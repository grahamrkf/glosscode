# Releasing

How GlossCode versions are numbered, what each release contains, and how users get updates.

## Version number

The version lives in one place: the [`VERSION`](../VERSION) file at the repository root, in `MAJOR.MINOR.PATCH` form (`0.1.0`). A pre-release adds a suffix (`0.2.0-beta.1`).

- The build compiles it into the program, where Help › About shows it.
- `node scripts/sync-mockup-data.mjs` copies it into the mockup's About window.
- Each release is a Git tag named `v` plus the version (`v0.1.0`), and a GitHub Release made from that tag.

While the version starts with `0.`, file formats (machine definitions, library files, settings) may still change between releases.

## Release files

Every release has the same files, so scripts and package managers can find the right one by its name.

| File | What it is |
|---|---|
| `GlossCode-<version>-windows-x64-setup.exe` | Windows installer. Installs for the current user without administrator rights, adds a Start menu entry and an uninstaller. |
| `GlossCode-<version>-windows-x64-portable.zip` | Windows portable copy: `GlossCode.exe` plus an empty `portable` file, so settings stay in `GlossCode-data` beside it. |
| `GlossCode-<version>-linux-amd64.deb` | Debian and Ubuntu package. Depends on the distribution's GTK 3 and WebKitGTK packages. |
| `GlossCode-<version>-linux-x86_64.rpm` | Fedora and openSUSE package, with the same dependencies. |
| `GlossCode-<version>-linux-x86_64-portable.tar.gz` | Linux portable copy, same layout as the Windows zip. Needs GTK 3 and WebKitGTK installed. |
| `GlossCode-<version>-examples.zip` | Sample programs for Haas, Fanuc and Okuma mills and lathes (`examples/`) and example subprogram library files (`docs/subprogram-library/examples/`). They aren't part of the program, so they're a download of their own; the home page links to them. |
| `SHA256SUMS.txt` | SHA-256 checksum of every file above. |

The release notes are the release's description on GitHub, and the About window shows them.

## Getting updates

GlossCode doesn't check for updates itself and makes no network connections. Updates come from the system's own tools, and Help › About GlossCode says which one applies to the copy that's running:

| Installed from | How it updates |
|---|---|
| Microsoft Store | The Store updates it ([microsoft-store.md](microsoft-store.md)). |
| winget (`winget install GlossCode.GlossCode`) | `winget upgrade GlossCode.GlossCode`, or `winget upgrade --all`. |
| The package repository (apt or dnf) | The system's updates: `sudo apt upgrade`, `sudo dnf upgrade`. |
| The installer, .deb or .rpm from the Releases page | Run or install the new file from the Releases page; it updates the copy in place. |
| A portable archive | Download the new archive and replace the program; the GlossCode-data folder stays. |

There was a **Check for updates** button in Help › About up to 0.1.9. It was removed because a Store copy must not update itself, and the package managers already cover the installed copies.

### Package repositories (apt and dnf)

`.github/workflows/packages.yml` runs whenever a release is published. It downloads the .deb and .rpm files of the last five published releases (not drafts or pre-releases), checks them against each release's `SHA256SUMS.txt`, signs them into an apt repository and a dnf repository with `scripts/make-package-repos.sh`, and deploys both to GitHub Pages:

```
https://grahamrkf.github.io/glosscode/                 setup instructions
https://grahamrkf.github.io/glosscode/glosscode.gpg     signing key (binary; glosscode.asc is the text form)
https://grahamrkf.github.io/glosscode/apt               apt: suite stable, component main, amd64
https://grahamrkf.github.io/glosscode/rpm               dnf and zypper: x86_64
```

A user adds it once:

```sh
# Debian, Ubuntu, Linux Mint
sudo curl -fsSLo /usr/share/keyrings/glosscode.gpg https://grahamrkf.github.io/glosscode/glosscode.gpg
sudo curl -fsSLo /etc/apt/sources.list.d/glosscode.sources https://grahamrkf.github.io/glosscode/apt/glosscode.sources
sudo apt update && sudo apt install glosscode

# Fedora
sudo curl -fsSLo /etc/yum.repos.d/glosscode.repo https://grahamrkf.github.io/glosscode/rpm/glosscode.repo
sudo dnf install glosscode
```

One-time setup, by the repository owner:

1. Make a signing key with no expiry, used only for the package repositories, and keep a backup of it somewhere safe. If it's lost, every user has to add a new key.
   ```sh
   gpg --quick-gen-key "GlossCode packages <your noreply address>" rsa4096 sign never
   gpg --armor --export-secret-keys "GlossCode packages" > glosscode-packages-private.asc
   ```
2. Add the private key as the repository secret `PACKAGES_GPG_PRIVATE_KEY` (Settings › Secrets and variables › Actions), and its passphrase, if it has one, as `PACKAGES_GPG_PASSPHRASE`. Then delete the exported file.
3. Settings › Pages › Build and deployment › Source: **GitHub Actions**.
4. Run the workflow once by hand (Actions › Package repositories › Run workflow) to publish the current release.

