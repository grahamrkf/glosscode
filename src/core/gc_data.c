/* Loading the data files and putting together the tables for one machine: the dialect chain from
   gcode-rules.json (dialectFor() in the mockup), dictionary lookups with machine overrides (entry()),
   the canned-cycle guide's words (cycleHelp()), and library lookups for G65 calls (libFor()). */
#include "gc_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

gc_data *gc_data_load(const char *words_json, size_t words_len, const char *rules_json, size_t rules_len,
                      char *err, size_t errsz)
{
    char e[200];
    gc_json *w = gc_json_parse(words_json, words_len, e, sizeof e);
    if (!w || !gc_json_is_obj(gc_json_get(w, "codes"))) {
        if (err) snprintf(err, errsz, "gcode-words.json: %s", w ? "no \"codes\" table" : e);
        gc_json_free(w);
        return NULL;
    }
    gc_json *r = gc_json_parse(rules_json, rules_len, e, sizeof e);
    if (!r || !gc_json_is_obj(gc_json_get(r, "rules")) || !gc_json_is_obj(gc_json_get(r, "dialects"))) {
        if (err) snprintf(err, errsz, "gcode-rules.json: %s", r ? "no \"rules\" or \"dialects\" table" : e);
        gc_json_free(w);
        gc_json_free(r);
        return NULL;
    }
    gc_data *d = gc_xcalloc(1, sizeof *d);
    d->words = w;
    d->rules = r;
    d->library = gc_json_new(GC_JARR);
    return d;
}

int gc_data_add_library(gc_data *data, const char *json, size_t len, const char *source, char *err, size_t errsz)
{
    char e[200];
    gc_json *v = gc_json_parse(json, len, e, sizeof e);
    if (!v || !gc_json_is_obj(v) || !gc_json_get(v, "program") || !gc_json_is_arr(gc_json_get(v, "args"))) {
        if (err) snprintf(err, errsz, "%s", v ? "not a subprogram library file (needs \"program\" and \"args\")" : e);
        gc_json_free(v);
        return 0;
    }
    gc_json_set(v, "source", gc_json_new_str(source ? source : "builtin"));
    gc_json_push(data->library, v);
    return 1;
}

void gc_data_free(gc_data *data)
{
    if (!data) return;
    gc_json_free(data->words);
    gc_json_free(data->rules);
    gc_json_free(data->library);
    free(data);
}

/* ---------- Codes ---------- */

void gc_pad2(const char *t, char *out, size_t outsz)
{
    size_t rest = strlen(t + 1);
    if (rest < 2) snprintf(out, outsz, "%c0%s", t[0], t + 1);
    else snprintf(out, outsz, "%s", t);
}

int gc_is_code(const char *t, const char *c)
{
    if (!(t[0] == 'G' || t[0] == 'M') || !gc_is_digit((unsigned char)t[1])) return 0;
    char k[64];
    gc_pad2(t, k, sizeof k);
    return strcmp(k, c) == 0;
}

int gc_own_word(const gc_ctx *c, const gc_line *l, char L)
{
    for (int i = 0; i < l->ntok; i++) {
        const char *t = l->tok[i];
        if (t[0] != 'G' || !gc_is_digit((unsigned char)t[1])) continue;
        char k[64];
        gc_pad2(t, k, sizeof k);
        const gc_json *o = gc_json_get(gc_json_get(c->cycles, k), "ownWords");
        if (!o) continue;
        char Ls[2] = { L, '\0' };
        return gc_json_has_str(o, Ls);
    }
    return 0;
}

int gc_line_has_code(const gc_line *l, const char *c)
{
    for (int i = 0; i < l->ntok; i++)
        if (gc_is_code(l->tok[i], c)) return 1;
    return 0;
}

int gc_line_has_tok(const gc_line *l, const char *t)
{
    for (int i = 0; i < l->ntok; i++)
        if (strcmp(l->tok[i], t) == 0) return 1;
    return 0;
}

