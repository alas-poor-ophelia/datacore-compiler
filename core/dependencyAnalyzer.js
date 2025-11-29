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