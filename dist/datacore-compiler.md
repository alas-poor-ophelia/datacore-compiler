<!-- Compiled by Datacore Script Compiler -->
<!-- Source: Projects/DatacoreCompiler -->
<!-- Main Component: CompilerUI -->
<!-- Compiled: 2025-11-29T03:33:30.984Z -->
<!-- Files: 12 -->
<!-- Version: 0.5.1 -->

# Demo

```datacorejsx
// Example: How to use the compiled CompilerUI component
const { View: CompilerUI } = await dc.require(dc.headerLink(dc.resolvePath("datacore-compiler"), "CompilerUI"));

// Pass props to your component as needed:
// return <CompilerUI someProp="value" />;

return <CompilerUI />;
```

# utils

```js
// utils.js - Shared utility functions

const SCRIPT_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

function extractModuleName(pathString) {
  if (!pathString) return null;

  const segments = pathString.split(/[/\\]/);
  const filename = segments[segments.length - 1];
  
  return filename.replace(/\.(js|jsx|ts|tsx)$/i, '') || null;
}

function getCssModuleName(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  const segments = filePath.split(/[/\\]/);
  const filename = segments[segments.length - 1];

  return filename.toLowerCase().endsWith('.css') 
    ? filename.substring(0, filename.length - 4)
    : filename;
}

function getFileExtension(filePath) {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot === -1 ? '' : filePath.substring(lastDot);
}

function getFileName(filePath) {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSlash === -1 ? filePath : filePath.substring(lastSlash + 1);
}

function removeExtension(fileName, ext) {
  return ext && fileName.endsWith(ext) 
    ? fileName.substring(0, fileName.length - ext.length)
    : fileName;
}

function normalizePath(path) {
  return path.replace(/^\/+|\/+$/g, '');
}

return {
  extractModuleName,
  getCssModuleName,
  getFileExtension,
  getFileName,
  removeExtension,
  normalizePath
};
```

# constants

```js
// constants.js - Shared constants across compiler modules

const SCRIPT_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const CSS_EXTENSION = '.css';

const CSS_IMPORT_PATTERNS = {
  CACHED_READ: 'cachedRead',
  READ_ABSTRACT: 'readAbstract',
  ADAPTER_READ: 'adapterRead',
  HEADER_LINK: 'headerLink'
};

const ERROR_MESSAGES = {
  INVALID_INPUT: (fieldName) => `${fieldName} must be a non-empty string`,
  INVALID_ARRAY: (fieldName) => `${fieldName} must be an array`,
  DIR_NOT_EXIST: (path) => `Directory does not exist: ${path}`,
  FILE_NOT_FOUND: (fileName, parent) => `Missing dependency: '${fileName}' required by '${parent}'`,
  CIRCULAR_DEPENDENCY: (path) => `Circular dependency detected: ${path}`,
  DUPLICATE_FILENAME: (name) => `Duplicate filename detected: ${name}. All files must have unique names.`,
  NO_FILES_FOUND: (dir) => `No script files found in directory: ${dir}`,
  MAIN_NOT_FOUND: (name) => `Main component '${name}' not found in project directory`,
  CANNOT_RESOLVE: (name, source) => `Cannot resolve dependency: ${name} (from: ${source})`
};

return {
  SCRIPT_EXTENSIONS,
  CSS_EXTENSION,
  CSS_IMPORT_PATTERNS,
  ERROR_MESSAGES
};
```

# fileDiscovery

```js
// fileDiscovery.js - Scan directory and collect all script files

const { normalizePath, getFileExtension, getFileName, removeExtension } = await dc.require(dc.headerLink(dc.resolvePath("datacore-compiler"), "utils"));
const { SCRIPT_EXTENSIONS, ERROR_MESSAGES } = await dc.require(dc.headerLink(dc.resolvePath("datacore-compiler"), "constants"));

async function scanDirectory(directoryPath) {
  if (!directoryPath || typeof directoryPath !== 'string') {
    throw new Error('Directory path must be a non-empty string');
  }

  const activeFile = dc.app.workspace.getActiveFile().path;
  const { normalizePath, getFileExtension, getFileName, removeExtension } = 
    await dc.require(dc.headerLink(activeFile, "utils"));
  const { SCRIPT_EXTENSIONS, ERROR_MESSAGES } = 
    await dc.require(dc.headerLink(activeFile, "constants"));

  const normalizedPath = normalizePath(directoryPath);

  const exists = await dc.app.vault.adapter.exists(normalizedPath);
  if (!exists) {
    throw new Error(ERROR_MESSAGES.DIR_NOT_EXIST(normalizedPath));
  }

  let dirContents;
  try {
    dirContents = await dc.app.vault.adapter.list(normalizedPath);
  } catch (error) {
    throw new Error(`Failed to read directory: ${normalizedPath}. ${error.message}`);
  }

  const files = [];
  const fileNamesSeen = new Set();

  async function processDirectory(currentPath, dirListing) {
    for (const filePath of dirListing.files) {
      const ext = getFileExtension(filePath);
      
      if (SCRIPT_EXTENSIONS.includes(ext)) {
        try {
          const content = await dc.app.vault.adapter.read(filePath);
          const name = getFileName(filePath);
          const nameWithoutExt = removeExtension(name, ext);
          
          if (fileNamesSeen.has(nameWithoutExt)) {
            throw new Error(ERROR_MESSAGES.DUPLICATE_FILENAME(nameWithoutExt));
          }
          fileNamesSeen.add(nameWithoutExt);
          
          files.push({ path: filePath, name, nameWithoutExt, content });
        } catch (error) {
          if (error.message.includes('Duplicate filename detected')) {
            throw error;
          }
          throw new Error(`Failed to read file: ${filePath}. ${error.message}`);
        }
      }
    }

    for (const subDirPath of dirListing.folders) {
      try {
        const subDirContents = await dc.app.vault.adapter.list(subDirPath);
        await processDirectory(subDirPath, subDirContents);
      } catch (error) {
        throw new Error(`Failed to process subdirectory: ${subDirPath}. ${error.message}`);
      }
    }
  }

  await processDirectory(normalizedPath, dirContents);

  if (files.length === 0) {
    throw new Error(ERROR_MESSAGES.NO_FILES_FOUND(normalizedPath));
  }

  files.sort((a, b) => a.name.localeCompare(b.name));

  return files;
}

return { scanDirectory };
```

# dependencyAnalyzer

```js
// dependencyAnalyzer.js - Extract all dependency imports from file content

function extractDependencies(fileContent) {
  if (typeof fileContent !== 'string') {
    return [];
  }

  const contentWithoutComments = removeComments(fileContent);
  const dependencies = new Set();

  const dcRequirePattern = /(?:await\s+)?dc\.require\s*\(\s*(?:dc\.headerLink\s*\([^)]*,\s*['"`]([^'"`]+)['"`]\s*\)|dc\.resolvePath\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|['"`]([^'"`]+)['"`])/g;
  
  const requireModulePattern = /requireModuleByName\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

  function extractModuleName(pathString) {
    if (!pathString) return null;

    const segments = pathString.split(/[/\\]/);
    const filename = segments[segments.length - 1];
    
    return filename.replace(/\.(js|jsx|ts|tsx)$/i, '') || null;
  }

  let match;
  
  while ((match = dcRequirePattern.exec(contentWithoutComments)) !== null) {
    const pathString = match[1] || match[2] || match[3];
    const moduleName = extractModuleName(pathString);
    if (moduleName) {
      dependencies.add(moduleName);
    }
  }

  while ((match = requireModulePattern.exec(contentWithoutComments)) !== null) {
    const moduleName = extractModuleName(match[1]);
    if (moduleName) {
      dependencies.add(moduleName);
    }
  }

  return Array.from(dependencies);
}

