/* Shared between the core's own files; not part of the public interface. */
#ifndef GC_INTERNAL_H
#define GC_INTERNAL_H

#include "glosscode.h"
#include "gc_util.h"

/* Everything one analysis needs about the machine: the merged dialect tables and the dictionary. */
typedef struct gc_ctx {
    const gc_data *data;
    const gc_json *machine;
    const char *brand;
    const char *type;  /* "mill", "lathe" or "plasma" */
    const char *base_type; /* the type whose tables and words it starts from ("mill" for plasma), or NULL */
    int lathe;
    int okuma;
    int fagor;         /* the dialect's blockSyntax is "fagor8060" (SYNTAX in the mockup) */
    int style;         /* GC_STYLE_LONG, GC_STYLE_SHORT or GC_STYLE_WORDS */
    gc_json *dialect;  /* owned: the per-type tables merged along the inherits chain */
    gc_json *cycle_help_layers; /* owned array of borrowed pointers' clones: cycleHelp layers, base first */
    const gc_json *groups;      /* dialect.modalGroups */
    const gc_json *cycles;      /* dialect.cycles */
    const gc_json *process;     /* dialect.process (a plasma torch in place of the spindle), or NULL */
    char feed_per_min[8], feed_per_rev[8];
    char tlen_off[16];
    const gc_doc *doc;
    gc_map labels;              /* "N100" / "O1000" -> first block index */
} gc_ctx;

void gc_ctx_init(gc_ctx *c, const gc_data *data, const gc_json *machine, const gc_doc *doc, int style);
void gc_ctx_free(gc_ctx *c);

/* The dictionary entry for a code ("G01", "M97", "CALL"), with machine overrides. NULL if none. */
const gc_json *gc_entry(const gc_ctx *c, const char *key);
/* The canned-cycle guide's entry for one word of a cycle: [example, what it does, English word?]. */
const gc_json *gc_cycle_word(const gc_ctx *c, const char *code, char letter);
/* The library entry a G65 line calls, or NULL. */
const gc_json *gc_lib_for(const gc_ctx *c, const gc_line *line);

/* "G1" -> "G01", "G43.4" stays; like the mockup's pad2(). out must hold strlen(t)+2. */
void gc_pad2(const char *t, char *out, size_t outsz);
/* t is a G or M code and pads to c. */
int gc_is_code(const char *t, const char *c);
int gc_line_has_code(const gc_line *l, const char *c);
int gc_line_has_tok(const gc_line *l, const char *t);
int gc_is_end(const gc_line *l);
int gc_is_return(const gc_line *l, int fagor);
/* Writes the label a line jumps to ("N1000", "O1200") into out; returns 0 when it calls nothing. */
int gc_call_target(const gc_line *l, char *out, size_t outsz);
/* "N90" or "N90:" -> "N90", anything else ("NA1") as it is: labelKey() in the mockup. */
int gc_label_key(const char *t, char *key, size_t keysz);

/* fmtNum(): the number as the English line shows it. */
typedef struct gc_num {
    char v[192];
    int implied;
    char intended[64];
} gc_num;
void gc_fmt_num(const gc_ctx *c, char letter, const char *raw, int inch, gc_num *out);

/* Translation (gc_translate.c) fills cells, modes and kind. */
void gc_translate(gc_ctx *c, gc_analysis *a);
/* Checks (gc_checks.c) fill problems; they need the cells from gc_translate. */
void gc_check(gc_ctx *c, gc_analysis *a);

#endif
