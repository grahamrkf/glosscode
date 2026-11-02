/* Windows platform file. Wide-character Win32 calls, converted to and from UTF-8 at the edges. */
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef UNICODE
#define UNICODE
#endif
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#include "platform.h"

static wchar_t *to_wide(const char *s)
{
    int n = MultiByteToWideChar(CP_UTF8, 0, s, -1, NULL, 0);
    wchar_t *w = malloc((size_t)(n > 0 ? n : 1) * sizeof *w);
    if (!w) return NULL;
    if (n <= 0) {
        w[0] = 0;
        return w;
    }
    MultiByteToWideChar(CP_UTF8, 0, s, -1, w, n);
    return w;
}

static char *to_utf8(const wchar_t *w)
{
    int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, NULL, 0, NULL, NULL);
    char *s = malloc((size_t)(n > 0 ? n : 1));
    if (!s) return NULL;
    if (n <= 0) {
        s[0] = 0;
        return s;
    }
    WideCharToMultiByte(CP_UTF8, 0, w, -1, s, n, NULL, NULL);
    return s;
}

static char *join(const char *a, const char *b)
{
    size_t la = strlen(a), lb = strlen(b);
    char *p = malloc(la + lb + 2);
    if (!p) return NULL;
    memcpy(p, a, la);
    p[la] = '\\';
    memcpy(p + la + 1, b, lb + 1);
    return p;
}

char plat_sep(void)
{
    return '\\';
}

const char *plat_name(void)
{
    return "windows";
}

