/* Unit tests for the core's building blocks: number formatting, the JSON reader, the word splitter,
   reading and writing files, machine profile overrides and the JSON interface.
   Usage: test_core <repo root> */
#include "glosscode.h"
#include "gc_util.h"
#include "test_util.h"

static void test_numbers(void)
{
    char s[64];
    struct { double n; const char *want; } nums[] = {
        { 0, "0" }, { 1, "1" }, { -1.5, "-1.5" }, { 0.1 + 0.2, "0.30000000000000004" }, { 0.0001, "0.0001" },
        { 1e-7, "1e-7" }, { 123456789012, "123456789012" }, { 1e21, "1e+21" }, { 2.5e-6, "0.0000025" }, { 0.6, "0.6" },
    };
    for (size_t i = 0; i < sizeof nums / sizeof *nums; i++) {
        gc_js_num(nums[i].n, s, sizeof s);
        CHECK_STR(s, nums[i].want, "String(%.17g)", nums[i].n);
    }
    gc_js_num(gc_nan(), s, sizeof s);
    CHECK_STR(s, "NaN", "String(NaN)");
    gc_js_fixed(5 * 0.0001, 4, s, sizeof s);
    CHECK_STR(s, "0.0005", "toFixed");
    gc_js_fixed(-12 * 0.001, 3, s, sizeof s);
    CHECK_STR(s, "-0.012", "toFixed negative");
    gc_js_fixed(0.125, 2, s, sizeof s);
    CHECK_STR(s, "0.13", "toFixed rounds an exact half up, like JavaScript");
    gc_js_fixed(-0.00001, 4, s, sizeof s);
    CHECK_STR(s, "-0.0000", "toFixed keeps the sign of a tiny negative, like JavaScript");
    CHECK(gc_js_parse_float("1.2.3") == 1.2, "parseFloat stops at the second point");
    CHECK(gc_js_parse_float(".5") == 0.5, "parseFloat .5");
    CHECK(gc_isnan(gc_js_parse_float("")), "parseFloat empty is NaN");
    CHECK(gc_isnan(gc_js_parse_float("-")), "parseFloat - is NaN");
    CHECK(gc_js_parse_int("0203") == 203, "parseInt leading zero");
    CHECK(gc_js_parse_int("12.9") == 12, "parseInt stops at the point");
    CHECK(gc_isnan(gc_js_parse_int("x")), "parseInt x is NaN");
}

static void test_json(void)
{
    char err[200];
    const char *src = "{\"a\":[1,2.5,-3e2],\"b\":\"x\\u00e9\\n\\ud83d\\ude00\",\"c\":null,\"a\":true}";
    gc_json *v = gc_json_parse(src, strlen(src), err, sizeof err);
    CHECK(v != NULL, "parse: %s", err);
    if (!v) return;
    CHECK(gc_json_len(v) == 3, "a repeated key replaces the first in place");
    CHECK(gc_json_get(v, "a")->type == GC_JTRUE, "the later value wins");
    CHECK_STR(gc_json_get_str(v, "b"), "x\xc3\xa9\n\xf0\x9f\x98\x80", "escapes decode to UTF-8");
    CHECK(!gc_json_truthy(gc_json_get(v, "c")), "null is falsy");
    gc_buf b;
    gc_buf_init(&b);
    gc_json_write(&b, v);
    CHECK_STR(gc_buf_str(&b), "{\"a\":true,\"b\":\"x\xc3\xa9\\n\xf0\x9f\x98\x80\",\"c\":null}", "write");
    gc_buf_free(&b);
    gc_json_free(v);
    const char *bad[] = { "{", "[1,]", "{\"a\" 1}", "tru", "\"abc", "1 2", "{\"a\":01x}" };
    for (size_t i = 0; i < sizeof bad / sizeof *bad; i++) {
        gc_json *x = gc_json_parse(bad[i], strlen(bad[i]), err, sizeof err);
        CHECK(x == NULL && err[0], "bad JSON %s is refused", bad[i]);
        gc_json_free(x);
    }
}

static void tok_is(const char *line, const char *want)
{
    int n;
    char **t = gc_tokenize(line, strlen(line), &n);
    gc_buf b;
    gc_buf_init(&b);
    for (int i = 0; i < n; i++) {
        if (i) gc_buf_putc(&b, '|');
        gc_buf_puts(&b, t[i]);
    }
    CHECK_STR(gc_buf_str(&b), want, "tokenize %s", line);
    gc_buf_free(&b);
    gc_tokens_free(t, n);
}

