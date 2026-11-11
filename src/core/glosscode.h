/* GlossCode core: the public interface.

   The core reads and writes G-code files: it splits them into blocks and words (with each control's
   block syntax), and writes them back keeping every unchanged block byte for byte, with the file's
   line endings, ';' marks and Latin-1 encoding. The gloss, the checks and the simulation are done by
   the UI's own JavaScript (src/ui/index.html).

   Standard C99 only: no platform headers, UTF-8 strings, '/' in paths. The webview shell talks to the
   core through gc_api_call() (gc_api.c), which takes and returns JSON. */
#ifndef GLOSSCODE_H
#define GLOSSCODE_H

#include <stddef.h>

#include "gc_json.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ---------- Documents ---------- */

typedef struct gc_line {
    char **tok;   /* words, upper case; comments kept whole with their parentheses */
    int ntok;
    char *raw;    /* the block's text as read, without its ';' (written back unchanged if the words are) */
} gc_line;

typedef struct gc_doc {
    gc_line *lines; /* one per block: a source line with "A;B" gives two */
    int nlines;
    int eob;        /* the file had ';' end-of-block marks */
    char eol[3];    /* the file's line ending: "\r\n", "\n" or "\r" (CRLF for a new file) */
    int final_eol;  /* the last line ended with a line ending */
    char syntax[16]; /* the control's block syntax ("fagor8060"), "" for the usual one */
} gc_doc;

/* Splits text into blocks and words. Never fails; bytes that aren't words are skipped, as the
   control would skip them (the raw text keeps them). */
gc_doc *gc_doc_parse(const char *text, size_t len);
/* The same for a control with its own block syntax (a dialect's "blockSyntax", such as "fagor8060",
   where ';' starts a comment and $, # and % statements run to the end of the line). NULL or "" is the usual one. */
gc_doc *gc_doc_parse_syntax(const char *text, size_t len, const char *syntax);
void gc_doc_set_syntax(gc_doc *doc, const char *syntax);
/* A block syntax name as a number: GC_SYN_NONE for the usual one or an unknown name. */
enum { GC_SYN_NONE = 0, GC_SYN_FAGOR8060 = 1, GC_SYN_FAGOR8055 = 2, GC_SYN_KLARTEXT = 3 };
int gc_syntax_code(const char *syntax);
/* Adds one block made of the given words (for building documents from the UI or in tests). */
void gc_doc_add_line(gc_doc *doc, const char *const *tok, int ntok, const char *raw);
gc_doc *gc_doc_new(void);
void gc_doc_free(gc_doc *doc);
/* Splits one line into words, like the parser does. Free with gc_tokens_free. */
char **gc_tokenize(const char *line, size_t len, int *ntok);
char **gc_tokenize_syntax(const char *line, size_t len, const char *syntax, int *ntok);
void gc_tokens_free(char **tok, int ntok);
/* Writes the document: each block's words joined by spaces, ';' after each when eob is set, and the
   document's line ending. A block whose raw text still holds the same words is written as raw. */
char *gc_doc_serialize(const gc_doc *doc, int eob, size_t *len);

/* G-code files are often Latin-1 (old controls, DNC software) rather than UTF-8. The UI works in
   UTF-8, so a file that isn't valid UTF-8 is read as Latin-1 and written back the same way. */
int gc_is_utf8(const char *s, size_t len);
char *gc_latin1_to_utf8(const char *s, size_t len, size_t *outlen);
char *gc_utf8_to_latin1(const char *s, size_t len, size_t *outlen);

/* ---------- JSON interface for the UI ---------- */

/* Runs one request and returns a JSON string the caller frees. Methods and their parameters are
   listed in gc_api.c. Errors come back as {"error": "..."}. */
char *gc_api_call(const char *method, const char *params_json, size_t params_len);

#ifdef __cplusplus
}
#endif

#endif
