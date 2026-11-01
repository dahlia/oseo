/* eslint-disable no-useless-concat -- Wrap pinned text without changing it. */
// Derived from Test262; BSD license in completion-record-cases.LICENSE.

/** One literal eval call site in a pinned original source. */
export interface HostScriptTraincSite {
  /** UTF-16 offset of the call expression in the original file. */
  readonly start: number;
  /** Exact original call expression text. */
  readonly call: string;
  /** Cooked value of the call's string literal argument. */
  readonly source: string;
  /** Indirect calls always evaluate sloppy global code. */
  readonly indirect: boolean;
  /**
   * Expected completion as caller-side expression text, or `null` when the
   * original requires an early SyntaxError before evaluation.
   */
  readonly expected: string | null;
  /** Whether an original assertion consumes the completion or error. */
  readonly consumed: boolean;
  /** Mutated completion an original consumer must reject. */
  readonly mutant: string;
  /** Additional caller-side condition that must hold after the error. */
  readonly after?: string;
  /** One literal eval call inside this site's source, replaced in place. */
  readonly nested?: { readonly call: string; readonly source: string };
}

/** A pinned original file and the strictness variants test262 runs. */
export interface HostScriptTraincCase {
  readonly path: string;
  readonly sourceDigest: string;
  readonly family: string;
  readonly variants: readonly ("sloppy" | "strict")[];
  readonly sites: readonly HostScriptTraincSite[];
}