int gc_is_end(const gc_line *l, int syntax)
{
    if (gc_line_has_code(l, "M30") || gc_line_has_code(l, "M02")) return 1;
    for (int i = 0; syntax == GC_SYN_KLARTEXT && i < l->ntok; i++)
        if (gc_starts_with(l->tok[i], "END PGM")) return 1;
    return 0;
}

int gc_is_return(const gc_line *l, int syntax)
{
    if (syntax == GC_SYN_KLARTEXT) return gc_line_has_tok(l, "LBL 0"); /* M99 calls a cycle there */
    if (gc_line_has_code(l, "M99") || gc_line_has_tok(l, "RTS")) return 1;
    if (syntax == GC_SYN_FAGOR8060) return gc_line_has_code(l, "M17") || gc_line_has_code(l, "M29") || gc_line_has_tok(l, "#RET");
    return syntax == GC_SYN_FAGOR8055 && gc_line_has_tok(l, "(RET)");
}

/* Fagor 8055: "(SUB 12)" (with label 1) or "(CALL 12" / "(PCALL 12" (label 0): the number's digits, or NULL.
   *nd gets how many. */
static const char *f55_num(const char *t, int label, size_t *nd)
{
    const char *p = NULL;
    if (label && gc_starts_with(t, "(SUB")) p = t + 4;
    else if (!label && gc_starts_with(t, "(CALL")) p = t + 5;
    else if (!label && gc_starts_with(t, "(PCALL")) p = t + 6;
    if (!p) return NULL;
    if (*p == ' ') p++;
    size_t k = 0;
    while (gc_is_digit((unsigned char)p[k])) k++;
    if (!k) return NULL;
    if (label ? strcmp(p + k, ")") != 0 : p[k] == '.') return NULL;
    *nd = k;
    return p;
}

static void sub_key(const char *digits, size_t nd, char *out, size_t outsz)
{
    char d[32], num[32];
    snprintf(d, sizeof d, "%.*s", (int)(nd < 31 ? nd : 31), digits);
    gc_js_num(gc_js_parse_int(d), num, sizeof num);
    snprintf(out, outsz, "SUB %s", num);
}

/* /^X\d+$/ on a token with letter X. */
static int letter_digits(const char *t, char L)
{
    return t[0] == L && gc_all_digits(t + 1);
}

/* N10 or N10: (a Fagor label): the key "N10" */
static int n_label(const char *t, char *key, size_t keysz)
{
    if (t[0] != 'N' || !gc_is_digit((unsigned char)t[1])) return 0;
    size_t k = 1;
    while (gc_is_digit((unsigned char)t[k])) k++;
    if (t[k] && !(t[k] == ':' && !t[k + 1])) return 0;
    char num[32];
    gc_js_num(gc_js_parse_int(t + 1), num, sizeof num);
    snprintf(key, keysz, "N%s", num);
    return 1;
}

int gc_label_key(const char *t, char *key, size_t keysz)
{
    if (!n_label(t, key, keysz)) snprintf(key, keysz, "%s", t);
    return 1;
}

/* Klartext: "CALL LBL 5" or 'CALL LBL "NAME" …' at t: the label's length (from t + 9), or 0 */
static size_t kl_call_lbl(const char *t)
{
    if (!gc_starts_with(t, "CALL LBL ")) return 0;
    const char *p = t + 9;
    size_t k = 0;
    if (*p == '"') {
        k = 1;
        while (p[k] && p[k] != '"') k++;
        return p[k] == '"' ? k + 1 : 0;
    }
    while (gc_is_digit((unsigned char)p[k])) k++;
    return k;
}