### winget

The same workflow writes the winget manifests for the newest release (`scripts/make-winget-manifest.sh`, package `GlossCode.GlossCode`) and uploads them as the `winget-manifests` artifact. winget installs with the release's `setup.exe` from GitHub, silently and for the current user.

- **First submission** (by hand, so the package name is checked once): install [wingetcreate](https://github.com/microsoft/winget-create), download the artifact, and run `wingetcreate submit <folder with the three .yaml files>`. It opens a pull request on `microsoft/winget-pkgs`, which winget's moderators review.
- **Later releases**: add a classic GitHub token with the `public_repo` scope as the secret `WINGET_TOKEN`, and the workflow submits each new version itself. Without it, submit by hand as above.

## What a first release needs

The UI, data, icons, the packaging plan, the core and the program exist. Before binaries can be published, these are still needed, roughly in this order:

| | Item | Status |
|---|---|---|
| ✓ | UI design (the mockup), dictionary, rules, built-in library, sample programs | Done. The program's build leaves the sample programs out (`cmake/strip-samples.cmake`); they're `GlossCode-<version>-examples.zip` |
| ✓ | App icon (`assets/logo/glosscode.ico`, PNGs) | Done |
| ✓ | License (MIT) | Done |
| ✓ | Where user files go, portable mode, single executable plan ([architecture.md](architecture.md#packaging)) | Written down |
| ✓ | Version number and release file names | This page |
| ✓ | **Core in C**: parser, mode tracker, translator, checks, dictionary loader | Done (`src/core/`), checked against the mockup by `test_golden` |
| – | **Platform files** `platform_win32.c` and `platform_posix.c` | Done except the download function and file watching |
| – | **Webview shell**: window, bindings between the UI and the core, embedded UI and data | Done for Open, Save, Save As and About; plus the home page, recent files and default machines (`settings.json`); the UI still draws with its own copy of the logic |
| ✓ | **Build script** (CMake) for MinGW-w64 on Windows and gcc on Linux, with webview and nativefiledialog-extended added as pinned dependencies | Done, with CI on Windows and Linux ([building.md](building.md)) |
| ✓ | **Windows resource file**: icon, version info shown in the file's Properties | Done (`src/app/glosscode.rc.in`) |
| ✓ | **Windows installer script** (Inno Setup): per-user install, Start menu entry, uninstaller, optional `.nc` file association | Done (`packaging/windows/glosscode.iss`, `scripts/package-windows.ps1`) |
| ✓ | **Linux packages**: `.desktop` file and icon, `.deb` and `.rpm` (nFPM builds both from one file) | Done (`packaging/linux/`, `scripts/package-linux.sh`) |
| ✓ | **Release workflow** (GitHub Actions): on a `v*` tag, build on Windows and Linux, package, write `SHA256SUMS.txt`, and create a draft release | Done (`.github/workflows/release.yml`) |
| ✓ | **Third-party notices** for webview (MIT) and nativefiledialog-extended (zlib), shipped with every release | In every package and archive |
| ✓ | `CHANGELOG.md` | Done |
| – | **Code signing** for the Windows .exe and installer | Optional for a first release; see below |

### Code signing

Unsigned Windows programs still run, but SmartScreen shows "Windows protected your PC" until the file builds a download reputation, and the user has to click **More info › Run anyway**. Copies from the Microsoft Store don't show it, since the Store signs its package, and winget installs don't either. Signing the installer removes most of it for direct downloads too. The options are a code signing certificate from a certificate authority, or a cloud signing service such as Azure Trusted Signing; both cost a yearly fee and need identity verification. A first release can ship unsigned with a note in the release description explaining the warning, and add signing later without changing anything else.

Linux packages are not usually signed for direct downloads; `SHA256SUMS.txt` covers integrity.

## Making a release

1. Update `VERSION` and add the version's section to `CHANGELOG.md` (`## [0.2.0] - <date>`), run `node scripts/sync-mockup-data.mjs`, and merge.
2. Tag the merge commit: `git tag v0.2.0 && git push origin v0.2.0`.
3. The release workflow (`.github/workflows/release.yml`) checks that the tag matches `VERSION`, builds and packages everything, writes `SHA256SUMS.txt`, and creates a **draft** release with the files attached and the changelog section as its notes (`scripts/release-notes.sh`). A version with a suffix (`0.2.0-beta.1`) is marked as a pre-release.
4. Install and run each file on a clean Windows and Linux computer, then publish the draft. Publishing starts `packages.yml`, which updates the apt and dnf repositories and the winget manifests.
5. Microsoft Store: download the `store-windows` artifact from the release run (Actions › Release › the run for the tag) and upload its .msix as a new submission in Partner Center ([microsoft-store.md](microsoft-store.md)).

If the workflow fails, fix it on `main`, delete the tag (`git push origin :v0.2.0`, and any draft it made), and tag again.
