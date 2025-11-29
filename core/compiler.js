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