int gc_kl_key(const gc_ctx *c, const char *t, char *key, size_t keysz)
{
    if (c->syntax != GC_SYN_KLARTEXT || !(t[0] >= 'A' && t[0] <= 'Z')) return 0;
    if (gc_starts_with(t, "FN ") && gc_is_digit((unsigned char)t[3])) {
        size_t k = 3;
        while (gc_is_digit((unsigned char)t[k])) k++;
        if (t[k] == ':') {
            char d[32], num[32];
            snprintf(d, sizeof d, "%.*s", (int)(k - 3 < 31 ? k - 3 : 31), t + 3);
            gc_js_num(gc_js_parse_int(d), num, sizeof num);
            snprintf(key, keysz, "FN %s", num);
            return 1;
        }
    }
    if (!strcmp(t, "LBL 0")) {
        snprintf(key, keysz, "%s", t);
        return 1;
    }
    const gc_json *K = gc_json_get(gc_json_get(c->data->words, "machineOverrides"), "heidenhain");
    size_t sp[3], ns = 0;
    for (size_t q = 0; t[q] && ns < 3; q++)
        if (t[q] == ' ') sp[ns++] = q;
    for (int k = (int)(ns + 1 < 3 ? ns + 1 : 3); k > 0; k--) {
        size_t n = (size_t)k <= ns ? sp[k - 1] : strlen(t);
        char cand[64];
        if (n >= sizeof cand) continue;
        memcpy(cand, t, n);
        cand[n] = '\0';
        if (gc_json_truthy(gc_json_get(K, cand)) && !(cand[0] == 'M' && gc_is_digit((unsigned char)cand[1]))) {
            snprintf(key, keysz, "%s", cand);
            return 1;
        }
    }
    return 0;
}

int gc_kl_head(const gc_ctx *c, const gc_line *l, char *key, size_t keysz)
{
    for (int i = 0; i < l->ntok; i++)
        if (!gc_is_comment(l->tok[i], c->syntax) && gc_kl_key(c, l->tok[i], key, keysz)) return 1;
    return 0;
}

int gc_kl_move(const char *k)
{
    static const char *const M[] = { "L", "LP", "C", "CR", "CT", "CP", "CTP", "FL", "FLT", "FC", "FCT" };
    for (size_t i = 0; i < sizeof M / sizeof *M; i++)
        if (!strcmp(k, M[i])) return 1;
    return (gc_starts_with(k, "APPR ") || gc_starts_with(k, "DEP ")) && k[strlen(k) - 1] != ' ';
}

int gc_kl_arc(const char *k)
{
    static const char *const A[] = { "C", "CR", "CT", "CP", "CTP", "FC", "FCT" };
    for (size_t i = 0; i < sizeof A / sizeof *A; i++)
        if (!strcmp(k, A[i])) return 1;
    return 0;
}

void gc_kl_label(const char *x, size_t n, char *out, size_t outsz)
{
    char d[48];
    snprintf(d, sizeof d, "%.*s", (int)(n < 47 ? n : 47), x);
    if (d[0] && gc_all_digits(d)) {
        char num[32];
        gc_js_num(gc_js_parse_int(d), num, sizeof num);
        snprintf(out, outsz, "LBL %s", num);
    } else
        snprintf(out, outsz, "LBL %s", d);
}

