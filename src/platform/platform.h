/* The platform file's interface: the few things the app needs from the operating system. One file
   per OS implements it (platform_win32.c, platform_posix.c); everything else is portable. All paths
   and strings are UTF-8, and paths use the OS's own separator (plat_sep()). */
#ifndef GC_PLATFORM_H
#define GC_PLATFORM_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* The path separator: '\\' on Windows, '/' elsewhere. */
char plat_sep(void);

/* Reads a whole file. Returns a malloc'd buffer (NUL-terminated, *len bytes) or NULL. */
char *plat_read_file(const char *path, size_t *len);
/* Writes a whole file safely: to a temporary file beside it, then replaces the original.
   Returns 0 on success, or -1 with a message in err. */
int plat_write_file(const char *path, const char *data, size_t len, char *err, size_t errsz);
/* Creates a folder and any missing parents. Returns 0 when it exists afterwards. */
int plat_make_dirs(const char *path);
int plat_file_exists(const char *path);
/* The absolute form of a path (relative paths are taken from the current folder). Returns a malloc'd string. */
char *plat_full_path(const char *path);

/* Calls fn for each file in dir whose name ends with ext (".json"), in name order. */
typedef void (*plat_dir_fn)(const char *path, const char *name, void *arg);
void plat_list_dir(const char *dir, const char *ext, plat_dir_fn fn, void *arg);

/* Where GlossCode keeps its files. The strings belong to the platform file. */
typedef struct plat_dirs {
    const char *exe_dir;  /* the folder the program is in */
    const char *config;   /* settings, personal machines and library: %APPDATA%\GlossCode or ~/.config/glosscode */
    const char *cache;    /* WebView data and caches: %LOCALAPPDATA%\GlossCode or ~/.cache/glosscode */
    int portable;         /* a file named "portable" sits beside the program: both live in GlossCode-data there */
} plat_dirs;

/* Works the folders out once (and creates them). */
const plat_dirs *plat_get_dirs(void);

/* Opens a web address in the default browser. */
void plat_open_url(const char *url);

/* Shows a message box for errors that happen before the window exists. */
void plat_error_box(const char *title, const char *msg);

/* Gets ready for the webview: on Windows, points WebView2's user data folder at the cache folder. */
void plat_prepare_webview(const plat_dirs *dirs);

/* The name of the platform, for Help › About: "windows" or "linux". */
const char *plat_name(void);

#ifdef __cplusplus
}
#endif

#endif
