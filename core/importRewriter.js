// importRewriter.js - Rewrite import statements to use header-based references

const DC_REQUIRE_PATTERN = /(?:await\s+)?dc\.require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const DC_RESOLVE_PATH_PATTERN = /(?:await\s+)?dc\.require\s*\(\s*dc\.resolvePath\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\)/g;
const REQUIRE_MODULE_PATTERN = /requireModuleByName\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

function rewriteImports(fileContent, allFileNames, compiledNoteName) {
  if (typeof fileContent !== 'string') {
    throw new Error('File content must be a string');
  }
  
  if (!Array.isArray(allFileNames)) {
    throw new Error('allFileNames must be an array');
  }
  
  if (!compiledNoteName || typeof compiledNoteName !== 'string') {
    throw new Error('compiledNoteName must be a non-empty string');
  }

  const availableModules = new Set(allFileNames);

  function extractModuleName(pathString) {
    if (!pathString) return null;
    const segments = pathString.split(/[/\\]/);
    const filename = segments[segments.length - 1];
    return filename.replace(/\.(js|jsx|ts|tsx)$/i, '') || null;
  }

  function validateModule(moduleName, originalMatch) {
    if (!availableModules.has(moduleName)) {
      throw new Error(`Cannot resolve dependency: ${moduleName} (from: ${originalMatch})`);
    }
  }

  const replacements = [];

  // Find and mark pathResolver imports for removal
  const pathResolverMatches = findPathResolverImports(fileContent);
  replacements.push(...pathResolverMatches.map(m => ({
    start: m.start,
    end: m.end,
    replacement: ''
  })));

  // Find and replace dc.require(dc.resolvePath(...)) patterns
  replacements.push(...findDcResolvePathReplacements(
    fileContent,
    extractModuleName,
    validateModule,
    compiledNoteName
  ));

  // Find and replace dc.require patterns
  replacements.push(...findDcRequireReplacements(
    fileContent, 
    extractModuleName, 
    validateModule, 
    compiledNoteName
  ));

  // Find and replace requireModuleByName patterns
  replacements.push(...findRequireModuleReplacements(
    fileContent,
    extractModuleName,
    validateModule,
    compiledNoteName
  ));

  return applyReplacements(fileContent, replacements);
}

