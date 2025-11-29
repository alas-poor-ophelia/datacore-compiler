## Version 0.5.1

First version to github, some new functionality around preparing releases.

- Added optional Version field to compiler, which will write the provided version number to the compiled script, as well as create a VERSION file in the output directory.
- Added an optional Changelog field will output its contents to a CHANGELOG.md file in the output folder.
- Added capability to bundle additional files. Any files specified will be copied to the output directory along with your compiled script and other files. Does not compile these extra files.
- Added ability to disable the "demo" callouts from compiled script (helper text intended for new users).

### Bug Fixes
- Fixed a bug where the compiler would try to resolve import statements from comments.