int gc_call_target(const gc_line *l, int syntax, char *out, size_t outsz)
{
    if (syntax == GC_SYN_KLARTEXT) { /* CALL LBL 5 runs the subprogram at LBL 5; with REP it repeats a section instead */
        for (int i = 0; i < l->ntok; i++) {
            size_t k = kl_call_lbl(l->tok[i]);
            if (!k) continue;
            const char *rest = l->tok[i] + 9 + k;
            for (const char *r = strstr(rest, "REP"); r; r = strstr(r + 1, "REP"))
                if (r == rest || !(gc_is_alpha((unsigned char)r[-1]) || gc_is_digit((unsigned char)r[-1]) || r[-1] == '_')) return 0;
            gc_kl_label(l->tok[i] + 9, k, out, outsz);
            return 1;
        }
        return 0;
    }
    /* Fagor: LL NAME, #CALL NAME or #PCALL NAME … calls the local subroutine "%L NAME" */
    for (int i = 0; i < l->ntok; i++) {
        const char *t = l->tok[i], *p = NULL;
        if (gc_starts_with(t, "LL ")) p = t + 3;
        else if (gc_starts_with(t, "#CALL ")) p = t + 6;
        else if (gc_starts_with(t, "#PCALL ")) p = t + 7;
        if (!p || !*p || *p == ' ' || *p == ',') continue;
        size_t n = strcspn(p, " ,");
        snprintf(out, outsz, "%%L %.*s", (int)n, p);
        return 1;
    }
    /* Fagor 8055: (CALL 12) or (PCALL 12, …) calls the "(SUB 12)" in the same file */
    for (int i = 0; syntax == GC_SYN_FAGOR8055 && i < l->ntok; i++) {
        size_t nd;
        const char *d = f55_num(l->tok[i], 0, &nd);
        if (d) {
            sub_key(d, nd, out, outsz);
            return 1;
        }
    }
    for (int i = 0; i < l->ntok; i++) {
        if (strcmp(l->tok[i], "CALL") != 0) continue;
        for (int j = i + 1; j < l->ntok; j++)
            if (letter_digits(l->tok[j], 'O')) {
                char n[32];
                gc_js_num(gc_js_parse_int(l->tok[j] + 1), n, sizeof n);
                snprintf(out, outsz, "O%s", n);
                return 1;
            }
        return 0;
    }
    if (!gc_line_has_code(l, "M97")) return 0;
    for (int i = 0; i < l->ntok; i++)
        if (l->tok[i][0] == 'P' && gc_is_digit((unsigned char)l->tok[i][1])) {
            char n[32];
            gc_js_num(gc_js_parse_int(l->tok[i] + 1), n, sizeof n);
            snprintf(out, outsz, "N%s", n);
            return 1;
        }
    return 0;
}

/* ---------- The dialect for one machine ---------- */

static void merge_layer(gc_json *out, const gc_json *layer)
{
    for (size_t i = 0; layer && i < layer->n; i++) {
        const char *k = layer->keys[i];
        const gc_json *v = layer->items[i];
        gc_json *cur = gc_json_get(out, k);
        if (gc_json_is_obj(v) && gc_json_is_obj(cur)) {
            /* One level deep: a key set to null removes the inherited one. */
            for (size_t j = 0; j < v->n; j++) {
                if (v->items[j]->type == GC_JNULL) gc_json_del(cur, v->keys[j]);
                else gc_json_set(cur, v->keys[j], gc_json_clone(v->items[j]));
            }
        } else {
            gc_json_set(out, k, gc_json_clone(v));
        }
    }
}

/* Dialect names from the base up to brand, following "inherits". Returns how many (at most max). */
static int dialect_chain(const gc_json *dialects, const char *brand, const char **chain, int max)
{
    int n = 0;
    const char *b = brand;
    while (b && gc_json_get(dialects, b) && n < max) {
        int seen = 0;
        for (int i = 0; i < n; i++)
            if (strcmp(chain[i], b) == 0) seen = 1;
        if (seen) break;
        memmove(chain + 1, chain, (size_t)n * sizeof *chain);
        chain[0] = b;
        n++;
        b = gc_json_get_str(gc_json_get(dialects, b), "inherits");
    }
    return n;
}

