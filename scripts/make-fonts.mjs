// Writes src/ui/css/fonts.css: the fonts GlossCode ships for the code and gloss rows (IBM Plex Mono and IBM Plex Sans,
// SIL Open Font License, assets/fonts/OFL.txt), embedded as data: URLs so the one-page program needs no font files.
// The .woff2 files in assets/fonts/ are the "latin" and "latin-ext" subsets from @fontsource/ibm-plex-mono and
// @fontsource/ibm-plex-sans 5.3.0 (npm). They're given their own family names ("GlossCode Mono", "GlossCode Gloss")
// so an installed copy of Plex with other metrics never takes their place.
// node scripts/make-fonts.mjs (CI runs it and checks the file is unchanged)
import { readFileSync, writeFileSync } from "node:fs";

const RANGES = {
  "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
};
const FACES = [
  ["GlossCode Mono", "ibm-plex-mono", 400], ["GlossCode Mono", "ibm-plex-mono", 600],
  ["GlossCode Gloss", "ibm-plex-sans", 400],
];
let css = "/* Written by scripts/make-fonts.mjs from assets/fonts/: edit and run that, not this file.\n"
  + "   IBM Plex Mono and IBM Plex Sans, Copyright 2017 and 2019 IBM Corp., SIL Open Font License 1.1 (assets/fonts/OFL.txt). */\n";
for (const [family, file, weight] of FACES)
  for (const [subset, range] of Object.entries(RANGES)){
    const data = readFileSync(`assets/fonts/${file}-${subset}-${weight}-normal.woff2`).toString("base64");
    css += `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;unicode-range:${range};`
      + `src:url(data:font/woff2;base64,${data}) format("woff2")}\n`;
  }
writeFileSync("src/ui/css/fonts.css", css);
