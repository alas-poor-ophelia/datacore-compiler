# Datacore Script Compiler

A bundling tool for Obsidian that compiles multi-file JavaScript/JSX projects into single markdown files compatible with the Datacore plugin. 

Runs in Obsidian and requires Datacore.

## What it does

Datacore executes scripts from markdown code blocks, but complex projects often span multiple files. This compiler:

- Scans a project directory for `.js`, `.jsx`, `.ts`, `.tsx` files
- Analyzes dependencies between files
- Rewrites imports to use Datacore's `dc.headerLink()` system
- Bundles everything into one markdown file with each module as a separate header section
- Detects and bundles CSS files referenced in your code

The compiled output works as a self-contained script that can be shared or used across different vault structures.

## Features

- **Automatic dependency resolution** — figures out the correct load order
- **CSS bundling** — detects CSS file reads and includes them as JavaScript modules
- **Minification** (beta) — optional whitespace/comment removal
- **Circular dependency detection** 
- **Autocomplete in your vault** — project directory and file selection in the UI
- **Customizable output directory**
- **Additional file bundling** — Select any other files in your vault you want to copy to your output folder (designed to kinda work with GitHub Actions, or anything where you want to target an entire folder to zip and distribute)

## Usage

1. Open the compiler note in Obsidian (the one containing the CompilerUI component)
2. Enter the path to your project directory (vault-relative, e.g., `projects/my-app`)
3. Select the main component (entry point filename without extension)
4. Specify an output filename
5. Click **Compile Project**

The compiled markdown file will be created at the root of your vault. Open it to see a demo section showing how to use the bundled script.

## Import patterns supported

The compiler recognizes and rewrites these patterns:

```javascript
// Direct path
const { Something } = await dc.require('path/to/Module.js');

// Using resolvePath
const { Something } = await dc.require(dc.resolvePath('Module.js'));
```

All get rewritten to:

```javascript
const { Something } = await dc.require(dc.headerLink(dc.resolvePath("compiled-output"), "Module"));
```

## CSS handling

CSS files are detected when loaded into variables containing "css" or "style" in the name:

```javascript
const fontCss = await dc.app.vault.adapter.read(`styles/fonts.css`);
```

These are bundled as JavaScript modules returning the CSS string, which you can inject via `<style>{fontCss}</style>` (the compiler will attempt to do this automatically, but won't necessarily handle other patterns).

## Limitations

- All filenames must be unique across the project (even in subdirectories)
- External data files (JSON, YAML) are not automatically bundled—paths need manual adjustment
- CSS detection requires the variable name to contain "css" or "style"
- Only string literal paths are detected (no dynamic path construction)

## Requirements

- Obsidian with the Datacore plugin installed and enabled

## Thanks to
[Blacksmithgu](https://github.com/blacksmithgu) for creating Datacore, which made this all possible.
[Beto](https://github.com/beto-group) for tons of DC inspiration, and the foundational idea of this compiler.
