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