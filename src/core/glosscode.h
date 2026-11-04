/* GlossCode core: the public interface.

   The core reads G-code, tracks the machine's modes line by line in the order the control runs them,
   gives every word its English word, and checks the program for problems. Everything it knows about
   codes and controls comes from the data files (data/gcode-words.json, data/gcode-rules.json, the
   subprogram library and the machine profile), so nothing here is specific to one control.

   Standard C99 only: no platform headers, UTF-8 strings, '/' in paths. The webview shell talks to the
   core through gc_api_call() (gc_api.c), which takes and returns JSON. */
#ifndef GLOSSCODE_H
#define GLOSSCODE_H

#include <stddef.h>

#include "gc_json.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ---------- Data ---------- */

typedef struct gc_data {
    gc_json *words;   /* gcode-words.json */
    gc_json *rules;   /* gcode-rules.json */
    gc_json *library; /* array of subprogram library entries, each with a "source" key */
} gc_data;

/* Loads the dictionary and rules. Returns NULL with a message in err when either can't be read. */
gc_data *gc_data_load(const char *words_json, size_t words_len, const char *rules_json, size_t rules_len,
                      char *err, size_t errsz);
/* Adds one subprogram library file. source is "builtin", "shop" or "personal". Returns 0 on error. */
int gc_data_add_library(gc_data *data, const char *json, size_t len, const char *source, char *err, size_t errsz);
void gc_data_free(gc_data *data);

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
enum { GC_SYN_NONE = 0, GC_SYN_FAGOR8060 = 1, GC_SYN_FAGOR8055 = 2 };
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

/* ---------- Analysis ---------- */

enum {
    GC_CELL_UNKNOWN = 1, /* not in the dictionary or this machine's tables */
    GC_CELL_IMPLIED = 2, /* a distance with no decimal point, read as the least increment */
    GC_CELL_COMMENT = 4
};

typedef struct gc_cell {
    char *g;  /* the word as written */
    char *e;  /* its English word, "" for a comment */
    char *u;  /* unit shown after F and S ("ipm", "rpm"…), or NULL */
    char *d;  /* a sentence describing it */
    unsigned flags;
} gc_cell;

/* The modes after a line, as shown in the active-modes panel. Strings are "" when nothing is set. */
typedef struct gc_modes {
    char motion[16], plane[16], units[8], unit_code[16], dist_code[16], feed_mode[8], feed_code[16];
    char spin_mode[8], spin_code[16], comp[16], tlen[16], wcs[48], spin_dir[16], cool[16], cycle[16];
    char torch[16];   /* the last cut on or cut off code on a plasma machine, "" before one */
    const char *F, *S, *T, *H; /* the words that set them, or NULL */
    int tlen_on;
    unsigned changed; /* GC_MODE_* bits set on this line */
    int has_pos[3];
    double pos[3];    /* X Y Z where the tool is after the line (X as written: a lathe diameter) */
} gc_modes;

typedef struct gc_problem {
    int line;   /* block index */
    char *id;   /* rule id, such as "no-feed-rate" */
    char *sev;  /* "error", "warning" or "info" */
    char *title, *msg, *why;
} gc_problem;

typedef struct gc_analysis {
    int nlines;
    gc_cell **cells;  /* cells[i] has ncells[i] entries, one per word of block i */
    int *ncells;
    gc_modes *modes;  /* one per block */
    char **kind;      /* "rapid", "feed", "arc", "cyc" or NULL: the line's color */
    gc_problem *problems; /* sorted by line, then errors before warnings before info */
    int nproblems;
    char *dialect_label;
    int dialect_verified;
} gc_analysis;

enum { GC_STYLE_LONG = 0, GC_STYLE_SHORT = 1, GC_STYLE_WORDS = 2 };

/* machine is a machine profile object: { "type": "mill"|"lathe", "brand": "haas", "eob": false,
   "macro": true, "liveTooling": false, "yAxis": false, "codes": {…}, "checks": {…} }. "codes" and
   "checks" are optional overrides: English words for codes, and per-rule severities or "off". */
gc_analysis *gc_analyze(const gc_data *data, const gc_json *machine, const gc_doc *doc, int style);
void gc_analysis_free(gc_analysis *a);

/* ---------- JSON interface for the UI ---------- */

/* Runs one request and returns a JSON string the caller frees. Methods and their parameters are
   listed in gc_api.c. Errors come back as {"error": "..."}. */
char *gc_api_call(const gc_data *data, const char *method, const char *params_json, size_t params_len);

#ifdef __cplusplus
}
#endif

#endif