static void test_tokenize(void)
{
    tok_is("n10g1x1.y-.5f10.", "N10|G1|X1.|Y-.5|F10.");
    tok_is("N20 T1 M06 (1/4 end mill)", "N20|T1|M06|(1/4 end mill)");
    tok_is("(unclosed comment", "(unclosed comment");
    tok_is("call o1000", "CALL|O1000");
    tok_is("XCALL", "X|C|A|L|L");
    tok_is("GOTO5", "G|O|T|O5");
    tok_is("/N30 #100=1 G00 Z+1.", "/|N30|#100=1|G00|Z+1.");   /* block delete stays the first word */
    /* Macro variables and expressions stay whole, and an assignment ends at the next address word */
    tok_is("N3000 G00 X - #101 Y#102 z#113", "N3000|G00|X-#101|Y#102|Z#113");
    tok_is("#110= -0.0350 (DEPTH)", "#110=-0.0350|(DEPTH)");
    tok_is("#1 = SIN[30] * #2 MOD 3", "#1=SIN[30]*#2 MOD 3");
    tok_is("#1=1G00", "#1=1|G00");
    tok_is("X[#1 + #2] Y-#[#3] F [#4*2]", "X[#1+#2]|Y-#[#3]|F[#4*2]");
    tok_is("if [#1 gt 2]   goto 100 (C)", "IF [#1 GT 2] GOTO 100|(C)");
    tok_is("WHILE[#1 LT 5]DO1", "WHILE[#1 LT 5]DO1");
    tok_is("END1", "END1");
    tok_is("ENDX1", "E|N|D|X1");
    tok_is("  /2 N40 M01", "/2|N40|M01");
    tok_is("N50 X1. / 2", "N50|X1.|/|2");             /* a "/" later in the block isn't block delete; kept as written */
    tok_is("X-", "X-");
    /* Okuma: NAME= assignments, X=expression, sequence names, GOTO N.. */
    tok_is("V1=3 (PARTS)", "V1=3|(PARTS)");
    tok_is("N390 V2=V2+1", "N390|V2=V2+1");
    tok_is("DIA1 = 160 + 2 X=DIA1 Z0", "DIA1=160+2|X=DIA1|Z0");
    tok_is("VC1=VC2*2 VC3=1", "VC1=VC2*2|VC3=1");
    tok_is("NA1 G81", "NA1|G81");
    tok_is("N170 G85 na1 D0.3", "N170|G85|NA1|D0.3");
    tok_is("NABCDE1", "N|A|B|C|D|E1");
    tok_is("N430 GOTO N90", "N430|GOTO|N90");
    tok_is("IF [V2 GE V1] N440", "IF [V2 GE V1] N440");
    tok_is("#1=#2 X1.", "#1=#2|X1.");
    tok_is("#1=2 MOD 3 Y1.", "#1=2 MOD 3|Y1.");
    tok_is("X1.==", "X1.|==");
    tok_is("%", "%");
    tok_is("N10 G00;", "N10|G00|;");
    tok_is("X1. *& 12", "X1.|*&|12");
}

static void test_doc(void)
{
    const char *src = "O1 (A;B);\r\nN10 G00;N20 X1.;\r\n\r\n%";
    gc_doc *d = gc_doc_parse(src, strlen(src));
    CHECK(d->nlines == 5, "blocks: %d", d->nlines);
    CHECK(d->eob, "';' found");
    CHECK_STR(d->eol, "\r\n", "line ending");
    CHECK(!d->final_eol, "no final line ending");
    CHECK(d->nlines == 5 && d->lines[0].ntok == 3, "a ';' inside a comment doesn't split, and the ';' after it is a word");
    size_t n;
    char *out = gc_doc_serialize(d, 1, &n);
    CHECK_STR(out, "O1 (A;B);\r\nN10 G00;\r\nN20 X1.;\r\n\r\n%", "written with ';' after blocks that have words");
    free(out);
    /* An edited block is written from its words. */
    free(d->lines[1].tok[1]);
    d->lines[1].tok[1] = gc_strdup("G01");
    out = gc_doc_serialize(d, 0, &n);
    CHECK_STR(out, "O1 (A;B);\r\nN10 G01;\r\nN20 X1.;\r\n\r\n%", "edited block keeps the ';' it was written with");
    free(out);
    gc_doc_free(d);

    d = gc_doc_parse("G0\nG1\n", 6);
    CHECK_STR(d->eol, "\n", "LF file");
    CHECK(d->final_eol && d->nlines == 2, "final LF doesn't add a block");
    gc_doc_free(d);
    d = gc_doc_parse("", 0);
    CHECK(d->nlines == 1 && d->lines[0].ntok == 0, "empty file is one empty block");
    gc_doc_free(d);

    const char latin[] = "(caf\xe9)";
    CHECK(!gc_is_utf8(latin, strlen(latin)), "Latin-1 isn't UTF-8");
    size_t ul, ll;
    char *u = gc_latin1_to_utf8(latin, strlen(latin), &ul);
    CHECK_STR(u, "(caf\xc3\xa9)", "Latin-1 to UTF-8");
    CHECK(gc_is_utf8(u, ul), "result is UTF-8");
    char *l = gc_utf8_to_latin1(u, ul, &ll);
    CHECK(ll == strlen(latin) && !memcmp(l, latin, ll), "and back");
    free(u);
    free(l);
}

