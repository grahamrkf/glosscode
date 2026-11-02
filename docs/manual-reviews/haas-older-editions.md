# Older Haas editions: Mill 96-8000 Rev Y (2009) and Lathe 96-8910 Rev F (2017)

| | |
|---|---|
| Manuals | Haas Mill Operator's Manual 96-8000 Rev Y, Dec. 2009, classic control (PDF page = printed + 8) · Haas Lathe Operator's Manual NGC 96-8910 Rev F, Dec. 2017 (printed + 20) |
| Reviewed | 2026-11-01, only for what differs from the reviews in [haas-ngc.md](haas-ngc.md), [haas-ngc-lathe-2025.md](haas-ngc-lathe-2025.md) and [haas-vf-1995.md](haas-vf-1995.md) |
| Result | A new `haasclassic` dialect for the 2008–2016 classic mill control. The 2017 lathe edition matches the 2025 one |

## Mill, Rev Y 2009 (classic control)

It sits between the 1995 control and NGC:

- **Same as both:** one M code per line (p. 199), G04 P10 = 10 ms and P10. = 10 s (p. 137), M97/M98/M99, extra work offsets G110–G129 (p. 179).
- **Present in 2009 but not 1995**, so they're valid on classic mills and rightly flagged on `haas1995`: G93/G94/G95 (p. 173), G154 P1–P99 (pp. 94–95), M88/M89 through-spindle coolant (p. 205), G187 (p. 198), and G141, G143, G150, G153, G155, G161–G169, G174/G184, G136 and G188.
- **G87 and G88 still exist in 2009** (group 09, p. 130); NGC dropped them. No G96/G97 on the mill.

The new `haasclassic` dialect inherits `haas` and adds back G87 and G88. It sets `inheritWords`, so it keeps every Haas and Haas mill word.

## Lathe, Rev F 2017

This is an older edition of the 2025 lathe manual. The rules checked (one M code per line, p. 123; dwell P units, p. 244) match. The two editions lay out their code lists differently, so there was no full code-by-code comparison. Nothing contradicts the 2025 review, which stays the reference.
