#!/usr/bin/env bash
# Writes the winget manifests for a published release, ready to submit to microsoft/winget-pkgs:
#
#   scripts/make-winget-manifest.sh <version> <SHA256SUMS.txt> <output folder>
#
# Makes <output>/manifests/g/GlossCode/GlossCode/<version>/ with the version, installer and
# en-US locale files. The installer URL is the release's setup.exe, which only works once the
# release is published. To submit: wingetcreate submit <that folder> (docs/releasing.md).
set -euo pipefail

v=${1:?usage: make-winget-manifest.sh <version> <SHA256SUMS.txt> <output folder>}
sums=${2:?usage: make-winget-manifest.sh <version> <SHA256SUMS.txt> <output folder>}
out=${3:?usage: make-winget-manifest.sh <version> <SHA256SUMS.txt> <output folder>}

id=GlossCode.GlossCode
repo=https://github.com/grahamrkf/glosscode
setup="GlossCode-$v-windows-x64-setup.exe"
sha=$(awk -v f="$setup" '$2 == f || $2 == "*"f { print toupper($1) }' "$sums")
[ -n "$sha" ] || { echo "$setup isn't in $sums"; exit 1; }
schema=1.9.0
dir="$out/manifests/g/GlossCode/GlossCode/$v"
mkdir -p "$dir"

cat > "$dir/$id.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.version.$schema.schema.json
PackageIdentifier: $id
PackageVersion: $v
DefaultLocale: en-US
ManifestType: version
ManifestVersion: $schema
YAML

cat > "$dir/$id.installer.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.installer.$schema.schema.json
PackageIdentifier: $id
PackageVersion: $v
MinimumOSVersion: 10.0.17763.0
InstallerType: inno
Scope: user
InstallModes:
  - interactive
  - silent
UpgradeBehavior: install
FileExtensions:
  - nc
Dependencies:
  PackageDependencies:
    - PackageIdentifier: Microsoft.EdgeWebView2Runtime
ProductCode: '{734A1C8B-4AAE-4306-B264-CF8E18127422}_is1'
Installers:
  - Architecture: x64
    InstallerUrl: $repo/releases/download/v$v/$setup
    InstallerSha256: $sha
ManifestType: installer
ManifestVersion: $schema
YAML

cat > "$dir/$id.locale.en-US.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.defaultLocale.$schema.schema.json
PackageIdentifier: $id
PackageVersion: $v
PackageLocale: en-US
Publisher: GlossCode
PublisherUrl: $repo
PublisherSupportUrl: $repo/issues
PackageName: GlossCode
PackageUrl: $repo
License: MIT
LicenseUrl: $repo/blob/main/LICENSE
ShortDescription: G-code editor with a plain-English gloss line above every line of code.
Description: |-
  GlossCode is a G-code editor for CNC mills, lathes and plasma tables. Above every line of code it
  shows a gloss line that says what the line does, and it tracks the active modes, checks the
  program for common mistakes and simulates the toolpath. It supports Haas, Fanuc, Okuma and other
  controls. Always prove a program on the machine before running it.
Moniker: glosscode
Tags:
  - cnc
  - g-code
  - gcode
  - editor
  - machining
ReleaseNotesUrl: $repo/releases/tag/v$v
ManifestType: defaultLocale
ManifestVersion: $schema
YAML

echo "Wrote $dir"
ls "$dir"