void gc_ctx_init(gc_ctx *c, const gc_data *data, const gc_json *machine, const gc_doc *doc, int style)
{
    memset(c, 0, sizeof *c);
    c->data = data;
    c->machine = machine;
    c->doc = doc;
    c->style = style;
    c->brand = gc_json_get_str(machine, "brand");
    if (!c->brand) c->brand = "fanuc";
    /* The machine type: mill, lathe, or one of the extra types in rules.machineTypes (plasma). A type
       with a "base" starts from the base type's tables and words (baseType() in the mockup). */
    const gc_json *types = gc_json_get(data->rules, "machineTypes");
    c->type = gc_json_get_str(machine, "type");
    if (!c->type || (strcmp(c->type, "lathe") != 0 && !gc_json_is_obj(gc_json_get(types, c->type)))) c->type = "mill";
    c->base_type = gc_json_get_str(gc_json_get(types, c->type), "base");
    c->lathe = strcmp(c->type, "lathe") == 0;
    /* Okuma's own language on any Okuma control (okuma, okumau10l, okuma7000l, okumae100l): the word chain reaches "okuma"
       (isOkuma() in the mockup) */
    c->okuma = 0;
    {
        const gc_json *ds = gc_json_get(data->rules, "dialects");
        const char *b = c->brand;
        for (int depth = 0; b && depth < 16; depth++) {
            if (strcmp(b, "okuma") == 0) c->okuma = 1;
            const gc_json *d = gc_json_get(ds, b);
            if (!d || gc_json_get(d, "inheritWords") == NULL || gc_json_get(d, "inheritWords")->type != GC_JTRUE) break;
            b = gc_json_get_str(d, "inherits");
        }
    }

    const gc_json *dialects = gc_json_get(data->rules, "dialects");
    const char *chain[16];
    int n = dialect_chain(dialects, c->brand, chain, 16);
    gc_json *out = gc_json_new(GC_JOBJ);
    int verified = n > 0;
    const char *layers[2] = { c->base_type, c->type };
    for (int t = 0; t < 2; t++) {
        if (!layers[t]) continue;
        for (int i = 0; i < n; i++) {
            const gc_json *d = gc_json_get(dialects, chain[i]);
            merge_layer(out, gc_json_get(d, layers[t]));
            const gc_json *kw = gc_json_get(d, "keywords");
            if (kw) gc_json_set(out, "keywords", gc_json_clone(kw));
        }
    }
    for (int i = 0; i < n; i++) {
        const gc_json *ver = gc_json_get(gc_json_get(dialects, chain[i]), "verified");
        if (ver && ver->type == GC_JFALSE) verified = 0;
    }
    gc_json *groups = gc_json_get(out, "modalGroups");
    gc_json *tl = gc_json_get(out, "toolLength");
    if (gc_json_is_obj(tl)) {
        /* The code that turns length offsets off: the group's code that isn't an "on" code. */
        const gc_json *on = gc_json_get(tl, "on");
        const gc_json *list = gc_json_get(groups, "tool length");
        const char *off = "G49";
        for (size_t i = 0; i < gc_json_len(list); i++) {
            const char *code = gc_json_str(list->items[i]);
            if (code && !gc_json_has_str(on, code)) {
                off = code;
                break;
            }
        }
        gc_json_set(tl, "off", gc_json_new_str(off));
    }
    gc_json_set(out, "verified", gc_json_new(verified ? GC_JTRUE : GC_JFALSE));
    const char *label = gc_json_get_str(gc_json_get(dialects, c->brand), "label");
    gc_json_set(out, "label", gc_json_new_str(label ? label : c->brand));

    /* Cycles that need an option this machine doesn't have (live tooling, a Y axis) are left out. */
    gc_json *cycles = gc_json_get(out, "cycles");
    for (size_t i = 0; cycles && i < cycles->n;) {
        const gc_json *needs = gc_json_get(cycles->items[i], "needs");
        int ok = 1;
        for (size_t j = 0; j < gc_json_len(needs); j++) {
            const char *opt = gc_json_str(needs->items[j]);
            if (opt && !gc_json_truthy(gc_json_get(machine, opt))) ok = 0;
        }
        if (!ok) {
            char *k = gc_strdup(cycles->keys[i]);
            gc_json_del(cycles, k);
            free(k);
        } else {
            i++;
        }
    }

    /* A machine profile can add English words of its own ("codes") and change rule severities
       ("checks"); see docs/machine-definitions.md. mConflicts adds to the control's. */
    const gc_json *mconf = gc_json_get(machine, "mConflicts");
    if (gc_json_is_arr(mconf)) {
        gc_json *list = gc_json_get(out, "mConflicts");
        if (!gc_json_is_arr(list)) {
            gc_json_set(out, "mConflicts", gc_json_new(GC_JARR));
            list = gc_json_get(out, "mConflicts");
        }
        for (size_t i = 0; i < mconf->n; i++) gc_json_push(list, gc_json_clone(mconf->items[i]));
    }

    c->dialect = out;
    c->groups = gc_json_get(out, "modalGroups");
    c->cycles = gc_json_get(out, "cycles");
    c->process = gc_json_get(out, "process");
    if (!gc_json_is_obj(c->process)) c->process = NULL;
    const gc_json *feedmode = gc_json_get(c->groups, "feed mode");
    /* A plasma control with no feed mode codes has none (Hypertherm's G98 ends a loop). */
    int none = c->process && gc_json_len(feedmode) == 0;
    strcpy(c->feed_per_min, gc_json_has_str(feedmode, "G94") ? "G94" : none ? "" : "G98");
    strcpy(c->feed_per_rev, gc_json_has_str(feedmode, "G95") ? "G95" : none ? "" : "G99");
    const char *off = gc_json_get_str(gc_json_get(out, "toolLength"), "off");
    snprintf(c->tlen_off, sizeof c->tlen_off, "%s", off ? off : "G49");

    /* cycleHelp layers: the machine type's, then each control's in the chain ("haas.mill"). */
    const gc_json *ch = gc_json_get(data->rules, "cycleHelp");
    c->cycle_help_layers = gc_json_new(GC_JARR);
    const gc_json *base = gc_json_get(ch, c->type);
    if (base) gc_json_push(c->cycle_help_layers, gc_json_clone(base));
    for (int i = 0; i < n; i++) {
        char key[64];
        snprintf(key, sizeof key, "%s.%s", chain[i], c->type);
        const gc_json *ly = gc_json_get(ch, key);
        if (ly) gc_json_push(c->cycle_help_layers, gc_json_clone(ly));
    }

    {
        const char *bs = gc_json_get_str(c->dialect, "blockSyntax");
        c->syntax = gc_syntax_code(bs);
    }
    gc_map_init(&c->labels);
    for (int i = 0; doc && i < doc->nlines; i++) {
        const gc_line *l = &doc->lines[i];
        if (!l->ntok) continue;
        char key[48], num[32];
        if (n_label(l->tok[0], key, sizeof key)) gc_map_add_first(&c->labels, key, i);
        if (l->tok[0][0] == 'N' && l->tok[0][1] >= 'A' && l->tok[0][1] <= 'Z') gc_map_add_first(&c->labels, l->tok[0], i);
        if (letter_digits(l->tok[0], 'O')) {
            gc_js_num(gc_js_parse_int(l->tok[0] + 1), num, sizeof num);
            snprintf(key, sizeof key, "O%s", num);
            gc_map_add_first(&c->labels, key, i);
        }
        /* Fagor: an [NAME] label anywhere on the line, and a "%L NAME" local subroutine header */
        for (int k = 0; k < l->ntok; k++) {
            const char *t = l->tok[k];
            size_t len_t = strlen(t);
            if (t[0] != '[' || len_t < 3 || t[len_t - 1] != ']') continue;
            int ok = 1;
            for (size_t q = 1; q + 1 < len_t; q++)
                if (!gc_is_alpha((unsigned char)t[q]) && !gc_is_digit((unsigned char)t[q]) && t[q] != '_') ok = 0;
            if (ok) {
                gc_map_add_first(&c->labels, t, i);
                break;
            }
        }
        if (gc_starts_with(l->tok[0], "%L ")) gc_map_add_first(&c->labels, l->tok[0], i);
        if (c->syntax == GC_SYN_KLARTEXT) { /* the block number, and LBL 5 or LBL "NAME" (not LBL 0) */
            if (gc_all_digits(l->tok[0]) && l->tok[0][0]) {
                gc_js_num(gc_js_parse_int(l->tok[0]), num, sizeof num);
                snprintf(key, sizeof key, "N%s", num);
                gc_map_add_first(&c->labels, key, i);
            }
            for (int k = 0; k < l->ntok; k++)
                if (gc_starts_with(l->tok[k], "LBL ") && strcmp(l->tok[k], "LBL 0") != 0) {
                    gc_kl_label(l->tok[k] + 4, strlen(l->tok[k] + 4), key, sizeof key);
                    gc_map_add_first(&c->labels, key, i);
                    break;
                }
        }
        for (int k = 0; c->syntax == GC_SYN_FAGOR8055 && k < l->ntok; k++) { /* Fagor 8055: (SUB 12) */
            size_t nd;
            const char *d = f55_num(l->tok[k], 1, &nd);
            if (d) {
                sub_key(d, nd, key, sizeof key);
                gc_map_add_first(&c->labels, key, i);
                break;
            }
        }
    }
}

