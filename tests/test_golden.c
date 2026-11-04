/* Checks the core against the mockup. scripts/make-core-goldens.mjs runs the mockup's JavaScript on
   every sample program and records each word's English and every problem; this test runs the C core
   on the same files and machines and expects exactly the same results.
   Usage: test_golden <repo root> */
#include "glosscode.h"
#include "test_util.h"

static gc_data *load_data(const char *root, const gc_json *index)
{
    size_t wl, rl;
    char *wp = join_path(root, "data/gcode-words.json"), *rp = join_path(root, "data/gcode-rules.json");
    char *w = read_file(wp, &wl), *r = read_file(rp, &rl);
    char err[300];
    gc_data *d = (w && r) ? gc_data_load(w, wl, r, rl, err, sizeof err) : NULL;
    if (!d) fprintf(stderr, "can't load data: %s\n", (w && r) ? err : "file missing");
    free(w);
    free(r);
    free(wp);
    free(rp);
    const gc_json *lib = gc_json_get(index, "library");
    for (size_t i = 0; d && i < gc_json_len(lib); i++) {
        char *p = join_path(root, gc_json_get_str(lib->items[i], "file"));
        size_t n;
        char *text = read_file(p, &n);
        CHECK(text && gc_data_add_library(d, text, n, gc_json_get_str(lib->items[i], "source"), err, sizeof err),
              "library file %s", p);
        free(text);
        free(p);
    }
    return d;
}

static void check_run(const gc_data *data, const gc_json *machine, const gc_doc *doc, const gc_json *run, const char *file)
{
    const char *mid = gc_json_get_str(run, "machine"), *style = gc_json_get_str(run, "style");
    gc_analysis *a = gc_analyze(data, machine, doc, !strcmp(style, "short") ? GC_STYLE_SHORT : !strcmp(style, "words") ? GC_STYLE_WORDS : GC_STYLE_LONG);
    const gc_json *words = gc_json_get(run, "words");
    CHECK(a->nlines == (int)gc_json_len(words), "%s %s: %d lines, want %d", file, mid, a->nlines, (int)gc_json_len(words));
    for (int li = 0; li < a->nlines && li < (int)gc_json_len(words); li++) {
        const gc_json *want = words->items[li];
        CHECK(a->ncells[li] == (int)gc_json_len(want), "%s %s line %d: %d words, want %d", file, mid, li, a->ncells[li], (int)gc_json_len(want));
        for (int k = 0; k < a->ncells[li] && k < (int)gc_json_len(want); k++) {
            const gc_cell *c = &a->cells[li][k];
            const gc_json *w = want->items[k];
            CHECK_STR(c->g, gc_json_get_str(w, "g"), "%s %s %s line %d word %d: g", file, mid, style, li, k);
            CHECK_STR(c->e, gc_json_get_str(w, "e"), "%s %s %s line %d %s: English", file, mid, style, li, c->g);
            CHECK_STR(c->u, gc_json_get_str(w, "u"), "%s %s %s line %d %s: unit", file, mid, style, li, c->g);
            CHECK_STR(c->d, gc_json_get_str(w, "d"), "%s %s %s line %d %s: description", file, mid, style, li, c->g);
            CHECK(!!(c->flags & GC_CELL_UNKNOWN) == gc_json_truthy(gc_json_get(w, "unk")), "%s %s line %d %s: unknown flag", file, mid, li, c->g);
            CHECK(!!(c->flags & GC_CELL_IMPLIED) == gc_json_truthy(gc_json_get(w, "imp")), "%s %s line %d %s: implied flag", file, mid, li, c->g);
            CHECK(!!(c->flags & GC_CELL_COMMENT) == gc_json_truthy(gc_json_get(w, "cm")), "%s %s line %d %s: comment flag", file, mid, li, c->g);
        }
    }
    const gc_json *probs = gc_json_get(run, "problems");
    int n = (int)gc_json_len(probs);
    CHECK(a->nproblems == n, "%s %s %s: %d problems, want %d", file, mid, style, a->nproblems, n);
    for (int i = 0; i < a->nproblems || i < n; i++) {
        const gc_problem *p = i < a->nproblems ? &a->problems[i] : NULL;
        const gc_json *w = i < n ? probs->items[i] : NULL;
        char got[600], want[600];
        snprintf(got, sizeof got, "%d %s %s %s", p ? p->line : -1, p ? p->id : "-", p ? p->sev : "-", p ? p->msg : "-");
        snprintf(want, sizeof want, "%d %s %s %s", w ? (int)gc_json_get(w, "li")->num : -1, w ? gc_json_get_str(w, "id") : "-",
                 w ? gc_json_get_str(w, "sev") : "-", w ? gc_json_get_str(w, "msg") : "-");
        CHECK_STR(got, want, "%s %s %s: problem %d", file, mid, style, i);
    }
    gc_analysis_free(a);
}

