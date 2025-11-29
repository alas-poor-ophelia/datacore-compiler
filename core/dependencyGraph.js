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