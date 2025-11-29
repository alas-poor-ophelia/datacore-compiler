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