static gc_data *load(const char *root)
{
    char *wp = join_path(root, "data/gcode-words.json"), *rp = join_path(root, "data/gcode-rules.json");
    size_t wl, rl;
    char *w = read_file(wp, &wl), *r = read_file(rp, &rl);
    char err[200];
    gc_data *d = (w && r) ? gc_data_load(w, wl, r, rl, err, sizeof err) : NULL;
    free(w);
    free(r);
    free(wp);
    free(rp);
    return d;
}

static const gc_problem *find_problem(const gc_analysis *a, const char *id)
{
    for (int i = 0; i < a->nproblems; i++)
        if (!strcmp(a->problems[i].id, id)) return &a->problems[i];
    return NULL;
}

static void test_machine_overrides(const gc_data *data)
{
    const char *prog = "N10 G20 G90\nN20 T1 M06\nN30 G00 X1 Y0.\nN40 M51\nN50 M51 M52\nN60 M30\n";
    gc_doc *doc = gc_doc_parse(prog, strlen(prog));
    char err[200];
    const char *plain = "{\"type\":\"mill\",\"brand\":\"haas\"}";
    const char *shop = "{\"type\":\"mill\",\"brand\":\"haas\",\"codes\":{\"M51\":{\"long\":\"VISEOPEN\",\"short\":\"VOPN\",\"desc\":\"Open the vise\"}},"
                       "\"checks\":{\"missing-decimal\":\"off\",\"unknown-word\":\"error\"},\"mConflicts\":[[\"M51\",\"M52\"]]}";
    gc_json *m1 = gc_json_parse(plain, strlen(plain), err, sizeof err), *m2 = gc_json_parse(shop, strlen(shop), err, sizeof err);
    gc_analysis *a = gc_analyze(data, m1, doc, GC_STYLE_LONG);
    CHECK(find_problem(a, "missing-decimal") != NULL, "X1 is flagged by default");
    CHECK(a->cells[3][1].flags & GC_CELL_UNKNOWN, "M51 is unknown on a plain Haas");
    CHECK(!strcmp(a->modes[2].motion, "G00") && a->modes[2].has_pos[0] && a->modes[2].pos[0] == 0.0001, "X1 is at 0.0001 in");
    gc_analysis_free(a);
    a = gc_analyze(data, m2, doc, GC_STYLE_SHORT);
    CHECK(find_problem(a, "missing-decimal") == NULL, "a profile can turn a check off");
    CHECK_STR(a->cells[3][1].e, "VOPN", "a profile can add English words");
    const gc_problem *p = find_problem(a, "m-conflict");
    CHECK(p && p->line == 4, "profile mConflicts are checked");
    gc_analysis_free(a);
    gc_json_free(m1);
    gc_json_free(m2);
    gc_doc_free(doc);
}

