/* Tiny test helpers for the core tests. */
#ifndef TEST_UTIL_H
#define TEST_UTIL_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int t_failures = 0, t_checks = 0;

#define CHECK(cond, ...)                                              \
    do {                                                              \
        t_checks++;                                                   \
        if (!(cond)) {                                                \
            t_failures++;                                             \
            fprintf(stderr, "%s:%d: FAIL: ", __FILE__, __LINE__);     \
            fprintf(stderr, __VA_ARGS__);                             \
            fputc('\n', stderr);                                      \
        }                                                             \
    } while (0)

#define CHECK_STR(got, want, ...)                                                     \
    do {                                                                              \
        const char *g_ = (got), *w_ = (want);                                         \
        t_checks++;                                                                   \
        if (!g_ || !w_ ? g_ != w_ : strcmp(g_, w_) != 0) {                            \
            t_failures++;                                                             \
            fprintf(stderr, "%s:%d: FAIL: ", __FILE__, __LINE__);                     \
            fprintf(stderr, __VA_ARGS__);                                             \
            fprintf(stderr, "\n    got:  %s\n    want: %s\n", g_ ? g_ : "(null)", w_ ? w_ : "(null)"); \
        }                                                                             \
    } while (0)

static int t_summary(const char *name)
{
    if (t_failures) fprintf(stderr, "%s: %d of %d checks failed\n", name, t_failures, t_checks);
    else printf("%s: all %d checks passed\n", name, t_checks);
    return t_failures ? 1 : 0;
}

#endif