/** All 98 train C subjects in selector order. */
export const hostScriptTraincCases: readonly HostScriptTraincCase[] = [
  {
    path: "test/language/statements/for/S12.6.3_A5.js",
    sourceDigest:
      "faa76aeb8f0c2a10f7d95f52527fc5be18e18e306d8dd9f2905019c8828ca146",
    family: "eval-syntax-errors",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 540,
        call: 'eval("i in arr")',
        source: "i in arr",
        indirect: false,
        expected: "true",
        consumed: false,
        mutant: '"mutant"',
      },
      {
        start: 879,
        call: 'eval("var i = 1 in arr")',
        source: "var i = 1 in arr",
        indirect: false,
        expected: "undefined",
        consumed: false,
        mutant: '"mutant"',
      },
      {
        start: 1234,
        call: 'eval("1 in arr")',
        source: "1 in arr",
        indirect: false,
        expected: "true",
        consumed: false,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/for/cptn-decl-expr-iter.js",
    sourceDigest:
      "77db8e690209fb72a87b3515799dd1becec7d0e8764c54b1ce45e95e9601baf9",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 994,
        call: "eval('1; for (var runA = true; runA; runA = false) { }')",
        source: "1; for (var runA = true; runA; runA = false) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1085,
        call:
          "eval('2; for (var runB = true; runB; runB = false) { 3; }'" + ")",
        source: "2; for (var runB = true; runB; runB = false) { 3; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/for/cptn-decl-expr-no-iter.js",
    sourceDigest:
      "7b321b02480ab43368ed909d85558855f2537086303a1ab935e67ef2f6189f2d",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 994,
        call: "eval('1; for (var run = false; run; ) { }')",
        source: "1; for (var run = false; run; ) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1068,
        call: "eval('2; for (var run = false; run; ) { 3; }')",
        source: "2; for (var run = false; run; ) { 3; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/for/cptn-expr-expr-iter.js",
    sourceDigest:
      "c6e07e6143f6c3dfcc6bce436e065b33e80b6cf0d4e5006aeb441064cd557f75",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1086,
        call:
          "eval('var runA; 1; for (runA = true; runA; runA = false) {" + " }')",
        source: "var runA; 1; for (runA = true; runA; runA = false) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1183,
        call:
          "eval('var runB; 2; for (runB = true; runB; runB = false) {" +
          " 3; }')",
        source: "var runB; 2; for (runB = true; runB; runB = false) { 3; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/for/cptn-expr-expr-no-iter.js",
    sourceDigest:
      "f08275b2d80ee46a834f406206052c240fff437b2cd692a2a24b8ed6bdeab273",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1082,
        call: "eval('1; for ( ; false; ) { }')",
        source: "1; for ( ; false; ) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1144,
        call: "eval('2; for ( ; false; ) { 3; }')",
        source: "2; for ( ; false; ) { 3; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/for/head-init-expr-check-empty-in" +
      "c-empty-completion.js",
    sourceDigest:
      "a02585fe16e2717fb6c72261a4ba04d5255239470e6923b0b6dc2ee55acbaef0",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 350,
        call:
          'eval("for(count=0;;) {if (count===supreme)break;else count' +
          '++; }")',
        source: "for(count=0;;) {if (count===supreme)break;else count++; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/for/head-init-var-check-empty-inc" +
      "-empty-completion.js",
    sourceDigest:
      "f00675d5b4e46d9b3207d044f5d891ba8e4648c6de5f87d9c644da51509a2a7d",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 335,
        call:
          'eval("for(var count=0;;) {if (count===supreme)break;else c' +
          'ount++; }")',
        source:
          "for(var count=0;;) {if (count===supreme)break;else count++" + "; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/function/13.0-15-s.js",
    sourceDigest:
      "3ea1298dc124cefaa4a87f0af9accf235898c65b50c977756232fe69be2b99f7",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 494,
        call:
          "eval(\"'use strict'; function _13_0_15_fun() {eval = 42;};\"" + ")",
        source: "'use strict'; function _13_0_15_fun() {eval = 42;};",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.0-16-s.js",
    sourceDigest:
      "15cfbe4e5787a88ffa718272750131bd4bbd376de08a4e8ac70bcc05d63ca351",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 494,
        call:
          "eval(\"'use strict'; var _13_0_16_fun = function () {eval =" +
          ' 42;};")',
        source: "'use strict'; var _13_0_16_fun = function () {eval = 42;};",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.0-7-s.js",
    sourceDigest:
      "ac40f0eb96bee3db447f1339efaa8ef49676273497a5945322e4cf56ec0fa887",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 548,
        call: "eval(\"'use strict'; function _13_0_7_fun() {eval = 42;};\")",
        source: "'use strict'; function _13_0_7_fun() {eval = 42;};",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.0-8-s.js",
    sourceDigest:
      "9b0353ac114da451af1020c8dc2215192b1b6c7ae5125aa0a4e18eefe0cdf78d",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 549,
        call: 'eval("var _13_0_8_fun = function () {eval = 42;};")',
        source: "var _13_0_8_fun = function () {eval = 42;};",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-19-s.js",
    sourceDigest:
      "4a27224d4137c61c73d0dd8bcfe753e5ce7bba3df2288218ec36b88316ab8934",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 620,
        call: "eval(\"'use strict';function _13_1_19_fun(arguments) { }\")",
        source: "'use strict';function _13_1_19_fun(arguments) { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-2-s.js",
    sourceDigest:
      "6d32b4a302b179f86c409af95e2ce0adb8cc723fb974643d5ff30414845db38e",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 594,
        call: 'eval("var _13_1_2_fun = function (eval) { }")',
        source: "var _13_1_2_fun = function (eval) { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-21-s.js",
    sourceDigest:
      "c0eb9b2b448814a29c49651e1842c929b0e04ba7a9c26da9e0772f1da714a8eb",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 618,
        call:
          "eval(\"'use strict'; var _13_1_21_fun = function (arguments" +
          ') { }")',
        source: "'use strict'; var _13_1_21_fun = function (arguments) { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-22-s.js",
    sourceDigest:
      "73511f19185e09c99170decf5b25bfd501bc6af359f23891fafefe6ad9c6ed0a",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 630,
        call:
          "eval(\"var _13_1_22_fun = function (arguments) { 'use stric" +
          "t'; }\")",
        source: "var _13_1_22_fun = function (arguments) { 'use strict'; }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-23-s.js",
    sourceDigest:
      "b329a040b6783fd598ab3f351f8fa4cdac2c8fc996d01a7440cdbfd703078951",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 617,
        call:
          "eval(\"'use strict'; function _13_1_23_fun(param, param) { " + '}")',
        source: "'use strict'; function _13_1_23_fun(param, param) { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-25-s.js",
    sourceDigest:
      "0abe93fdcc1251a68dd245339cc020b0db32e129d6435e33223ff641461912a9",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 668,
        call:
          "eval(\"'use strict'; function _13_1_25_fun(param1, param2, " +
          'param1) { }")',
        source:
          "'use strict'; function _13_1_25_fun(param1, param2, param1" +
          ") { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-27-s.js",
    sourceDigest:
      "b39074d5f56f0b632d640dec19f4b44909283087d7ec48ad734e54103a268c3c",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 619,
        call:
          "eval(\"'use strict'; function _13_1_27_fun(param, param, pa" +
          'ram) { }")',
        source:
          "'use strict'; function _13_1_27_fun(param, param, param) {" + " }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-29-s.js",
    sourceDigest:
      "0f638ad173b59188687d8aeabbb1b626d10b0d8f24ca7b1d70c3ae6a2b690708",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 616,
        call:
          "eval(\"'use strict'; var _13_1_29_fun = function (param, pa" +
          'ram) { };")',
        source:
          "'use strict'; var _13_1_29_fun = function (param, param) {" + " };",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-31-s.js",
    sourceDigest:
      "8764c588ae11b34188d0b1b73f64a24c34468d5d445b7ff107fdbc95d876957b",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 668,
        call:
          "eval(\"'use strict'; var _13_1_31_fun = function (param1, p" +
          'aram2, param1) { };")',
        source:
          "'use strict'; var _13_1_31_fun = function (param1, param2," +
          " param1) { };",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-33-s.js",
    sourceDigest:
      "3a69353d6cf5d732a5d4ad6b4ce511be4a2e822ea96cf1b8bc51ee55cb7288a8",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 616,
        call:
          "eval(\"'use strict'; var _13_1_33_fun = function (param, pa" +
          'ram, param) { };")',
        source:
          "'use strict'; var _13_1_33_fun = function (param, param, p" +
          "aram) { };",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-39-s.js",
    sourceDigest:
      "b10fcf6a44cee627b3e372642d35b1091d080a9673c47623a4869d9200960aa5",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 375,
        call: "eval(\"'use strict'; function arguments() { };\")",
        source: "'use strict'; function arguments() { };",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-4-s.js",
    sourceDigest:
      "176f27bacdd9c0a0f1345103017729c31e4f74bb54f08184bebb84bc71fbb82b",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 599,
        call: 'eval("var _13_1_4_fun = function (arguments) { };")',
        source: "var _13_1_4_fun = function (arguments) { };",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/13.1-41-s.js",
    sourceDigest:
      "541858e41aafcfcfd030b1edc88bd7111bb04b165adb2e66a7efc893775a54ad",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 392,
        call:
          "eval(\"'use strict'; _13_1_41_s.x = function arguments() {}" + ';")',
        source: "'use strict'; _13_1_41_s.x = function arguments() {};",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
        after: '!("x" in _13_1_41_s)',
      },
    ],
  },
  {
    path: "test/language/statements/function/S13_A14_T1.js",
    sourceDigest:
      "93ae7163dd61235ebfb0b4a2d5a81c1fe6016287d529b54617f7fe5eaf93ef88",
    family: "eval-binding-instantiation",
    variants: ["sloppy"],
    sites: [
      {
        start: 286,
        call: 'eval("function __func\\u0041(__arg){return __arg;};")',
        source: "function __funcA(__arg){return __arg;};",
        indirect: false,
        expected: "undefined",
        consumed: false,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/function/cptn-decl.js",
    sourceDigest:
      "ff0d259f3f660195c10959162e89a3f6b645b6d417fae63c53ddae32014cb7d5",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 415,
        call: "eval('function f() {}')",
        source: "function f() {}",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 469,
        call: "eval('1; function f() {}')",
        source: "1; function f() {}",
        indirect: false,
        expected: "1",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/function/name-eval-stricteval.js",
    sourceDigest:
      "0902f26c7a861f5d38479c76ba25a90a0fc3496bf876469e49f25610cfcc85df",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 378,
        call: "eval(\"'use strict'; function eval() { };\")",
        source: "'use strict'; function eval() { };",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/function/name-unicode.js",
    sourceDigest:
      "bdec3ae69b749abfa534cb3ed74bebb506070b79faaf256780101e1e41d26fd1",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 280,
        call:
          'eval("function __func\\u0041(__arg){return __arg;}; __funcA' + '")',
        source: "function __funcA(__arg){return __arg;}; __funcA",
        indirect: false,
        expected: "__funcA",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/function/param-eval-stricteval.js",
    sourceDigest:
      "0e95a8be5c37bea521ddc5f4b3eb64574e9459bd9ad0214926fd0968589b4163",
    family: "eval-syntax-errors",
    variants: ["sloppy"],
    sites: [
      {
        start: 623,
        call: "eval(\"'use strict';function _13_1_15_fun(eval) { }\")",
        source: "'use strict';function _13_1_15_fun(eval) { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/generators/cptn-decl.js",
    sourceDigest:
      "6c839dd2d3636db554aa95971aee0fcd8893ccd1aa53e11a92b6b1f8e3f059f5",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 554,
        call: "eval('function* f() {}')",
        source: "function* f() {}",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 609,
        call: "eval('1; function* f() {}')",
        source: "1; function* f() {}",
        indirect: false,
        expected: "1",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/S12.5_A2.js",
    sourceDigest:
      "e6de405072a409c00b7cf1e50ce69b84b219272c28897eef5d6b7abd66d0d9ec",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 275,
        call: 'eval("true")',
        source: "true",
        indirect: false,
        expected: "true",
        consumed: true,
        mutant: "false",
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-else-false-abrupt-empty.j" + "s",
    sourceDigest:
      "0e743c571551a14c432f8c2f5eb972c412aee8a037b148a4d890854c6a1f37dc",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 629,
        call:
          "eval('1; do { if (false) { } else { break; } } while (fals" + "e)')",
        source: "1; do { if (false) { } else { break; } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 726,
        call:
          "eval('2; do { 3; if (false) { } else { break; } } while (f" +
          "alse)')",
        source: "2; do { 3; if (false) { } else { break; } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 826,
        call:
          "eval('4; do { if (false) { 5; } else { break; } } while (f" +
          "alse)')",
        source: "4; do { if (false) { 5; } else { break; } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 926,
        call:
          "eval('6; do { 7; if (false) { 8; } else { break; } } while" +
          " (false)')",
        source:
          "6; do { 7; if (false) { 8; } else { break; } } while (fals" + "e)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1032,
        call:
          "eval('9; do { if (false) { } else { continue; } } while (f" +
          "alse)')",
        source: "9; do { if (false) { } else { continue; } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1132,
        call:
          "eval('10; do { 11; if (false) { } else { continue; } } whi" +
          "le (false)')",
        source:
          "10; do { 11; if (false) { } else { continue; } } while (fa" + "lse)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1239,
        call:
          "eval('12; do { if (false) { 13; } else { continue; } } whi" +
          "le (false)')",
        source:
          "12; do { if (false) { 13; } else { continue; } } while (fa" + "lse)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1346,
        call:
          "eval('14; do { 15; if (false) { 16; } else { continue; } }" +
          " while (false)')",
        source:
          "14; do { 15; if (false) { 16; } else { continue; } } while" +
          " (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-else-false-nrml.js",
    sourceDigest:
      "ec6e1d20257f662a0674d576ee440e7ea761986945010084bac97faffcc2a7a4",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 669,
        call: "eval('1; if (false) { } else { }')",
        source: "1; if (false) { } else { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 734,
        call: "eval('2; if (false) { } else { 3; }')",
        source: "2; if (false) { } else { 3; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 794,
        call: "eval('4; if (false) { 5; } else { }')",
        source: "4; if (false) { 5; } else { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 862,
        call: "eval('6; if (false) { 7; } else { 8; }')",
        source: "6; if (false) { 7; } else { 8; }",
        indirect: false,
        expected: "8",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-else-true-abrupt-empty.js",
    sourceDigest:
      "9b3ee87b1b06e94333e2e6251d595e3534e1bc9728bdb83579bb08f390cf513d",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 621,
        call:
          "eval('1; do { if (true) { break; } else { } } while (false" + ")')",
        source: "1; do { if (true) { break; } else { } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 717,
        call:
          "eval('2; do { 3; if (true) { break; } else { } } while (fa" +
          "lse)')",
        source: "2; do { 3; if (true) { break; } else { } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 816,
        call:
          "eval('4; do { if (true) { break; } else { 5; } } while (fa" +
          "lse)')",
        source: "4; do { if (true) { break; } else { 5; } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 915,
        call:
          "eval('6; do { 7; if (true) { break; } else { 8; } } while " +
          "(false)')",
        source:
          "6; do { 7; if (true) { break; } else { 8; } } while (false" + ")",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1020,
        call:
          "eval('1; do { if (true) { continue; } else { } } while (fa" +
          "lse)')",
        source: "1; do { if (true) { continue; } else { } } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1119,
        call:
          "eval('2; do { 3; if (true) { continue; } else { } } while " +
          "(false)')",
        source:
          "2; do { 3; if (true) { continue; } else { } } while (false" + ")",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1221,
        call:
          "eval('4; do { if (true) { continue; } else { 5; } } while " +
          "(false)')",
        source:
          "4; do { if (true) { continue; } else { 5; } } while (false" + ")",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1323,
        call:
          "eval('6; do { 7; if (true) { continue; } else { 8; } } whi" +
          "le (false)')",
        source:
          "6; do { 7; if (true) { continue; } else { 8; } } while (fa" + "lse)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-else-true-nrml.js",
    sourceDigest:
      "240a23b9a9fde3972e093d1aeb21b07d4128da031efbaa6c2408749be7913edc",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 667,
        call: "eval('1; if (true) { } else { }')",
        source: "1; if (true) { } else { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 731,
        call: "eval('2; if (true) { 3; } else { }')",
        source: "2; if (true) { 3; } else { }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 790,
        call: "eval('4; if (true) { } else { 5; }')",
        source: "4; if (true) { } else { 5; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 857,
        call: "eval('6; if (true) { 7; } else { 8; }')",
        source: "6; if (true) { 7; } else { 8; }",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-empty-statement.js",
    sourceDigest:
      "db78241edb665bef78107ba1e46bbd4513d1cbaa10ff05a6baf6b0ee4007b1f2",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 330,
        call: 'eval("if(1);")',
        source: "if(1);",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-no-else-false.js",
    sourceDigest:
      "c3c89d3d4c4b580dfed50a6d2ab201cf320730fdedc88329c88988f4d8e6a085",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 408,
        call: "eval('1; if (false) { }')",
        source: "1; if (false) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 464,
        call: "eval('2; if (false) { 3; }')",
        source: "2; if (false) { 3; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-no-else-true-abrupt-empty" + ".js",
    sourceDigest:
      "94b2a18de6f1eb40756f612a6e2940fc4d4981c5a4ca261f5ac034e8e3714c44",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 609,
        call:
          "eval('1; do { 2; if (true) { 3; break; } 4; } while (false" + ")')",
        source: "1; do { 2; if (true) { 3; break; } 4; } while (false)",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 697,
        call: "eval('5; do { 6; if (true) { break; } 7; } while (false)')",
        source: "5; do { 6; if (true) { break; } 7; } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 791,
        call:
          "eval('8; do { 9; if (true) { 10; continue; } 11; } while (" +
          "false)')",
        source: "8; do { 9; if (true) { 10; continue; } 11; } while (false)",
        indirect: false,
        expected: "10",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 885,
        call:
          "eval('12; do { 13; if (true) { continue; } 14; } while (fa" +
          "lse)')",
        source: "12; do { 13; if (true) { continue; } 14; } while (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/if/cptn-no-else-true-nrml.js",
    sourceDigest:
      "2dd098d9167f12a535293c7deb5ee208e6289ea1b054228e1bdf23f1f5b0fd14",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 666,
        call: "eval('1; if (true) { }')",
        source: "1; if (true) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 721,
        call: "eval('2; if (true) { 3; }')",
        source: "2; if (true) { 3; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/labeled/cptn-break.js",
    sourceDigest:
      "cb08236a1a8f862802cb2dac13895705d35a72b6705fa83530d8f8626c01076f",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 742,
        call: "eval('test262id: { 5; break test262id; 9; }')",
        source: "test262id: { 5; break test262id; 9; }",
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/labeled/cptn-nrml.js",
    sourceDigest:
      "ea13f4c384ab874d7808ada7fc88d967afe3a726092b2dc8cc05cc1a210bc3d7",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 711,
        call: "eval('test262id: 2;')",
        source: "test262id: 2;",
        indirect: false,
        expected: "2",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/let/cptn-value.js",
    sourceDigest:
      "3fc487e463d52bae33bc089ceb8395d656cec56f443aa55904155a4b390d3c7d",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 470,
        call: "eval('let test262id1;')",
        source: "let test262id1;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 570,
        call: "eval('let test262id2 = 2;')",
        source: "let test262id2 = 2;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 678,
        call: "eval('let test262id3 = 3, test262id4;')",
        source: "let test262id3 = 3, test262id4;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 808,
        call: "eval('let test262id5, test262id6 = 6;')",
        source: "let test262id5, test262id6 = 6;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 936,
        call: "eval('7; let test262id8;')",
        source: "7; let test262id8;",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 985,
        call: "eval('9; let test262id10 = 10;')",
        source: "9; let test262id10 = 10;",
        indirect: false,
        expected: "9",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1040,
        call: "eval('11; let test262id12 = 12, test262id13;')",
        source: "11; let test262id12 = 12, test262id13;",
        indirect: false,
        expected: "11",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1110,
        call: "eval('14; let test262id15, test262id16 = 16;')",
        source: "14; let test262id15, test262id16 = 16;",
        indirect: false,
        expected: "14",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-a-abrupt-empty.js",
    sourceDigest:
      "78c1f80d342d532028124bb1b6003d5871ef968d814ea63628c205fca2bafd63",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1737,
        call: 'eval(\'1; switch ("a") { case "a": break; default: }\')',
        source: '1; switch ("a") { case "a": break; default: }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1825,
        call:
          'eval(\'2; switch ("a") { case "a": { 3; break; } default: }' + "')",
        source: '2; switch ("a") { case "a": { 3; break; } default: }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1913,
        call:
          'eval(\'4; do { switch ("a") { case "a": continue; default: ' +
          "} } while (false)')",
        source:
          '4; do { switch ("a") { case "a": continue; default: } } wh' +
          "ile (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2027,
        call:
          'eval(\'5; do { switch ("a") { case "a": { 6; continue; } de' +
          "fault: } } while (false)')",
        source:
          '5; do { switch ("a") { case "a": { 6; continue; } default:' +
          " } } while (false)",
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/switch/cptn-a-fall-thru-abrupt-em" + "pty.js",
    sourceDigest:
      "8a6602a78eafa7708586ec2f17ae821866b2d438118191a8e8e00ccfa1091884",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1245,
        call:
          'eval(\'1; switch ("a") { case "a": 2; case "b": 3; break;' +
          " default: }')",
        source:
          '1; switch ("a") { case "a": 2; case "b": 3; break; defau' + "lt: }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1398,
        call:
          'eval(\'4; switch ("a") { case "a": case "b": 5; break; de' +
          "fault: }')",
        source:
          '4; switch ("a") { case "a": case "b": 5; break; default:' + " }",
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1535,
        call:
          'eval(\'6; switch ("a") { case "a": 7; case "b": break; de' +
          "fault: }')",
        source:
          '6; switch ("a") { case "a": 7; case "b": break; default:' + " }",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1690,
        call:
          'eval(\'8; do { switch ("a") { case "a": 9; case "b": 10; ' +
          "continue; default: } } while (false)')",
        source:
          '8; do { switch ("a") { case "a": 9; case "b": 10; contin' +
          "ue; default: } } while (false)",
        indirect: false,
        expected: "10",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1869,
        call:
          'eval(\'11; do { switch ("a") { case "a": case "b": 12; co' +
          "ntinue; default: } } while (false)')",
        source:
          '11; do { switch ("a") { case "a": case "b": 12; continue' +
          "; default: } } while (false)",
        indirect: false,
        expected: "12",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2033,
        call:
          'eval(\'13; do { switch ("a") { case "a": 14; case "b": co' +
          "ntinue; default: } } while (false)')",
        source:
          '13; do { switch ("a") { case "a": 14; case "b": continue' +
          "; default: } } while (false)",
        indirect: false,
        expected: "14",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-a-fall-thru-nrml.js",
    sourceDigest:
      "9cfa3975cdfcc75341ecf7dfd9f63ea5ac6256e726a5d1927063b0e0a494c7de",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2044,
        call: 'eval(\'1; switch ("a") { case "a": 2; default: 3; }\')',
        source: '1; switch ("a") { case "a": 2; default: 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2180,
        call: 'eval(\'4; switch ("a") { case "a": default: 5; }\')',
        source: '4; switch ("a") { case "a": default: 5; }',
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2300,
        call: 'eval(\'6; switch ("a") { case "a": 7; default: }\')',
        source: '6; switch ("a") { case "a": 7; default: }',
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-abrupt-empty.js",
    sourceDigest:
      "c54a1c8216c82b443fa55ffc25bdac7728fac1e5ebae5bba9b00d39ce68ff30c",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 635,
        call: "eval('1; switch(null) {}')",
        source: "1; switch(null) {}",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-b-abrupt-empty.js",
    sourceDigest:
      "3922983d17b5ff1165d711440796cfc93873e6c2f495a03b1791c71c21aafbbf",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2100,
        call: 'eval(\'1; switch ("a") { default: case "a": break; }\')',
        source: '1; switch ("a") { default: case "a": break; }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2188,
        call:
          'eval(\'2; switch ("a") { default: case "a": { 3; break; } }' + "')",
        source: '2; switch ("a") { default: case "a": { 3; break; } }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2276,
        call:
          'eval(\'4; do { switch ("a") { default: case "a": continue; ' +
          "} } while (false)')",
        source:
          '4; do { switch ("a") { default: case "a": continue; } } wh' +
          "ile (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2390,
        call:
          'eval(\'5; do { switch ("a") { default: case "a": { 6; conti' +
          "nue; } } } while (false)')",
        source:
          '5; do { switch ("a") { default: case "a": { 6; continue; }' +
          " } } while (false)",
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/switch/cptn-b-fall-thru-abrupt-em" + "pty.js",
    sourceDigest:
      "a8b30b7ce9016ed2613ef7ab374d1a97cf059c8280dc4e130cf95bad669c7225",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2125,
        call:
          'eval(\'1; switch ("a") { default: case "a": 2; case "b": ' +
          "3; break; }')",
        source:
          '1; switch ("a") { default: case "a": 2; case "b": 3; bre' + "ak; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2278,
        call:
          'eval(\'4; switch ("a") { default: case "a": case "b": 5; ' +
          "break; }')",
        source:
          '4; switch ("a") { default: case "a": case "b": 5; break;' + " }",
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2415,
        call:
          'eval(\'6; switch ("a") { default: case "a": 7; case "b": ' +
          "break; }')",
        source:
          '6; switch ("a") { default: case "a": 7; case "b": break;' + " }",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2570,
        call:
          'eval(\'8; do { switch ("a") { default: case "a": 9; case "' +
          "b\": 10; continue; } } while (false)')",
        source:
          '8; do { switch ("a") { default: case "a": 9; case "b": 1' +
          "0; continue; } } while (false)",
        indirect: false,
        expected: "10",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2749,
        call:
          'eval(\'11; do { switch ("a") { default: case "a": case "b' +
          "\": 12; continue; } } while (false)')",
        source:
          '11; do { switch ("a") { default: case "a": case "b": 12;' +
          " continue; } } while (false)",
        indirect: false,
        expected: "12",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2913,
        call:
          'eval(\'13; do { switch ("a") { default: case "a": 14; case ' +
          '"b": continue; } } while (false)\')',
        source:
          '13; do { switch ("a") { default: case "a": 14; case "b":' +
          " continue; } } while (false)",
        indirect: false,
        expected: "14",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-b-fall-thru-nrml.js",
    sourceDigest:
      "b2cef9314506e72e1c3c4282d08eabc5937adb060b84e0feca4a194f9dc1a114",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2174,
        call:
          'eval(\'1; switch ("a") { default: case "a": 2; case "b": ' +
          "3; }')",
        source: '1; switch ("a") { default: case "a": 2; case "b": 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2320,
        call:
          'eval(\'4; switch ("a") { default: case "a": case "b": 5; ' + "}')",
        source: '4; switch ("a") { default: case "a": case "b": 5; }',
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2450,
        call:
          'eval(\'6; switch ("a") { default: case "a": 7; case "b": ' + "}')",
        source: '6; switch ("a") { default: case "a": 7; case "b": }',
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-b-final.js",
    sourceDigest:
      "c031281770ad695b4d466cad98816d49a7a99ed22a45c5e2aa4a25b853730f65",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2078,
        call: 'eval(\'1; switch ("a") { default: case "a": }\')',
        source: '1; switch ("a") { default: case "a": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2198,
        call: 'eval(\'2; switch ("a") { default: case "a": 3; }\')',
        source: '2; switch ("a") { default: case "a": 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2316,
        call: 'eval(\'4; switch ("b") { default: case "a": case "b": }\')',
        source: '4; switch ("b") { default: case "a": case "b": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2460,
        call:
          'eval(\'5; switch ("b") { default: case "a": case "b": 6; ' + "}')",
        source: '5; switch ("b") { default: case "a": case "b": 6; }',
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2603,
        call:
          'eval(\'7; switch ("b") { default: case "a": 8; case "b": ' + "}')",
        source: '7; switch ("b") { default: case "a": 8; case "b": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2753,
        call:
          'eval(\'9; switch ("b") { default: case "a": 10; case "b":' +
          " 11; }')",
        source: '9; switch ("b") { default: case "a": 10; case "b": 11; }',
        indirect: false,
        expected: "11",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-dflt-abrupt-empty.js",
    sourceDigest:
      "5b59bc29c8a63bc2222cf5522ea3f5db34018777aff70b4270f45945fe64f82f",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1425,
        call: "eval('1; switch (\"a\") { default: break; }')",
        source: '1; switch ("a") { default: break; }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1499,
        call: "eval('2; switch (\"a\") { default: { 3; break; } }')",
        source: '2; switch ("a") { default: { 3; break; } }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1576,
        call:
          'eval(\'4; do { switch ("a") { default: { continue; } } } wh' +
          "ile (false)')",
        source:
          '4; do { switch ("a") { default: { continue; } } } while (f' +
          "alse)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1684,
        call:
          'eval(\'5; do { switch ("a") { default: { 6; continue; } } }' +
          " while (false)')",
        source:
          '5; do { switch ("a") { default: { 6; continue; } } } while' +
          " (false)",
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-dflt-b-abrupt-empty.j" + "s",
    sourceDigest:
      "7f9af37e1e6e5c4c36780c17a133fe208057a7e2c5fe681bd2424f1239e34a1a",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2131,
        call: 'eval(\'1; switch ("a") { default: case "b": break; }\')',
        source: '1; switch ("a") { default: case "b": break; }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2219,
        call:
          'eval(\'2; switch ("a") { default: case "b": { 3; break; } }' + "')",
        source: '2; switch ("a") { default: case "b": { 3; break; } }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2307,
        call:
          'eval(\'4; do { switch ("a") { default: case "b": continue; ' +
          "} } while (false)')",
        source:
          '4; do { switch ("a") { default: case "b": continue; } } wh' +
          "ile (false)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2421,
        call:
          'eval(\'5; do { switch ("a") { default: case "b": { 6; conti' +
          "nue; } } } while (false)')",
        source:
          '5; do { switch ("a") { default: case "b": { 6; continue; }' +
          " } } while (false)",
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/switch/cptn-dflt-b-fall-thru-abru" +
      "pt-empty.js",
    sourceDigest:
      "2e580abe7f21779c0f15ecdad133a517347704136f2561115649677530522f32",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2156,
        call:
          'eval(\'1; switch ("a") { default: case "b": 2; case "c": ' +
          "3; break; }')",
        source:
          '1; switch ("a") { default: case "b": 2; case "c": 3; bre' + "ak; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2309,
        call:
          'eval(\'4; switch ("a") { default: case "b": case "c": 5; ' +
          "break; }')",
        source:
          '4; switch ("a") { default: case "b": case "c": 5; break;' + " }",
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2446,
        call:
          'eval(\'6; switch ("a") { default: case "b": 7; case "c": ' +
          "break; }')",
        source:
          '6; switch ("a") { default: case "b": 7; case "c": break;' + " }",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2601,
        call:
          'eval(\'8; do { switch ("a") { default: case "b": 9; case "' +
          "c\": 10; continue; } } while (false)')",
        source:
          '8; do { switch ("a") { default: case "b": 9; case "c": 1' +
          "0; continue; } } while (false)",
        indirect: false,
        expected: "10",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2780,
        call:
          'eval(\'11; do { switch ("a") { default: case "b": case "c' +
          "\": 12; continue; } } while (false)')",
        source:
          '11; do { switch ("a") { default: case "b": case "c": 12;' +
          " continue; } } while (false)",
        indirect: false,
        expected: "12",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2944,
        call:
          'eval(\'13; do { switch ("a") { default: case "b": 14; case ' +
          '"c": continue; } } while (false)\')',
        source:
          '13; do { switch ("a") { default: case "b": 14; case "c":' +
          " continue; } } while (false)",
        indirect: false,
        expected: "14",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-dflt-b-fall-thru-nrml" + ".js",
    sourceDigest:
      "fa2d05b9cfbd2dcf101fcdc07da9a6f8b62e3ee97d9ead18b95da42b16ad9cbb",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2185,
        call:
          'eval(\'1; switch ("a") { default: case "b": 2; case "c": ' +
          "3; }')",
        source: '1; switch ("a") { default: case "b": 2; case "c": 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2331,
        call:
          'eval(\'4; switch ("a") { default: case "b": case "c": 5; ' + "}')",
        source: '4; switch ("a") { default: case "b": case "c": 5; }',
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2461,
        call:
          'eval(\'6; switch ("a") { default: case "b": 7; case "c": ' + "}')",
        source: '6; switch ("a") { default: case "b": 7; case "c": }',
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-dflt-b-final.js",
    sourceDigest:
      "ec6b6e27ed2e877e5c891e9ce4a4ffe1602f6e9112df61536fc9b3739290fc50",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 2089,
        call: 'eval(\'1; switch ("a") { default: case "b": }\')',
        source: '1; switch ("a") { default: case "b": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2209,
        call: 'eval(\'2; switch ("a") { default: case "b": 3; }\')',
        source: '2; switch ("a") { default: case "b": 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2327,
        call: 'eval(\'4; switch ("a") { default: case "b": case "c": }\')',
        source: '4; switch ("a") { default: case "b": case "c": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2471,
        call:
          'eval(\'5; switch ("a") { default: case "b": case "c": 6; ' + "}')",
        source: '5; switch ("a") { default: case "b": case "c": 6; }',
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2614,
        call:
          'eval(\'7; switch ("a") { default: case "b": 8; case "c": ' + "}')",
        source: '7; switch ("a") { default: case "b": 8; case "c": }',
        indirect: false,
        expected: "8",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2756,
        call:
          'eval(\'9; switch ("a") { default: case "b": 10; case "c":' +
          " 11; }')",
        source: '9; switch ("a") { default: case "b": 10; case "c": 11; }',
        indirect: false,
        expected: "11",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/switch/cptn-dflt-fall-thru-abrupt" +
      "-empty.js",
    sourceDigest:
      "2140489f5ea665bdd9402eaa4edd1550188b22dea585ed1cfb2a0a5405f22815",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1474,
        call:
          'eval(\'1; switch ("a") { case "a": 2; default: 3; break; }\'' + ")",
        source: '1; switch ("a") { case "a": 2; default: 3; break; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1617,
        call: 'eval(\'4; switch ("a") { case "a": default: 5; break; }\')',
        source: '4; switch ("a") { case "a": default: 5; break; }',
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1744,
        call: 'eval(\'6; switch ("a") { case "a": 7; default: break; }\')',
        source: '6; switch ("a") { case "a": 7; default: break; }',
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1889,
        call:
          'eval(\'8; do { switch ("a") { case "a": 9; default: 10; con' +
          "tinue; } } while (false)')",
        source:
          '8; do { switch ("a") { case "a": 9; default: 10; continue;' +
          " } } while (false)",
        indirect: false,
        expected: "10",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2058,
        call:
          'eval(\'11; do { switch ("a") { case "a": default: 12; conti' +
          "nue; } } while (false)')",
        source:
          '11; do { switch ("a") { case "a": default: 12; continue; }' +
          " } while (false)",
        indirect: false,
        expected: "12",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2212,
        call:
          'eval(\'13; do { switch ("a") { case "a": 14; default: conti' +
          "nue; } } while (false)')",
        source:
          '13; do { switch ("a") { case "a": 14; default: continue; }' +
          " } while (false)",
        indirect: false,
        expected: "14",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-dflt-fall-thru-nrml.j" + "s",
    sourceDigest:
      "022c7b42e7262e41c380a87da460de9083611da9853a9caa9272d730c665a375",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1635,
        call: 'eval(\'1; switch ("a") { case "a": 2; default: 3; }\')',
        source: '1; switch ("a") { case "a": 2; default: 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1771,
        call: 'eval(\'4; switch ("a") { case "a": default: 5; }\')',
        source: '4; switch ("a") { case "a": default: 5; }',
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1891,
        call: 'eval(\'6; switch ("a") { case "a": 7; default: }\')',
        source: '6; switch ("a") { case "a": 7; default: }',
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-dflt-final.js",
    sourceDigest:
      "58b6c4c407d2e78efb9127998a3dc8e815857f0e370ba496d06cb8c127158d8a",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1380,
        call: "eval('1; switch (\"a\") { default: }')",
        source: '1; switch ("a") { default: }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1490,
        call: "eval('2; switch (\"a\") { default: 3; }')",
        source: '2; switch ("a") { default: 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1598,
        call: 'eval(\'4; switch ("b") { case "a": default: }\')',
        source: '4; switch ("b") { case "a": default: }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1732,
        call: 'eval(\'5; switch ("b") { case "a": default: 6; }\')',
        source: '5; switch ("b") { case "a": default: 6; }',
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1865,
        call: 'eval(\'7; switch ("b") { case "a": 8; default: }\')',
        source: '7; switch ("b") { case "a": 8; default: }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2005,
        call: 'eval(\'9; switch ("b") { case "a": 10; default: 11; }\')',
        source: '9; switch ("b") { case "a": 10; default: 11; }',
        indirect: false,
        expected: "11",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/switch/cptn-no-dflt-match-abrupt-" + "empty.js",
    sourceDigest:
      "0e9f332613b10bad29174f12cd2787017c8fcff70a75946e5704d78178c3302d",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1649,
        call: 'eval(\'1; switch ("a") { case "a": break; }\')',
        source: '1; switch ("a") { case "a": break; }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1724,
        call: 'eval(\'2; switch ("a") { case "a": { 3; break; } }\')',
        source: '2; switch ("a") { case "a": { 3; break; } }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1802,
        call:
          'eval(\'4; do { switch ("a") { case "a": continue; } } while' +
          " (false)')",
        source:
          '4; do { switch ("a") { case "a": continue; } } while (fals' + "e)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1907,
        call:
          'eval(\'5; do { switch ("a") { case "a": { 6; continue; } } ' +
          "} while (false)')",
        source:
          '5; do { switch ("a") { case "a": { 6; continue; } } } whil' +
          "e (false)",
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/switch/cptn-no-dflt-match-fall-th" +
      "ru-abrupt-empty.js",
    sourceDigest:
      "de552d163ff437124534488da95ac75abcd2ffccf2bbd58557ab7f7aaf858af0",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1154,
        call:
          'eval(\'1; switch ("a") { case "a": 2; case "b": 3; break;' + " }')",
        source: '1; switch ("a") { case "a": 2; case "b": 3; break; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1298,
        call:
          'eval(\'4; switch ("a") { case "a": case "b": 5; break; }\'' + ")",
        source: '4; switch ("a") { case "a": case "b": 5; break; }',
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1426,
        call:
          'eval(\'6; switch ("a") { case "a": 7; case "b": break; }\'' + ")",
        source: '6; switch ("a") { case "a": 7; case "b": break; }',
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1572,
        call:
          'eval(\'8; do { switch ("a") { case "a": 9; case "b": 10; ' +
          "continue; } } while (false)')",
        source:
          '8; do { switch ("a") { case "a": 9; case "b": 10; contin' +
          "ue; } } while (false)",
        indirect: false,
        expected: "10",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1742,
        call:
          'eval(\'11; do { switch ("a") { case "a": case "b": 12; co' +
          "ntinue; } } while (false)')",
        source:
          '11; do { switch ("a") { case "a": case "b": 12; continue' +
          "; } } while (false)",
        indirect: false,
        expected: "12",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1897,
        call:
          'eval(\'13; do { switch ("a") { case "a": 14; case "b": co' +
          "ntinue; } } while (false)')",
        source:
          '13; do { switch ("a") { case "a": 14; case "b": continue' +
          "; } } while (false)",
        indirect: false,
        expected: "14",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/switch/cptn-no-dflt-match-fall-th" +
      "ru-nrml.js",
    sourceDigest:
      "b69edb93c199a4b2e4b8dc56f735395d6b0fb99ddcd677c3e5384d82d648cf86",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1100,
        call: 'eval(\'1; switch ("a") { case "a": 2; case "b": 3; }\')',
        source: '1; switch ("a") { case "a": 2; case "b": 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1237,
        call: 'eval(\'4; switch ("a") { case "a": case "b": 5; }\')',
        source: '4; switch ("a") { case "a": case "b": 5; }',
        indirect: false,
        expected: "5",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1358,
        call: 'eval(\'6; switch ("a") { case "a": 7; case "b": }\')',
        source: '6; switch ("a") { case "a": 7; case "b": }',
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-no-dflt-match-final.j" + "s",
    sourceDigest:
      "54a41bc9e986b74324fdc6b250e94d2c0039460fb8e78bb1e8c2666dc0891365",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1640,
        call: 'eval(\'1; switch ("a") { case "a": }\')',
        source: '1; switch ("a") { case "a": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1751,
        call: 'eval(\'2; switch ("a") { case "a": 3; }\')',
        source: '2; switch ("a") { case "a": 3; }',
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1860,
        call: 'eval(\'4; switch ("b") { case "a": case "b": }\')',
        source: '4; switch ("b") { case "a": case "b": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1995,
        call: 'eval(\'5; switch ("b") { case "a": case "b": 6; }\')',
        source: '5; switch ("b") { case "a": case "b": 6; }',
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2129,
        call: 'eval(\'7; switch ("b") { case "a": 8; case "b": }\')',
        source: '7; switch ("b") { case "a": 8; case "b": }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2270,
        call: 'eval(\'9; switch ("b") { case "a": 10; case "b": 11; }\')',
        source: '9; switch ("b") { case "a": 10; case "b": 11; }',
        indirect: false,
        expected: "11",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/switch/cptn-no-dflt-no-match.js",
    sourceDigest:
      "e5fe4345003b20ad5a9ed928782d66cc559d356d768a0079f15955e16888b781",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1189,
        call: "eval('1; switch (\"a\") { case null: }')",
        source: '1; switch ("a") { case null: }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1285,
        call: "eval('2; switch (\"a\") { case null: 3; }')",
        source: '2; switch ("a") { case null: 3; }',
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/try/catch-parameter-boundnames-re" +
      "striction-arguments-eval-throws.js",
    sourceDigest:
      "d7881acae209ab8163a5a501ea2bbef9ea851c7212e6a6ffd0ba8876f587b15d",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 418,
        call: 'eval("try {} catch (arguments) { }")',
        source: "try {} catch (arguments) { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path:
      "test/language/statements/try/catch-parameter-boundnames-re" +
      "striction-eval-eval-throws.js",
    sourceDigest:
      "48a74b549d8a4308595ef3bb88084c64ae93b397b5967f17464e6c0d66469417",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 418,
        call: 'eval("try {} catch (eval) { }")',
        source: "try {} catch (eval) { }",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/try/completion-values.js",
    sourceDigest:
      "9ca9d0d7af85e5a300682c22ab258cf6339df9a2b0e537ea336dccdd1a64ae2a",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 632,
        call:
          "eval('99; do { -99; try { 39 } catch (e) { -1 } finally { " +
          "42; break; -2 }; } while (false);')",
        source:
          "99; do { -99; try { 39 } catch (e) { -1 } finally { 42; br" +
          "eak; -2 }; } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 755,
        call:
          "eval('99; do { -99; try { [].x.x } catch (e) { -1; } final" +
          "ly { 42; break; -3 }; } while (false);')",
        source:
          "99; do { -99; try { [].x.x } catch (e) { -1; } finally { 4" +
          "2; break; -3 }; } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 883,
        call:
          "eval('99; do { -99; try { 39 } catch (e) { -1 } finally { " +
          "break; -2 }; } while (false);')",
        source:
          "99; do { -99; try { 39 } catch (e) { -1 } finally { break;" +
          " -2 }; } while (false);",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1009,
        call:
          "eval('99; do { -99; try { [].x.x } catch (e) { -1; } final" +
          "ly { break; -3 }; } while (false);')",
        source:
          "99; do { -99; try { [].x.x } catch (e) { -1; } finally { b" +
          "reak; -3 }; } while (false);",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1140,
        call:
          "eval('99; do { -99; try { 39 } catch (e) { -1 } finally { " +
          "42; break; -3 }; -77 } while (false);')",
        source:
          "99; do { -99; try { 39 } catch (e) { -1 } finally { 42; br" +
          "eak; -3 }; -77 } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1267,
        call:
          "eval('99; do { -99; try { [].x.x } catch (e) { -1; } final" +
          "ly { 42; break; -3 }; -77 } while (false);')",
        source:
          "99; do { -99; try { [].x.x } catch (e) { -1; } finally { 4" +
          "2; break; -3 }; -77 } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1399,
        call:
          "eval('99; do { -99; try { 39 } catch (e) { -1 } finally { " +
          "break; -3 }; -77 } while (false);')",
        source:
          "99; do { -99; try { 39 } catch (e) { -1 } finally { break;" +
          " -3 }; -77 } while (false);",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1529,
        call:
          "eval('99; do { -99; try { [].x.x } catch (e) { -1; } final" +
          "ly { break; -3 }; -77 } while (false);')",
        source:
          "99; do { -99; try { [].x.x } catch (e) { -1; } finally { b" +
          "reak; -3 }; -77 } while (false);",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1664,
        call:
          "eval('99; do { -99; try { 39 } catch (e) { -1 } finally { " +
          "42; continue; -3 }; } while (false);')",
        source:
          "99; do { -99; try { 39 } catch (e) { -1 } finally { 42; co" +
          "ntinue; -3 }; } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1790,
        call:
          "eval('99; do { -99; try { [].x.x } catch (e) { -1; } final" +
          "ly { 42; continue; -3 }; } while (false);')",
        source:
          "99; do { -99; try { [].x.x } catch (e) { -1; } finally { 4" +
          "2; continue; -3 }; } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1921,
        call:
          "eval('99; do { -99; try { 39 } catch (e) { -1 } finally { " +
          "42; continue; -3 }; -77 } while (false);')",
        source:
          "99; do { -99; try { 39 } catch (e) { -1 } finally { 42; co" +
          "ntinue; -3 }; -77 } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 2051,
        call:
          "eval('99; do { -99; try { [].x.x } catch (e) { -1 } finall" +
          "y { 42; continue; -3 }; -77 } while (false);')",
        source:
          "99; do { -99; try { [].x.x } catch (e) { -1 } finally { 42" +
          "; continue; -3 }; -77 } while (false);",
        indirect: false,
        expected: "42",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-catch-empty-break.js",
    sourceDigest:
      "5aec6c9dc360bac3ce2627b51829aee82896edbe610c36009f068f8c7d21260a",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 621,
        call:
          'eval("for (var i = 0; i < 2; ++i) { if (i) { try { throw n' +
          "ull; } catch (e) { break; } } 'bad completion'; }\")",
        source:
          "for (var i = 0; i < 2; ++i) { if (i) { try { throw null; }" +
          " catch (e) { break; } } 'bad completion'; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-catch-empty-continue.js",
    sourceDigest:
      "f03442980b9d65eca747697632ea7aa6516544a9c063cf5a5ff57a6f19c4c9b2",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 621,
        call:
          'eval("for (var i = 0; i < 2; ++i) { if (i) { try { throw n' +
          "ull; } catch (e) { continue; } } 'bad completion'; }\")",
        source:
          "for (var i = 0; i < 2; ++i) { if (i) { try { throw null; }" +
          " catch (e) { continue; } } 'bad completion'; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-catch-finally-empty-brea" + "k.js",
    sourceDigest:
      "17ce745690a5a4b4201699454cc8051395ae0420a40571d668aae004dffcf59b",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 583,
        call:
          'eval("for (var i = 0; i < 2; ++i) { if (i) { try { throw n' +
          "ull; } catch (e) {} finally { break; } } 'bad completion';" +
          ' }")',
        source:
          "for (var i = 0; i < 2; ++i) { if (i) { try { throw null; }" +
          " catch (e) {} finally { break; } } 'bad completion'; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path:
      "test/language/statements/try/cptn-catch-finally-empty-cont" + "inue.js",
    sourceDigest:
      "1abc8d3032dc81e60f86d239fc99018da0f03fb382fd110b871d22a6f526f287",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 583,
        call:
          'eval("for (var i = 0; i < 2; ++i) { if (i) { try { throw n' +
          "ull; } catch (e) {} finally { continue; } } 'bad completio" +
          "n'; }\")",
        source:
          "for (var i = 0; i < 2; ++i) { if (i) { try { throw null; }" +
          " catch (e) {} finally { continue; } } 'bad completion'; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-catch.js",
    sourceDigest:
      "f7de3b6dc00c3891ad10fbf4ca88a14a4be01a2b0e684c1b92e107421449c432",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1013,
        call: "eval('1; try { throw null; } catch (err) { }')",
        source: "1; try { throw null; } catch (err) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1090,
        call: "eval('2; try { throw null; } catch (err) { 3; }')",
        source: "2; try { throw null; } catch (err) { 3; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-finally-empty-break.js",
    sourceDigest:
      "5304dbfc339c7c922922797b8da7499206be3804400fd4a8e1f73f8da67ecc20",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 576,
        call:
          'eval("for (var i = 0; i < 2; ++i) { if (i) { try {} finall' +
          "y { break; } } 'bad completion'; }\")",
        source:
          "for (var i = 0; i < 2; ++i) { if (i) { try {} finally { br" +
          "eak; } } 'bad completion'; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-finally-empty-continue.j" + "s",
    sourceDigest:
      "ae5c7e07f2d0d3a598d633c90d4c1993c1c895747309938743183b0ae3e7c3bd",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 576,
        call:
          'eval("for (var i = 0; i < 2; ++i) { if (i) { try {} finall' +
          "y { continue; } } 'bad completion'; }\")",
        source:
          "for (var i = 0; i < 2; ++i) { if (i) { try {} finally { co" +
          "ntinue; } } 'bad completion'; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-finally-from-catch.js",
    sourceDigest:
      "1c9053ba0c444224b5f65a65f2746b920eb9d63cae14dc9c7c7e5dcd493644e2",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 1154,
        call: "eval('1; try { throw null; } catch (err) { } finally { }')",
        source: "1; try { throw null; } catch (err) { } finally { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1247,
        call:
          "eval('2; try { throw null; } catch (err) { 3; } finally { " + "}')",
        source: "2; try { throw null; } catch (err) { 3; } finally { }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1335,
        call:
          "eval('4; try { throw null; } catch (err) { } finally { 5; " + "}')",
        source: "4; try { throw null; } catch (err) { } finally { 5; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1431,
        call:
          "eval('6; try { throw null; } catch (err) { 7; } finally { " +
          "8; }')",
        source: "6; try { throw null; } catch (err) { 7; } finally { 8; }",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-finally-skip-catch.js",
    sourceDigest:
      "0bb64a4a5a88dd339275edd2e62b35b881f6162603b970917f55aaf2bdbbfb54",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 864,
        call: "eval('1; try { } catch (err) { } finally { }')",
        source: "1; try { } catch (err) { } finally { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 941,
        call: "eval('2; try { } catch (err) { 3; } finally { }')",
        source: "2; try { } catch (err) { 3; } finally { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1021,
        call: "eval('4; try { } catch (err) { } finally { 5; }')",
        source: "4; try { } catch (err) { } finally { 5; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1101,
        call: "eval('6; try { } catch (err) { 7; } finally { 8; }')",
        source: "6; try { } catch (err) { 7; } finally { 8; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1184,
        call: "eval('9; try { 10; } catch (err) { } finally { }')",
        source: "9; try { 10; } catch (err) { } finally { }",
        indirect: false,
        expected: "10",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1258,
        call: "eval('11; try { 12; } catch (err) { 13; } finally { }')",
        source: "11; try { 12; } catch (err) { 13; } finally { }",
        indirect: false,
        expected: "12",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1337,
        call: "eval('14; try { 15; } catch (err) { } finally { 16; }')",
        source: "14; try { 15; } catch (err) { } finally { 16; }",
        indirect: false,
        expected: "15",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1416,
        call:
          "eval('17; try { 18; } catch (err) { 19; } finally { 20; }'" + ")",
        source: "17; try { 18; } catch (err) { 19; } finally { 20; }",
        indirect: false,
        expected: "18",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-finally-wo-catch.js",
    sourceDigest:
      "3844e060a9048b34e23104a57b378844bf32e5da68928201ec4db35bd9894fb9",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 691,
        call: "eval('1; try { } finally { }')",
        source: "1; try { } finally { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 752,
        call: "eval('2; try { 3; } finally { }')",
        source: "2; try { 3; } finally { }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 808,
        call: "eval('4; try { } finally { 5; }')",
        source: "4; try { } finally { 5; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 872,
        call: "eval('6; try { 7; } finally { 8; }')",
        source: "6; try { 7; } finally { 8; }",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/try/cptn-try.js",
    sourceDigest:
      "840c745028e71d1cf845971b7c7f231df014d3de32bd036805e88174976da155",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 696,
        call: "eval('1; try { } catch (err) { }')",
        source: "1; try { } catch (err) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 761,
        call: "eval('2; try { 3; } catch (err) { }')",
        source: "2; try { 3; } catch (err) { }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 821,
        call: "eval('4; try { } catch (err) { 5; }')",
        source: "4; try { } catch (err) { 5; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 889,
        call: "eval('6; try { 7; } catch (err) { 8; }')",
        source: "6; try { 7; } catch (err) { 8; }",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-10-s.js",
    sourceDigest:
      "4062cb95c2ebaf42ca9fbe5e0788d98e4e9b4b90092143119ed439de74aa39d7",
    family: "eval-syntax-errors",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 268,
        call: "s('eval = 42;')",
        source: "eval = 42;",
        indirect: true,
        expected: "42",
        consumed: false,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-18-s.js",
    sourceDigest:
      "44f503bb4ea1995988e7709e9368b1604c668d6b049a3cd3a2c641e593d90f32",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 338,
        call: "eval('var arguments;')",
        source: "var arguments;",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-19-s.js",
    sourceDigest:
      "9e5a53064cd5bc6e884e3d1345028e169949e18f64963e4b517d2e221b7d8215",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 331,
        call: "eval('arguments = 42;')",
        source: "arguments = 42;",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-2-s.js",
    sourceDigest:
      "945a19ed925932fe469129a7f90a675c5c78c1763cab1f6e12431eed64c192b2",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 329,
        call: "eval('function foo() { eval = 42; }; foo()')",
        source: "function foo() { eval = 42; }; foo()",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-20-s.js",
    sourceDigest:
      "e10339a4f5d5d65330494b5a4b10cbf678a7a6ad71947beb701737e8f5a65025",
    family: "eval-syntax-errors",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 288,
        call: "s('var arguments;')",
        source: "var arguments;",
        indirect: true,
        expected: "undefined",
        consumed: false,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-21-s.js",
    sourceDigest:
      "efba0167efcc36dd0104c6d209edfba162806e0e6fc4e53ce0ba8eee2cca35d2",
    family: "eval-syntax-errors",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 281,
        call: "s('arguments = 42;')",
        source: "arguments = 42;",
        indirect: true,
        expected: "42",
        consumed: false,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-22-s.js",
    sourceDigest:
      "3a45b4cc4c00d7447948b9a4765548dd61fa4af198518010e07d9967c761cd8c",
    family: "eval-syntax-errors",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 334,
        call: "indirectEval(\"'use strict'; var arguments;\")",
        source: "'use strict'; var arguments;",
        indirect: true,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-3-s.js",
    sourceDigest:
      "b37acd9d4a9bf28a5a537cccf22a1ec9ed3a7f62f175d08dd4bf0d9020cc7dea",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 341,
        call: "eval('(function () { var eval; })')",
        source: "(function () { var eval; })",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-4-s.js",
    sourceDigest:
      "96f3cad555ce39ad565d627a5f76b5608e947025f1832054cd5705d991ac521f",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 336,
        call: "eval('(function () { eval = 42; })()')",
        source: "(function () { eval = 42; })()",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-7-s.js",
    sourceDigest:
      "d89f2221618f18d4d2a3bd3cbd6a7ae419deeb043a7a9a05af08320291b44058",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 339,
        call: "eval('var eval;')",
        source: "var eval;",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-8-s.js",
    sourceDigest:
      "b56fbba2aa23987e10f53c4f1678d44e2d506e8f4570fad0ebed7715e34118b6",
    family: "eval-syntax-errors",
    variants: ["strict"],
    sites: [
      {
        start: 332,
        call: "eval('eval = 42;')",
        source: "eval = 42;",
        indirect: false,
        expected: null,
        consumed: true,
        mutant: "void 0",
      },
    ],
  },
  {
    path: "test/language/statements/variable/12.2.1-9-s.js",
    sourceDigest:
      "984badc49fad1459d7321ae279457d5fdeb91b2dce6355e0a3d0d44aef733ce9",
    family: "eval-syntax-errors",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 265,
        call: "s('var eval;')",
        source: "var eval;",
        indirect: true,
        expected: "undefined",
        consumed: false,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/variable/S12.2_A5.js",
    sourceDigest:
      "5f7761d8ad6c3078462540b714920aa7b1d97de8e31e0dc090d52e54bf813c56",
    family: "binding-introduction-and-references",
    variants: ["sloppy"],
    sites: [
      {
        start: 556,
        call: 'eval("var x")',
        source: "var x",
        indirect: false,
        expected: "undefined",
        consumed: false,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/variable/cptn-value.js",
    sourceDigest:
      "746f5fed7e3485833ffa3e17dd341c2f673c9e05e5518f7f3e0ee40588814496",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 478,
        call: "eval('var test262id1;')",
        source: "var test262id1;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 578,
        call: "eval('var test262id2 = 2;')",
        source: "var test262id2 = 2;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 686,
        call: "eval('var test262id3 = 3, test262id4;')",
        source: "var test262id3 = 3, test262id4;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 816,
        call: "eval('var test262id5, test262id6 = 6;')",
        source: "var test262id5, test262id6 = 6;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 944,
        call: "eval('7; var test262id8;')",
        source: "7; var test262id8;",
        indirect: false,
        expected: "7",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 993,
        call: "eval('9; var test262id10 = 10;')",
        source: "9; var test262id10 = 10;",
        indirect: false,
        expected: "9",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1048,
        call: "eval('11; var test262id12 = 12, test262id13;')",
        source: "11; var test262id12 = 12, test262id13;",
        indirect: false,
        expected: "11",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1118,
        call: "eval('14; var test262id15, test262id16 = 16;')",
        source: "14; var test262id15, test262id16 = 16;",
        indirect: false,
        expected: "14",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/while/S12.6.2_A3.js",
    sourceDigest:
      "abcce5471fbea4f44bc00cfe8f1680fd8a104144b1c2b6b80e36c1cdb2855b6d",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 322,
        call: 'eval("while (false) __in__do=1;")',
        source: "while (false) __in__do=1;",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/while/S12.6.2_A5.js",
    sourceDigest:
      "f0f657b9a9a8eca76aa58e71f92cbb680b00a94b5c0a1aca073ced8459cc966c",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 391,
        call:
          'eval("while(1) {__in__do__before__break=1; break; __in__do' +
          '__after__break=2;}")',
        source:
          "while(1) {__in__do__before__break=1; break; __in__do__afte" +
          "r__break=2;}",
        indirect: false,
        expected: "1",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/while/S12.6.2_A7.js",
    sourceDigest:
      "ee938b98371cacd4e07a6606e5ff8118fd6d3e419d162cc4a6792aa2be90ac2b",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 338,
        call: 'eval("while (__condition<5) eval(\\"__condition++\\");")',
        source: 'while (__condition<5) eval("__condition++");',
        indirect: false,
        expected: "4",
        consumed: true,
        mutant: '"mutant"',
        nested: { call: 'eval("__condition++")', source: "__condition++" },
      },
    ],
  },
  {
    path: "test/language/statements/while/S12.6.2_A8.js",
    sourceDigest:
      "b2cc631dd15362a4cb70376c7cb5fdd9748e2973e5859158a78010fdcd48a409",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 321,
        call:
          "eval(\"while(__condition < 10) { __condition++; if (((''+__" +
          "condition/2).split('.')).length>1) continue; __odds++;}\")",
        source:
          "while(__condition < 10) { __condition++; if (((''+__condit" +
          "ion/2).split('.')).length>1) continue; __odds++;}",
        indirect: false,
        expected: "4",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/while/cptn-abrupt-empty.js",
    sourceDigest:
      "e676d38fd1a72d464080175d65a68400b623953b7366f407047e8fad20c775a0",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 764,
        call: "eval('1; while (true) { break; }')",
        source: "1; while (true) { break; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 829,
        call: "eval('2; while (true) { 3; break; }')",
        source: "2; while (true) { 3; break; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 893,
        call:
          "eval('4; outer: do { while (true) { continue outer; } } wh" +
          "ile (false)')",
        source:
          "4; outer: do { while (true) { continue outer; } } while (f" +
          "alse)",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 1001,
        call:
          "eval('5; outer: do { while (true) { 6; continue outer; } }" +
          " while (false)')",
        source:
          "5; outer: do { while (true) { 6; continue outer; } } while" +
          " (false)",
        indirect: false,
        expected: "6",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/while/cptn-iter.js",
    sourceDigest:
      "3aeeb7e108aeed31d73496319c62d537d8de0525f7bbf3259c77ed34bfce8a32",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 820,
        call: "eval('var count1 = 2; 1; while (count1 -= 1) { }')",
        source: "var count1 = 2; 1; while (count1 -= 1) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 901,
        call: "eval('var count2 = 2; 2; while (count2 -= 1) { 3; }')",
        source: "var count2 = 2; 2; while (count2 -= 1) { 3; }",
        indirect: false,
        expected: "3",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
  {
    path: "test/language/statements/while/cptn-no-iter.js",
    sourceDigest:
      "52c3ac99999652e3272aee32c479396bc8f12970df930a58752cd743d447baed",
    family: "script-completion-values",
    variants: ["sloppy", "strict"],
    sites: [
      {
        start: 567,
        call: "eval('1; while (false) { }')",
        source: "1; while (false) { }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
      {
        start: 626,
        call: "eval('2; while (false) { 3; }')",
        source: "2; while (false) { 3; }",
        indirect: false,
        expected: "undefined",
        consumed: true,
        mutant: '"mutant"',
      },
    ],
  },
];
