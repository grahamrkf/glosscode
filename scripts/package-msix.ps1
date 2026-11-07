# Makes the Microsoft Store package from a finished build:
#   GlossCode-<version>-windows-x64.msix
#
#   pwsh scripts/package-msix.ps1 [-Build build] [-Out dist-store]
#        [-IdentityName <name>] [-Publisher "CN=..."] [-PublisherDisplayName <name>]
#
# The identity values come from Partner Center (Product management › Product identity) and must
# match it exactly, or the upload is refused. Left out, they come from the environment variables
# MSIX_IDENTITY_NAME, MSIX_PUBLISHER and MSIX_PUBLISHER_DISPLAY_NAME, and otherwise from test
# values that are fine for installing on your own computer but can't be uploaded.
#
# The package is not signed: the Store signs it after certification. To install it on a test
# computer, sign it with a test certificate first (docs/microsoft-store.md).
#
# Needs makeappx.exe and makepri.exe from the Windows SDK (on GitHub's Windows runners already).
param(
    [string]$Build = "build",
    [string]$Out = "dist-store",
    [string]$IdentityName = $env:MSIX_IDENTITY_NAME,
    [string]$Publisher = $env:MSIX_PUBLISHER,
    [string]$PublisherDisplayName = $env:MSIX_PUBLISHER_DISPLAY_NAME
)
$ErrorActionPreference = "Stop"
if (-not $IdentityName) { $IdentityName = "GlossCode.Test" }
if (-not $Publisher) { $Publisher = "CN=GlossCode Test" }
if (-not $PublisherDisplayName) { $PublisherDisplayName = "GlossCode" }

$src = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Build = (Resolve-Path $Build).Path
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$version = (Get-Content (Join-Path $src "VERSION") -Raw).Trim()
$exe = Join-Path $Build "GlossCode.exe"
if (-not (Test-Path $exe)) { throw "$exe isn't there; build first (docs/building.md)" }

# Package versions take four numbers, and the Store needs the last one to be 0, so 0.2.0-beta.1
# becomes 0.2.0.0, as in the installer's version fields.
$numeric = ($version -split "-")[0]
if ($numeric -notmatch '^\d+\.\d+\.\d+$') { throw "VERSION ($version) isn't MAJOR.MINOR.PATCH" }
$pkgVersion = "$numeric.0"

# Find the SDK tools: on PATH, or the newest Windows 10/11 SDK.
function Find-SdkTool($name) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $kits = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    $hit = Get-ChildItem $kits -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^10\.' -and (Test-Path (Join-Path $_.FullName "x64\$name")) } |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    if (-not $hit) { throw "$name isn't installed; install the Windows SDK" }
    return Join-Path $hit.FullName "x64\$name"
}
$makeappx = Find-SdkTool "makeappx.exe"
$makepri = Find-SdkTool "makepri.exe"

# Stage the package contents.
$stage = Join-Path $Build "package\msix"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item $exe (Join-Path $stage "GlossCode.exe")
Copy-Item (Join-Path $src "LICENSE") (Join-Path $stage "LICENSE.txt")
Copy-Item (Join-Path $src "THIRD_PARTY_NOTICES.md") (Join-Path $stage "THIRD_PARTY_NOTICES.txt")
Copy-Item (Join-Path $src "CHANGELOG.md") (Join-Path $stage "CHANGELOG.txt")
Copy-Item -Recurse (Join-Path $src "packaging\windows\msix\Assets") (Join-Path $stage "Assets")

function Escape-Xml($s) { [System.Security.SecurityElement]::Escape($s) }
$manifest = Get-Content (Join-Path $src "packaging\windows\msix\AppxManifest.xml.in") -Raw
$manifest = $manifest.Replace("@IDENTITY_NAME@", (Escape-Xml $IdentityName)).
    Replace("@PUBLISHER@", (Escape-Xml $Publisher)).
    Replace("@PUBLISHER_DISPLAY_NAME@", (Escape-Xml $PublisherDisplayName)).
    Replace("@VERSION@", $pkgVersion)
if ($manifest -match "@[A-Z_]+@") { throw "AppxManifest.xml.in has a value this script doesn't fill in: $($Matches[0])" }
[System.IO.File]::WriteAllText((Join-Path $stage "AppxManifest.xml"), $manifest, (New-Object System.Text.UTF8Encoding $false))

# resources.pri lets Windows pick the right scale and target size of each tile image.
$priconfig = Join-Path $Build "package\priconfig.xml"
& $makepri createconfig /cf $priconfig /dq en-US /pv 10.0.0 /o | Out-Null
if ($LASTEXITCODE -ne 0) { throw "makepri createconfig failed ($LASTEXITCODE)" }
& $makepri new /pr $stage /cf $priconfig /mn (Join-Path $stage "AppxManifest.xml") /of (Join-Path $stage "resources.pri") /o | Out-Null
if ($LASTEXITCODE -ne 0) { throw "makepri new failed ($LASTEXITCODE)" }

$msix = Join-Path $Out "GlossCode-$version-windows-x64.msix"
if (Test-Path $msix) { Remove-Item $msix }
& $makeappx pack /d $stage /p $msix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)" }

Write-Host "Identity: $IdentityName, $Publisher ($PublisherDisplayName), version $pkgVersion"
Get-ChildItem $Out | Format-Table Name, Length
