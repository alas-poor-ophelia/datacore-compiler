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