void gc_ctx_free(gc_ctx *c)
{
    gc_json_free(c->dialect);
    gc_json_free(c->cycle_help_layers);
    gc_map_free(&c->labels);
}

const gc_json *gc_entry(const gc_ctx *c, const char *key)
{
    const gc_json *codes = gc_json_get(c->machine, "codes");
    const gc_json *mine = gc_json_get(codes, key);
    if (gc_json_truthy(mine)) return mine;
    /* Overrides: this dialect's "<brand>.<type>" then "<brand>". A dialect with
       "inheritWords": true then falls back to the words of the dialect it inherits. */
    const gc_json *ovs = gc_json_get(c->data->words, "machineOverrides");
    const gc_json *dialects = gc_json_get(c->data->rules, "dialects");
    const char *b = c->brand;
    for (int depth = 0; b && depth < 16; depth++) {
        char bt[64];
        snprintf(bt, sizeof bt, "%s.%s", b, c->type);
        const gc_json *ov = gc_json_get(gc_json_get(ovs, bt), key);
        if (!gc_json_truthy(ov) && c->base_type) {
            snprintf(bt, sizeof bt, "%s.%s", b, c->base_type);
            ov = gc_json_get(gc_json_get(ovs, bt), key);
        }
        if (!gc_json_truthy(ov)) ov = gc_json_get(gc_json_get(ovs, b), key);
        if (gc_json_truthy(ov)) return ov;
        const gc_json *d = gc_json_get(dialects, b);
        if (!d || gc_json_get(d, "inheritWords") == NULL || gc_json_get(d, "inheritWords")->type != GC_JTRUE) break;
        b = gc_json_get_str(d, "inherits");
    }
    const gc_json *e = gc_json_get(gc_json_get(c->data->words, "codes"), key);
    if (!e) return NULL;
    if (gc_json_truthy(gc_json_get(e, "long"))) return e;
    const gc_json *t = gc_json_get(e, c->type);
    if ((!t || t->type == GC_JNULL) && c->base_type) t = gc_json_get(e, c->base_type);
    return (t && t->type != GC_JNULL) ? t : NULL;
}