function removeComments(code) {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = null;
  
  while (i < code.length) {
    const char = code[i];
    const next = code[i + 1];
    
    // Single-line comment
    if (!inString && char === '/' && next === '/') {
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      continue;
    }
    
    // Multi-line comment
    if (!inString && char === '/' && next === '*') {
      i += 2;
      while (i < code.length - 1) {
        if (code[i] === '*' && code[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    
    // Track string state to avoid matching inside strings
    if (char === '"' || char === "'" || char === '`') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && code[i - 1] !== '\\') {
        inString = false;
        stringChar = null;
      }
    }
    
    result += char;
    i++;
  }
  
  return result;
}

return { extractDependencies };
```

# dependencyGraph

```js
// dependencyGraph.js - Build dependency tree and establish execution order

function buildDependencyOrder(files, mainComponentName) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Files array must be non-empty');
  }
  
  if (!mainComponentName || typeof mainComponentName !== 'string') {
    throw new Error('Main component name must be a non-empty string');
  }

  const fileMap = new Map(files.map(f => [f.nameWithoutExt, f]));

  if (!fileMap.has(mainComponentName)) {
    throw new Error(`Main component '${mainComponentName}' not found in project directory`);
  }

  const visited = new Set();
  const visiting = new Set();
  const orderedFiles = [];

  function visit(fileName, path = []) {
    if (visited.has(fileName)) return;

    if (visiting.has(fileName)) {
      const cycleStart = path.indexOf(fileName);
      const cyclePath = [...path.slice(cycleStart), fileName].join(' → ');
      throw new Error(`Circular dependency detected: ${cyclePath}`);
    }

    const file = fileMap.get(fileName);
    if (!file) {
      const parent = path[path.length - 1] || 'unknown';
      throw new Error(`Missing dependency: '${fileName}' required by '${parent}'`);
    }

    visiting.add(fileName);
    
    if (file.dependencies) {
      for (const depName of file.dependencies) {
        visit(depName, [...path, fileName]);
      }
    }

    visiting.delete(fileName);
    visited.add(fileName);
    orderedFiles.push(file);
  }

  visit(mainComponentName);

  return orderedFiles;
}

return { buildDependencyOrder };
```

# importRewriter

```js
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
```

# bundleGenerator

```js
// bundleGenerator.js - Create the final compiled markdown file content

function generateBundle(orderedFiles, projectDir, mainComponentName, compiledNoteName, cssFiles = [], minifyOptions = {}, version = null, includeDemo = true) {
  if (!Array.isArray(orderedFiles) || orderedFiles.length === 0) {
    throw new Error('orderedFiles must be a non-empty array');
  }
  
  if (!projectDir || typeof projectDir !== 'string') {
    throw new Error('projectDir must be a non-empty string');
  }
  
  if (!mainComponentName || typeof mainComponentName !== 'string') {
    throw new Error('mainComponentName must be a non-empty string');
  }
  
  if (!compiledNoteName || typeof compiledNoteName !== 'string') {
    throw new Error('compiledNoteName must be a non-empty string');
  }

  const parts = [];
  const { componentName: actualComponentName, isMultiExport } = detectActualComponentName(orderedFiles, mainComponentName);

  parts.push(...generateHeader(projectDir, mainComponentName, orderedFiles.length, cssFiles.length, minifyOptions, version));
  
  // Always include demo code block, but callouts are controlled by includeDemo
  parts.push(...generateDemo(actualComponentName, mainComponentName, compiledNoteName, isMultiExport, includeDemo));
  
  parts.push(...generateModuleSections(orderedFiles, mainComponentName));
  
  if (cssFiles.length > 0) {
    parts.push(...generateCssSections(cssFiles, compiledNoteName));
  }

  return parts.join('\n');
}

function detectActualComponentName(orderedFiles, mainComponentName) {
  const mainFile = orderedFiles.find(f => f.nameWithoutExt === mainComponentName);
  if (!mainFile) return { componentName: mainComponentName, isMultiExport: false };

  const returnPattern = /return\s*\{([^}]+)\}\s*;?\s*$/s;
  const match = mainFile.content.match(returnPattern);
  
  if (!match) return { componentName: mainComponentName, isMultiExport: false };
  
  const returnContent = match[1].trim();
  
  // Priority 1: Look for View: pattern
  if (returnContent.includes('View:')) {
    const viewPattern = /View:\s*(\w+)/;
    const viewMatch = returnContent.match(viewPattern);
    if (viewMatch) return { componentName: viewMatch[1], isMultiExport: false };
  }
  
  // Priority 2: Check if it's a single component
  const simplePattern = /^\s*(\w+)\s*$/;
  const simpleMatch = returnContent.match(simplePattern);
  if (simpleMatch) return { componentName: simpleMatch[1], isMultiExport: false };
  
  // Priority 3: Multiple exports - take the first one
  // Handles: { ComponentA, ComponentB, ... } or { key: ComponentA, ... }
  const firstComponentPattern = /^\s*(?:\w+\s*:\s*)?(\w+)/;
  const firstMatch = returnContent.match(firstComponentPattern);
  if (firstMatch) return { componentName: firstMatch[1], isMultiExport: true };
  
  return { componentName: mainComponentName, isMultiExport: false };
}

function generateHeader(projectDir, mainComponentName, fileCount, cssCount, minifyOptions, version = null) {
  const timestamp = new Date().toISOString();
  const parts = [
    '<!-- Compiled by Datacore Script Compiler -->',
    `<!-- Source: ${projectDir} -->`,
    `<!-- Main Component: ${mainComponentName} -->`,
    `<!-- Compiled: ${timestamp} -->`,
    `<!-- Files: ${fileCount} -->`
  ];
  
  if (version) {
    parts.push(`<!-- Version: ${version} -->`);
  }
  
  if (cssCount > 0) {
    parts.push(`<!-- CSS Files: ${cssCount} -->`);
  }
  
  if (minifyOptions.enabled) {
    const minifyType = minifyOptions.obfuscate ? 'Yes (Obfuscated)' : 'Yes';
    parts.push(`<!-- Minified: ${minifyType} -->`);
  }
  
  parts.push('');
  return parts;
}

function generateDemo(actualComponentName, mainComponentName, compiledNoteName, isMultiExport, includeCallouts = true) {
  const parts = ['# Demo'];
  
  // Callouts are conditional based on includeCallouts parameter
  if (includeCallouts) {
    parts.push(
      '> [!NOTE]- A Note on the Demo',
      `> This compiler does its best to demonstrate the way you call your script`,
      `> However you may need to adjust if your specific script works in an unexpected way.`,
      `> The compiled script should work (any other caveats like Data files aside) regardless of the demo's functioning.`,
      ''
    );
    
    if (isMultiExport) {
      parts.push(
        '> [!WARNING] Multiple Exports Detected',
        '> This script exports multiple components. The compiler selected the first one for this demo.',
        '> You may need to adjust the code below to use the correct component for your needs.',
        ''
      );
    }
  } else {
    parts.push('');
  }
  
  // Demo code block is always included
  parts.push(
    '```datacorejsx',
    `// Example: How to use the compiled ${actualComponentName} component`
  );
  
  if (isMultiExport) {
    parts.push(`const { ${actualComponentName} } = await dc.require(dc.headerLink(dc.resolvePath("${compiledNoteName}"), "${mainComponentName}"));`);
  } else {
    parts.push(`const { View: ${actualComponentName} } = await dc.require(dc.headerLink(dc.resolvePath("${compiledNoteName}"), "${mainComponentName}"));`);
  }
  
  parts.push(
    '',
    '// Pass props to your component as needed:',
    `// return <${actualComponentName} someProp="value" />;`,
    '',
    `return <${actualComponentName} />;`,
    '```',
    ''
  );
  
  // External Data Files callout is conditional
  if (includeCallouts) {
    parts.push(
      '> [!NOTE] External Data Files',
      `> If your project uses external data files, you'll need to manually update the paths in the compiled code.`,
      `> Use \`dc.resolvePath("your-data-file.json")\` to reference data files in your vault.`,
      ''
    );
  }
  
  return parts;
}


function generateModuleSections(orderedFiles, mainComponentName) {
  const parts = [];
  
  for (const file of orderedFiles) {
    parts.push(`# ${file.nameWithoutExt}`);
    parts.push('');
    
    const ext = file.name.substring(file.name.lastIndexOf('.') + 1);
    const languageTag = ext || 'javascript';
    
    parts.push('```' + languageTag);
    
    const content = file.nameWithoutExt === mainComponentName
      ? ensureViewWrapper(file.content)
      : file.content;
    
    parts.push(content);
    parts.push('```');
    parts.push('');
  }
  
  return parts;
}

function ensureViewWrapper(content) {
  const returnPattern = /return\s*\{([^}]+)\}\s*;?\s*$/s;
  const match = content.match(returnPattern);
  
  if (!match) return content;
  
  const returnContent = match[1].trim();
  
  if (returnContent.includes('View:')) return content;
  
  const componentPattern = /^\s*(\w+)\s*$/;
  const componentMatch = returnContent.match(componentPattern);
  
  if (componentMatch) {
    const componentName = componentMatch[1];
    return content.replace(returnPattern, `return { View: ${componentName} };`);
  }
  
  return content;
}

