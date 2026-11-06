#!/usr/bin/env bash
# Builds the apt and dnf package repositories that GitHub Pages serves, from a folder of
# GlossCode .deb and .rpm files (the last few published releases):
#
#   scripts/make-package-repos.sh <packages folder> <output folder>
#
# Environment:
#   GPG_KEY_ID        the signing key, already imported into gpg (required)
#   GPG_PASSPHRASE    its passphrase, if it has one
#   REPO_URL          where the output folder is served, for the setup files
#                     (default https://grahamrkf.github.io/glosscode)
#
# Output:
#   glosscode.asc, glosscode.gpg       the public key (text and binary)
#   apt/                               a signed apt repository: suite "stable", component "main", amd64
#   apt/glosscode.sources              the apt source for /etc/apt/sources.list.d
#   rpm/                               a signed dnf/zypper repository (x86_64), packages signed too
#   rpm/glosscode.repo                 the repository file for /etc/yum.repos.d
#   index.html                         setup instructions
#
# Needs: gpg, apt-ftparchive (apt-utils), createrepo_c, rpmsign (rpm). See docs/releasing.md.
set -euo pipefail

in=${1:?usage: make-package-repos.sh <packages folder> <output folder>}
out=${2:?usage: make-package-repos.sh <packages folder> <output folder>}
key=${GPG_KEY_ID:?set GPG_KEY_ID to the signing key}
url=${REPO_URL:-https://grahamrkf.github.io/glosscode}
url=${url%/}

gpgargs=(--batch --yes --local-user "$key")
passfile=""
if [ -n "${GPG_PASSPHRASE:-}" ]; then
  passfile=$(mktemp)
  trap 'rm -f "$passfile"' EXIT
  printf '%s' "$GPG_PASSPHRASE" > "$passfile"
  gpgargs+=(--pinentry-mode loopback --passphrase-file "$passfile")
fi

shopt -s nullglob
debs=("$in"/*.deb)
rpms=("$in"/*.rpm)
[ ${#debs[@]} -gt 0 ] || { echo "no .deb files in $in"; exit 1; }
[ ${#rpms[@]} -gt 0 ] || { echo "no .rpm files in $in"; exit 1; }

rm -rf "$out"
mkdir -p "$out"
gpg --batch --yes --armor --export "$key" > "$out/glosscode.asc"
gpg --batch --yes --export "$key" > "$out/glosscode.gpg"
[ -s "$out/glosscode.gpg" ] || { echo "gpg has no public key $key"; exit 1; }

# ---- apt ----
apt="$out/apt"
pool="$apt/pool/main/g/glosscode"
bin="$apt/dists/stable/main/binary-amd64"
mkdir -p "$pool" "$bin"
cp "${debs[@]}" "$pool/"
(cd "$apt" && apt-ftparchive packages pool > dists/stable/main/binary-amd64/Packages)
gzip -9nk "$bin/Packages"
cat > "$apt/release.conf" <<CONF
APT::FTPArchive::Release::Origin "GlossCode";
APT::FTPArchive::Release::Label "GlossCode";
APT::FTPArchive::Release::Suite "stable";
APT::FTPArchive::Release::Codename "stable";
APT::FTPArchive::Release::Architectures "amd64";
APT::FTPArchive::Release::Components "main";
APT::FTPArchive::Release::Description "GlossCode G-code editor";
CONF
(cd "$apt/dists/stable" && apt-ftparchive -c ../../release.conf release . > Release)
rm "$apt/release.conf"
gpg "${gpgargs[@]}" --clearsign -o "$apt/dists/stable/InRelease" "$apt/dists/stable/Release"
gpg "${gpgargs[@]}" --armor --detach-sign -o "$apt/dists/stable/Release.gpg" "$apt/dists/stable/Release"
cat > "$apt/glosscode.sources" <<SRC
Types: deb
URIs: $url/apt
Suites: stable
Components: main
Architectures: amd64
Signed-By: /usr/share/keyrings/glosscode.gpg
SRC

# ---- rpm ----
rpmdir="$out/rpm"
mkdir -p "$rpmdir/x86_64"
cp "${rpms[@]}" "$rpmdir/x86_64/"
signcmd="%{__gpg} gpg ${gpgargs[*]} --no-armor --detach-sign -o %{__signature_filename} %{__plaintext_filename}"
for f in "$rpmdir"/x86_64/*.rpm; do
  rpmsign --addsign --define "_gpg_name $key" --define "__gpg_sign_cmd $signcmd" "$f" > /dev/null
done
createrepo_c --quiet "$rpmdir"
gpg "${gpgargs[@]}" --armor --detach-sign -o "$rpmdir/repodata/repomd.xml.asc" "$rpmdir/repodata/repomd.xml"
cat > "$rpmdir/glosscode.repo" <<REPO
[glosscode]
name=GlossCode
baseurl=$url/rpm
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=$url/glosscode.asc
REPO

# ---- instructions ----
cat > "$out/index.html" <<HTML
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlossCode package repositories</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b1b1b;background:#fff}
pre{background:#f4f4f4;padding:.8rem;overflow-x:auto;border-radius:6px}code{font-family:ui-monospace,Consolas,monospace}</style></head>
<body>
<h1>GlossCode package repositories</h1>
<p>Add one of these once, and your system's updates keep <a href="https://github.com/grahamrkf/glosscode">GlossCode</a> up to date.</p>
<h2>Debian, Ubuntu, Linux Mint (apt)</h2>
<pre><code>sudo curl -fsSLo /usr/share/keyrings/glosscode.gpg $url/glosscode.gpg
sudo curl -fsSLo /etc/apt/sources.list.d/glosscode.sources $url/apt/glosscode.sources
sudo apt update
sudo apt install glosscode</code></pre>
<h2>Fedora (dnf)</h2>
<pre><code>sudo curl -fsSLo /etc/yum.repos.d/glosscode.repo $url/rpm/glosscode.repo
sudo dnf install glosscode</code></pre>
<h2>openSUSE (zypper)</h2>
<pre><code>sudo zypper addrepo $url/rpm/glosscode.repo
sudo zypper install glosscode</code></pre>
<p>The packages and the repository indexes are signed with the key in <a href="glosscode.asc">glosscode.asc</a>.</p>
</body></html>
HTML

echo "Made $out:"
(cd "$out" && find . -type f | sort)
