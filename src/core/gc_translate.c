/* Modes and English words. Walks the program in the order the control runs it (following M97 and
   CALL subprograms), tracks the modal state, and gives each word its English word. Mirrors
   applyModes(), trackCarry(), word() and translateAll() in the mockup. */
#include "gc_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum {
    CH_F = 1 << 0, CH_S = 1 << 1, CH_T = 1 << 2, CH_H = 1 << 3, CH_WCS = 1 << 4, CH_MOTION = 1 << 5,
    CH_PLANE = 1 << 6, CH_UNITS = 1 << 7, CH_DIST = 1 << 8, CH_FEED = 1 << 9, CH_SPIN = 1 << 10,
    CH_COMP = 1 << 11, CH_TLEN = 1 << 12, CH_CYCLE = 1 << 13, CH_SPINDIR = 1 << 14, CH_COOL = 1 << 15,
    CH_TORCH = 1 << 16
};

typedef struct tstate {
    int inch, inc, per_rev, css;
    int cycle, dwell, sub, local, one_shot, zero_shift;
    char sub_word; /* the subprogram call's program letter when it isn't P (M2/M0 G22 L) */
    char corner[16]; /* Okuma G75/G76 on this line: L is the chamfer or rounding size */
    const gc_json *lib;
    char code_w[16]; /* a code on this line whose words mean something of their own (Fagor 8055 G60-G68) */
    char motion[16], cycle_code[16], plane[16], unit_code[16], dist_code[16], feed_code[16], spin_code[16];
    char comp[16], tlen[16], wcs[48], spin_dir[16], cool[16], torch[16];
    int tlen_on;
    const char *F, *S, *T, *H;
    unsigned chg, ever;
    int has_pos[3];
    double pos[3];
    const char *pos_w[3];
    const char *cyc_r, *cyc_q;
} tstate;

/* Copies a code into a fixed field, cutting it short if it's ever longer than any real code. */
static void set_str(char *dst, size_t n, const char *s)
{
    size_t len = s ? strlen(s) : 0;
    if (len >= n) len = n - 1;
    if (len) memcpy(dst, s, len);
    dst[len] = '\0';
}
#define SET(f, v) set_str(st->f, sizeof st->f, (v))

static void new_state(const gc_ctx *c, tstate *st)
{
    memset(st, 0, sizeof *st);
    st->inch = 1;
    st->per_rev = c->lathe;
    SET(plane, c->lathe ? "G18" : "G17");
    SET(unit_code, "G20");
    SET(dist_code, "G90");
    SET(feed_code, c->lathe ? c->feed_per_rev : c->feed_per_min);
    SET(spin_code, "G97");
    SET(comp, "G40");
    SET(tlen, c->tlen_off);
    SET(wcs, c->okuma ? (c->lathe ? "" : "G15 H1") : "G54");
    SET(spin_dir, "M05");
    SET(cool, "M09");
}

/* /^L[-+]?[\d.]+$/ for a letter in set. */
static int is_value_word(const char *t, const char *letters)
{
    if (!t[0] || !strchr(letters, t[0])) return 0;
    const char *p = t + 1;
    if (*p == '-' || *p == '+') p++;
    if (!*p) return 0;
    for (; *p; p++)
        if (!gc_is_digit((unsigned char)*p) && *p != '.') return 0;
    return 1;
}

static int is_gm(const char *t)
{
    return (t[0] == 'G' || t[0] == 'M') && gc_is_digit((unsigned char)t[1]);
}

static int in_group(const gc_ctx *c, const char *group, const char *code)
{
    return gc_json_has_str(gc_json_get(c->groups, group), code);
}

/* The lathe code that clamps the spindle speed and, with X or Z, sets the coordinates:
   G50 in G code system A, G92 in systems B and C (the dialect's speedClamp code). */
static const char *coord_set_code(const gc_ctx *c)
{
    const char *k = gc_json_get_str(gc_json_get(c->dialect, "speedClamp"), "code");
    return k ? k : "G50";
}

static double num_value(const gc_ctx *c, const char *t, int inch)
{
    gc_num f;
    gc_fmt_num(c, t[0], t + 1, inch, &f);
    return gc_js_parse_float(f.v);
}

static void track_carry(const gc_ctx *c, const gc_line *l, tstate *st)
{
    if (st->cycle)
        for (int i = 0; i < l->ntok; i++) {
            if (is_value_word(l->tok[i], "R")) st->cyc_r = l->tok[i];
            if (is_value_word(l->tok[i], "Q")) st->cyc_q = l->tok[i];
        }
    if (gc_line_has_code(l, "G04") || gc_line_has_code(l, "G65") || gc_line_has_code(l, "M97") ||
        gc_line_has_code(l, "M98") || gc_line_has_tok(l, "CALL"))
        return; /* X and P there are a dwell or arguments */
    const gc_json *nm = gc_json_get(c->dialect, "noMoveCodes");
    for (size_t i = 0; i < gc_json_len(nm); i++)
        if (gc_json_str(nm->items[i]) && gc_line_has_code(l, gc_json_str(nm->items[i]))) return; /* X and Y there are a pattern's sizes */
    int unknown = gc_line_has_code(l, "G28") || gc_line_has_code(l, "G30") || gc_line_has_code(l, "G53") ||
                  gc_line_has_code(l, "G52") || gc_line_has_code(l, "G92") || (c->lathe && gc_line_has_code(l, coord_set_code(c))) ||
                  (c->lathe && st->cycle);
    static const char ABS[3] = { 'X', 'Y', 'Z' }, INC[3] = { 'U', 'V', 'W' };
    for (int a = 0; a < 3; a++) {
        const char *ta = NULL, *ti = NULL;
        char la[2] = { ABS[a], 0 }, li[2] = { INC[a], 0 };
        for (int i = 0; i < l->ntok && !ta; i++)
            if (is_value_word(l->tok[i], la) || (l->tok[i][0] == ABS[a] && gc_is_var_val(l->tok[i]))) ta = l->tok[i];
        for (int i = 0; i < l->ntok && !ti; i++)
            if (is_value_word(l->tok[i], li) || (l->tok[i][0] == INC[a] && gc_is_var_val(l->tok[i]))) ti = l->tok[i];
        if (!ta && !ti) continue;
        st->pos_w[a] = NULL;
        if ((ta && gc_is_var_val(ta)) || (!ta && gc_is_var_val(ti))) { /* worked out when it runs */
            if (ta && !st->inc) st->pos_w[a] = ta;
            st->has_pos[a] = 0;
            continue;
        }
        if (unknown || (st->cycle && st->inc && a == 2)) {
            st->has_pos[a] = 0;
            continue;
        }
        if (ta && !st->inc) st->pos_w[a] = ta;
        if (ta) {
            double v = num_value(c, ta, st->inch);
            if (st->inc) {
                if (st->has_pos[a]) st->pos[a] += v;
            } else {
                st->pos[a] = v;
                st->has_pos[a] = 1;
            }
        } else if (c->lathe) {
            if (st->has_pos[a]) st->pos[a] += num_value(c, ti, st->inch);
        }
    }
}

