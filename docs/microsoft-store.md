# Microsoft Store

GlossCode is published in the Microsoft Store as an MSIX package. The Store signs it, hosts it and updates it, so it needs no code signing certificate. This page covers how the package is built, what's different about a Store copy, and how to submit a release. The Releases page, winget and the package repositories are covered in [releasing.md](releasing.md).

## The package

`scripts/package-msix.ps1` makes `GlossCode-<version>-windows-x64.msix` from a finished build. CI runs it on every push (the `store-windows` artifact), and the `msix` job installs it on a clean Windows runner with a test signature, so a broken manifest shows up before submission.

| File | What it is |
|---|---|
| `packaging/windows/msix/AppxManifest.xml.in` | The package manifest: identity, Windows 10 1809 or later, x64, the `runFullTrust` capability every desktop program needs, and Open with for .nc, .tap, .gcode, .ngc, .min, .mpf and .eia files |
| `packaging/windows/msix/Assets/` | Tile and Store images, made from `assets/logo` by `scripts/make-msix-assets.py` (run it again if the logo changes) |

The package version is `VERSION` plus a fourth number, 0 (`0.2.0.0`); the Store needs the fourth number to be 0. A pre-release suffix is dropped, as in the installer.

The package's identity must match Partner Center exactly (Product management › Product identity). The script takes it from the repository's Actions variables, so set these once (Settings › Secrets and variables › Actions › Variables):

| Variable | Partner Center field | Looks like |
|---|---|---|
| `MSIX_IDENTITY_NAME` | Package/Identity/Name | `12345Publisher.GlossCode` |
| `MSIX_PUBLISHER` | Package/Identity/Publisher | `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` |
| `MSIX_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName | the publisher name shown in the Store |

Without them the package gets a test identity (`GlossCode.Test`, `CN=GlossCode Test`): fine for installing on your own computer, refused by Partner Center.

## What's different about a Store copy

The program finds out it's running from a package (`GetCurrentPackageFamilyName` in `platform_win32.c`) and then:

- **Keeps its settings in the package's folder**, `%LOCALAPPDATA%\Packages\<package family name>\LocalCache\Roaming\GlossCode` (cache in `...\LocalCache\Local\GlossCode`). Windows would otherwise redirect writes under `%APPDATA%` to a hidden copy that isn't where the path says. Help › Open settings folder opens the real folder. A Store copy doesn't see the settings of a copy installed from the Releases page, and Windows deletes its folder when it's uninstalled.
- **Ignores a `portable` file.** The install folder is read-only.
- **Says in Help › About that the Store keeps it up to date.** GlossCode has no update check of its own.

Everything else is the same program.

## Testing a package on your own computer

An unsigned package won't install, so sign a test copy with a certificate of your own. In PowerShell as administrator, with the Windows SDK installed:

```powershell
$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=GlossCode Test" -KeyUsage DigitalSignature `
  -CertStoreLocation Cert:\CurrentUser\My -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
Export-PfxCertificate -Cert $cert -FilePath test.pfx -Password (ConvertTo-SecureString test -AsPlainText -Force)
Export-Certificate -Cert $cert -FilePath test.cer
Import-Certificate -FilePath test.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople
signtool sign /fd SHA256 /f test.pfx /p test GlossCode-0.2.0-windows-x64.msix
Add-AppxPackage GlossCode-0.2.0-windows-x64.msix
```

Use a package built with the test identity (the subject must equal the manifest's Publisher). Remove it afterwards with `Get-AppxPackage GlossCode.Test | Remove-AppxPackage`, and delete the certificate from Trusted People.

Before the first submission, also run the **Windows App Certification Kit** (part of the Windows SDK) on the package, which runs the same basic checks as certification.

## First submission

1. Create a developer account at [Partner Center](https://storedeveloper.microsoft.com). It's free for individuals and companies; an individual account needs an identity check.
2. **Apps and games › New product › MSIX or PWA app**, and reserve the name **GlossCode**.
3. Copy the three identity values into the repository's Actions variables (above). The next build makes an uploadable package.
4. Fill in the submission:
   - **Pricing and availability:** Free; all markets.
   - **Properties:** category Developer tools (subcategory: none) or Productivity; privacy policy URL `https://github.com/grahamrkf/glosscode/blob/main/PRIVACY.md`; website `https://github.com/grahamrkf/glosscode`; support contact `https://github.com/grahamrkf/glosscode/issues`. Under system requirements, note the WebView2 Runtime.
   - **Age ratings:** the IARC questionnaire. GlossCode has no violence, no sharing or chat between users, no purchases and no user-generated content shared with others, and it doesn't collect personal information, so it rates for everyone (3+ / Everyone).
   - **Packages:** upload the .msix from the `store-windows` artifact.
   - **Store listings:** the text below, and the screenshots.
   - **Submission options › Restricted capabilities:** the package uses `runFullTrust`. Reason: "GlossCode is a desktop program (Win32 with a WebView2 window)."
5. Submit. Certification usually takes from a few hours to three business days. If it fails, the report names the policy.

## Each release after that

After publishing the GitHub release, open the release workflow's run for the tag, download `store-windows`, and in Partner Center make a new submission (Update) with that .msix. The listing carries over.

## Listing text

**Name:** GlossCode. The name has to be the name alone (policy 10.1.1), with no "G-code editor" after it.

**Short description:** G-code editor with a plain-English gloss line above every line of code.

**Description:**

> GlossCode is a G-code editor for CNC mills, lathes and plasma tables. Above every line of code it shows a gloss line that says what the line does, in plain words, in columns that line up with the code.
>
> - Gloss words for every code, in a full style (run.rapid, spindle.cw, cycle.peck) or a short one (SFWD, TLON)
> - Active modes at any line: units, plane, absolute or incremental, feed and speed, tool, offsets, cutter comp
> - Checks for common mistakes, such as a feed move with no feed rate or a canned cycle left on
> - Toolpath view, a Z-by-line timeline and a step-by-step simulation that stops at M00, M01 and block delete
> - Subprogram and macro calls shown in line, a subprogram library, and macro variables simulated
> - Haas, Fanuc, Okuma and other controls, with your own machine profiles
>
> GlossCode is new and largely untested. Its checks have been compared with the programming manuals of only some controls. Always prove a program on the machine itself, with a dry run, before cutting.
>
> GlossCode needs the Microsoft Edge WebView2 Runtime, which comes with Windows 11 and with Microsoft Edge on Windows 10. It's free and open source (MIT license).

**Search terms (up to 7):** G-code, CNC, CNC editor, NC program, Haas, Fanuc, Okuma

**Screenshots:** at least one, 1366 × 768 or larger. Use the editor with a sample program and the gloss rows showing, the toolpath with the simulation, and the machine picker.

**Store logo:** the 300 × 300 PNG Partner Center asks for can be exported from `assets/logo/glosscode-512.png`.

## Policies that apply

From the [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies):

- **10.1.1** Name: the name alone, nothing descriptive.
- **10.2.2** No downloading code that changes what the program does. GlossCode has no update check and downloads nothing.
- **10.2.4** Dependencies on other software must be disclosed: the WebView2 Runtime, in the description.
- **10.5.1** Desktop programs must have a privacy policy, even when they collect nothing: [PRIVACY.md](../PRIVACY.md).
- **11.11** Keep the age rating accurate. Only needs another look if GlossCode ever gets online or sharing features.