function generateCssSections(cssFiles, compiledNoteName) {
  const parts = [
    '---',
    '',
    '# CSS Styles',
    '',
    '> [!TIP] Using CSS Files',
    '> CSS files are bundled as JavaScript modules that return CSS strings:',
    '> ```javascript',
    `> const myStyles = await dc.require(dc.headerLink(dc.resolvePath("${compiledNoteName}"), "styleName"));`,
    '> // Use in JSX: <style>{myStyles}</style>',
    '> ```',
    ''
  ];
  
  for (const cssFile of cssFiles) {
    parts.push(`## ${cssFile.nameWithoutExt}`);
    parts.push('');
    parts.push('```js');
    parts.push('const css = `');
    // Escape backticks and backslashes in CSS content to prevent breaking the template literal
    const escapedContent = cssFile.content.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    parts.push(escapedContent);
    parts.push('`;');
    parts.push('');
    parts.push('return css;');
    parts.push('```');
    parts.push('');
  }
  
  return parts;
}

return { generateBundle };
```

# fileWriter

```js
// fileWriter.js - Write compiled content to vault

async function writeToVault(content, outputFileName, autoAddMd = true) {
  if (typeof content !== 'string') {
    return { success: false, error: 'Content must be a string' };
  }

  if (!outputFileName || typeof outputFileName !== 'string') {
    return { success: false, error: 'Output filename must be a non-empty string' };
  }

  let finalFileName = outputFileName.trim();
  
  // Add .md extension if autoAddMd is true and filename has no extension
  if (autoAddMd && !finalFileName.endsWith('.md')) {
    finalFileName += '.md';
  }

  try {
    await dc.app.vault.adapter.write(finalFileName, content);
    return { success: true, path: finalFileName };
  } catch (error) {
    return {
      success: false,
      path: finalFileName,
      error: `Failed to write file: ${error.message}`
    };
  }
}

return { writeToVault };
```

# cssReferenceAnalyzer

```js
// cssReferenceAnalyzer.js - Detect and extract CSS file references from code