static void apply_modes(const gc_ctx *c, const gc_line *l, tstate *st)
{
    st->dwell = st->sub = st->local = 0;
    st->sub_word = 0;
    /* a lathe G50 (G92 in G code systems B and C: the speedClamp code) with X or Z sets the
       coordinates (zero shift) instead of the spindle limit */
    st->zero_shift = 0;
    if (c->lathe && gc_line_has_code(l, coord_set_code(c)))
        for (int i = 0; i < l->ntok; i++) {
            const char *t = l->tok[i];
            if (!t[0] || !strchr("XZUW", t[0])) continue;
            const char *p = t + 1;
            if (*p == '-' || *p == '+') p++;
            if (gc_is_digit((unsigned char)*p) || *p == '.' || *p == '#' || *p == '[' || t[1] == '=' ||
                (p != t + 1 && gc_is_alpha((unsigned char)*p)))
                st->zero_shift = 1;
        }
    /* Okuma automatic chamfer or rounding (G75, G76): L on that line is the corner's size */
    st->corner[0] = '\0';
    for (int i = 0; i < l->ntok && !st->corner[0]; i++) {
        const char *t = l->tok[i];
        if (t[0] != 'G' || !gc_is_digit((unsigned char)t[1])) continue;
        char k[16], kl[24];
        gc_pad2(t, k, sizeof k);
        snprintf(kl, sizeof kl, "%s.L", k);
        if (gc_entry(c, kl)) snprintf(st->corner, sizeof st->corner, "%s", k);
    }
    st->lib = NULL;
    st->code_w[0] = '\0';
    st->chg = 0;
    if (st->one_shot) {
        st->cycle = 0;
        st->cycle_code[0] = '\0';
        st->one_shot = 0;
        st->cyc_r = st->cyc_q = NULL;
    }
#define CHG(bit) (st->chg |= (bit), st->ever |= (bit))
    int wcs_line = gc_line_has_code(l, "G15");
    const char *clamp_code = coord_set_code(c);
    const gc_json *unit_codes = gc_json_get(c->dialect, "unitCodes");
    const char *uc_inch = "G20", *uc_mm = "G21";
    if (unit_codes) {
        uc_inch = gc_json_get_str(unit_codes, "inch");
        uc_mm = gc_json_get_str(unit_codes, "mm");
    }
    const gc_json *tl_on = gc_json_get(gc_json_get(c->dialect, "toolLength"), "on");
    for (int i = 0; i < l->ntok; i++) {
        const char *t = l->tok[i];
        if (is_value_word(t, "FSTH") || (strchr("FSTH", t[0]) && gc_is_var_val(t))) {
            if (t[0] == 'H' && wcs_line) {
                snprintf(st->wcs, sizeof st->wcs, "G15 %s", t);
                CHG(CH_WCS);
            } else if (!(t[0] == 'S' && gc_line_has_code(l, clamp_code) && c->lathe)) {
                switch (t[0]) {
                case 'F': st->F = t; CHG(CH_F); break;
                case 'S': st->S = t; CHG(CH_S); break;
                case 'T': st->T = t; CHG(CH_T); break;
                default: st->H = t; CHG(CH_H); break;
                }
            }
            continue;
        }
        if (strcmp(t, "CALL") == 0) st->sub = 1;
        if (!is_gm(t)) continue;
        char k[64];
        gc_pad2(t, k, sizeof k);
        const gc_json *cyc = gc_json_get(c->cycles, k);
        if (!strcmp(k, "G00") || !strcmp(k, "G01") || !strcmp(k, "G02") || !strcmp(k, "G03")) {
            SET(motion, k);
            CHG(CH_MOTION);
            st->cycle_code[0] = '\0';
            st->cycle = 0;
            st->cyc_r = st->cyc_q = NULL;
        }
        if (!strcmp(k, "G17") || !strcmp(k, "G18") || !strcmp(k, "G19")) {
            SET(plane, k);
            CHG(CH_PLANE);
        }
        if (uc_inch && !strcmp(k, uc_inch)) {
            st->inch = 1;
            SET(unit_code, k);
            CHG(CH_UNITS);
        }
        if (uc_mm && !strcmp(k, uc_mm)) {
            st->inch = 0;
            SET(unit_code, k);
            CHG(CH_UNITS);
        }
        if (in_group(c, "distance", k)) {
            st->inc = (!strcmp(k, "G91") || !strcmp(k, "G191"));
            SET(dist_code, k);
            CHG(CH_DIST);
        }
        if (!strcmp(k, c->feed_per_min) && !cyc) {
            st->per_rev = 0;
            SET(feed_code, k);
            CHG(CH_FEED);
        }
        if (!strcmp(k, c->feed_per_rev) && !cyc) {
            st->per_rev = 1;
            SET(feed_code, k);
            CHG(CH_FEED);
        }
        int css_codes = !c->process && !gc_json_truthy(gc_json_get(c->dialect, "noCss")); /* Fagor 8055: G96/G97 are feed modes */
        if (css_codes && !strcmp(k, "G96")) {
            st->css = 1;
            SET(spin_code, k);
            CHG(CH_SPIN);
        }
        if (css_codes && !strcmp(k, "G97")) {
            st->css = 0;
            SET(spin_code, k);
            CHG(CH_SPIN);
        }
        if (!strcmp(k, "G40") || !strcmp(k, "G41") || !strcmp(k, "G42")) {
            SET(comp, k);
            CHG(CH_COMP);
        }
        if (in_group(c, "tool length", k)) {
            SET(tlen, k);
            CHG(CH_TLEN);
            st->tlen_on = gc_json_has_str(tl_on, k);
        }
        if (in_group(c, "work offset", k) && strcmp(k, "G15") != 0) {
            SET(wcs, k);
            CHG(CH_WCS);
        }
        if (cyc) {
            st->cycle = 1;
            SET(cycle_code, k);
            CHG(CH_CYCLE);
            const gc_json *modal = gc_json_get(cyc, "modal");
            st->one_shot = modal && modal->type == GC_JFALSE;
        }
        if (!strcmp(k, "G80") && !(c->lathe && c->okuma)) {
            st->cycle = 0;
            st->cycle_code[0] = '\0';
            CHG(CH_CYCLE);
            st->cyc_r = st->cyc_q = NULL;
            if (!c->lathe) {
                st->has_pos[2] = 0;
                st->pos_w[2] = NULL;
            }
        }
        if (c->process) {
            /* A plasma torch, not a spindle and coolant. */
            if (gc_json_has_str(gc_json_get(c->process, "on"), k) || gc_json_has_str(gc_json_get(c->process, "off"), k)) {
                SET(torch, k);
                CHG(CH_TORCH);
            }
        } else if (!strcmp(k, "M03") || !strcmp(k, "M04") || !strcmp(k, "M05")) {
            SET(spin_dir, k);
            CHG(CH_SPINDIR);
        } else if (!strcmp(k, "M08") || !strcmp(k, "M09") || !strcmp(k, "M88") || !strcmp(k, "M89")) {
            SET(cool, k);
            CHG(CH_COOL);
        }
        if (!strcmp(k, "G04")) st->dwell = 1;
        if (gc_json_get(gc_json_get(c->dialect, "codeWords"), k)) { /* Fagor 8055 G60-G68 patterns and pockets */
            set_str(st->code_w, sizeof st->code_w, k);
            continue;
        }
        if (!strcmp(k, "M98") || !strcmp(k, "M97") || !strcmp(k, "G65")) st->sub = 1;
        {
            const char *sw = gc_json_get_str(gc_json_get(gc_json_get(c->dialect, "subCalls"), k), "word");
            if (sw && sw[0] && sw[0] != 'P') {
                st->sub = 1;
                st->sub_word = sw[0];
            }
        }
        if (!strcmp(k, "M97")) st->local = 1;
        if (!strcmp(k, "G65")) st->lib = gc_lib_for(c, l);
    }
#undef CHG
    track_carry(c, l, st);
}