static void test_api(const gc_data *data)
{
    const char *p = "{\"text\":\"N10 G0 X1.;\\r\\nN20 M30;\\r\\n\"}";
    char *r = gc_api_call(data, "parse", p, strlen(p));
    CHECK_STR(r, "{\"lines\":[{\"tok\":[\"N10\",\"G0\",\"X1.\",\";\"],\"raw\":\"N10 G0 X1.;\"},{\"tok\":[\"N20\",\"M30\",\";\"],\"raw\":\"N20 M30;\"}],"
                 "\"eob\":true,\"eol\":\"\\r\\n\",\"finalEol\":true}", "parse");
    free(r);
    p = "{\"lines\":[[\"N10\",\"G01\",\"X2.\"],{\"tok\":[\"N20\",\"M30\"],\"raw\":\"N20  M30\"}],\"eob\":true,\"eol\":\"\\n\",\"finalEol\":true}";
    r = gc_api_call(data, "serialize", p, strlen(p));
    CHECK_STR(r, "{\"text\":\"N10 G01 X2.;\\nN20  M30;\\n\"}", "serialize keeps unchanged raw text");
    free(r);
    p = "{\"lines\":[[\"N10\",\"G97\",\"S600\",\"M03\"]],\"machine\":{\"type\":\"mill\",\"brand\":\"fanuc\"}}";
    r = gc_api_call(data, "analyze", p, strlen(p));
    CHECK(r && strstr(r, "\"e\":\"S600\",\"u\":\"rpm\"") && strstr(r, "\"id\":\"no-program-end\"") && strstr(r, "\"spinDir\":\"M03\""),
          "analyze: %s", r ? r : "(null)");
    free(r);
    r = gc_api_call(data, "nope", "{}", 2);
    CHECK_STR(r, "{\"error\":\"unknown method \\\"nope\\\"\"}", "unknown method");
    free(r);
    r = gc_api_call(data, "parse", "{", 1);
    CHECK(r && strstr(r, "\"error\""), "bad JSON parameters");
    free(r);
    r = gc_api_call(data, "tokenize", "{\"text\":\"g1x1.\"}", 16);
    CHECK_STR(r, "{\"tok\":[\"G1\",\"X1.\"]}", "tokenize");
    free(r);
}

/* Random text made of G-code-ish pieces must never crash or hang the core (run under sanitizers in CI). */
static void test_garbage(const gc_data *data)
{
    static const char *const bits[] = { "G", "M", "X", "Y", "Z", "U", "W", "R", "Q", "P", "F", "S", "T", "H", "D", "N", "O",
                                        "I", "J", "K", "-", ".", "0", "1", "5", "99", "97", "65", "83", "02", "03", "41",
                                        " ", " ", " ", "(", ")", ";", "\n", "\r\n", "CALL ", "RTS", "GOTO", "#", "/", "%",
                                        "\xe9", "M30", "M99", "G04", "G28", "G96", "G50", "G15 H", "G71", "G76" };
    static const char *const machines[] = { "{\"type\":\"mill\",\"brand\":\"haas\"}", "{\"type\":\"lathe\",\"brand\":\"haas\"}",
                                            "{\"type\":\"mill\",\"brand\":\"okuma\"}", "{\"type\":\"lathe\",\"brand\":\"okuma\"}",
                                            "{\"type\":\"mill\",\"brand\":\"fanuc\"}", "{}" };
    unsigned long seed = 12345;
    char err[200];
    for (int round = 0; round < 300; round++) {
        gc_buf b;
        gc_buf_init(&b);
        int n = (int)(seed % 400);
        for (int i = 0; i < n; i++) {
            seed = seed * 6364136223846793005UL + 1442695040888963407UL;
            gc_buf_puts(&b, bits[(seed >> 33) % (sizeof bits / sizeof *bits)]);
        }
        gc_doc *doc = gc_doc_parse(gc_buf_str(&b), b.len);
        const char *mj = machines[round % (sizeof machines / sizeof *machines)];
        gc_json *m = gc_json_parse(mj, strlen(mj), err, sizeof err);
        gc_analysis *a = gc_analyze(data, m, doc, round & 1);
        CHECK(a && a->nlines == doc->nlines, "garbage round %d", round);
        size_t len;
        free(gc_doc_serialize(doc, round & 2, &len));
        gc_analysis_free(a);
        gc_json_free(m);
        gc_doc_free(doc);
        gc_buf_free(&b);
    }
}

int main(int argc, char **argv)
{
    const char *root = argc > 1 ? argv[1] : ".";
    test_numbers();
    test_json();
    test_tokenize();
    test_doc();
    gc_data *data = load(root);
    CHECK(data != NULL, "load data from %s", root);
    if (data) {
        test_machine_overrides(data);
        test_api(data);
        test_garbage(data);
        char err[200];
        CHECK(!gc_data_add_library(data, "{}", 2, "shop", err, sizeof err) && err[0], "a library file needs program and args");
    }
    gc_data_free(data);
    return t_summary("test_core");
}
