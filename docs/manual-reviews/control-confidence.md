# How sure we are of each control

Last updated 2026-11-05. Update it when a control gets a manual review, a page-image check or real shop programs.

How sure we are that each control's tables match the real control. This is based on four things: whether its manual was reviewed, whether that manual had real text or had to be OCR'd, whether code tables were checked against page images, and whether real shop programs read and simulate correctly. **No control has been tested on a machine.** Every program still needs a dry run on the machine itself.

## 1. High
| Control | Why |
|---|---|
| Haas NGC mill | Several manuals reviewed (2017, 2020 and 2025 editions), marked verified, and proven shop programs read and simulate. Where the manual editions conflict (M39 and others), the machine profile settles it. |
| Okuma OSP-U10L / U100L lathe | Manual reviewed (OCR). On 2026-11-05 every G and M code number, group and mark was checked against page images. proven shop programs read and simulate. It still uses the P200L tables, apart from the differences the review recorded. |

## 2. Good: reviewed from a real manual, marked verified, no shop programs yet
| Control | Why |
|---|---|
| Fanuc-style mill (0i-F) | 0i-F mill manual (text). The base the Fanuc-family controls inherit. The Custom Macro B rules come from the 21i manual, because the 0i-F common volume is missing. |
| Okuma OSP700L / 7000L lathe | Manual reviewed (OCR), and its G/M tables were image-checked on 2026-11-05. It still uses the P200L tables. |
| Okuma OSP-P200L lathe and P300M mill | Text manuals, marked verified. Part of the P200L number/decimal table was scrambled in the extract. |
| Haas NGC lathe | 2025 manual reviewed. A few open questions remain (G74 I, G105 Q). |
| Haas classic (2008-2016) and Haas 1995 VF | Their own manuals reviewed. |
| LinuxCNC 2.9 | Official documentation, marked verified. |
| GRBL 1.1 | Checked against its README and source code. |
| Centroid CNC12 (mill, lathe, router) | v5.42 manuals, marked verified. |
| Hurco WinMax NC (ISNC) | Mill and lathe NC manuals, marked verified. BNC isn't covered. |

## 3. Fair: reviewed from a manual but marked unverified
| Control | Why |
|---|---|
| Fanuc-style lathe | 0i-F and 0i-D lathe manuals, G code system A. |
| Okuma OSP-E100L lathe | Reviewed from the text layer only, with no page images checked. |
| Tormach PathPilot (mill, lathe) | Reviewed against the PathPilot guides. It inherits LinuxCNC. |
| Mazak EIA/ISO (mill, lathe) | Two EIA manuals reviewed. Mill-turn isn't covered. |
| Mitsubishi M800/M80 (mill, lathe) | Programming manuals reviewed. Builder M codes aren't defined. |
| Siemens SINUMERIK ISO mode (mill, lathe) | ISO milling (2021) and turning (2012) manuals. Native Siemens programs aren't covered. |
| Fanuc Series 0 / 0-Mate mill | Older manual, with differences from the 0i noted. |
| Mitsubishi M700/M70 M2/M0 format | Manual reviewed. It has its own call format. |

## 4. Lower: built from code lists or quick references, or little checked
| Control | Why |
|---|---|
| Fanuc lathe G code systems B and C; Mazak lathe systems B and C; Mitsubishi lathe lists 3/5/7 | Renumbered from each manual's G code system table, without a full review of each system. |
| Fagor 8055 / 8055i mill and lathe | Manuals reviewed, but they needed a new parser. The pattern and pocket cycles are new. |
| Fagor 8060 / 8065 mill | Cycle words come from the canned cycles manual, and still need checking against a machine. |
| Hypertherm Phoenix / EDGE plasma; Centroid and Tormach plasma | Programmer's references reviewed. Plasma is a new machine type. |

## 5. Lowest
| Control | Why |
|---|---|
| Fagor 8060 / 8065 lathe | Started from the quick reference, then partly checked against the 8065 T cycles manual. Some readings are disputed (G87 K). |
| Heidenhain TNC 640 Klartext | First draft of a different language, with its own parser and simulation. Some functions aren't drawn yet (RND/CHF, FK). |
| Generic (each machine type) | Deliberately loose: only the common ISO codes. |

## What would raise confidence most
1. Run more of proven shop programs (Haas and Okuma) through the checks and simulation, and record where GlossCode disagrees with the machine.
2. Find the Fanuc 0i-F common volume (B-64604EN), the Okuma P200L page images for the number table, and shop programs for any other control.
3. Image-check the code tables of the controls marked unverified, in small batches.