/* ---------- English words ---------- */

static const char *style_key(const gc_ctx *c)
{
    return c->style == GC_STYLE_SHORT ? "short" : c->style == GC_STYLE_WORDS ? "words" : "long";
}

/* An entry's English word in the chosen style; full words fall back to the long word where an entry has none. */
static const gc_json *style_get(const gc_json *o, const char *sk)
{
    const gc_json *v = gc_json_get(o, sk);
    return v ? v : gc_json_get(o, "long");
}

static const char *feed_unit(int per_rev, int inch)
{
    return per_rev ? (inch ? "ipr" : "mmpr") : (inch ? "ipm" : "mmpm");
}

static const char *speed_unit(int css, int inch)
{
    return css ? (inch ? "sfm" : "smm") : "rpm";
}

static const char *unit_words(const char *u)
{
    static const char *const T[][2] = { { "ipm", "inches per minute" }, { "ipr", "inches per rev" },
                                        { "mmpm", "mm per minute" },     { "mmpr", "mm per rev" },
                                        { "rpm", "RPM" },                { "sfm", "surface feet per minute" },
                                        { "smm", "surface meters per minute" } };
    for (size_t i = 0; i < sizeof T / sizeof *T; i++)
        if (!strcmp(T[i][0], u)) return T[i][1];
    return "";
}

static int arg_var(char L)
{
    static const char LET[] = "ABCIJKDEFHMQRSTUVWXYZ";
    static const int VAR[] = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26 };
    const char *p = strchr(LET, L);
    return (p && L) ? VAR[p - LET] : 0;
}

/* JavaScript's `${x}` of a JSON value that may be missing. */
static const char *js_str(const gc_json *v)
{
    const char *s = gc_json_str(v);
    return s ? s : "undefined";
}

static void cell_set(gc_cell *cell, const char *e, const char *u, const char *d, unsigned flags)
{
    cell->e = gc_strdup(e ? e : "undefined");
    cell->u = (u && *u) ? gc_strdup(u) : NULL;
    cell->d = gc_strdup(d ? d : "");
    cell->flags = flags;
}

/* Fagor 8060/8065: labels (N10: and [NAME]), the NR repeat count, and statements read by their first word
   ($IF, #CALL, %L, LL). Returns 0 for other words. */
