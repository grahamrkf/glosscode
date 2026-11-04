; Inno Setup script for the GlossCode Windows installer (Inno Setup 6.3 or later).
;
;   iscc /DAppVersion=0.1.0 /DSourceDir=<repository> /DExe=<path to GlossCode.exe> /DOutputDir=dist packaging\windows\glosscode.iss
;
; Makes GlossCode-<version>-windows-x64-setup.exe: installs for the current user only, without
; administrator rights, into %LOCALAPPDATA%\Programs\GlossCode, with a Start menu entry, an optional
; desktop shortcut, an optional "Open with GlossCode" for .nc files, and an uninstaller.
; The uninstaller leaves the user's settings in %APPDATA%\GlossCode alone.
; The release workflow (.github/workflows/build.yml) runs it; see docs/releasing.md.

#ifndef AppVersion
  #error Pass the version: /DAppVersion=0.1.0
#endif
#ifndef SourceDir
  #define SourceDir "..\.."
#endif
; Exe and OutputDir may be relative to SourceDir.
#ifndef Exe
  #define Exe "build\GlossCode.exe"
#endif
#ifndef OutputDir
  #define OutputDir "dist"
#endif

; Windows version fields take numbers only, so 0.2.0-beta.1 becomes 0.2.0.0 there.
#define Dash Pos("-", AppVersion)
#if Dash > 0
  #define NumericVersion Copy(AppVersion, 1, Dash - 1)
#else
  #define NumericVersion AppVersion
#endif

[Setup]
; AppId identifies GlossCode to Windows across versions, so a new installer upgrades the old copy. Never change it.
AppId={{734A1C8B-4AAE-4306-B264-CF8E18127422}
AppName=GlossCode
AppVersion={#AppVersion}
AppVerName=GlossCode {#AppVersion}
AppPublisher=GlossCode
AppPublisherURL=https://github.com/grahamrkf/glosscode
AppSupportURL=https://github.com/grahamrkf/glosscode/issues
AppUpdatesURL=https://github.com/grahamrkf/glosscode/releases
AppCopyright=MIT License
VersionInfoVersion={#NumericVersion}.0
VersionInfoProductVersion={#NumericVersion}.0
VersionInfoProductTextVersion={#AppVersion}
VersionInfoDescription=GlossCode setup
; Per-user install: no administrator rights, {autopf} is %LOCALAPPDATA%\Programs.
PrivilegesRequired=lowest
DefaultDirName={autopf}\GlossCode
DisableProgramGroupPage=yes
DefaultGroupName=GlossCode
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SourceDir={#SourceDir}
OutputDir={#OutputDir}
OutputBaseFilename=GlossCode-{#AppVersion}-windows-x64-setup
SetupIconFile=assets\logo\glosscode.ico
UninstallDisplayIcon={app}\GlossCode.exe
UninstallDisplayName=GlossCode
LicenseFile=LICENSE
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
ChangesAssociations=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "assocnc"; Description: "Add GlossCode to ""Open with"" for .nc files"; GroupDescription: "File types:"; Flags: unchecked

[Files]
Source: "{#Exe}"; DestDir: "{app}"; DestName: "GlossCode.exe"; Flags: ignoreversion
Source: "LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; DestName: "THIRD_PARTY_NOTICES.txt"; Flags: ignoreversion
Source: "CHANGELOG.md"; DestDir: "{app}"; DestName: "CHANGELOG.txt"; Flags: ignoreversion

[InstallDelete]
; An installed copy must never look portable.
Type: files; Name: "{app}\portable"

[Icons]
Name: "{autoprograms}\GlossCode"; Filename: "{app}\GlossCode.exe"
Name: "{autodesktop}\GlossCode"; Filename: "{app}\GlossCode.exe"; Tasks: desktopicon

[Registry]
; The program's entry, so Windows knows how to open a file with it ("Open with" lists it for text files).
Root: HKA; Subkey: "Software\Classes\Applications\GlossCode.exe"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "GlossCode"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Applications\GlossCode.exe\DefaultIcon"; ValueType: string; ValueData: """{app}\GlossCode.exe"",0"
Root: HKA; Subkey: "Software\Classes\Applications\GlossCode.exe\shell\open\command"; ValueType: string; ValueData: """{app}\GlossCode.exe"" ""%1"""
Root: HKA; Subkey: "Software\Classes\Applications\GlossCode.exe\SupportedTypes"; ValueType: string; ValueName: ".nc"; ValueData: ""
; Optional: offer GlossCode in "Open with" for .nc files, without taking over the default program.
Root: HKA; Subkey: "Software\Classes\GlossCode.nc"; ValueType: string; ValueData: "G-code program"; Flags: uninsdeletekey; Tasks: assocnc
Root: HKA; Subkey: "Software\Classes\GlossCode.nc\DefaultIcon"; ValueType: string; ValueData: """{app}\GlossCode.exe"",0"; Tasks: assocnc
Root: HKA; Subkey: "Software\Classes\GlossCode.nc\shell\open\command"; ValueType: string; ValueData: """{app}\GlossCode.exe"" ""%1"""; Tasks: assocnc
Root: HKA; Subkey: "Software\Classes\.nc\OpenWithProgids"; ValueType: none; ValueName: "GlossCode.nc"; Flags: uninsdeletevalue; Tasks: assocnc

[Run]
Filename: "{app}\GlossCode.exe"; Description: "{cm:LaunchProgram,GlossCode}"; Flags: nowait postinstall skipifsilent
