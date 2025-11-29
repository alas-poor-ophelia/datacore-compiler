// CompilerUI.jsx - User interface for the Datacore Script Compiler

const { compile } = await dc.require(dc.resolvePath("compiler.js"));

const { useState, useEffect, useRef } = dc;

function fuzzyMatch(text, query) {
  if (!query) return true;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
}

function scoreMatch(text, query) {
  if (!query) return 0;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  if (textLower === queryLower) return 1000;
  if (textLower.startsWith(queryLower)) return 500;
  if (textLower.includes(queryLower)) return 250;
  return 100;
}

function AutocompleteInput({ 
  value, 
  onChange, 
  onSelect,
  placeholder, 
  disabled,
  getSuggestions,
  maxSuggestions = 10
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [userIsTyping, setUserIsTyping] = useState(false);
  
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const justSelectedRef = useRef(false);
  const suggestionRefs = useRef([]);
  const isKeyboardNavRef = useRef(false);

  // Scroll selected item into view when navigating with keyboard only
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionRefs.current[selectedIndex] && isKeyboardNavRef.current) {
      const element = suggestionRefs.current[selectedIndex];
      const container = element?.parentElement;
      if (container) {
        const elementTop = element.offsetTop;
        const elementBottom = elementTop + element.offsetHeight;
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        
        if (elementTop < containerTop) {
          container.scrollTop = elementTop;
        } else if (elementBottom > containerBottom) {
          container.scrollTop = elementBottom - container.clientHeight;
        }
      }
      isKeyboardNavRef.current = false;
    }
  }, [selectedIndex]);

  useEffect(() => {
    const loadSuggestions = async () => {
      if (!value || value.length < 1) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }

      setIsLoading(true);
      
      try {
        const allSuggestions = await getSuggestions(value);
        
        const matches = allSuggestions
          .filter(item => fuzzyMatch(item, value))
          .map(item => ({
            text: item,
            score: scoreMatch(item, value)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSuggestions)
          .map(item => item.text);

        setSuggestions(matches);
        
        if (userIsTyping) {
          setShowSuggestions(matches.length > 0);
        }
        
        if (matches.length > 0 && selectedIndex >= matches.length) {
          setSelectedIndex(matches.length - 1);
        }
      } catch (error) {
        console.error('Error loading suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadSuggestions();
  }, [value, getSuggestions, maxSuggestions, userIsTyping]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    setUserIsTyping(true);
    onChange(e);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          selectSuggestion(suggestions[selectedIndex]);
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setUserIsTyping(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const selectSuggestion = (suggestion) => {
    justSelectedRef.current = true;
    setUserIsTyping(false);
    onChange({ target: { value: suggestion } });
    if (onSelect) onSelect(suggestion);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleFocus = () => {
    if (value && suggestions.length > 0 && userIsTyping) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setUserIsTyping(false);
    }, 200);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{ 
          width: '100%',
          padding: '10px 12px',
          fontSize: '14px',
          backgroundColor: 'var(--background-primary-alt)',
          color: 'var(--text-normal)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          boxSizing: 'border-box'
        }}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          backgroundColor: 'var(--background-primary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              ref={el => suggestionRefs.current[index] = el}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex 
                  ? 'var(--background-modifier-hover)' 
                  : 'transparent',
                fontSize: '14px',
                color: 'var(--text-normal)',
                fontFamily: 'var(--font-monospace)'
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
      
      {isLoading && (
        <div style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '12px',
          color: 'var(--text-muted)'
        }}>
          Loading...
        </div>
      )}
    </div>
  );
}


function CompilerUI() {
  const [projectDir, setProjectDir] = useState('');
  const [mainComponent, setMainComponent] = useState('');
  const [outputName, setOutputName] = useState('');
  const [status, setStatus] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [result, setResult] = useState(null);
  const [minifyEnabled, setMinifyEnabled] = useState(false);
  const [obfuscateEnabled, setObfuscateEnabled] = useState(false);
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [outputDir, setOutputDir] = useState('dist');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [additionalFiles, setAdditionalFiles] = useState([]);
  const [showAdditionalFiles, setShowAdditionalFiles] = useState(false);
  const [fileInput, setFileInput] = useState('');


  const [allDirectories, setAllDirectories] = useState(null);
  const [allVaultFiles, setAllVaultFiles] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const dirs = await getAllDirectories();
        setAllDirectories(dirs);
        
        const files = await getAllVaultFiles();
        setAllVaultFiles(files);
      } catch (error) {
        console.error('Failed to load vault data:', error);
        setAllDirectories([]);
        setAllVaultFiles([]);
      }
    };
    
    loadData();
  }, []);

  async function getAllDirectories() {
    const directories = [];
    
    async function scanDir(path) {
      try {
        const contents = await dc.app.vault.adapter.list(path);
        
        for (const folder of contents.folders) {
          directories.push(folder);
          await scanDir(folder);
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await scanDir('');
    
    directories.sort((a, b) => {
      const aHasHidden = a.split('/').some(segment => segment.startsWith('.'));
      const bHasHidden = b.split('/').some(segment => segment.startsWith('.'));
      
      if (aHasHidden !== bHasHidden) {
        return aHasHidden ? 1 : -1;
      }
      return a.localeCompare(b);
    });
    
    return directories;
  }

  async function getAllVaultFiles() {
    const files = [];
    
    async function scanDir(path) {
      try {
        const contents = await dc.app.vault.adapter.list(path);
        
        for (const filePath of contents.files) {
          // Skip hidden files and system files
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
          if (!fileName.startsWith('.')) {
            files.push(filePath);
          }
        }
        
        for (const folder of contents.folders) {
          await scanDir(folder);
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await scanDir('');
    
    // Sort files alphabetically, with hidden paths at the end
    files.sort((a, b) => {
      const aHasHidden = a.split('/').some(segment => segment.startsWith('.'));
      const bHasHidden = b.split('/').some(segment => segment.startsWith('.'));
      
      if (aHasHidden !== bHasHidden) {
        return aHasHidden ? 1 : -1;
      }
      return a.localeCompare(b);
    });
    
    return files;
  }

  async function getScriptFilesInDirectory(dirPath) {
    if (!dirPath) return [];
    
    try {
      const contents = await dc.app.vault.adapter.list(dirPath);
      const scriptExtensions = ['.js', '.jsx', '.ts', '.tsx'];
      
      const files = contents.files
        .filter(filePath => {
          const ext = filePath.substring(filePath.lastIndexOf('.'));
          return scriptExtensions.includes(ext);
        })
        .map(filePath => {
          const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
          return nameWithoutExt;
        });
      
      return files;
    } catch (error) {
      return [];
    }
  }

  const getDirectorySuggestions = async (query) => {
    if (!allDirectories) return [];
    return allDirectories;
  };

  const getMainComponentSuggestions = async (query) => {
    if (!projectDir) return [];
    return await getScriptFilesInDirectory(projectDir);
  };

  const updateOutputDefaults = (dir) => {
    if (!dir) {
      setOutputName('');
      setOutputDir('dist');
      return;
    }
    
    const segments = dir.split('/').filter(s => s.length > 0);
    const lastSegment = segments[segments.length - 1] || 'output';
    const defaultName = `compiled-${lastSegment}.md`;
    setOutputName(defaultName);
    
    // Set outputDir relative to project directory
    const defaultOutputDir = `${dir}/dist`;
    setOutputDir(defaultOutputDir);
  };

  const handleProjectDirChange = (e) => {
    const value = e.target.value;
    setProjectDir(value);
    updateOutputDefaults(value);
    setMainComponent('');
  };

  const handleProjectDirSelect = (value) => {
    setProjectDir(value);
    updateOutputDefaults(value);
    setMainComponent('');
  };

  const handleCompile = async () => {
    setResult(null);
    setStatus('');
    setIsCompiling(true);

    try {
      if (!projectDir.trim()) {
        setResult({
          success: false,
          error: 'Please enter a project directory path'
        });
        setIsCompiling(false);
        return;
      }

      if (!mainComponent.trim()) {
        setResult({
          success: false,
          error: 'Please enter the main component name'
        });
        setIsCompiling(false);
        return;
      }

      if (!outputName.trim()) {
        setResult({
          success: false,
          error: 'Please enter an output filename'
        });
        setIsCompiling(false);
        return;
      }

      setStatus('Loading compiler...');
      const activeFile = dc.app.workspace.getActiveFile().path;
      const { compile } = await dc.require(dc.headerLink(activeFile, "compiler"));

      setStatus('Scanning files...');
      const compileResult = await compile(
        projectDir.trim(),
        mainComponent.trim(),
        outputName.trim(),
        { 
          minify: minifyEnabled, 
          obfuscate: obfuscateEnabled,
          version: version.trim() || null,
          changelog: changelog.trim() || null,
          outputDir: outputDir.trim() || 'dist',
          includeDemo: includeDemo,
          additionalFiles: additionalFiles
        }
      );

      setResult(compileResult);
      setStatus('');
    } catch (error) {
      setResult({
        success: false,
        error: `Compilation failed: ${error.message}`
      });
      setStatus('');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleOpenFile = async () => {
    if (result && result.outputPath) {
      try {
        const file = dc.app.vault.getAbstractFileByPath(result.outputPath);
        if (file) {
          await dc.app.workspace.getLeaf().openFile(file);
        } else {
          new Notice(`File not found: ${result.outputPath}`);
        }
      } catch (error) {
        new Notice(`Failed to open file: ${error.message}`);
      }
    }
  };

  return (
    <div style={{ 
      fontFamily: 'var(--font-interface)', 
      padding: '24px', 
      maxWidth: '800px', 
      margin: '0 auto',
      backgroundColor: 'var(--background-primary)',
      color: 'var(--text-normal)',
      borderRadius: '8px'
    }}>
      <div style={{ 
        borderBottom: '2px solid var(--background-modifier-border)', 
        paddingBottom: '16px',
        marginBottom: '24px'
      }}>
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '8px',
          color: 'var(--text-normal)'
        }}>
          Datacore Script Compiler
        </h2>
        <p style={{ 
          margin: 0, 
          color: 'var(--text-muted)',
          fontSize: '14px'
        }}>
          Bundle multi-file Datacore projects into a single markdown file
        </p>
      </div>

      <div style={{ 
        display: 'grid', 
        gap: '20px',
        marginBottom: '24px'
      }}>
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Project Directory
          </label>
          <AutocompleteInput
            value={projectDir}
            onChange={handleProjectDirChange}
            onSelect={handleProjectDirSelect}
            placeholder="e.g., projects/my-app"
            disabled={isCompiling}
            getSuggestions={getDirectorySuggestions}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Vault-relative path to your project directory
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Main Component Name
          </label>
          <AutocompleteInput
            value={mainComponent}
            onChange={(e) => setMainComponent(e.target.value)}
            placeholder="e.g., MyApp (without extension)"
            disabled={isCompiling || !projectDir}
            getSuggestions={getMainComponentSuggestions}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Entry point component (filename without extension)
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Output Filename
          </label>
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="e.g., compiled-my-app.md"
            disabled={isCompiling}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Name for the compiled markdown file
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Output Directory
          </label>
          <input
            type="text"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            placeholder="e.g., dist"
            disabled={isCompiling}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Output directory relative to project root (updates automatically)
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Version (Optional)
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g., 1.0.0"
            disabled={isCompiling}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Creates a VERSION file in output directory
          </p>
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '500',
            color: 'var(--text-normal)'
          }}>
            Changelog (Optional)
          </label>
          <textarea
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder="## Version 1.0.0&#10;&#10;- Initial release&#10;- Added new features"
            disabled={isCompiling}
            rows={5}
            style={{ 
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--background-primary-alt)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              boxSizing: 'border-box',
              fontFamily: 'var(--font-monospace)',
              resize: 'vertical'
            }}
          />
          <p style={{ 
            margin: '4px 0 0 0', 
            fontSize: '12px', 
            color: 'var(--text-muted)'
          }}>
            Creates a CHANGELOG.md file in output directory
          </p>
        </div>

        <div style={{ marginTop: '16px', borderTop: '1px solid var(--background-modifier-border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => setShowAdditionalFiles(!showAdditionalFiles)}
              disabled={isCompiling}
              style={{
                padding: '4px 8px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: 'transparent',
                color: 'var(--text-normal)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                cursor: isCompiling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span style={{ transform: showAdditionalFiles ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
              Additional Files for Distribution
            </button>
            {additionalFiles.length > 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ({additionalFiles.length} file{additionalFiles.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>

          {showAdditionalFiles && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--background-primary-alt)', borderRadius: '4px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '500',
                color: 'var(--text-normal)',
                fontSize: '14px'
              }}>
                Add File
              </label>
              <AutocompleteInput
                value={fileInput}
                onChange={(e) => setFileInput(e.target.value)}
                onSelect={(filePath) => {
                  if (!additionalFiles.includes(filePath)) {
                    setAdditionalFiles([...additionalFiles, filePath]);
                  }
                  setFileInput('');
                }}
                placeholder="Search for files in vault..."
                disabled={isCompiling}
                getSuggestions={async () => allVaultFiles || []}
              />
              <p style={{ 
                margin: '4px 0 0 0', 
                fontSize: '12px', 
                color: 'var(--text-muted)'
              }}>
                Select files to copy to the output directory
              </p>

              {additionalFiles.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-normal)', marginBottom: '8px' }}>
                    Selected Files:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {additionalFiles.map((filePath, index) => (
                      <div 
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          backgroundColor: 'var(--background-primary)',
                          borderRadius: '4px',
                          fontSize: '13px'
                        }}
                      >
                        <span style={{ 
                          fontFamily: 'var(--font-monospace)',
                          color: 'var(--text-normal)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {filePath}
                        </span>
                        <button
                          onClick={() => setAdditionalFiles(additionalFiles.filter((_, i) => i !== index))}
                          disabled={isCompiling}
                          style={{
                            padding: '2px 8px',
                            fontSize: '12px',
                            backgroundColor: 'var(--background-modifier-error)',
                            color: 'var(--text-on-accent)',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: isCompiling ? 'not-allowed' : 'pointer',
                            marginLeft: '8px',
                            flexShrink: 0
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: isCompiling ? 'not-allowed' : 'pointer' }}>
            <input 
              type="checkbox" 
              checked={includeDemo}
              onChange={(e) => setIncludeDemo(e.target.checked)}
              disabled={isCompiling}
              style={{ cursor: isCompiling ? 'not-allowed' : 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--text-normal)' }}>Include demo callouts</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: isCompiling ? 'not-allowed' : 'pointer' }}>
            <input 
              type="checkbox" 
              checked={minifyEnabled}
              onChange={(e) => setMinifyEnabled(e.target.checked)}
              disabled={isCompiling}
              style={{ cursor: isCompiling ? 'not-allowed' : 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--text-normal)' }}>Minify output (Beta)</span>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: (isCompiling || !minifyEnabled) ? 'not-allowed' : 'pointer', opacity: !minifyEnabled ? 0.5 : 1 }}>
            <input 
              type="checkbox" 
              checked={obfuscateEnabled}
              onChange={(e) => setObfuscateEnabled(e.target.checked)}
              disabled={isCompiling || !minifyEnabled}
              style={{ cursor: (isCompiling || !minifyEnabled) ? 'not-allowed' : 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: 'var(--text-normal)' }}>+ Obfuscate (Beta)</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleCompile}
        disabled={isCompiling || !projectDir || !mainComponent || !outputName}
        style={{
          width: '100%',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: '500',
          backgroundColor: isCompiling || !projectDir || !mainComponent || !outputName 
            ? 'var(--background-modifier-border)' 
            : 'var(--interactive-accent)',
          color: isCompiling || !projectDir || !mainComponent || !outputName
            ? 'var(--text-muted)'
            : 'var(--text-on-accent)',
          border: 'none',
          borderRadius: '6px',
          cursor: isCompiling || !projectDir || !mainComponent || !outputName 
            ? 'not-allowed' 
            : 'pointer',
          transition: 'background-color 0.2s'
        }}
      >
        {isCompiling ? 'Compiling...' : 'Compile Project'}
      </button>

      {status && (
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          backgroundColor: 'var(--background-secondary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          color: 'var(--text-accent)',
          fontSize: '14px'
        }}>
          {status}
        </div>
      )}

      {result && !result.success && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: 'rgba(var(--color-red-rgb), 0.1)',
          border: '1px solid var(--color-red)',
          borderRadius: '6px'
        }}>
          <strong style={{ color: 'var(--color-red)', fontSize: '14px' }}>
            Error
          </strong>
          <pre style={{ 
            margin: '8px 0 0 0', 
            color: 'var(--text-normal)',
            fontSize: '13px',
            fontFamily: 'var(--font-monospace)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {result.error}
          </pre>
        </div>
      )}

      {result && result.success && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: 'rgba(var(--color-green-rgb), 0.1)',
          border: '1px solid var(--color-green)',
          borderRadius: '6px'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'var(--color-green)', fontSize: '14px' }}>
              Success!
            </strong>
          </div>
          
          <div style={{ 
            fontSize: '14px', 
            color: 'var(--text-normal)',
            marginBottom: '8px'
          }}>
            Compiled {result.filesProcessed} file{result.filesProcessed !== 1 ? 's' : ''}
            {result.cssFilesProcessed > 0 && ` and ${result.cssFilesProcessed} CSS file${result.cssFilesProcessed !== 1 ? 's' : ''}`}
          </div>
          
          <div style={{ 
            fontSize: '13px', 
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-monospace)',
            marginBottom: result.versionPath || result.changelogPath ? '4px' : '12px'
          }}>
            Output: {result.outputPath}
          </div>
          
          {result.versionPath && (
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-monospace)',
              marginBottom: result.changelogPath ? '4px' : '12px'
            }}>
              VERSION: {result.versionPath}
            </div>
          )}
          
          {result.changelogPath && (
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-monospace)',
              marginBottom: result.copiedFiles && result.copiedFiles.length > 0 ? '4px' : '12px'
            }}>
              CHANGELOG: {result.changelogPath}
            </div>
          )}
          
          {result.copiedFiles && result.copiedFiles.length > 0 && (
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-monospace)',
              marginBottom: '12px'
            }}>
              <div style={{ marginBottom: '4px' }}>
                Additional files ({result.copiedFiles.length}):
              </div>
              {result.copiedFiles.map((filePath, idx) => (
                <div key={idx} style={{ paddingLeft: '8px', fontSize: '12px' }}>
                  • {filePath}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleOpenFile}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: 'var(--interactive-accent)',
              color: 'var(--text-on-accent)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Open Compiled File
          </button>
        </div>
      )}
    </div>
  );
}

return { CompilerUI };