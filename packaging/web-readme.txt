GlossCode @VERSION@, web app
===========================

This folder is the GlossCode web app: a G-code editor that shows a gloss (a short
plain-English reading) above every line of code, checks the program and simulates
the toolpath. It is plain files with no server code, so any web server can serve it.

Putting it on a server
----------------------
1. Copy this folder into a folder your web server serves (Apache, nginx, IIS,
   Caddy...). Any folder or address works, for example https://server/glosscode/.
2. Serve it over HTTPS. Browsers allow the file pickers and the offline copy only
   over HTTPS, or from localhost.
3. Make sure .wasm files are sent as application/wasm and .webmanifest as
   application/manifest+json. Most servers already do.

Trying it on one computer
-------------------------
In this folder, run a small local server and open http://localhost:8000/ :

    python3 -m http.server 8000

Opening index.html straight from the folder (a file:// address) doesn't work:
browsers don't run WebAssembly or offline copies from local files.

How it works
------------
- Open and Save use the browser's file pickers. In Chrome and Edge, Save writes
  back to the file you opened. In Firefox and Safari, Open reads a copy of the
  file and Save downloads one.
- Files are read and written by GlossCode's C core, built as WebAssembly
  (core.wasm), the same code as the desktop program: unchanged lines are kept byte
  for byte, with the file's own line endings, ';' marks and encoding.
- Nothing you open is sent anywhere. Settings, machine profiles and your
  subprogram library are kept in the browser, for this address only.
- Once opened it works offline, and Chrome and Edge can install it as an app.

Check every program on the machine before you cut. GlossCode is new and can miss
real problems.

Source, documentation and other downloads: https://github.com/grahamrkf/glosscode
