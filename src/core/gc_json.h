/* A small JSON reader for the data files (dictionary, rules, library, machine profiles) and for
   requests from the UI. Objects keep their keys in the order they were written, like JavaScript's. */
#ifndef GC_JSON_H
#define GC_JSON_H

#include <stddef.h>

typedef enum { GC_JNULL, GC_JFALSE, GC_JTRUE, GC_JNUM, GC_JSTR, GC_JARR, GC_JOBJ } gc_jtype;

typedef struct gc_json gc_json;
struct gc_json {
    gc_jtype type;
    double num;
    char *str;       /* GC_JSTR: UTF-8, NUL-terminated */
    size_t n, cap;   /* GC_JARR / GC_JOBJ: number of items */
    gc_json **items;
    char **keys;     /* GC_JOBJ only */
};

/* Parses len bytes. Returns NULL and writes a message to err on a syntax error. */
gc_json *gc_json_parse(const char *text, size_t len, char *err, size_t errsz);
void gc_json_free(gc_json *v);
gc_json *gc_json_clone(const gc_json *v);

gc_json *gc_json_new(gc_jtype type);
/* Sets key on an object, taking ownership of v. An existing key keeps its place. */
void gc_json_set(gc_json *obj, const char *key, gc_json *v);
void gc_json_push(gc_json *arr, gc_json *v);

/* Lookups return NULL when v isn't the right type or the item isn't there. */
gc_json *gc_json_get(const gc_json *obj, const char *key);
gc_json *gc_json_at(const gc_json *arr, size_t i);
const char *gc_json_str(const gc_json *v);
/* String value of obj[key], or NULL. */
const char *gc_json_get_str(const gc_json *obj, const char *key);
int gc_json_is_obj(const gc_json *v);
int gc_json_is_arr(const gc_json *v);
/* JavaScript truthiness: null, false, 0, NaN and "" are false; a missing value (NULL) is false. */
int gc_json_truthy(const gc_json *v);
size_t gc_json_len(const gc_json *v);

/* Writes v as compact JSON. */
struct gc_buf;
void gc_json_write(struct gc_buf *b, const gc_json *v);

#endif
