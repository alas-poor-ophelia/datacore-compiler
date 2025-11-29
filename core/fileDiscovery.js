// fileDiscovery.js - Scan directory and collect all script files

const { normalizePath, getFileExtension, getFileName, removeExtension } = await dc.require(dc.resolvePath("utils.js"));
const { SCRIPT_EXTENSIONS, ERROR_MESSAGES } = await dc.require(dc.resolvePath("constants.js"));

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