const gc_json *gc_cycle_word(const gc_ctx *c, const char *code, char letter)
{
    if (!gc_json_get(c->cycles, code)) return NULL;
    char L[2] = { letter, '\0' };
    /* Later layers win; a cycle's own words win over the "common" ones. */
    const gc_json *hit = NULL;
    const gc_json *layers = c->cycle_help_layers;
    for (size_t i = 0; i < gc_json_len(layers); i++) {
        const gc_json *w = gc_json_get(gc_json_get(gc_json_get(layers->items[i], "common"), "words"), L);
        if (w) hit = w;
    }
    for (size_t i = 0; i < gc_json_len(layers); i++) {
        const gc_json *w = gc_json_get(gc_json_get(gc_json_get(layers->items[i], code), "words"), L);
        if (w) hit = w;
    }
    return hit;
}

/* Library fit: "yes" when the entry lists this control (or one it extends) and machine type.
   Mirrors fits() and EXTENDS in the mockup: Haas runs Fanuc-style library programs. */
static int lib_fits(const gc_ctx *c, const gc_json *e)
{
    const gc_json *ms = gc_json_get(e, "machines");
    char a[64], b[64];
    snprintf(a, sizeof a, "%s.%s", c->brand, c->type);
    snprintf(b, sizeof b, "fanuc.%s", c->type);
    /* EXTENDS: Haas and Generic run Fanuc-style programs; the older Okuma lathe controls run Okuma ones */
    int old_okuma = !strcmp(c->brand, "okumau10l") || !strcmp(c->brand, "okuma7000l") || !strcmp(c->brand, "okumae100l");
    if (old_okuma) snprintf(b, sizeof b, "okuma.%s", c->type);
    int ext = !strcmp(c->brand, "haas") || !strcmp(c->brand, "generic") || old_okuma;
    for (size_t i = 0; i < gc_json_len(ms); i++) {
        const char *id = gc_json_str(ms->items[i]);
        if (id && (strcmp(id, a) == 0 || (ext && strcmp(id, b) == 0))) return 1;
    }
    return 0;
}