static int fagor_word(const gc_ctx *c, const char *t, const tstate *st, gc_cell *cell)
{
    char e[640], d[512];
    const char *sk = style_key(c);
    size_t tl = strlen(t);
    const gc_json *addr = gc_json_get(c->data->words, "address");
    if (t[0] == 'N' && gc_is_digit((unsigned char)t[1]) && t[tl - 1] == ':') {
        size_t k = 1;
        while (gc_is_digit((unsigned char)t[k])) k++;
        if (k == tl - 1) {
            snprintf(e, sizeof e, "%s%s", js_str(style_get(gc_json_get(addr, "N"), sk)), t + 1);
            snprintf(d, sizeof d, "Sequence number %.*s, a label other lines can jump to", (int)(tl - 2), t + 1);
            cell_set(cell, e, NULL, d, 0);
            return 1;
        }
    }
    if (t[0] == '[' && tl > 2 && t[tl - 1] == ']') {
        int ok = 1;
        for (size_t q = 1; q + 1 < tl; q++)
            if (!gc_is_alpha((unsigned char)t[q]) && !gc_is_digit((unsigned char)t[q]) && t[q] != '_') ok = 0;
        if (ok) {
            snprintf(e, sizeof e, "LABEL%s", t);
            snprintf(d, sizeof d, "Label %.*s, a place other lines can jump to", (int)(tl - 2), t + 1);
            cell_set(cell, e, NULL, d, 0);
            return 1;
        }
    }
    if (t[0] == 'N' && t[1] == 'R' && t[2] && gc_all_digits(t + 2)) {
        snprintf(e, sizeof e, "%s%s", strcmp(sk, "short") ? "REPEAT" : "x", t + 2);
        snprintf(d, sizeof d, "Run this line %s times", t + 2);
        cell_set(cell, e, NULL, d, 0);
        return 1;
    }
    size_t w1 = 0;
    if (t[0] == '#' || t[0] == '$') {
        size_t k = 1;
        while (t[k] >= 'A' && t[k] <= 'Z') k++;
        if (k > 1) w1 = k;
    } else if (t[0] == '%') {
        w1 = (t[1] == 'L' && t[2] == ' ') ? 2 : 1;
    } else if (t[0] == 'L') {
        if (t[1] == 'L' && t[2] == ' ') w1 = 2;
        else if (t[1] == ' ') w1 = 1;
    }
    if (w1) {
        char key[32];
        if (w1 >= sizeof key) w1 = sizeof key - 1;
        memcpy(key, t, w1);
        key[w1] = '\0';
        const gc_json *en = gc_entry(c, key);
        const char *rest = t + w1;
        if (en) {
            snprintf(e, sizeof e, "%s%s%s", js_str(style_get(en, sk)), (*rest && *rest != ' ') ? " " : "", rest);
            cell_set(cell, e, NULL, js_str(gc_json_get(en, "desc")), 0);
        } else {
            snprintf(e, sizeof e, "?%s", t);
            snprintf(d, sizeof d, "%s isn't a statement GlossCode knows on this control.", key);
            cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
        }
        return 1;
    }
    if (st && st->dwell && tl && gc_is_digit((unsigned char)t[tl - 1])) { /* G04 8.5: the time alone */
        int dots = 0, ok = 1;
        for (size_t q = 0; q < tl; q++)
            if (t[q] == '.') dots++;
            else if (!gc_is_digit((unsigned char)t[q])) ok = 0;
        if (ok && dots <= 1) {
            snprintf(e, sizeof e, "%s%s", js_str(style_get(gc_json_get(gc_json_get(addr, "P"), "dwell"), sk)), t);
            snprintf(d, sizeof d, "Dwell for %s seconds", t);
            cell_set(cell, e, NULL, d, 0);
            return 1;
        }
    }
    return 0;
}

/* Fagor 8055: the "%" header line, and statements in ( ): an assignment reads as written, others by their
   first word. Returns 0 for other words. */
static int fagor55_word(const gc_ctx *c, const char *t, gc_cell *cell)
{
    char e[1024], d[512];
    const char *sk = style_key(c);
    if (t[0] == '%') {
        const gc_json *en = gc_entry(c, "%");
        if (!en) return 0;
        const char *rest = t + 1;
        snprintf(e, sizeof e, "%s%s%s", js_str(style_get(en, sk)), (*rest && *rest != ' ') ? " " : "", rest);
        cell_set(cell, e, NULL, js_str(gc_json_get(en, "desc")), 0);
        return 1;
    }
    if (t[0] != '(') return 0;
    size_t tl = strlen(t), il = tl - 1;
    if (tl > 1 && t[tl - 1] == ')') il = tl - 2;
    char inner[1024];
    snprintf(inner, sizeof inner, "%.*s", (int)il, t + 1);
    /* An assignment: NAME =, or NAME(index) = */
    {
        const char *q = inner;
        if (*q >= 'A' && *q <= 'Z') {
            q++;
            while ((*q >= 'A' && *q <= 'Z') || gc_is_digit((unsigned char)*q)) q++;
            if (*q == '(') {
                const char *r = strchr(q, ')');
                if (r && !memchr(q + 1, '(', (size_t)(r - q - 1))) q = r + 1;
            }
            if (*q == ' ') q++;
            if (*q == '=') {
                cell_set(cell, inner, NULL, "Sets parameters or variables, worked out when the line runs", 0);
                return 1;
            }
        }
    }
    size_t w1 = 0;
    while (inner[w1] >= 'A' && inner[w1] <= 'Z') w1++;
    char key[40];
    const gc_json *en = NULL;
    if (w1 && w1 < sizeof key - 1) {
        snprintf(key, sizeof key, "(%.*s", (int)w1, inner);
        en = gc_entry(c, key);
    }
    if (en) {
        const char *rest = inner + w1;
        snprintf(e, sizeof e, "%s%s%s", js_str(style_get(en, sk)), (*rest && *rest != ' ') ? " " : "", rest);
        cell_set(cell, e, NULL, js_str(gc_json_get(en, "desc")), 0);
    } else {
        snprintf(e, sizeof e, "?%s", t);
        if (w1) snprintf(d, sizeof d, "%.*s isn't a statement GlossCode knows on this control.", (int)w1, inner);
        else snprintf(d, sizeof d, "%s isn't a statement GlossCode knows on this control.", t);
        cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
    }
    return 1;
}

