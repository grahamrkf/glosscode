/* Checks that the core splits every test program into the same words as the UI.

   A program is split into words twice: by the core when a file is opened or saved (gc_doc.c), which keeps
   each block's raw text so unchanged lines are written back exactly as read, and by the UI's JavaScript for
   everything on screen (splitBlocks and tokenize in src/ui/js/reading.js). If the two drift apart, lines the
   user never touched are rewritten on save. tests/golden/<file>.json holds the UI's words ("lines") and the
   block syntax it used ("syntax"), written by scripts/make-goldens.mjs; this reads the same program with the
   core and compares them block by block.

   Usage: test_tokens <repo folder> <golden file>... */
#include "glosscode.h"
#include "gc_json.h"
#include "gc_util.h"
#include "test_util.h"

static char *read_all(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    gc_buf b;
    gc_buf_init(&b);
    char chunk[8192];
    size_t n;
    while ((n = fread(chunk, 1, sizeof chunk, f)) > 0) gc_buf_putn(&b, chunk, n);
    fclose(f);
    *len = b.len;
    return gc_buf_take(&b);
}

static void check_file(const char *repo, const char *golden_path)
{
    size_t glen, slen = 0;
    char err[200], path[1024];
    char *gtext = read_all(golden_path, &glen);
    CHECK(gtext != NULL, "can't read %s", golden_path);
    if (!gtext) return;
    gc_json *g = gc_json_parse(gtext, glen, err, sizeof err);
    free(gtext);
    CHECK(g != NULL, "%s: %s", golden_path, err);
    if (!g) return;
    const char *name = gc_json_get_str(g, "file"), *syntax = gc_json_get_str(g, "syntax");
    const gc_json *want = gc_json_get(g, "lines");
    char *src = NULL;
    const char *dirs[] = { "examples", "tests/cases" };
    for (size_t i = 0; name && !src && i < sizeof dirs / sizeof *dirs; i++) {
        snprintf(path, sizeof path, "%s/%s/%s", repo, dirs[i], name);
        src = read_all(path, &slen);
    }
    CHECK(src != NULL, "%s: can't find %s in examples/ or tests/cases/", golden_path, name ? name : "(no file)");
    if (!src || !gc_json_is_arr(want)) { free(src); gc_json_free(g); return; }
    /* make-goldens.mjs reads every program as Latin-1, so the same bytes are read that way here */
    size_t ulen;
    char *text = gc_latin1_to_utf8(src, slen, &ulen);
    free(src);
    gc_doc *doc = gc_doc_parse_syntax(text, ulen, syntax);
    free(text);
    CHECK(doc->nlines == (int)want->n, "%s: the core reads %d blocks, the UI %d", name, doc->nlines, (int)want->n);
    int shown = 0;
    for (int i = 0; i < doc->nlines && i < (int)want->n && shown < 5; i++) {
        gc_buf a, b;
        gc_buf_init(&a);
        gc_buf_init(&b);
        for (int k = 0; k < doc->lines[i].ntok; k++) {
            if (k) gc_buf_puts(&a, " | ");
            gc_buf_puts(&a, doc->lines[i].tok[k]);
        }
        const gc_json *w = want->items[i];
        for (size_t k = 0; k < gc_json_len(w); k++) {
            if (k) gc_buf_puts(&b, " | ");
            gc_buf_puts(&b, gc_json_str(w->items[k]) ? gc_json_str(w->items[k]) : "?");
        }
        if (strcmp(gc_buf_str(&a), gc_buf_str(&b))) shown++;
        CHECK_STR(gc_buf_str(&a), gc_buf_str(&b), "%s block %d: core words (got) vs UI words (want)", name, i + 1);
        gc_buf_free(&a);
        gc_buf_free(&b);
    }
    gc_doc_free(doc);
    gc_json_free(g);
}

int main(int argc, char **argv)
{
    if (argc < 3) {
        fprintf(stderr, "usage: test_tokens <repo folder> <golden file>...\n");
        return 2;
    }
    for (int i = 2; i < argc; i++) check_file(argv[1], argv[i]);
    return t_summary("test_tokens");
}