int main(int argc, char **argv)
{
    const char *root = argc > 1 ? argv[1] : ".";
    char *ip = join_path(root, "tests/golden/index.json");
    size_t n;
    char *it = read_file(ip, &n);
    char err[300];
    gc_json *index = it ? gc_json_parse(it, n, err, sizeof err) : NULL;
    if (!index) {
        fprintf(stderr, "can't read %s\n", ip);
        return 2;
    }
    gc_data *data = load_data(root, index);
    if (!data) return 2;
    const gc_json *machines = gc_json_get(index, "machines");
    const gc_json *goldens = gc_json_get(index, "goldens");
    for (size_t g = 0; g < gc_json_len(goldens); g++) {
        const char *ex = gc_json_get_str(goldens->items[g], "example");
        char *ep = join_path(root, ex), *gp = join_path(root, gc_json_get_str(goldens->items[g], "golden"));
        size_t el, gl;
        char *etext = read_file(ep, &el), *gtext = read_file(gp, &gl);
        gc_json *golden = gtext ? gc_json_parse(gtext, gl, err, sizeof err) : NULL;
        CHECK(etext && golden, "reading %s and %s", ep, gp);
        if (etext && golden) {
            /* Like the app: a file that isn't UTF-8 is read as Latin-1. */
            int latin1 = !gc_is_utf8(etext, el);
            size_t ul = el;
            char *utext = latin1 ? gc_latin1_to_utf8(etext, el, &ul) : NULL;
            gc_doc *doc = gc_doc_parse(utext ? utext : etext, ul);
            /* The parser splits blocks and words like the mockup. */
            const gc_json *lines = gc_json_get(golden, "lines");
            CHECK(doc->nlines == (int)gc_json_len(lines), "%s: %d blocks, want %d", ex, doc->nlines, (int)gc_json_len(lines));
            for (int li = 0; li < doc->nlines && li < (int)gc_json_len(lines); li++) {
                const gc_json *want = lines->items[li];
                CHECK(doc->lines[li].ntok == (int)gc_json_len(want), "%s line %d: %d words", ex, li, doc->lines[li].ntok);
                for (int k = 0; k < doc->lines[li].ntok && k < (int)gc_json_len(want); k++)
                    CHECK_STR(doc->lines[li].tok[k], gc_json_str(want->items[k]), "%s line %d word %d", ex, li, k);
            }
            /* Unchanged documents with one block per line are written back byte for byte. */
            int sourceLines = 0;
            for (size_t i = 0; i < el; i++)
                if (etext[i] == '\n' || (etext[i] == '\r' && (i + 1 == el || etext[i + 1] != '\n'))) sourceLines++;
            if (el && etext[el - 1] != '\n' && etext[el - 1] != '\r') sourceLines++;
            if (doc->nlines == sourceLines) {
                size_t sl;
                char *again = gc_doc_serialize(doc, doc->eob, &sl);
                char *back = latin1 ? gc_utf8_to_latin1(again, sl, &sl) : NULL;
                CHECK(sl == el && !memcmp(back ? back : again, etext, el), "%s: written back unchanged", ex);
                free(again);
                free(back);
            }
            const gc_json *runs = gc_json_get(golden, "runs");
            for (size_t r = 0; r < gc_json_len(runs); r++) {
                const gc_json *m = gc_json_get(machines, gc_json_get_str(runs->items[r], "machine"));
                CHECK(m != NULL, "machine %s", gc_json_get_str(runs->items[r], "machine"));
                if (m) check_run(data, m, doc, runs->items[r], ex);
            }
            gc_doc_free(doc);
            free(utext);
        }
        gc_json_free(golden);
        free(etext);
        free(gtext);
        free(ep);
        free(gp);
    }
    gc_data_free(data);
    gc_json_free(index);
    free(it);
    free(ip);
    return t_summary("test_golden");
}
