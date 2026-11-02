#!/bin/sh
# Runs after the .deb or .rpm installs (nFPM puts it in the package; see nfpm.yaml).
#
# The package manager unpacks glosscode.desktop before the icons and only rebuilds the icon cache
# at the very end. A desktop that is running (seen on Linux Mint's Cinnamon) can add the menu entry
# in between, find no icon, and keep showing it blank until the desktop restarts. So rebuild the
# icon cache now, then put the .desktop file back as a new file: the desktop reads the entry again,
# this time with the icon in place.
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
f=/usr/share/applications/glosscode.desktop
if [ -f "$f" ]; then
    cp -p "$f" "$f.new" && mv -f "$f.new" "$f" || rm -f "$f.new"
fi
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi
exit 0
