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