static void word(const gc_ctx *c, const char *t, const tstate *st, gc_cell *cell, int ref)
{
    char e[256], d[512];
    cell->g = gc_strdup(t);
    if (gc_is_comment(t, c->syntax)) {
        cell_set(cell, "", NULL, "Comment, kept as written", GC_CELL_COMMENT);
        return;
    }
    if (c->syntax == GC_SYN_FAGOR8060 && fagor_word(c, t, st, cell)) return;
    if (c->syntax == GC_SYN_FAGOR8055 && fagor55_word(c, t, cell)) return;
    if (!gc_is_alpha((unsigned char)t[0]) && t[0] != '#' && t[0] != '/') { /* text that isn't a word, kept as written */
        if (!strcmp(t, ";")) cell_set(cell, ";", NULL, "End of block (;)", 0);
        else if (!strcmp(t, "%")) cell_set(cell, "%", NULL, "Program start or end mark (%), kept as written", 0);
        else if (!strcmp(t, "\x1a"))
            cell_set(cell, "EOF", NULL, "End-of-file mark (Ctrl+Z) that older systems write after the last line, kept as written", 0);
        else {
            snprintf(e, sizeof e, "?%s", t);
            snprintf(d, sizeof d, "%s isn't G-code GlossCode can read. It's kept as written.", t);
            cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
        }
        return;
    }
    const char *sk = style_key(c);
    if (gc_is_macro_tok(t)) { /* macro text reads as written */
        if (t[0] == '#') {
            const char *eq = NULL;
            if (t[1] == '[') {
                const char *q = strchr(t, ']');
                if (q && q[1] == '=') eq = q + 1;
            } else {
                const char *q = t + 1;
                while (gc_is_digit((unsigned char)*q)) q++;
                if (q > t + 1 && *q == '=') eq = q;
            }
            if (!eq || !eq[1]) {
                snprintf(e, sizeof e, "?%s", t);
                snprintf(d, sizeof d, "%s has no = and value, so it doesn't set the variable.", t);
                cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
                return;
            }
            const char *val = eq + 1, *p = val;
            if (*p == '-' || *p == '+') p++;
            int plain = *p != '\0';
            for (; *p; p++)
                if (!gc_is_digit((unsigned char)*p) && *p != '.') plain = 0;
            snprintf(d, sizeof d, "Sets macro variable %.*s to %s%s", (int)(eq - t), t, val, plain ? "" : ", worked out when the line runs");
            cell_set(cell, t, NULL, d, 0);
        } else if (gc_is_alpha((unsigned char)t[0]) && strchr(t, '=') && !gc_starts_with(t, "IF") && !gc_starts_with(t, "WHILE")) {
            /* Okuma: V1=3 (a common variable) or DIA1=160 (a local variable) */
            const char *eq = strchr(t, '='), *val = eq + 1, *p = val;
            if (*p == '-' || *p == '+') p++;
            int plain = *p != '\0';
            for (; *p; p++)
                if (!gc_is_digit((unsigned char)*p) && *p != '.') plain = 0;
            snprintf(d, sizeof d, "Sets variable %.*s to %s%s", (int)(eq - t), t, val, plain ? "" : ", worked out when the line runs");
            cell_set(cell, t, NULL, d, 0);
        } else if (gc_starts_with(t, "GOTO ")) {
            snprintf(d, sizeof d, "Jump to N%s", t[5] == 'N' ? t + 6 : t + 5);
            cell_set(cell, t, NULL, d, 0);
        } else if (gc_starts_with(t, "IF"))
            cell_set(cell, t, NULL, "Macro IF statement: when the condition in [ ] is true, the rest of the line runs", 0);
        else if (gc_starts_with(t, "WHILE"))
            cell_set(cell, t, NULL, "Macro WHILE loop: runs the lines down to the matching END while the condition in [ ] is true", 0);
        else {
            snprintf(d, sizeof d, "End of WHILE loop %s", t + 3);
            cell_set(cell, t, NULL, d, 0);
        }
        return;
    }
    if (t[0] == '/') { /* block delete */
        const gc_json *en = gc_entry(c, "/");
        if (!en) {
            cell_set(cell, "?/", NULL, "Block delete isn't in the dictionary.", GC_CELL_UNKNOWN);
            return;
        }
        snprintf(e, sizeof e, "%s%s", js_str(style_get(en, sk)), t + 1);
        if (t[1]) snprintf(d, sizeof d, "%s (switch %s)", js_str(gc_json_get(en, "desc")), t + 1);
        else snprintf(d, sizeof d, "%s", js_str(gc_json_get(en, "desc")));
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (gc_is_kw(t)) { /* CALL, RTS, GOTO */
        const gc_json *en = gc_entry(c, t);
        /* A statement with arguments (Okuma PS LC,[0,0],[-2,55]) reads by its first word, and the rest as written */
        size_t w1 = 0;
        while (t[w1] >= 'A' && t[w1] <= 'Z') w1++;
        char first[32];
        const gc_json *e1 = NULL;
        if (!en && t[w1] && w1 < sizeof first) {
            memcpy(first, t, w1);
            first[w1] = '\0';
            e1 = gc_entry(c, first);
        }
        if (e1) {
            char ee[600];
            snprintf(ee, sizeof ee, "%s%s", js_str(style_get(e1, sk)), t + w1);
            cell_set(cell, ee, NULL, js_str(gc_json_get(e1, "desc")), 0);
        } else if (en) {
            cell_set(cell, js_str(style_get(en, sk)), NULL, js_str(gc_json_get(en, "desc")), 0);
        } else {
            snprintf(e, sizeof e, "?%s", t);
            snprintf(d, sizeof d, "%s isn't a keyword on this machine.", t);
            cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
        }
        return;
    }
    char L = t[0];
    const char *raw = t + 1;
    gc_num f;
    gc_fmt_num(c, L, raw, st->inch, &f);
    const char *v = f.v;
    if ((L == 'G' || L == 'M') && t[1] == 'P' && gc_is_digit((unsigned char)t[2])) { /* Fagor: GP0, the code in a parameter */
        snprintf(d, sizeof d, "%c code from parameter %s, known when the line runs", L, raw);
        cell_set(cell, t, NULL, d, 0);
        return;
    }
    if (L == 'G' || L == 'M') {
        char k[64];
        gc_pad2(t, k, sizeof k);
        char ks[72];
        snprintf(ks, sizeof ks, "%s.shift", k);
        const gc_json *en = (!strcmp(k, coord_set_code(c)) && st->zero_shift) ? gc_entry(c, ks) : NULL;
        if (!en) en = gc_entry(c, k);
        if (!en) {
            snprintf(e, sizeof e, "?%s", k);
            snprintf(d, sizeof d, "%s isn't in the dictionary or this machine's file.", k);
            cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
        } else {
            cell_set(cell, js_str(style_get(en, sk)), NULL, js_str(gc_json_get(en, "desc")), 0);
        }
        return;
    }
    /* A subprogram call whose program word isn't P (Mitsubishi M2/M0: G22 L2200 P5, P the repeat count) */
    if (st->sub_word && st->sub_word != 'P' && (L == st->sub_word || L == 'P')) {
        if (L == 'P') {
            snprintf(e, sizeof e, "%s%s", strcmp(sk, "short") ? "REPEAT" : "x", v);
            snprintf(d, sizeof d, "Repeat %s times", v);
        } else {
            const gc_json *x = gc_json_get(gc_json_get(gc_json_get(c->data->words, "address"), "P"), "sub");
            if (strcmp(sk, "short")) snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
            else snprintf(e, sizeof e, "%c%s", L, v);
            snprintf(d, sizeof d, "Program number %s", v);
        }
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    /* On a code with words of its own (Fagor 8055 G60 linear pattern: X is its length, K the number of points) */
    if (st->code_w[0] && L != 'N') {
        const gc_json *cd = gc_json_get(gc_json_get(c->dialect, "codeWords"), st->code_w);
        char Ls1[2] = { L, '\0' };
        const gc_json *cw = gc_json_get(gc_json_get(cd, "words"), Ls1);
        if (cw) {
            snprintf(e, sizeof e, "%s%s", js_str(gc_json_at(cw, 0)), gc_json_has_str(gc_json_get(cd, "labels"), Ls1) ? raw : v);
            snprintf(d, sizeof d, "%s (%s)", js_str(gc_json_at(cw, 1)), st->code_w);
            cell_set(cell, e, NULL, d, f.implied ? GC_CELL_IMPLIED : 0);
            return;
        }
    }
    /* On a G65 line that calls a library subprogram, each argument reads as the name the library gives it. */
    if (st->lib && L != 'N' && L != 'O') {
        const gc_json *lib = st->lib;
        char prog[32];
        gc_js_num(gc_json_get(lib, "program") ? gc_json_get(lib, "program")->num : gc_nan(), prog, sizeof prog);
        if (L == 'P') {
            const char *w = js_str(style_get(gc_json_get(lib, "word"), sk));
            snprintf(e, sizeof e, "%s", (w && *w) ? w : "");
            if (!(w && *w)) snprintf(e, sizeof e, "O%s", prog);
            snprintf(d, sizeof d, "Library subprogram O%s: %s", prog, js_str(gc_json_get(lib, "name")));
            cell_set(cell, e, NULL, d, 0);
            return;
        }
        const gc_json *args = gc_json_get(lib, "args"), *a = NULL;
        for (size_t i = 0; i < gc_json_len(args) && !a; i++) {
            const char *letter = gc_json_get_str(args->items[i], "letter");
            if (letter && letter[0] == L && !letter[1]) a = args->items[i];
        }
        if (!a) {
            snprintf(e, sizeof e, "?%c", L);
            snprintf(d, sizeof d, "%s has no %c variable.", js_str(gc_json_get(lib, "name")), L);
            cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
            return;
        }
        const char *kind = gc_json_get_str(a, "kind");
        const char *unit = "";
        if (kind && !strcmp(kind, "feed")) unit = feed_unit(st->per_rev, st->inch);
        else if (kind && !strcmp(kind, "speed")) unit = speed_unit(st->css, st->inch);
        int imp = f.implied && kind && !strcmp(kind, "distance");
        snprintf(e, sizeof e, "%s%s", js_str(gc_json_get(a, "name")), v);
        char var[16];
        int n = arg_var(L);
        if (n) snprintf(var, sizeof var, "%d", n);
        else strcpy(var, "undefined");
        snprintf(d, sizeof d, "%s: %s%s%s (#%s in O%s)", js_str(gc_json_get(a, "desc")), v, *unit ? " " : "", unit, var, prog);
        cell_set(cell, e, unit, d, imp ? GC_CELL_IMPLIED : 0);
        return;
    }
    /* Inside a canned cycle, a word can mean something special (Haas G76 A is the tool angle). */
    if (st->cycle_code[0] && (!strchr("FSXYZ", L) || (L == 'Z' && gc_json_truthy(gc_json_get(c->dialect, "cycleRefZ"))))) {
        const gc_json *cw = gc_cycle_word(c, st->cycle_code, L);
        const char *en = gc_json_str(gc_json_at(cw, 2));
        if (en && *en) {
            snprintf(e, sizeof e, "%s%s", en, v);
            snprintf(d, sizeof d, "%s (%s)", js_str(gc_json_at(cw, 1)), st->cycle_code);
            cell_set(cell, e, NULL, d, f.implied ? GC_CELL_IMPLIED : 0);
            return;
        }
    }
    char Ls[2] = { L, '\0' };
    const gc_json *a = gc_json_get(gc_json_get(c->data->words, "address"), Ls);
    if (!a) {
        if (L == 'L' && st->corner[0]) { /* Okuma G75/G76: the chamfer or rounding size */
            char kl[24];
            snprintf(kl, sizeof kl, "%s.L", st->corner);
            const gc_json *x = gc_entry(c, kl);
            snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
            snprintf(d, sizeof d, "%s %s", js_str(gc_json_get(x, "desc")), v);
            cell_set(cell, e, NULL, d, f.implied ? GC_CELL_IMPLIED : 0);
            return;
        }
        /* Okuma lathes give an arc's radius with L (G03 X Z L), where other controls use R */
        const char *ar = gc_json_get_str(c->dialect, "arcRadius");
        if (ar && ar[0] == L && !ar[1] && (!strcmp(st->motion, "G02") || !strcmp(st->motion, "G03")) && !st->cycle_code[0]) {
            const gc_json *x = gc_json_get(gc_json_get(gc_json_get(c->data->words, "address"), "R"), "arc");
            snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
            cell_set(cell, e, NULL, "Arc radius", f.implied ? GC_CELL_IMPLIED : 0);
            return;
        }
        snprintf(e, sizeof e, "?%c", L);
        snprintf(d, sizeof d, "Address letter %c isn't in the dictionary.", L);
        cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
        return;
    }
    /* A later N word names another line: the one a GOTO or IF jumps to, or where an Okuma LAP contour starts */
    /* Fagor 8055: an N after the first word repeats the line (N0 makes the move without the active cycle) */
    if (L == 'N' && ref && c->syntax == GC_SYN_FAGOR8055) {
        int zeros = *raw != '\0';
        for (const char *q = raw; *q; q++)
            if (*q != '0') zeros = 0;
        snprintf(e, sizeof e, "%s%s", strcmp(sk, "short") ? "REPEAT" : "x", raw);
        if (zeros) snprintf(d, sizeof d, "Make the move without running the active cycle");
        else snprintf(d, sizeof d, "Run this line %s times", raw);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (L == 'N' && ref) {
        snprintf(e, sizeof e, "%s%s", js_str(style_get(a, sk)), raw);
        snprintf(d, sizeof d, "The line labeled N%s", raw);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    /* G04 K0.5 (Fagor 8060), in seconds */
    if (L == 'K' && st->dwell && gc_json_has_str(gc_json_get(c->dialect, "dwellWords"), "K") &&
        gc_json_truthy(gc_json_get(c->dialect, "dwellHundredths"))) { /* Fagor 8055: K50 is half a second */
        snprintf(e, sizeof e, "%s%s", strcmp(sk, "short") ? "DWELL" : "DWL", v);
        snprintf(d, sizeof d, "Dwell for %s hundredths of a second", v);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (L == 'K' && st->dwell && gc_json_has_str(gc_json_get(c->dialect, "dwellWords"), "K")) {
        const gc_json *x = gc_json_get(gc_json_get(gc_json_get(c->data->words, "address"), "P"), "dwell");
        snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
        snprintf(d, sizeof d, "Dwell for %s seconds", v);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    /* G04 F2. on controls that give the dwell time with F (Okuma) */
    if (L == 'F' && st->dwell && gc_json_has_str(gc_json_get(c->dialect, "dwellWords"), "F")) {
        const gc_json *x = gc_json_get(gc_json_get(gc_json_get(c->data->words, "address"), "P"), "dwell");
        snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
        snprintf(d, sizeof d, "Dwell for %s seconds", v);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    const char *in = st->inch ? "in" : "mm";
    char d2[512] = "";
    unsigned imp = 0;
    if (f.implied) {
        char intended[64];
        snprintf(intended, sizeof intended, "%s", f.intended);
        size_t il = strlen(intended);
        if (il && intended[il - 1] == '.') intended[il - 1] = '\0';
        snprintf(d2, sizeof d2, "No decimal point, so this reads as %s %s. Write %c%s for %s %s.", v, in, L, f.intended, intended, in);
        imp = GC_CELL_IMPLIED;
    }
    if (L == 'F') {
        const char *u = feed_unit(st->per_rev, st->inch);
        snprintf(e, sizeof e, "F%s", v);
        snprintf(d, sizeof d, "Feed rate %s %s", v, unit_words(u));
        cell_set(cell, e, u, d, 0);
        return;
    }
    if (L == 'S') {
        const char *u = speed_unit(st->css, st->inch);
        snprintf(e, sizeof e, "S%s", v);
        if (st->css) snprintf(d, sizeof d, "Surface speed %s %s", v, unit_words(u));
        else snprintf(d, sizeof d, "Spindle speed %s RPM", v);
        cell_set(cell, e, u, d, 0);
        return;
    }
    if (L == 'X' || L == 'Y' || L == 'Z') {
        const gc_json *x = gc_json_get(a, st->inc ? "inc" : "abs");
        snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
        if (*d2) snprintf(d, sizeof d, "%s", d2);
        else if (st->inc) snprintf(d, sizeof d, "Move %s in %c from where the tool is", v, L);
        else snprintf(d, sizeof d, "%c position %s", L, v);
        cell_set(cell, e, NULL, d, imp);
        return;
    }
    if (L == 'U' || L == 'W') {
        if (!c->lathe) {
            snprintf(e, sizeof e, "?%c", L);
            snprintf(d, sizeof d, "%c is only used on lathes.", L);
            cell_set(cell, e, NULL, d, GC_CELL_UNKNOWN);
            return;
        }
        const gc_json *x = gc_json_get(a, "lathe");
        snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
        if (*d2) snprintf(d, sizeof d, "%s", d2);
        else snprintf(d, sizeof d, "%s %s", js_str(gc_json_get(x, "desc")), v);
        cell_set(cell, e, NULL, d, imp);
        return;
    }
    if (L == 'R') {
        const gc_json *x = gc_json_get(a, st->cycle ? "cycle" : "arc");
        snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
        snprintf(d, sizeof d, "%s", *d2 ? d2 : st->cycle ? "Retract plane for the drilling cycle" : "Arc radius");
        cell_set(cell, e, NULL, d, imp);
        return;
    }
    const gc_json *cy = st->cycle_code[0] ? gc_json_get(c->cycles, st->cycle_code) : NULL;
    if (cy && gc_json_has_str(gc_json_get(cy, "labels"), Ls)) {
        snprintf(e, sizeof e, "%s%s", L == 'P' ? "FROM" : "TO", raw);
        snprintf(d, sizeof d, "%s line of the contour, N%s", L == 'P' ? "First" : "Last", raw);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (cy && c->lathe && L == 'D') {
        snprintf(e, sizeof e, "DEPTH%s", v);
        snprintf(d, sizeof d, "Depth of each pass, %s", v);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (cy && c->lathe && L == 'K' && gc_json_truthy(gc_json_get(cy, "leadF"))) {
        snprintf(e, sizeof e, "THDHT%s", v);
        snprintf(d, sizeof d, "Thread height, %s", v);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (L == 'H' && (st->chg & CH_WCS) && gc_starts_with(st->wcs, "G15")) {
        snprintf(e, sizeof e, "WOFS%s", raw);
        snprintf(d, sizeof d, "Work offset number %s", raw);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (L == 'P' && st->local) {
        snprintf(e, sizeof e, "LBL%s", v);
        snprintf(d, sizeof d, "Jump to the line labeled N%s and run it until M99", v);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    if (L == 'P') {
        const gc_json *x = gc_json_get(a, st->sub ? "sub" : "dwell");
        snprintf(e, sizeof e, "%s%s", js_str(style_get(x, sk)), v);
        if (st->sub) snprintf(d, sizeof d, "Program number %s", v);
        else snprintf(d, sizeof d, "Dwell for %s seconds", v);
        cell_set(cell, e, NULL, d, 0);
        return;
    }
    /* A letter can read differently on one machine type (D is the kerf on a plasma table). */
    const gc_json *ax = gc_json_get(a, c->type);
    if (!gc_json_truthy(gc_json_get(ax, "long"))) ax = a;
    snprintf(e, sizeof e, "%s%s", js_str(style_get(ax, sk)), v);
    if (*d2) snprintf(d, sizeof d, "%s", d2);
    else snprintf(d, sizeof d, "%s %s", js_str(gc_json_get(ax, "desc")), v);
    cell_set(cell, e, NULL, d, imp);
}

/* ---------- The walk ---------- */

static void save_modes(const tstate *st, gc_modes *m)
{
    memset(m, 0, sizeof *m);
    snprintf(m->motion, sizeof m->motion, "%s", st->motion);
    snprintf(m->plane, sizeof m->plane, "%s", st->plane);
    snprintf(m->units, sizeof m->units, "%s", st->inch ? "inch" : "mm");
    snprintf(m->unit_code, sizeof m->unit_code, "%s", st->unit_code);
    snprintf(m->dist_code, sizeof m->dist_code, "%s", st->dist_code);
    snprintf(m->feed_mode, sizeof m->feed_mode, "%s", st->per_rev ? "perRev" : "perMin");
    snprintf(m->feed_code, sizeof m->feed_code, "%s", st->feed_code);
    snprintf(m->spin_mode, sizeof m->spin_mode, "%s", st->css ? "css" : "rpm");
    snprintf(m->spin_code, sizeof m->spin_code, "%s", st->spin_code);
    snprintf(m->comp, sizeof m->comp, "%s", st->comp);
    snprintf(m->tlen, sizeof m->tlen, "%s", st->tlen);
    snprintf(m->wcs, sizeof m->wcs, "%s", st->wcs);
    snprintf(m->spin_dir, sizeof m->spin_dir, "%s", st->spin_dir);
    snprintf(m->cool, sizeof m->cool, "%s", st->cool);
    snprintf(m->torch, sizeof m->torch, "%s", st->torch);
    snprintf(m->cycle, sizeof m->cycle, "%s", st->cycle_code);
    m->F = st->F;
    m->S = st->S;
    m->T = st->T;
    m->H = st->H;
    m->tlen_on = st->tlen_on;
    m->changed = st->chg;
    for (int i = 0; i < 3; i++) {
        m->has_pos[i] = st->has_pos[i];
        m->pos[i] = st->pos[i];
    }
}

static int has_axis_word(const gc_line *l)
{
    for (int i = 0; i < l->ntok; i++) {
        const char *t = l->tok[i];
        if (!t[0] || !strchr("XYZUW", t[0])) continue;
        const char *p = t + 1;
        if (*p == '-' || *p == '+') p++;
        if (gc_is_digit((unsigned char)*p) || *p == '.' || *p == '#' || *p == '[') return 1;
    }
    return 0;
}

static const char *line_kind(const gc_ctx *c, const gc_line *l, const tstate *st)
{
    if (!has_axis_word(l) || (gc_line_has_code(l, "G65") && !gc_json_get(gc_json_get(c->dialect, "codeWords"), "G65"))) return NULL;
    if (gc_line_has_code(l, "G28") || gc_line_has_code(l, "G53")) return "rapid";
    if (st->cycle_code[0]) return "cyc";
    if (!strcmp(st->motion, "G00")) return "rapid";
    if (!strcmp(st->motion, "G01")) return "feed";
    if (!strcmp(st->motion, "G02") || !strcmp(st->motion, "G03")) return "arc";
    return NULL;
}

typedef struct walk {
    gc_ctx *c;
    gc_analysis *a;
    char *seen;
    tstate *saved; /* the state after each line the first time it runs */
} walk;

static void visit(walk *w, int li, tstate *st)
{
    const gc_line *l = &w->c->doc->lines[li];
    apply_modes(w->c, l, st);
    if (w->seen[li]) return;
    w->seen[li] = 1;
    w->saved[li] = *st;
    w->saved[li].lib = NULL;
    w->a->ncells[li] = l->ntok;
    w->a->cells[li] = gc_xcalloc((size_t)(l->ntok ? l->ntok : 1), sizeof(gc_cell));
    int first = (l->ntok && l->tok[0][0] == '/') ? 1 : 0; /* a later N word names a line to jump to */
    for (int i = 0; i < l->ntok; i++) word(w->c, l->tok[i], st, &w->a->cells[li][i], l->tok[i][0] == 'N' && i > first);
    save_modes(st, &w->a->modes[li]);
    const char *k = line_kind(w->c, l, st);
    w->a->kind[li] = k ? gc_strdup(k) : NULL;
}

void gc_translate(gc_ctx *c, gc_analysis *a)
{
    const gc_doc *doc = c->doc;
    int n = doc->nlines;
    walk w = { c, a, gc_xcalloc((size_t)(n ? n : 1), 1), gc_xcalloc((size_t)(n ? n : 1), sizeof(tstate)) };
    tstate st;
    new_state(c, &st);
    /* Modes are tracked in the order the machine runs the lines, so a subprogram is read with the
       modes active at its call. Calls nest up to 8 deep. */
    int stack[8], depth = 0, i = 0;
    long guard = 0, limit = 5000 + 20L * n;
    while (i < n && guard++ < limit) {
        const gc_line *l = &doc->lines[i];
        visit(&w, i, &st);
        if (gc_is_end(l)) break;
        if (gc_is_return(l, c->syntax) && depth) {
            i = stack[--depth];
            continue;
        }
        char tgt[48];
        int to;
        if (gc_call_target(l, c->syntax, tgt, sizeof tgt) && gc_map_get(&c->labels, tgt, &to) && depth < 8) {
            stack[depth++] = i + 1;
            i = to;
            continue;
        }
        i++;
    }
    /* Lines never run (subprograms nothing calls, lines after M30) are read in file order, carrying
       the state of the line above. */
    tstate st2;
    new_state(c, &st2);
    for (int li = 0; li < n; li++) {
        if (w.seen[li] && w.a->cells[li]) {
            st2 = w.saved[li];
        } else {
            visit(&w, li, &st2);
        }
    }
    free(w.seen);
    free(w.saved);
}