char *plat_read_file(const char *path, size_t *len)
{
    wchar_t *w = to_wide(path);
    HANDLE h = CreateFileW(w, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    free(w);
    if (h == INVALID_HANDLE_VALUE) return NULL;
    LARGE_INTEGER size;
    if (!GetFileSizeEx(h, &size) || size.QuadPart > 512 * 1024 * 1024) {
        CloseHandle(h);
        return NULL;
    }
    size_t n = (size_t)size.QuadPart, got = 0;
    char *buf = malloc(n + 1);
    while (buf && got < n) {
        DWORD r = 0, want = (DWORD)((n - got) > 0x10000000 ? 0x10000000 : (n - got));
        if (!ReadFile(h, buf + got, want, &r, NULL) || r == 0) break;
        got += r;
    }
    CloseHandle(h);
    if (!buf || got != n) {
        free(buf);
        return NULL;
    }
    buf[n] = '\0';
    if (len) *len = n;
    return buf;
}

static void last_error(const char *what, const char *path, char *err, size_t errsz)
{
    wchar_t msg[512];
    DWORD code = GetLastError();
    msg[0] = 0;
    FormatMessageW(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, NULL, code, 0, msg, 512, NULL);
    char *m = to_utf8(msg);
    size_t ml = m ? strlen(m) : 0;
    while (ml && (m[ml - 1] == '\n' || m[ml - 1] == '\r' || m[ml - 1] == ' ')) m[--ml] = 0;
    if (err) snprintf(err, errsz, "Couldn't %s %s: %s", what, path, m ? m : "unknown error");
    free(m);
}

int plat_write_file(const char *path, const char *data, size_t len, char *err, size_t errsz)
{
    size_t pl = strlen(path);
    char *tmp = malloc(pl + 16);
    if (!tmp) return -1;
    snprintf(tmp, pl + 16, "%s.gc-tmp", path);
    wchar_t *wt = to_wide(tmp), *wp = to_wide(path);
    HANDLE h = CreateFileW(wt, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    int ok = h != INVALID_HANDLE_VALUE;
    if (!ok) last_error("write", path, err, errsz);
    size_t done = 0;
    while (ok && done < len) {
        DWORD w = 0, want = (DWORD)((len - done) > 0x10000000 ? 0x10000000 : (len - done));
        if (!WriteFile(h, data + done, want, &w, NULL)) {
            last_error("write", path, err, errsz);
            ok = 0;
        }
        done += w;
    }
    if (h != INVALID_HANDLE_VALUE) {
        if (ok && !FlushFileBuffers(h)) ok = 0;
        CloseHandle(h);
    }
    if (ok && !MoveFileExW(wt, wp, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        last_error("replace", path, err, errsz);
        ok = 0;
    }
    if (!ok) DeleteFileW(wt);
    free(wt);
    free(wp);
    free(tmp);
    return ok ? 0 : -1;
}

int plat_file_exists(const char *path)
{
    wchar_t *w = to_wide(path);
    DWORD a = GetFileAttributesW(w);
    free(w);
    return a != INVALID_FILE_ATTRIBUTES;
}

char *plat_full_path(const char *path)
{
    wchar_t *w = to_wide(path);
    DWORD n = GetFullPathNameW(w, 0, NULL, NULL);
    char *r = NULL;
    if (n) {
        wchar_t *full = malloc(n * sizeof *full);
        if (full && GetFullPathNameW(w, n, full, NULL)) r = to_utf8(full);
        free(full);
    }
    free(w);
    if (!r && (r = malloc(strlen(path) + 1)) != NULL) strcpy(r, path);
    return r;
}

int plat_make_dirs(const char *path)
{
    wchar_t *w = to_wide(path);
    if (!w) return -1;
    for (wchar_t *p = w; *p; p++) {
        if ((*p == L'\\' || *p == L'/') && p > w && p[-1] != L':' && !(p == w + 1 && w[0] == L'\\')) {
            wchar_t c = *p;
            *p = 0;
            CreateDirectoryW(w, NULL);
            *p = c;
        }
    }
    CreateDirectoryW(w, NULL);
    DWORD a = GetFileAttributesW(w);
    free(w);
    return (a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY)) ? 0 : -1;
}

static int cmp_str(const void *a, const void *b)
{
    return strcmp(*(char *const *)a, *(char *const *)b);
}

void plat_list_dir(const char *dir, const char *ext, plat_dir_fn fn, void *arg)
{
    char *pattern = join(dir, "*");
    wchar_t *w = to_wide(pattern);
    free(pattern);
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileW(w, &fd);
    free(w);
    if (h == INVALID_HANDLE_VALUE) return;
    char **names = NULL;
    size_t n = 0, cap = 0;
    do {
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
        char *name = to_utf8(fd.cFileName);
        size_t nl = strlen(name), el = strlen(ext);
        if (nl >= el && _stricmp(name + nl - el, ext) == 0) {
            if (n == cap) {
                cap = cap ? cap * 2 : 16;
                names = realloc(names, cap * sizeof *names);
            }
            names[n++] = name;
        } else {
            free(name);
        }
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    qsort(names, n, sizeof *names, cmp_str);
    for (size_t i = 0; i < n; i++) {
        char *p = join(dir, names[i]);
        fn(p, names[i], arg);
        free(p);
        free(names[i]);
    }
    free(names);
}

static char *known_folder(int csidl)
{
    wchar_t buf[MAX_PATH];
    if (FAILED(SHGetFolderPathW(NULL, csidl | CSIDL_FLAG_CREATE, NULL, 0, buf))) return NULL;
    return to_utf8(buf);
}

const plat_dirs *plat_get_dirs(void)
{
    static plat_dirs d;
    static int done = 0;
    if (done) return &d;
    done = 1;
    wchar_t exe[32768];
    DWORD n = GetModuleFileNameW(NULL, exe, 32768);
    if (n == 0 || n >= 32768) wcscpy(exe, L".\\GlossCode.exe");
    wchar_t *slash = wcsrchr(exe, L'\\');
    if (slash) *slash = 0;
    char *exe_dir = to_utf8(exe);
    d.exe_dir = exe_dir;
    char *marker = join(exe_dir, "portable");
    d.portable = plat_file_exists(marker);
    free(marker);
    if (d.portable) {
        char *base = join(exe_dir, "GlossCode-data");
        d.config = base;
        d.cache = join(base, "cache");
    } else {
        char *roaming = known_folder(CSIDL_APPDATA), *local = known_folder(CSIDL_LOCAL_APPDATA);
        d.config = join(roaming ? roaming : exe_dir, "GlossCode");
        d.cache = join(local ? local : exe_dir, "GlossCode");
        free(roaming);
        free(local);
    }
    plat_make_dirs(d.config);
    plat_make_dirs(d.cache);
    return &d;
}

void plat_open_url(const char *url)
{
    if (strncmp(url, "https://", 8) != 0 && strncmp(url, "http://", 7) != 0) return;
    wchar_t *w = to_wide(url);
    ShellExecuteW(NULL, L"open", w, NULL, NULL, SW_SHOWNORMAL);
    free(w);
}

void plat_error_box(const char *title, const char *msg)
{
    wchar_t *t = to_wide(title), *m = to_wide(msg);
    MessageBoxW(NULL, m, t, MB_OK | MB_ICONERROR);
    free(t);
    free(m);
}

void plat_prepare_webview(const plat_dirs *dirs)
{
    /* WebView2 would otherwise keep its data beside the program (or in %APPDATA%\GlossCode.exe),
       which fails under Program Files and clutters the roaming profile. The environment variable
       takes precedence over the folder the webview library passes. */
    char *udf = join(dirs->cache, "WebView2");
    plat_make_dirs(udf);
    wchar_t *w = to_wide(udf);
    SetEnvironmentVariableW(L"WEBVIEW2_USER_DATA_FOLDER", w);
    free(w);
    free(udf);
}
