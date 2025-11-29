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