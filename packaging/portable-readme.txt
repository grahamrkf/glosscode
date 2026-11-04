GlossCode portable
==================

This is a portable copy of GlossCode, a G-code editor with a plain-English
line above every line of code.

Run it from this folder:
  Windows: GlossCode.exe
  Linux:   ./glosscode

The empty file named "portable" keeps GlossCode's settings, recent files and
machine profiles in a "GlossCode-data" folder beside the program, instead of
in your user settings folder, so the whole folder can be copied to another
computer or a USB drive. Delete the "portable" file to use the normal
settings folder instead.

Linux needs GTK 3 and WebKitGTK 4.1 installed (on Debian and Ubuntu:
libgtk-3-0 and libwebkit2gtk-4.1-0; on Fedora: gtk3 and webkit2gtk4.1).
Windows needs the Microsoft Edge WebView2 Runtime, which comes with
Windows 10 and 11.

Sample programs are a separate download, GlossCode-<version>-examples.zip,
on the release page:
  https://github.com/grahamrkf/glosscode/releases

License: MIT (LICENSE.txt). Third-party code: THIRD_PARTY_NOTICES.txt.