function findPathResolverImports(fileContent) {
  const matches = [];
  let pathResolverVarName = null;

  const varPattern = /const\s+(\w+)\s*=\s*dc\.resolvePath\s*\(\s*['"`]pathResolver\.js['"`]\s*\)\s*;?\s*\n?/g;
  let match;
  
  while ((match = varPattern.exec(fileContent)) !== null) {
    pathResolverVarName = match[1];
    const lineStart = fileContent.lastIndexOf('\n', match.index) + 1;
    const lineEnd = match.index + match[0].length;
    matches.push({ start: lineStart, end: lineEnd, varName: pathResolverVarName });
  }
  
  if (pathResolverVarName) {
    const requirePattern = new RegExp(
      `const\\s+(?:\\{[^}]+\\}|\\w+)\\s*=\\s*(?:await\\s+)?dc\\.require\\s*\\(\\s*${pathResolverVarName}\\s*\\)\\s*;?\\s*\\n?`,
      'g'
    );
    
    while ((match = requirePattern.exec(fileContent)) !== null) {
      const lineStart = fileContent.lastIndexOf('\n', match.index) + 1;
      const lineEnd = match.index + match[0].length;
      matches.push({ start: lineStart, end: lineEnd });
    }
  }
  
  const directPattern = /const\s+(?:\{[^}]+\}|\w+)\s*=\s*(?:await\s+)?dc\.require\s*\(\s*['"`][^'"`]*pathResolver\.js['"`]\s*\)\s*;?\s*\n?/g;
  while ((match = directPattern.exec(fileContent)) !== null) {
    const lineStart = fileContent.lastIndexOf('\n', match.index) + 1;
    const lineEnd = match.index + match[0].length;
    
    const alreadyMarked = matches.some(m => m.start === lineStart && m.end === lineEnd);
    if (!alreadyMarked) {
      matches.push({ start: lineStart, end: lineEnd });
    }
  }

  return matches;
}

function findDcResolvePathReplacements(fileContent, extractModuleName, validateModule, compiledNoteName) {
  const replacements = [];
  const regex = new RegExp(DC_RESOLVE_PATH_PATTERN.source, DC_RESOLVE_PATH_PATTERN.flags);
  let match;
  
  while ((match = regex.exec(fileContent)) !== null) {
    const fullMatch = match[0];
    const moduleName = extractModuleName(match[1]);
    
    if (moduleName && moduleName !== 'pathResolver') {
      validateModule(moduleName, fullMatch);
      
      const isAwait = fullMatch.trim().startsWith('await');
      const awaitPrefix = isAwait ? 'await ' : '';
      const replacement = `${awaitPrefix}dc.require(dc.headerLink(dc.resolvePath("${compiledNoteName}"), "${moduleName}"))`;
      
      replacements.push({
        start: match.index,
        end: match.index + fullMatch.length,
        replacement
      });
    }
  }

  return replacements;
}

function findDcRequireReplacements(fileContent, extractModuleName, validateModule, compiledNoteName) {
  const replacements = [];
  const regex = new RegExp(DC_REQUIRE_PATTERN.source, DC_REQUIRE_PATTERN.flags);
  let match;
  
  while ((match = regex.exec(fileContent)) !== null) {
    const fullMatch = match[0];
    
    if (fullMatch.includes('dc.headerLink') || fullMatch.includes('dc.resolvePath')) continue;
    
    const moduleName = extractModuleName(match[1]);
    
    if (moduleName && moduleName !== 'pathResolver') {
      validateModule(moduleName, fullMatch);
      
      const isAwait = fullMatch.trim().startsWith('await');
      const awaitPrefix = isAwait ? 'await ' : '';
      const replacement = `${awaitPrefix}dc.require(dc.headerLink(dc.resolvePath("${compiledNoteName}"), "${moduleName}"))`;
      
      replacements.push({
        start: match.index,
        end: match.index + fullMatch.length,
        replacement
      });
    }
  }

  return replacements;
}

function findRequireModuleReplacements(fileContent, extractModuleName, validateModule, compiledNoteName) {
  const replacements = [];
  const regex = new RegExp(REQUIRE_MODULE_PATTERN.source, REQUIRE_MODULE_PATTERN.flags);
  let match;
  
  while ((match = regex.exec(fileContent)) !== null) {
    const moduleName = extractModuleName(match[1]);
    
    if (moduleName && moduleName !== 'pathResolver') {
      validateModule(moduleName, match[0]);
      
      const replacement = `dc.require(dc.headerLink(dc.resolvePath("${compiledNoteName}"), "${moduleName}"))`;
      
      replacements.push({
        start: match.index,
        end: match.index + match[0].length,
        replacement
      });
    }
  }

  return replacements;
}

function rewriteCssReferences(fileContent, cssReferences, compiledNoteName) {
  if (typeof fileContent !== 'string') {
    throw new Error('File content must be a string');
  }
  
  if (!Array.isArray(cssReferences) || cssReferences.length === 0) {
    return fileContent;
  }
  
  if (!compiledNoteName || typeof compiledNoteName !== 'string') {
    throw new Error('compiledNoteName must be a non-empty string');
  }

  function getCssModuleName(filePath) {
    if (!filePath) return null;
    const segments = filePath.split(/[/\\]/);
    const filename = segments[segments.length - 1];
    return filename.toLowerCase().endsWith('.css') 
      ? filename.substring(0, filename.length - 4)
      : filename;
  }

  const replacements = cssReferences
    .filter(ref => ref.pattern !== 'headerLink' && (ref.filePath || ref.resolvedPath))
    .map(ref => {
      // Use resolvedPath if available (from template literal resolution), otherwise use filePath
      const pathToUse = ref.resolvedPath || ref.filePath;
      const moduleName = getCssModuleName(pathToUse);
      if (!moduleName) return null;

      return {
        start: ref.startIndex,
        end: ref.endIndex,
        replacement: `const ${ref.varName} = await dc.require(dc.headerLink(dc.resolvePath("${compiledNoteName}"), "${moduleName}"))`
      };
    })
    .filter(Boolean);

  return applyReplacements(fileContent, replacements);
}

function applyReplacements(content, replacements) {
  replacements.sort((a, b) => b.start - a.start);

  let result = content;
  for (const { start, end, replacement } of replacements) {
    result = result.substring(0, start) + replacement + result.substring(end);
  }

  return result;
}

return {
  rewriteImports,
  rewriteCssReferences
};