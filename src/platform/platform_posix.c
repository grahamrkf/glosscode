/* Linux (and other POSIX) platform file. */
#define _POSIX_C_SOURCE 200809L
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#include "platform.h"

static char *join(const char *a, const char *b)
{
    size_t la = strlen(a), lb = strlen(b);
    char *p = malloc(la + lb + 2);
    if (!p) return NULL;
    memcpy(p, a, la);
    p[la] = '/';
    memcpy(p + la + 1, b, lb + 1);
    return p;
}

char plat_sep(void)
{
    return '/';
}

const char *plat_name(void)
{
    return "linux";
}

char *plat_read_file(const char *path, size_t *len)
{
    int fd = open(path, O_RDONLY);
    if (fd < 0) return NULL;
    struct stat st;
    if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode)) {
        close(fd);
        return NULL;
    }
    size_t n = (size_t)st.st_size, got = 0;
    char *buf = malloc(n + 1);
    while (buf && got < n) {
        ssize_t r = read(fd, buf + got, n - got);
        if (r < 0 && errno == EINTR) continue;
        if (r <= 0) break;
        got += (size_t)r;
    }
    close(fd);
    if (!buf || got != n) {
        free(buf);
        return NULL;
    }
    buf[n] = '\0';
    if (len) *len = n;
    return buf;
}

int plat_write_file(const char *path, const char *data, size_t len, char *err, size_t errsz)
{
    size_t pl = strlen(path);
    char *tmp = malloc(pl + 16);
    if (!tmp) return -1;
    snprintf(tmp, pl + 16, "%s.gc-tmp", path);
    int fd = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    int ok = fd >= 0;
    size_t done = 0;
    while (ok && done < len) {
        ssize_t w = write(fd, data + done, len - done);
        if (w < 0 && errno == EINTR) continue;
        if (w <= 0) ok = 0;
        else done += (size_t)w;
    }
    if (fd >= 0) {
        if (ok && fsync(fd) != 0) ok = 0;
        close(fd);
    }
    if (ok) {
        /* Keep the original file's permissions. */
        struct stat st;
        if (stat(path, &st) == 0) chmod(tmp, st.st_mode & 07777);
        if (rename(tmp, path) != 0) ok = 0;
    }
    if (!ok) {
        if (err) snprintf(err, errsz, "Couldn't write %s: %s", path, strerror(errno));
        unlink(tmp);
    }
    free(tmp);
    return ok ? 0 : -1;
}

int plat_file_exists(const char *path)
{
    struct stat st;
    return stat(path, &st) == 0;
}

char *plat_full_path(const char *path)
{
    char *r = realpath(path, NULL);
    if (r) return r;
    if (path[0] == '/') return strdup(path);
    char cwd[PATH_MAX];
    if (!getcwd(cwd, sizeof cwd)) return strdup(path);
    return join(cwd, path);
}

int plat_make_dirs(const char *path)
{
    char *p = strdup(path);
    if (!p) return -1;
    for (char *s = p + 1; *s; s++)
        if (*s == '/') {
            *s = 0;
            mkdir(p, 0755);
            *s = '/';
        }
    mkdir(p, 0755);
    struct stat st;
    int ok = stat(p, &st) == 0 && S_ISDIR(st.st_mode);
    free(p);
    return ok ? 0 : -1;
}

static int cmp_str(const void *a, const void *b)
{
    return strcmp(*(char *const *)a, *(char *const *)b);
}

void plat_list_dir(const char *dir, const char *ext, plat_dir_fn fn, void *arg)
{
    DIR *d = opendir(dir);
    if (!d) return;
    char **names = NULL;
    size_t n = 0, cap = 0;
    struct dirent *e;
    size_t el = strlen(ext);
    while ((e = readdir(d)) != NULL) {
        size_t nl = strlen(e->d_name);
        if (e->d_name[0] == '.' || nl < el || strcmp(e->d_name + nl - el, ext) != 0) continue;
        if (n == cap) {
            cap = cap ? cap * 2 : 16;
            names = realloc(names, cap * sizeof *names);
        }
        names[n++] = strdup(e->d_name);
    }
    closedir(d);
    qsort(names, n, sizeof *names, cmp_str);
    for (size_t i = 0; i < n; i++) {
        char *p = join(dir, names[i]);
        struct stat st;
        if (stat(p, &st) == 0 && S_ISREG(st.st_mode)) fn(p, names[i], arg);
        free(p);
        free(names[i]);
    }
    free(names);
}

static char *exe_folder(void)
{
    char buf[PATH_MAX];
    ssize_t n = readlink("/proc/self/exe", buf, sizeof buf - 1);
    if (n <= 0) return strdup(".");
    buf[n] = 0;
    char *slash = strrchr(buf, '/');
    if (slash && slash != buf) *slash = 0;
    return strdup(buf);
}

static char *xdg(const char *var, const char *fallback)
{
    const char *v = getenv(var);
    if (v && v[0] == '/') return join(v, "glosscode");
    const char *home = getenv("HOME");
    char *base = join(home && *home ? home : "/tmp", fallback);
    char *p = join(base, "glosscode");
    free(base);
    return p;
}

const plat_dirs *plat_get_dirs(void)
{
    static plat_dirs d;
    static int done = 0;
    if (done) return &d;
    done = 1;
    char *exe = exe_folder();
    d.exe_dir = exe;
    char *marker = join(exe, "portable");
    d.portable = plat_file_exists(marker);
    free(marker);
    if (d.portable) {
        char *base = join(exe, "GlossCode-data");
        d.config = base;
        d.cache = join(base, "cache");
    } else {
        d.config = xdg("XDG_CONFIG_HOME", ".config");
        d.cache = xdg("XDG_CACHE_HOME", ".cache");
    }
    plat_make_dirs(d.config);
    plat_make_dirs(d.cache);
    return &d;
}

void plat_open_url(const char *url)
{
    if (strncmp(url, "https://", 8) != 0 && strncmp(url, "http://", 7) != 0) return;
    pid_t pid = fork();
    if (pid == 0) {
        /* Detach so the browser outlives us and doesn't become a zombie. */
        if (fork() == 0) {
            execlp("xdg-open", "xdg-open", url, (char *)NULL);
            _exit(127);
        }
        _exit(0);
    }
    if (pid > 0) waitpid(pid, NULL, 0);
}

void plat_error_box(const char *title, const char *msg)
{
    fprintf(stderr, "%s: %s\n", title, msg);
}

void plat_prepare_webview(const plat_dirs *dirs)
{
    (void)dirs; /* WebKitGTK keeps its data under the XDG folders already. */
}