const gc_json *gc_lib_for(const gc_ctx *c, const gc_line *l)
{
    if (!gc_line_has_code(l, "G65")) return NULL;
    double prog = gc_nan();
    for (int i = 0; i < l->ntok; i++)
        if (letter_digits(l->tok[i], 'P')) {
            prog = gc_js_parse_int(l->tok[i] + 1);
            break;
        }
    if (gc_isnan(prog)) return NULL;
    const gc_json *first = NULL;
    const gc_json *lib = c->data->library;
    for (size_t i = 0; i < gc_json_len(lib); i++) {
        const gc_json *p = gc_json_get(lib->items[i], "program");
        if (!p || p->type != GC_JNUM || p->num != prog) continue;
        if (lib_fits(c, lib->items[i])) return lib->items[i];
        if (!first) first = lib->items[i];
    }
    return first;
}

void gc_fmt_num(const gc_ctx *c, char L, const char *raw, int inch, gc_num *out)
{
    memset(out, 0, sizeof *out);
    if (!raw || !*raw) return;
    {   /* a macro variable or expression: worked out when the line runs */
        const char *p = (raw[0] == '-' || raw[0] == '+') ? raw + 1 : raw;
        if (*p == '#' || *p == '[' || raw[0] == '=' || (p != raw && gc_is_alpha((unsigned char)*p)) ||
            (raw[0] == 'P' && gc_is_digit((unsigned char)raw[1]))) { /* Fagor: XP1, a parameter */
            snprintf(out->v, sizeof out->v, "%s", raw);
            return;
        }
    }
    const char *sign = raw[0] == '-' ? "-" : "";
    const char *body = (raw[0] == '-' || raw[0] == '+') ? raw + 1 : raw;
    if (strchr(body, '.')) {
        snprintf(out->v, sizeof out->v, "%s%s%s%s", sign, body[0] == '.' ? "0" : "", body,
                 gc_ends_with(body, ".") ? "0" : "");
        return;
    }
    const gc_json *nums = gc_json_get(c->dialect, "numbers");
    const char *nd = gc_json_get_str(nums, "noDecimal");
    char Ls[2] = { L, '\0' };
    if (nd && strcmp(nd, "leastIncrement") == 0 && gc_json_has_str(gc_json_get(nums, "words"), Ls) && gc_all_digits(body)) {
        double n = gc_js_parse_int(body);
        if (n == 0) {
            strcpy(out->v, "0.0");
            return;
        }
        const gc_json *inc = gc_json_get(gc_json_get(nums, "increment"), inch ? "inch" : "mm");
        double step = inc && inc->type == GC_JNUM ? inc->num : gc_nan();
        char f[48];
        gc_js_fixed(n * step, inch ? 4 : 3, f, sizeof f);
        snprintf(out->v, sizeof out->v, "%s%s", sign, f);
        out->implied = 1;
        snprintf(out->intended, sizeof out->intended, "%s%s.", sign, body);
        return;
    }
    if (L == 'F') snprintf(out->v, sizeof out->v, "%s%s.0", sign, body);
    else snprintf(out->v, sizeof out->v, "%s%s", sign, body);
}
