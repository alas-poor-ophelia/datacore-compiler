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