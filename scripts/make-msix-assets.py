#!/usr/bin/env python3
"""Makes the tile and Store images for the MSIX package (packaging/windows/msix/Assets) from the
logo PNGs in assets/logo. Run from the repository root after the logo changes:

    python3 scripts/make-msix-assets.py

Needs Pillow. The images are committed, so building the package doesn't need Python.
Small sizes (48 px and under) come from the 48 px export of the simplified artwork, larger ones
from the 512 px master, the same split as glosscode.ico.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "assets", "logo")
OUT = os.path.join(ROOT, "packaging", "windows", "msix", "Assets")

big = Image.open(os.path.join(LOGO, "glosscode-512.png")).convert("RGBA")
small = {n: Image.open(os.path.join(LOGO, f"glosscode-{n}.png")).convert("RGBA") for n in (16, 32, 48)}


def logo(px):
    if px in small:
        return small[px].copy()
    src = small[48] if px < 48 else big
    return src.resize((px, px), Image.LANCZOS)


def square(name, px, pad=0.0):
    """The logo centred on a transparent square, with pad (a fraction of the size) around it."""
    inner = max(1, round(px * (1 - 2 * pad)))
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    img.alpha_composite(logo(inner), ((px - inner) // 2, (px - inner) // 2))
    img.save(os.path.join(OUT, name), optimize=True)


def wide(name, w, h):
    inner = round(h * 0.7)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img.alpha_composite(logo(inner), ((w - inner) // 2, (h - inner) // 2))
    img.save(os.path.join(OUT, name), optimize=True)


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith(".png"):
        os.remove(os.path.join(OUT, f))
# App list, taskbar and Start menu icon.
square("Square44x44Logo.scale-100.png", 44)
square("Square44x44Logo.scale-200.png", 88)
for t in (16, 24, 32, 48, 256):
    square(f"Square44x44Logo.targetsize-{t}.png", t)
    square(f"Square44x44Logo.targetsize-{t}_altform-unplated.png", t)
# Start menu tiles.
square("Square150x150Logo.scale-100.png", 150, pad=0.15)
square("Square150x150Logo.scale-200.png", 300, pad=0.15)
wide("Wide310x150Logo.scale-100.png", 310, 150)
wide("Wide310x150Logo.scale-200.png", 620, 300)
# Package logo shown by the installer and Store.
square("StoreLogo.scale-100.png", 50)
square("StoreLogo.scale-200.png", 100)
print("\n".join(sorted(os.listdir(OUT))))