const PATTERNS = {
  // String literal patterns (single/double quotes) - capture full path
  cachedRead: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.cachedRead\s*\(\s*await\s+(?:dc\.)?app\.vault\.getFileByPath\s*\(\s*['"]([^'"]+\.css)['"]\s*\)\s*\)/gs,
  readAbstract: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.read\s*\(\s*(?:dc\.)?app\.vault\.getAbstractFileByPath\s*\(\s*['"]([^'"]+\.css)['"]\s*\)\s*\)/gs,
  adapterRead: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.adapter\.read\s*\(\s*['"]([^'"]+\.css)['"]\s*\)/gs,
  
  // Template literal patterns - with parentheses: getFileByPath(`...`)
  cachedReadTemplate: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.cachedRead\s*\(\s*await\s+(?:dc\.)?app\.vault\.getFileByPath\s*\(\s*`[^`]*?\/([^/`]+\.css)`\s*\)\s*\)\s*;?/gs,
  readAbstractTemplate: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.read\s*\(\s*(?:dc\.)?app\.vault\.getAbstractFileByPath\s*\(\s*`[^`]*?\/([^/`]+\.css)`\s*\)\s*\)\s*;?/gs,
  adapterReadTemplate: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.adapter\.read\s*\(\s*`[^`]*?\/([^/`]+\.css)`\s*\)\s*;?/gs,
  
  // Tagged template literal patterns - without parentheses: getFileByPath`...`
  cachedReadTagged: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.cachedRead\s*\(\s*await\s+(?:dc\.)?app\.vault\.getFileByPath`[^`]*?\/([^/`]+\.css)`\s*\)\s*;?/gs,
  readAbstractTagged: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.read\s*\(\s*(?:dc\.)?app\.vault\.getAbstractFileByPath`[^`]*?\/([^/`]+\.css)`\s*\)\s*;?/gs,
  adapterReadTagged: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+(?:dc\.)?app\.vault\.adapter\.read`[^`]*?\/([^/`]+\.css)`\s*;?/gs,
  
  // Already converted patterns
  headerLink: /const\s+(\w*(?:[cC][sS][sS]|[sS][tT][yY][lL][eE])\w*)\s*=\s*await\s+dc\.require\s*\(\s*dc\.headerLink\s*\([^)]*,\s*['"`]([^'"`]+)['"`]\s*\)\s*\)/gs
};

function detectCssReferences(fileContent) {
  if (typeof fileContent !== 'string') {
    return [];
  }

  const cssReferences = [];

  function isCssVariableName(varName) {
    if (!varName) return false;
    const lower = varName.toLowerCase();
    return lower.includes('css') || lower.includes('style');
  }

  function isCssFile(filePath) {
    return filePath && filePath.toLowerCase().endsWith('.css');
  }

  function addReference(match, varName, pathOrModule, patternName) {
    if (!isCssVariableName(varName)) return;

    const isHeaderLink = patternName === 'headerLink';
    const isTemplatePattern = patternName.includes('Template') || patternName.includes('Tagged');
    
    if (!isHeaderLink && !isCssFile(pathOrModule)) return;

    const ref = {
      varName,
      filePath: isHeaderLink ? null : pathOrModule,
      moduleName: isHeaderLink ? pathOrModule : null,
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      pattern: patternName,
      isPartialPath: isTemplatePattern  // Only has filename, not full path
    };
    
    cssReferences.push(ref);
  }

  for (const [patternName, regex] of Object.entries(PATTERNS)) {
    // Reset regex lastIndex for each pattern
    regex.lastIndex = 0;
    let match;
    let matchCount = 0;
    
    while ((match = regex.exec(fileContent)) !== null) {
      matchCount++;
      addReference(match, match[1], match[2], patternName);
      
      // Safety check to prevent infinite loops
      if (matchCount > 100) {
        console.warn(`CSS pattern ${patternName} matched >100 times, stopping`);
        break;
      }
    }
  }

  return cssReferences;
}

function getCssModuleName(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  const segments = filePath.split(/[/\\]/);
  const filename = segments[segments.length - 1];

  return filename.toLowerCase().endsWith('.css') 
    ? filename.substring(0, filename.length - 4)
    : filename;
}

return {
  detectCssReferences,
  getCssModuleName
};
```

# minifier

```js
// minifier.js - Code minification with optional obfuscation

const REACT_HOOKS = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue'];
const PRESERVED_KEYWORDS = ['dc', 'return', 'export', 'import', 'const', 'let', 'var', 'function', 'class', 'extends', 'await', 'async'];
const PRESERVED_IDENTIFIERS = [...PRESERVED_KEYWORDS, ...REACT_HOOKS];

function minify(code, options = {}) {
  if (typeof code !== 'string') {
    return code;
  }

  let result = code;
  
  result = removeComments(result);
  result = removeConsoleStatements(result);
  result = compressWhitespace(result);
  
  return result;
}

function minifyWithObfuscation(code, options = {}) {
  if (typeof code !== 'string') {
    return { code, nextCounter: options.counterStart || 0 };
  }

  let result = minify(code, options);
  const preserveNames = options.preserveNames || new Set();
  const usedShortNames = options.usedShortNames || new Set();
  const { code: obfuscatedCode, nextCounter } = shortenVariableNames(
    result, 
    options.counterStart || 0, 
    preserveNames, 
    usedShortNames
  );
  result = aggressiveWhitespaceCompression(obfuscatedCode);
  
  return { code: result, nextCounter };
}

function removeComments(code) {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = null;
  let inRegex = false;
  
  while (i < code.length) {
    const char = code[i];
    const next = code[i + 1];
    
    if (!inString && !inRegex && char === '/' && next === '/') {
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      continue;
    }
    
    if (!inString && !inRegex && char === '/' && next === '*') {
      i += 2;
      while (i < code.length - 1) {
        if (code[i] === '*' && code[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    
    if (!inRegex && (char === '"' || char === "'" || char === '`')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && code[i - 1] !== '\\') {
        inString = false;
        stringChar = null;
      }
    }
    
    result += char;
    i++;
  }
  
  return result;
}

function removeConsoleStatements(code) {
  const patterns = [
    /console\.log\s*\([^;]*\)\s*;?\s*/g,
    /console\.warn\s*\([^;]*\)\s*;?\s*/g,
    /console\.error\s*\([^;]*\)\s*;?\s*/g,
    /console\.debug\s*\([^;]*\)\s*;?\s*/g,
    /console\.info\s*\([^;]*\)\s*;?\s*/g
  ];
  
  let result = code;
  for (const pattern of patterns) {
    result = result.replace(pattern, '');
  }
  
  return result;
}

function compressWhitespace(code) {
  let result = code;
  
  result = result.replace(/[ \t]+/g, ' ');
  result = result.replace(/\n\s*\n\s*\n+/g, '\n\n');
  result = result.replace(/\n\s+/g, '\n');
  result = result.replace(/\s*\{\s*/g, '{');
  result = result.replace(/\s*\}\s*/g, '}');
  result = result.replace(/\s*\(\s*/g, '(');
  result = result.replace(/\s*\)\s*/g, ')');
  result = result.replace(/\s*;\s*/g, ';');
  result = result.replace(/\s*,\s*/g, ',');
  result = result.replace(/\s*=\s*/g, '=');
  result = result.replace(/\s*:\s*/g, ':');
  
  return result.trim();
}

function aggressiveWhitespaceCompression(code) {
  let result = code;
  
  result = result.replace(/\n+/g, '\n');
  result = result.replace(/\n\s*/g, '\n');
  result = result.replace(/\s*\n/g, '\n');
  
  return result.trim();
}

function shortenVariableNames(code, startCounter = 0, preserveNames = new Set(), globalUsedShortNames = new Set()) {
  const varPattern = /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  const funcPattern = /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  const arrowFuncPattern = /\bconst\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>/g;
  
  const jsxComponentPattern = /<([A-Z][a-zA-Z0-9_$]*)/g;
  const jsxComponents = new Set();
  let match;
  
  while ((match = jsxComponentPattern.exec(code)) !== null) {
    jsxComponents.add(match[1]);
  }
  
  const variableNames = new Set();
  const usedShortNames = new Set(globalUsedShortNames);
  
  while ((match = varPattern.exec(code)) !== null) {
    const varName = match[1];
    if (!shouldPreserve(varName, preserveNames, jsxComponents)) {
      variableNames.add(varName);
    } else if (varName.length <= 2) {
      usedShortNames.add(varName);
    }
  }
  
  while ((match = funcPattern.exec(code)) !== null) {
    const funcName = match[1];
    if (!shouldPreserve(funcName, preserveNames, jsxComponents)) {
      variableNames.add(funcName);
    } else if (funcName.length <= 2) {
      usedShortNames.add(funcName);
    }
  }
  
  while ((match = arrowFuncPattern.exec(code)) !== null) {
    const funcName = match[1];
    if (!shouldPreserve(funcName, preserveNames, jsxComponents)) {
      variableNames.add(funcName);
    } else if (funcName.length <= 2) {
      usedShortNames.add(funcName);
    }
  }
  
  const sortedVars = Array.from(variableNames).sort((a, b) => b.length - a.length);
  
  let result = code;
  let counter = startCounter;
  
  for (const varName of sortedVars) {
    if (varName.length <= 2) {
      usedShortNames.add(varName);
      continue;
    }
    
    const isComponent = startsWithCapital(varName) || jsxComponents.has(varName);
    let shortName;
    
    do {
      shortName = generateShortName(counter++, isComponent);
    } while (usedShortNames.has(shortName));
    
    usedShortNames.add(shortName);
    
    const wordBoundaryPattern = new RegExp(`\\b${escapeRegExp(varName)}\\b`, 'g');
    result = result.replace(wordBoundaryPattern, shortName);
  }
  
  return { code: result, nextCounter: counter };
}

function shouldPreserve(name, preserveNames, jsxComponents) {
  if (PRESERVED_IDENTIFIERS.includes(name)) return true;
  if (name.startsWith('_')) return true;
  if (preserveNames.has(name)) return true;
  if (jsxComponents.has(name)) return true;
  return false;
}

function startsWithCapital(str) {
  return str.length > 0 && str[0] === str[0].toUpperCase() && str[0] !== str[0].toLowerCase();
}

function generateShortName(index, isComponent = false) {
  const chars = isComponent ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : 'abcdefghijklmnopqrstuvwxyz';
  let name = '';
  let num = index;
  
  do {
    name = chars[num % 26] + name;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);
  
  return name;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

return {
  minify,
  minifyWithObfuscation
};
```

# compiler

```js
// compiler.js - Main compiler controller that orchestrates the compilation process

async function compile(projectDir, mainComponentName, outputFileName, options = {}) {
  try {
    validateInputs(projectDir, mainComponentName, outputFileName);

    const activeFile = dc.app.workspace.getActiveFile().path;
    const { normalizePath } = await dc.require(dc.headerLink(activeFile, "utils"));
    
    const normalizedProjectDir = normalizePath(projectDir);
    await validateProjectDirectory(normalizedProjectDir);

    const compiledNoteName = extractNoteName(outputFileName);
    
    // Extract new options
    const outputDir = options.outputDir ? normalizePath(options.outputDir) : 'dist';
    const version = options.version || null;
    const changelog = options.changelog || null;
    const includeDemo = options.includeDemo !== false; // Default to true
    const additionalFiles = options.additionalFiles || [];

    const minifyOptions = {
      enabled: options.minify || false,
      obfuscate: options.obfuscate || false
    };
    
    // Create output directory if it doesn't exist
    await ensureOutputDirectory(outputDir);

    const modules = await loadModules(activeFile);
    const files = await scanAndAnalyzeFiles(normalizedProjectDir, modules);
    const cssData = await detectAndReadCssFiles(files, modules, compiledNoteName, normalizedProjectDir);
    const orderedFiles = modules.buildDependencyOrder(files, mainComponentName);

    rewriteAllImports(orderedFiles, files, modules, compiledNoteName, cssData);

    if (minifyOptions.enabled) {
      applyMinification(orderedFiles, modules, minifyOptions);
    }

    const bundleContent = modules.generateBundle(
      orderedFiles, 
      normalizedProjectDir, 
      mainComponentName, 
      compiledNoteName, 
      cssData.cssFiles,
      minifyOptions,
      version,
      includeDemo
    );

    // Construct full output path with directory
    const fullOutputPath = `${outputDir}/${outputFileName}`;
    const writeResult = await modules.writeToVault(bundleContent, fullOutputPath);
    
    // Write VERSION file if version provided
    let versionPath = null;
    if (version) {
      const versionFilePath = `${outputDir}/VERSION`;
      const versionResult = await modules.writeToVault(version, versionFilePath, false);
      if (versionResult.success) {
        versionPath = versionResult.path;
      }
    }
    
    // Write CHANGELOG.md file if changelog provided
    let changelogPath = null;
    if (changelog) {
      const changelogFilePath = `${outputDir}/CHANGELOG.md`;
      const changelogResult = await modules.writeToVault(changelog, changelogFilePath);
      if (changelogResult.success) {
        changelogPath = changelogResult.path;
      }
    }
    
    // Copy additional files for distribution
    const copiedFiles = [];
    if (additionalFiles && additionalFiles.length > 0) {
      for (const filePath of additionalFiles) {
        try {
          const fileExists = await dc.app.vault.adapter.exists(filePath);
          if (!fileExists) {
            console.warn(`Additional file not found: ${filePath} - skipping`);
            continue;
          }
          
          const fileContent = await dc.app.vault.adapter.read(filePath);
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
          const outputFilePath = `${outputDir}/${fileName}`;
          
          const copyResult = await modules.writeToVault(fileContent, outputFilePath, false);
          if (copyResult.success) {
            copiedFiles.push(copyResult.path);
          }
        } catch (error) {
          console.warn(`Failed to copy additional file ${filePath}: ${error.message} - skipping`);
        }
      }
    }

    return buildResult(writeResult, orderedFiles.length, cssData.cssFiles.length, versionPath, changelogPath, copiedFiles);

  } catch (error) {
    return {
      success: false,
      error: error.message || 'An unknown error occurred during compilation'
    };
  }
}

function validateInputs(projectDir, mainComponentName, outputFileName) {
  if (!projectDir || typeof projectDir !== 'string') {
    throw new Error('Project directory must be a non-empty string');
  }

  if (!mainComponentName || typeof mainComponentName !== 'string') {
    throw new Error('Main component name must be a non-empty string');
  }

  if (!outputFileName || typeof outputFileName !== 'string') {
    throw new Error('Output filename must be a non-empty string');
  }
}

async function validateProjectDirectory(normalizedPath) {
  const dirExists = await dc.app.vault.adapter.exists(normalizedPath);
  if (!dirExists) {
    throw new Error(`Project directory does not exist: ${normalizedPath}`);
  }
}

function extractNoteName(outputFileName) {
  let name = outputFileName.trim();
  if (name.endsWith('.md')) {
    name = name.substring(0, name.length - 3);
  }
  return name;
}

async function loadModules(activeFile) {
  return {
    scanDirectory: (await dc.require(dc.headerLink(activeFile, "fileDiscovery"))).scanDirectory,
    extractDependencies: (await dc.require(dc.headerLink(activeFile, "dependencyAnalyzer"))).extractDependencies,
    buildDependencyOrder: (await dc.require(dc.headerLink(activeFile, "dependencyGraph"))).buildDependencyOrder,
    rewriteImports: (await dc.require(dc.headerLink(activeFile, "importRewriter"))).rewriteImports,
    rewriteCssReferences: (await dc.require(dc.headerLink(activeFile, "importRewriter"))).rewriteCssReferences,
    generateBundle: (await dc.require(dc.headerLink(activeFile, "bundleGenerator"))).generateBundle,
    writeToVault: (await dc.require(dc.headerLink(activeFile, "fileWriter"))).writeToVault,
    detectCssReferences: (await dc.require(dc.headerLink(activeFile, "cssReferenceAnalyzer"))).detectCssReferences,
    getCssModuleName: (await dc.require(dc.headerLink(activeFile, "cssReferenceAnalyzer"))).getCssModuleName,
    minify: (await dc.require(dc.headerLink(activeFile, "minifier"))).minify,
    minifyWithObfuscation: (await dc.require(dc.headerLink(activeFile, "minifier"))).minifyWithObfuscation
  };
}

async function scanAndAnalyzeFiles(projectDir, modules) {
  const files = await modules.scanDirectory(projectDir);
  
  for (const file of files) {
    file.dependencies = modules.extractDependencies(file.content);
  }
  
  return files;
}

async function detectAndReadCssFiles(files, modules, compiledNoteName, projectDir) {
  console.log(`[CSS Detection] Scanning ${files.length} files for CSS references`);
  
  const fileCssReferences = new Map();
  const cssFilesNeeded = new Set();
  const partialCssFilenames = new Map(); // filename -> full path mapping
  
  // First pass: collect all CSS references
  for (const file of files) {
    const cssRefs = modules.detectCssReferences(file.content);
    if (cssRefs.length > 0) {
      console.log(`[CSS Detection] File "${file.nameWithoutExt}" has ${cssRefs.length} CSS references`);
      fileCssReferences.set(file.nameWithoutExt, cssRefs);
      
      for (const ref of cssRefs) {
        if (ref.pattern === 'headerLink') continue;
        
        if (ref.isPartialPath) {
          // Template literal - only has filename, need to search for it
          if (ref.filePath) {
            console.log(`[CSS Detection] Partial path to resolve: ${ref.filePath}`);
            partialCssFilenames.set(ref.filePath, null); // Mark for resolution
          }
        } else {
          // Full path available
          if (ref.filePath) {
            console.log(`[CSS Detection] Full path: ${ref.filePath}`);
            cssFilesNeeded.add(ref.filePath);
          }
        }
      }
    }
  }

  // Resolve partial filenames by searching project directory
  if (partialCssFilenames.size > 0) {
    console.log(`[CSS Resolution] Searching for ${partialCssFilenames.size} partial CSS filenames`);
    const foundCssFiles = await findCssFilesInDirectory(projectDir, Array.from(partialCssFilenames.keys()));
    for (const [filename, fullPath] of foundCssFiles) {
      if (fullPath) {
        console.log(`[CSS Resolution] Resolved: ${filename} -> ${fullPath}`);
        partialCssFilenames.set(filename, fullPath);
        cssFilesNeeded.add(fullPath);
      } else {
        console.warn(`[CSS Resolution] Could not resolve: ${filename}`);
      }
    }
  }

  console.log(`[CSS Bundling] Reading ${cssFilesNeeded.size} CSS files`);

  // Read all CSS files
  const cssFiles = [];
  const resolvedCssRefs = new Set(); // Track which references were successfully resolved
  
  for (const cssPath of cssFilesNeeded) {
    try {
      const cssExists = await dc.app.vault.adapter.exists(cssPath);
      if (!cssExists) {
        console.warn(`CSS file not found: ${cssPath} - skipping`);
        continue;
      }

      const cssContent = await dc.app.vault.adapter.read(cssPath);
      const moduleName = modules.getCssModuleName(cssPath);
      const segments = cssPath.split(/[/\\]/);
      const filename = segments[segments.length - 1];
      
      cssFiles.push({
        path: cssPath,
        name: filename,
        nameWithoutExt: moduleName,
        content: cssContent
      });
      
      console.log(`[CSS Bundling] Bundled: ${filename} as module "${moduleName}"`);
      
      // Mark this path/filename as resolved
      resolvedCssRefs.add(cssPath);
      resolvedCssRefs.add(filename); // Also add just the filename
      
    } catch (error) {
      console.warn(`Failed to read CSS file ${cssPath}: ${error.message} - skipping`);
    }
  }

  // Update partial references with resolved paths
  for (const [fileName, refs] of fileCssReferences) {
    for (const ref of refs) {
      if (ref.isPartialPath && ref.filePath) {
        const resolvedPath = partialCssFilenames.get(ref.filePath);
        if (resolvedPath) {
          ref.resolvedPath = resolvedPath;
          console.log(`[CSS Resolution] Updated reference in ${fileName}: ${ref.filePath} -> ${resolvedPath}`);
        }
      }
    }
  }

  console.log(`[CSS Detection] Summary: ${cssFiles.length} CSS files bundled, ${resolvedCssRefs.size} references resolved`);
  return { cssFiles, fileCssReferences, resolvedCssRefs };
}

// Helper function to search for CSS files by filename in project directory
async function findCssFilesInDirectory(dirPath, filenames) {
  const filenameSet = new Set(filenames);
  const results = new Map(filenames.map(f => [f, null]));
  
  async function searchDir(path) {
    try {
      const contents = await dc.app.vault.adapter.list(path);
      
      for (const filePath of contents.files) {
        if (filePath.toLowerCase().endsWith('.css')) {
          const segments = filePath.split(/[/\\]/);
          const filename = segments[segments.length - 1];
          
          if (filenameSet.has(filename) && !results.get(filename)) {
            results.set(filename, filePath);
          }
        }
      }
      
      for (const subDirPath of contents.folders) {
        await searchDir(subDirPath);
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await searchDir(dirPath);
  return results;
}

function extractExportedNames(fileContent) {
  const exportedNames = new Set();
  
  const returnPattern = /return\s*\{([^}]+)\}/s;
  const match = fileContent.match(returnPattern);
  
  if (match) {
    const returnContent = match[1];
    
    const exportItems = returnContent.split(',').map(item => item.trim());
    for (const item of exportItems) {
      if (!item) continue;
      
      if (item.includes(':')) {
        const keyValue = item.split(':');
        const name = keyValue[0].trim();
        if (name) exportedNames.add(name);
      } else {
        exportedNames.add(item);
      }
    }
  }
  
  return exportedNames;
}

function extractImportedNames(fileContent) {
  const importedNames = new Set();
  
  const destructurePattern = /const\s*\{([^}]+)\}\s*=\s*(?:await\s+)?dc\.require/g;
  let match;
  
  while ((match = destructurePattern.exec(fileContent)) !== null) {
    const destructureContent = match[1];
    const items = destructureContent.split(',').map(item => item.trim());
    
    for (const item of items) {
      if (!item) continue;
      
      if (item.includes(':')) {
        const parts = item.split(':');
        const name = parts[1].trim();
        if (name) importedNames.add(name);
      } else {
        importedNames.add(item);
      }
    }
  }
  
  return importedNames;
}

function extractObjectPropertyKeys(fileContent) {
  const propertyKeys = new Set();
  
  const objectLiteralPattern = /\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
  let match;
  
  while ((match = objectLiteralPattern.exec(fileContent)) !== null) {
    propertyKeys.add(match[1]);
  }
  
  return propertyKeys;
}

function extractDestructuredParams(fileContent) {
  const paramNames = new Set();
  
  const functionPattern = /function\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(\s*\{\s*([^}]+)\}\s*\)/g;
  const arrowPattern = /\(\s*\{\s*([^}]+)\}\s*\)\s*=>/g;
  
  let match;
  
  while ((match = functionPattern.exec(fileContent)) !== null) {
    const params = match[1].split(',').map(p => p.trim());
    for (const param of params) {
      const name = param.split(':')[0].trim();
      if (name) paramNames.add(name);
    }
  }
  
  while ((match = arrowPattern.exec(fileContent)) !== null) {
    const params = match[1].split(',').map(p => p.trim());
    for (const param of params) {
      const name = param.split(':')[0].trim();
      if (name) paramNames.add(name);
    }
  }
  
  return paramNames;
}

function buildPreserveSet(orderedFiles) {
  const preserveSet = new Set();
  const usedShortNames = new Set();
  
  const shortNamePattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]{0,1})\b/g;
  
  for (const file of orderedFiles) {
    const exports = extractExportedNames(file.content);
    for (const name of exports) {
      preserveSet.add(name);
      if (name.length <= 2) {
        usedShortNames.add(name);
      }
    }
    
    const imports = extractImportedNames(file.content);
    for (const name of imports) {
      preserveSet.add(name);
      if (name.length <= 2) {
        usedShortNames.add(name);
      }
    }
    
    if (file.dependencies) {
      for (const dep of file.dependencies) {
        preserveSet.add(dep);
        if (dep.length <= 2) {
          usedShortNames.add(dep);
        }
      }
    }
    
    const propertyKeys = extractObjectPropertyKeys(file.content);
    for (const key of propertyKeys) {
      preserveSet.add(key);
      if (key.length <= 2) {
        usedShortNames.add(key);
      }
    }
    
    const destructuredParams = extractDestructuredParams(file.content);
    for (const param of destructuredParams) {
      preserveSet.add(param);
      if (param.length <= 2) {
        usedShortNames.add(param);
      }
    }
    
    let match;
    while ((match = shortNamePattern.exec(file.content)) !== null) {
      const name = match[1];
      if (name.length <= 2 && /^[a-zA-Z_$][a-zA-Z0-9_$]?$/.test(name)) {
        usedShortNames.add(name);
      }
    }
  }
  
  return { preserveSet, usedShortNames };
}

function rewriteAllImports(orderedFiles, allFiles, modules, compiledNoteName, cssData) {
  const allFileNames = allFiles.map(f => f.nameWithoutExt);

  console.log(`[Compiler] Rewriting imports for ${orderedFiles.length} files`);

  for (const file of orderedFiles) {
    // First: Rewrite JS imports
    file.content = modules.rewriteImports(file.content, allFileNames, compiledNoteName);
    
    // Second: Re-detect CSS references in the UPDATED content with new correct indices
    const cssRefs = modules.detectCssReferences(file.content);
    
    if (cssRefs && cssRefs.length > 0) {
      console.log(`[Compiler] File "${file.nameWithoutExt}" has ${cssRefs.length} CSS references in updated content`);
      
      // Filter to only rewrite CSS references that were successfully resolved
      const resolvedRefs = cssRefs.filter(ref => {
        if (ref.pattern === 'headerLink') return true; // Already converted
        
        // Check if this CSS file was bundled
        // For partial paths, check if the filename was resolved
        if (ref.isPartialPath && ref.filePath) {
          const wasResolved = cssData.resolvedCssRefs.has(ref.filePath);
          if (!wasResolved) {
            console.log(`[Compiler] Skipping unresolved partial CSS: ${ref.filePath}`);
          }
          return wasResolved;
        }
        
        // For full paths, check the path directly
        if (ref.filePath) {
          const wasResolved = cssData.resolvedCssRefs.has(ref.filePath);
          if (!wasResolved) {
            console.log(`[Compiler] Skipping unresolved CSS path: ${ref.filePath}`);
          }
          return wasResolved;
        }
        
        return false;
      });
      
      console.log(`[Compiler] ${resolvedRefs.length} of ${cssRefs.length} CSS references will be rewritten`);
      
      if (resolvedRefs.length > 0) {
        // Update resolvedPath for partial references
        for (const ref of resolvedRefs) {
          if (ref.isPartialPath && ref.filePath && !ref.resolvedPath) {
            // Find the full path from our bundled files
            for (const cssFile of cssData.cssFiles) {
              if (cssFile.name === ref.filePath) {
                ref.resolvedPath = cssFile.path;
                console.log(`[Compiler] Resolved ${ref.filePath} to ${cssFile.path}`);
                break;
              }
            }
          }
        }
        
        const beforeLength = file.content.length;
        file.content = modules.rewriteCssReferences(file.content, resolvedRefs, compiledNoteName);
        const afterLength = file.content.length;
        console.log(`[Compiler] Content length change: ${beforeLength} -> ${afterLength} (${afterLength - beforeLength > 0 ? '+' : ''}${afterLength - beforeLength})`);
      }
    }
  }
}

function applyMinification(orderedFiles, modules, minifyOptions) {
  let globalCounter = 0;
  const { preserveSet, usedShortNames } = buildPreserveSet(orderedFiles);
  
  console.log('[Obfuscation] Preserved names:', Array.from(preserveSet));
  console.log('[Obfuscation] Pre-existing short names:', Array.from(usedShortNames));
  
  for (const file of orderedFiles) {
    if (minifyOptions.obfuscate) {
      console.log(`[Obfuscation] Processing ${file.nameWithoutExt}, counter start: ${globalCounter}`);
      const result = modules.minifyWithObfuscation(
        file.content, 
        { ...minifyOptions, counterStart: globalCounter, preserveNames: preserveSet, usedShortNames }
      );
      file.content = result.code;
      console.log(`[Obfuscation] Finished ${file.nameWithoutExt}, counter end: ${result.nextCounter}`);
      globalCounter = result.nextCounter;
    } else {
      file.content = modules.minify(file.content, minifyOptions);
    }
  }
  
  console.log('[Obfuscation] Final counter:', globalCounter);
}

async function ensureOutputDirectory(outputDir) {
  try {
    const exists = await dc.app.vault.adapter.exists(outputDir);
    if (!exists) {
      await dc.app.vault.adapter.mkdir(outputDir);
    }
  } catch (error) {
    throw new Error(`Failed to create output directory: ${outputDir}. ${error.message}`);
  }
}

function buildResult(writeResult, filesProcessed, cssFilesProcessed, versionPath = null, changelogPath = null, copiedFiles = []) {
  if (writeResult.success) {
    const result = {
      success: true,
      outputPath: writeResult.path,
      filesProcessed,
      cssFilesProcessed
    };
    
    if (versionPath) {
      result.versionPath = versionPath;
    }
    
    if (changelogPath) {
      result.changelogPath = changelogPath;
    }
    
    if (copiedFiles.length > 0) {
      result.copiedFiles = copiedFiles;
    }
    
    return result;
  } else {
    return {
      success: false,
      error: writeResult.error,
      filesProcessed,
      cssFilesProcessed
    };
  }
}

return { compile };
```

# CompilerUI

```jsx
// CompilerUI.jsx - User interface for the Datacore Script Compiler

const { compile } = await dc.require(dc.headerLink(dc.resolvePath("datacore-compiler"), "compiler"));

const { useState, useEffect, useRef } = dc;

function fuzzyMatch(text, query) {
  if (!query) return true;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
}

function scoreMatch(text, query) {
  if (!query) return 0;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  if (textLower === queryLower) return 1000;
  if (textLower.startsWith(queryLower)) return 500;
  if (textLower.includes(queryLower)) return 250;
  return 100;
}

function AutocompleteInput({ 
  value, 
  onChange, 
  onSelect,
  placeholder, 
  disabled,
  getSuggestions,
  maxSuggestions = 10
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [userIsTyping, setUserIsTyping] = useState(false);
  
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const justSelectedRef = useRef(false);
  const suggestionRefs = useRef([]);
  const isKeyboardNavRef = useRef(false);

  // Scroll selected item into view when navigating with keyboard only
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionRefs.current[selectedIndex] && isKeyboardNavRef.current) {
      const element = suggestionRefs.current[selectedIndex];
      const container = element?.parentElement;
      if (container) {
        const elementTop = element.offsetTop;
        const elementBottom = elementTop + element.offsetHeight;
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        
        if (elementTop < containerTop) {
          container.scrollTop = elementTop;
        } else if (elementBottom > containerBottom) {
          container.scrollTop = elementBottom - container.clientHeight;
        }
      }
      isKeyboardNavRef.current = false;
    }
  }, [selectedIndex]);

  useEffect(() => {
    const loadSuggestions = async () => {
      if (!value || value.length < 1) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }

      setIsLoading(true);
      
      try {
        const allSuggestions = await getSuggestions(value);
        
        const matches = allSuggestions
          .filter(item => fuzzyMatch(item, value))
          .map(item => ({
            text: item,
            score: scoreMatch(item, value)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSuggestions)
          .map(item => item.text);

        setSuggestions(matches);
        
        if (userIsTyping) {
          setShowSuggestions(matches.length > 0);
        }
        
        if (matches.length > 0 && selectedIndex >= matches.length) {
          setSelectedIndex(matches.length - 1);
        }
      } catch (error) {
        console.error('Error loading suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadSuggestions();
  }, [value, getSuggestions, maxSuggestions, userIsTyping]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    setUserIsTyping(true);
    onChange(e);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          selectSuggestion(suggestions[selectedIndex]);
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setUserIsTyping(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const selectSuggestion = (suggestion) => {
    justSelectedRef.current = true;
    setUserIsTyping(false);
    onChange({ target: { value: suggestion } });
    if (onSelect) onSelect(suggestion);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleFocus = () => {
    if (value && suggestions.length > 0 && userIsTyping) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setUserIsTyping(false);
    }, 200);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{ 
          width: '100%',
          padding: '10px 12px',
          fontSize: '14px',
          backgroundColor: 'var(--background-primary-alt)',
          color: 'var(--text-normal)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          boxSizing: 'border-box'
        }}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          backgroundColor: 'var(--background-primary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              ref={el => suggestionRefs.current[index] = el}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex 
                  ? 'var(--background-modifier-hover)' 
                  : 'transparent',
                fontSize: '14px',
                color: 'var(--text-normal)',
                fontFamily: 'var(--font-monospace)'
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
      
      {isLoading && (
        <div style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '12px',
          color: 'var(--text-muted)'
        }}>
          Loading...
        </div>
      )}
    </div>
  );
}


function CompilerUI() {
  const [projectDir, setProjectDir] = useState('');
  const [mainComponent, setMainComponent] = useState('');
  const [outputName, setOutputName] = useState('');
  const [status, setStatus] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [result, setResult] = useState(null);
  const [minifyEnabled, setMinifyEnabled] = useState(false);
  const [obfuscateEnabled, setObfuscateEnabled] = useState(false);
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [outputDir, setOutputDir] = useState('dist');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [additionalFiles, setAdditionalFiles] = useState([]);
  const [showAdditionalFiles, setShowAdditionalFiles] = useState(false);
  const [fileInput, setFileInput] = useState('');


  const [allDirectories, setAllDirectories] = useState(null);
  const [allVaultFiles, setAllVaultFiles] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const dirs = await getAllDirectories();
        setAllDirectories(dirs);
        
        const files = await getAllVaultFiles();
        setAllVaultFiles(files);
      } catch (error) {
        console.error('Failed to load vault data:', error);
        setAllDirectories([]);
        setAllVaultFiles([]);
      }
    };
    
    loadData();
  }, []);

  async function getAllDirectories() {
    const directories = [];
    
    async function scanDir(path) {
      try {
        const contents = await dc.app.vault.adapter.list(path);
        
        for (const folder of contents.folders) {
          directories.push(folder);
          await scanDir(folder);
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await scanDir('');
    
    directories.sort((a, b) => {
      const aHasHidden = a.split('/').some(segment => segment.startsWith('.'));
      const bHasHidden = b.split('/').some(segment => segment.startsWith('.'));
      
      if (aHasHidden !== bHasHidden) {
        return aHasHidden ? 1 : -1;
      }
      return a.localeCompare(b);
    });
    
    return directories;
  }

  async function getAllVaultFiles() {
    const files = [];
    
    async function scanDir(path) {
      try {
        const contents = await dc.app.vault.adapter.list(path);
        
        for (const filePath of contents.files) {
          // Skip hidden files and system files
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
          if (!fileName.startsWith('.')) {
            files.push(filePath);
          }
        }
        
        for (const folder of contents.folders) {
          await scanDir(folder);
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await scanDir('');
    
    // Sort files alphabetically, with hidden paths at the end
    files.sort((a, b) => {
      const aHasHidden = a.split('/').some(segment => segment.startsWith('.'));
      const bHasHidden = b.split('/').some(segment => segment.startsWith('.'));
      
      if (aHasHidden !== bHasHidden) {
        return aHasHidden ? 1 : -1;
      }
      return a.localeCompare(b);
    });
    
    return files;
  }

  async function getScriptFilesInDirectory(dirPath) {
    if (!dirPath) return [];
    
    try {
      const contents = await dc.app.vault.adapter.list(dirPath);
      const scriptExtensions = ['.js', '.jsx', '.ts', '.tsx'];
      
      const files = contents.files
        .filter(filePath => {
          const ext = filePath.substring(filePath.lastIndexOf('.'));
          return scriptExtensions.includes(ext);
        })
        .map(filePath => {
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
          return nameWithoutExt;
        });
      
      return files;
    } catch (error) {
      return [];
    }
  }

  const getDirectorySuggestions = async (query) => {
    if (!allDirectories) return [];
    return allDirectories;
  };

  const getMainComponentSuggestions = async (query) => {
    if (!projectDir) return [];
    return await getScriptFilesInDirectory(projectDir);
  };

  const updateOutputDefaults = (dir) => {
    if (!dir) {
      setOutputName('');
      setOutputDir('dist');
      return;
    }
    
    const segments = dir.split('/').filter(s => s.length > 0);
    const lastSegment = segments[segments.length - 1] || 'output';
    const defaultName = `compiled-${lastSegment}.md`;
    setOutputName(defaultName);
    
    // Set outputDir relative to project directory
    const defaultOutputDir = `${dir}/dist`;
    setOutputDir(defaultOutputDir);
  };

  const handleProjectDirChange = (e) => {
    const value = e.target.value;
    setProjectDir(value);
    updateOutputDefaults(value);
    setMainComponent('');
  };

  const handleProjectDirSelect = (value) => {
    setProjectDir(value);
    updateOutputDefaults(value);
    setMainComponent('');
  };

  const handleCompile = async () => {
    setResult(null);
    setStatus('');
    setIsCompiling(true);

    try {
      if (!projectDir.trim()) {
        setResult({
          success: false,
          error: 'Please enter a project directory path'
        });
        setIsCompiling(false);
        return;
      }

      if (!mainComponent.trim()) {
        setResult({
          success: false,
          error: 'Please enter the main component name'
        });
        setIsCompiling(false);
        return;
      }

      if (!outputName.trim()) {
        setResult({
          success: false,
          error: 'Please enter an output filename'
        });
        setIsCompiling(false);
        return;
      }

      setStatus('Loading compiler...');
      const activeFile = dc.app.workspace.getActiveFile().path;
      const { compile } = await dc.require(dc.headerLink(activeFile, "compiler"));

      setStatus('Scanning files...');
      const compileResult = await compile(
        projectDir.trim(),
        mainComponent.trim(),
        outputName.trim(),
        { 
          minify: minifyEnabled, 
          obfuscate: obfuscateEnabled,
          version: version.trim() || null,
          changelog: changelog.trim() || null,
          outputDir: outputDir.trim() || 'dist',
          includeDemo: includeDemo,
          additionalFiles: additionalFiles
        }
      );

      setResult(compileResult);
      setStatus('');
    } catch (error) {
      setResult({
        success: false,
        error: `Compilation failed: ${error.message}`
      });
      setStatus('');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleOpenFile = async () => {
    if (result && result.outputPath) {
      try {
        const file = dc.app.vault.getAbstractFileByPath(result.outputPath);
        if (file) {
          await dc.app.workspace.getLeaf().openFile(file);
        } else {
          new Notice(`File not found: ${result.outputPath}`);
        }
      } catch (error) {
        new Notice(`Failed to open file: ${error.message}`);
      }
    }
  };

  return (
    <div style={{ 
      fontFamily: 'var(--font-interface)', 
      padding: '24px', 
      maxWidth: '800px', 
      margin: '0 auto',
      backgroundColor: 'var(--background-primary)',
      color: 'var(--text-normal)',
      borderRadius: '8px'
    }}>
      <div style={{ 
        borderBottom: '2px solid var(--background-modifier-border)', 
        paddingBottom: '16px',
        marginBottom: '24px'
      }}>
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '8px',
          color: 'var(--text-normal)'
        }}>
          Datacore Script Compiler
        </h2>
        <p style={{ 
          margin: 0, 
          color: 'var(--text-muted)',
          fontSize: '14px'
        }}>
          Bundle multi-file Datacore projects into a single markdown file
        </p>
      </div>

      <div style={{ 
        display: 'grid', 
        gap: '20px',
        marginBottom: '24px'
      }}>
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Project Directory
          </label>
          <AutocompleteInput
            value={projectDir}
            onChange={handleProjectDirChange}
            onSelect={handleProjectDirSelect}
            placeholder="e.g., projects/my-app"
            disabled={isCompiling}
            getSuggestions={getDirectorySuggestions}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Vault-relative path to your project directory
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Main Component Name
          </label>
          <AutocompleteInput
            value={mainComponent}
            onChange={(e) => setMainComponent(e.target.value)}
            placeholder="e.g., MyApp (without extension)"
            disabled={isCompiling || !projectDir}
            getSuggestions={getMainComponentSuggestions}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Entry point component (filename without extension)
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Output Filename
          </label>
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="e.g., compiled-my-app.md"
            disabled={isCompiling}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Name for the compiled markdown file
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Output Directory
          </label>
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="e.g., dist"
            disabled={isCompiling}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Output directory relative to project root (updates automatically)
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Version (Optional)
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g., 1.0.0"
            disabled={isCompiling}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Creates a VERSION file in output directory
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Changelog (Optional)
          </label>
          <textarea
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder="## Version 1.0.0&#10;&#10;- Initial release&#10;- Added new features"
            disabled={isCompiling}
            rows={5}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box',
              fontFamily: 'var(--font-monospace)',
              resize: 'vertical'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Creates a CHANGELOG.md file in output directory
          </p>
        </div>

        <div style={{ marginTop: '16px', borderTop: '1px solid var(--background-modifier-border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => setShowAdditionalFiles(!showAdditionalFiles)}
              disabled={isCompiling}
              style={{
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: 'transparent',
                color: 'var(--text-normal)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                cursor: isCompiling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span style={{ transform: showAdditionalFiles ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
              Additional Files for Distribution
            </button>
            {additionalFiles.length > 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ({additionalFiles.length} file{additionalFiles.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>

          {showAdditionalFiles && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--background-primary-alt)', borderRadius: '4px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '500',
                color: 'var(--text-normal)',
                fontSize: '14px'
              }}>
                Add File
              </label>
              <AutocompleteInput
                value={fileInput}
                onChange={(e) => setFileInput(e.target.value)}
                onSelect={(filePath) => {
                  if (!additionalFiles.includes(filePath)) {
                    setAdditionalFiles([...additionalFiles, filePath]);
                  }
                  setFileInput('');
                }}
                placeholder="Search for files in vault..."
                disabled={isCompiling}
                getSuggestions={async () => allVaultFiles || []}
              />
              <p style={{ 
                margin: '4px 0 0 0', 
                fontSize: '12px', 
                color: 'var(--text-muted)'
              }}>
                Select files to copy to the output directory
              </p>

              {additionalFiles.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-normal)', marginBottom: '8px' }}>
                    Selected Files:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {additionalFiles.map((filePath, index) => (
                      <div 
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          backgroundColor: 'var(--background-primary)',
                          borderRadius: '4px',
                          fontSize: '13px'
                        }}
                      >
                        <span style={{ 
                          fontFamily: 'var(--font-monospace)',
                          color: 'var(--text-normal)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {filePath}
                        </span>
                        <button
                          onClick={() => setAdditionalFiles(additionalFiles.filter((_, i) => i !== index))}
                          disabled={isCompiling}
                          style={{
                            padding: '2px 8px',
                            fontSize: '12px',
                            backgroundColor: 'var(--background-modifier-error)',
                            color: 'var(--text-on-accent)',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: isCompiling ? 'not-allowed' : 'pointer',
                            marginLeft: '8px',
                            flexShrink: 0
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: isCompiling ? 'not-allowed' : 'pointer' }}>
            <input 
              type="checkbox" 
              checked={includeDemo}
              onChange={(e) => setIncludeDemo(e.target.checked)}
              disabled={isCompiling}
              style={{ cursor: isCompiling ? 'not-allowed' : 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--text-normal)' }}>Include demo callouts</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: isCompiling ? 'not-allowed' : 'pointer' }}>
            <input 
              type="checkbox" 
              checked={minifyEnabled}
              onChange={(e) => setMinifyEnabled(e.target.checked)}
              disabled={isCompiling}
              style={{ cursor: isCompiling ? 'not-allowed' : 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--text-normal)' }}>Minify output (Beta)</span>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: (isCompiling || !minifyEnabled) ? 'not-allowed' : 'pointer', opacity: !minifyEnabled ? 0.5 : 1 }}>
            <input 
              type="checkbox" 
              checked={obfuscateEnabled}
              onChange={(e) => setObfuscateEnabled(e.target.checked)}
              disabled={isCompiling || !minifyEnabled}
              style={{ cursor: (isCompiling || !minifyEnabled) ? 'not-allowed' : 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--text-normal)' }}>+ Obfuscate (Beta)</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleCompile}
        disabled={isCompiling || !projectDir || !mainComponent || !outputName}
        style={{
          width: '100%',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: '500',
          backgroundColor: isCompiling || !projectDir || !mainComponent || !outputName 
            ? 'var(--background-modifier-border)' 
            : 'var(--interactive-accent)',
          color: isCompiling || !projectDir || !mainComponent || !outputName
            ? 'var(--text-muted)'
            : 'var(--text-on-accent)',
          border: 'none',
          borderRadius: '6px',
          cursor: isCompiling || !projectDir || !mainComponent || !outputName 
            ? 'not-allowed' 
            : 'pointer',
          transition: 'background-color 0.2s'
        }}
      >
        {isCompiling ? 'Compiling...' : 'Compile Project'}
      </button>

      {status && (
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          backgroundColor: 'var(--background-secondary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          color: 'var(--text-accent)',
          fontSize: '14px'
        }}>
          {status}
        </div>
      )}

      {result && !result.success && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: 'rgba(var(--color-red-rgb), 0.1)',
          border: '1px solid var(--color-red)',
          borderRadius: '6px'
        }}>
          <strong style={{ color: 'var(--color-red)', fontSize: '14px' }}>
            Error
          </strong>
          <pre style={{ 
            margin: '8px 0 0 0', 
            color: 'var(--text-normal)',
            fontSize: '13px',
            fontFamily: 'var(--font-monospace)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {result.error}
          </pre>
        </div>
      )}

      {result && result.success && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: 'rgba(var(--color-green-rgb), 0.1)',
          border: '1px solid var(--color-green)',
          borderRadius: '6px'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'var(--color-green)', fontSize: '14px' }}>
              Success!
            </strong>
          </div>
          
          <div style={{ 
            fontSize: '14px', 
            color: 'var(--text-normal)',
            marginBottom: '8px'
          }}>
            Compiled {result.filesProcessed} file{result.filesProcessed !== 1 ? 's' : ''}
            {result.cssFilesProcessed > 0 && ` and ${result.cssFilesProcessed} CSS file${result.cssFilesProcessed !== 1 ? 's' : ''}`}
          </div>
          
          <div style={{ 
            fontSize: '13px', 
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-monospace)',
            marginBottom: result.versionPath || result.changelogPath ? '4px' : '12px'
          }}>
            Output: {result.outputPath}
          </div>
          
          {result.versionPath && (
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-monospace)',
              marginBottom: result.changelogPath ? '4px' : '12px'
            }}>
              VERSION: {result.versionPath}
            </div>
          )}
          
          {result.changelogPath && (
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-monospace)',
              marginBottom: result.copiedFiles && result.copiedFiles.length > 0 ? '4px' : '12px'
            }}>
              CHANGELOG: {result.changelogPath}
            </div>
          )}
          
          {result.copiedFiles && result.copiedFiles.length > 0 && (
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-monospace)',
              marginBottom: '12px'
            }}>
              <div style={{ marginBottom: '4px' }}>
                Additional files ({result.copiedFiles.length}):
              </div>
              {result.copiedFiles.map((filePath, idx) => (
                <div key={idx} style={{ paddingLeft: '8px', fontSize: '12px' }}>
                  • {filePath}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleOpenFile}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: 'var(--interactive-accent)',
              color: 'var(--text-on-accent)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Open Compiled File
          </button>
        </div>
      )}
    </div>
  );
}

return { View: CompilerUI };
```
