/**
 * One literal eval call in a pinned original, replaced in place by a
 * finite `$262.evalScript` call with the same source text.
 */
export interface HostScriptCall {
  /** Exact original call expression, matched after the frontmatter. */
  readonly call: string;
  /** Cooked value of the call's single string literal argument. */
  readonly source: string;
  /** Replacement source whose effect the original assertions reject. */
  readonly mutation: string;
  /** Expected value expression when the original consumes the value. */
  readonly expected?: string;
}

/** A pinned DS-10 original whose eval sites have host Script witnesses. */
export interface HostScriptCase {
  readonly path: string;
  readonly sha256: string;
  /** Caller modes from the frontmatter flags. */
  readonly modes: readonly ("sloppy" | "strict")[];
  /** Direct eval inherits caller strictness; indirect eval never does. */
  readonly direct: boolean;
  /** The caller's own directive makes it strict in every mode. */
  readonly strictFunctionCaller?: true;
  /** The original asserts an uncaught runtime SyntaxError. */
  readonly negative?: true;
  readonly includes?: readonly "propertyHelper.js"[];
  /** Non-call scaffolding edits, such as an eval alias declaration. */
  readonly aliases?: readonly string[];
  readonly calls: readonly HostScriptCall[];
  /** Literal host Script that must complete after the original runs. */
  readonly reached?: string;
}

const both = ["sloppy", "strict"] as const;
const sloppy = ["sloppy"] as const;
const strict = ["strict"] as const;
const thrown = 'throw new Error("mutation");';
const alias = "var _eval = eval;";

/** Calls for a test whose SyntaxError site appears twice. */
function twice(call: string, source: string): readonly HostScriptCall[] {
  return [
    { call, source, mutation: thrown },
    { call, source, mutation: thrown },
  ];
}

/** Every original whose non-source subjects a host Script reproduces. */
export const hostScriptCases: readonly HostScriptCase[] = [
  {
    path: "test/language/eval-code/direct/lex-env-no-init-cls.js",
    sha256: "27e69b0c7b975f401654f02a3044173ca572143d9756a8c029fdef4e46534c3f",
    modes: both,
    direct: true,
    calls: [
      {
        call: "eval('typeof C; class C {}')",
        source: "typeof C; class C {}",
        mutation: "class C {} typeof C;",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/lex-env-no-init-const.js",
    sha256: "7d7d161d1eb7826889b2326721ad95449362a4d4e70d7112c619b7f63e543fa0",
    modes: both,
    direct: true,
    calls: [
      {
        call: "eval('typeof x; const x = null;')",
        source: "typeof x; const x = null;",
        mutation: "const x = null; typeof x;",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/lex-env-no-init-let.js",
    sha256: "813ec0ecf3911d9e630c666b2ef8606a6f9eab88737f2165fbffbf2cfa00e10d",
    modes: both,
    direct: true,
    calls: [
      {
        call: "eval('typeof x; let x;')",
        source: "typeof x; let x;",
        mutation: "let x; typeof x;",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/new.target.js",
    sha256: "8c7e31f484901cc2ace831c3a84bde7d1ae1062b5a3f0bab1b06d5700c0f55d9",
    modes: both,
    direct: true,
    calls: [
      { call: "eval('new.target;')", source: "new.target;", mutation: thrown },
    ],
  },
  {
    path:
      "test/language/eval-code/direct/" +
      "non-definable-function-with-function.js",
    sha256: "0a2b5919d0f5893f0f6a6ae49d6d586ad6a8cbec0c27c2a5d2f110f7606c52fc",
    modes: sloppy,
    direct: true,
    calls: [
      {
        call: 'eval("function shouldNotBeDefined(){} function NaN(){}")',
        source: "function shouldNotBeDefined(){} function NaN(){}",
        mutation: "function shouldNotBeDefined(){} function notNaN(){}",
      },
    ],
  },
  {
    path:
      "test/language/eval-code/direct/" +
      "non-definable-function-with-variable.js",
    sha256: "48d53efdde64de46e46778ad9a3aaa8bb4379948f460b945571a268ba4681320",
    modes: sloppy,
    direct: true,
    calls: [
      {
        call: 'eval("var shouldNotBeDefined; function NaN(){}")',
        source: "var shouldNotBeDefined; function NaN(){}",
        mutation: "var shouldNotBeDefined; function notNaN(){}",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/non-definable-global-function.js",
    sha256: "515e39d6b9bd01407a636b89f7f831a530d0985cd5280e7f5e9d6587eea2a2a8",
    modes: sloppy,
    direct: true,
    calls: [
      {
        call: 'eval("function NaN(){}")',
        source: "function NaN(){}",
        mutation: "function notNaN(){}",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/non-definable-global-generator.js",
    sha256: "e0ef5f25961fd404e7e1e3ccf77e1702b5c53483d5c9e93dfb23196481a27217",
    modes: sloppy,
    direct: true,
    calls: [
      {
        call: 'eval("function* NaN(){}")',
        source: "function* NaN(){}",
        mutation: "function* notNaN(){}",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/non-definable-global-var.js",
    sha256: "29f495c4420e00182306c0a9906cd2611394b3afa1db52b7841607c3000ebdd3",
    modes: sloppy,
    direct: true,
    calls: [
      {
        call: 'eval("var unlikelyVariableName")',
        source: "var unlikelyVariableName",
        mutation: "0;",
      },
    ],
    reached: "if (nonExtensible !== true) throw new Error('skipped');",
  },
  {
    path: "test/language/eval-code/direct/strict-caller-function-context.js",
    sha256: "db81c6e14383e4a76c9e803563d9bc0cbf8ac231f87543f0fa5a9037edcbebc0",
    modes: both,
    direct: true,
    strictFunctionCaller: true,
    calls: [
      {
        call: "eval('var public = 1;')",
        source: "var public = 1;",
        mutation: "var notPublic = 1;",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/strict-caller-global.js",
    sha256: "ab918e5965e83e0623f40b02e0899fda5e3aae05115877facb600963d556b864",
    modes: strict,
    direct: true,
    negative: true,
    calls: [
      {
        call: "eval('var public = 1;')",
        source: "var public = 1;",
        mutation: "var notPublic = 1;",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/strictness-override.js",
    sha256: "8aca929b8fae3aa988796e84a000594af452aaba65bf9d04875a97ab26f1feac",
    modes: both,
    direct: true,
    calls: [
      {
        call: "eval('\"use strict\"; unresolvable = null;')",
        source: '"use strict"; unresolvable = null;',
        mutation: "0;",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/super-call.js",
    sha256: "c869b7b219841caa953d8b1fd55947e9869ff342fcad4aa4b3621191f60d9cd3",
    modes: both,
    direct: true,
    calls: [{ call: "eval('super();')", source: "super();", mutation: thrown }],
  },
  {
    path: "test/language/eval-code/direct/super-prop.js",
    sha256: "37d0126e9ae3bea9d7bdfd6485bbd6caba47d49479fc7bb2ebce0990f6a9824b",
    modes: both,
    direct: true,
    calls: [
      {
        call: "eval('super.property;')",
        source: "super.property;",
        mutation: thrown,
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/this-value-global.js",
    sha256: "ca77c1d103f7ca15fb2004398dd578bb5ddb213a5d4618cb94a95c78fc6b03df",
    modes: both,
    direct: true,
    calls: [
      {
        call: "eval('this;')",
        source: "this;",
        mutation: "({});",
        expected: "globalThis",
      },
    ],
  },
  {
    path:
      "test/language/eval-code/direct/" +
      "var-env-func-init-global-update-non-configurable.js",
    sha256: "f038ce808108266438427435acb0f9d4a48040b97a6e4fb7456a0073afb4a4fc",
    modes: sloppy,
    direct: true,
    includes: ["propertyHelper.js"],
    calls: [
      {
        call: "eval('initial = f; function f() { return 2222; }')",
        source: "initial = f; function f() { return 2222; }",
        mutation: "initial = f; function f() { return 2223; }",
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/var-env-func-init-multi.js",
    sha256: "5790d89b7bfd7f677bc8fabec2b43a47263da1a107663b47f324b7a9665caabf",
    modes: sloppy,
    direct: true,
    calls: [
      {
        call:
          'eval(\'initial = f; function f() { return "first"; } ' +
          'function f() { return "second"; }\')',
        source:
          'initial = f; function f() { return "first"; } ' +
          'function f() { return "second"; }',
        mutation:
          'initial = f; function f() { return "second"; } ' +
          'function f() { return "first"; }',
      },
    ],
  },
  {
    path: "test/language/eval-code/direct/var-env-global-lex-non-strict.js",
    sha256: "70ac987b8d11fec9759d5d6fddbd6bcb30f9ee0a68beebf5e1f6b5478dfde90d",
    modes: sloppy,
    direct: true,
    negative: true,
    calls: [{ call: "eval('var x;')", source: "var x;", mutation: "0;" }],
    // The preceding `let x;` initialized its binding: the throw is runtime.
    reached: "x;",
  },
  {
    path: "test/language/eval-code/direct/var-env-var-init-global-exstng.js",
    sha256: "805dc505c5f6f3d94c49dfd36152879ed71c00581493c3540967aee5fa268f6d",
    modes: sloppy,
    direct: true,
    includes: ["propertyHelper.js"],
    calls: [
      {
        call: "eval('initial = x; var x = 45;')",
        source: "initial = x; var x = 45;",
        mutation: "initial = x; var x = 46;",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/always-non-strict.js",
    sha256: "236722a95a26ae37d89b5a2ae1ee32fa5936cadb8c40a1e36ec381bdc16cd48c",
    modes: strict,
    direct: false,
    calls: [
      {
        call: "(0,eval)('var static; count += 1;')",
        source: "var static; count += 1;",
        mutation: "var static; count += 2;",
      },
      {
        call: "(0,eval)('with ({}) {} count += 1;')",
        source: "with ({}) {} count += 1;",
        mutation: "with ({}) {} count += 2;",
      },
      {
        call: "(0,eval)('unresolvable = null; count += 1;')",
        source: "unresolvable = null; count += 1;",
        mutation: "unresolvable = null; count += 2;",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/global-env-rec-catch.js",
    sha256: "fe6dad6a7cbe33e26e45ea32597f75485ebebb506ba6fc905fa1abc4a21699ce",
    modes: both,
    direct: false,
    aliases: [alias],
    calls: [
      {
        call: "_eval(\"\\'str\\' === __10_4_2_1_3\")",
        source: "'str' === __10_4_2_1_3",
        mutation: "'str2' === __10_4_2_1_3",
        expected: "true",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/global-env-rec-fun.js",
    sha256: "1441499ee101a37ca5f95354702b28d206293e946a55ccd00cb5ee0988346da9",
    modes: both,
    direct: false,
    aliases: [alias],
    calls: [
      {
        call: "_eval(\"\\'str\\' === __10_4_2_1_2\")",
        source: "'str' === __10_4_2_1_2",
        mutation: "'str2' === __10_4_2_1_2",
        expected: "true",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/global-env-rec-with.js",
    sha256: "c8aad2a100d4a3e6c6415f7c901bbeb0be433710c8d67e75cc8d21e2fcb9ad08",
    modes: sloppy,
    direct: false,
    aliases: [alias],
    calls: [
      {
        call: "_eval(\"\\'str\\' === __10_4_2_1_4\")",
        source: "'str' === __10_4_2_1_4",
        mutation: "'str2' === __10_4_2_1_4",
        expected: "true",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/global-env-rec.js",
    sha256: "608c7ca4c084886b6126bf749369caa52bfcd26a77f0ca04c317a67357329ef5",
    modes: both,
    direct: false,
    aliases: [alias],
    calls: [
      {
        call: "_eval(\"\\'str\\' === __10_4_2_1_1_1\")",
        source: "'str' === __10_4_2_1_1_1",
        mutation: "'str1' === __10_4_2_1_1_1",
        expected: "true",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/lex-env-heritage.js",
    sha256: "9b8b3997dfd4b2f4e4181f1a9e75d9b6a281b7f50d506a242ba9b7ab5f27222b",
    modes: both,
    direct: false,
    calls: [
      {
        call: "(0,eval)('x;')",
        source: "x;",
        mutation: '"inside";',
        expected: '"outside"',
      },
      {
        call: "(0,eval)('\"use strict\"; x;')",
        source: '"use strict"; x;',
        mutation: '"use strict"; "inside";',
        expected: '"outside"',
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/lex-env-no-init-cls.js",
    sha256: "56e120a7c671f566b48dff1636ecc957b95284893f40ccfb1387c7a5a1d9f207",
    modes: both,
    direct: false,
    calls: [
      {
        call: "(0,eval)('typeof C; class C {}')",
        source: "typeof C; class C {}",
        mutation: "class C {} typeof C;",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/lex-env-no-init-const.js",
    sha256: "fead1f0c87be18ed3536a73ab0dc9870794c620513c83ab6c93c788963f67aad",
    modes: both,
    direct: false,
    calls: [
      {
        call: "(0,eval)('typeof x; const x = null;')",
        source: "typeof x; const x = null;",
        mutation: "const x = null; typeof x;",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/lex-env-no-init-let.js",
    sha256: "09a98be913831b12d14fa9fe7ef9e5f8e1e8c2c2bd8dfaae956bf1c0998f5d5b",
    modes: both,
    direct: false,
    calls: [
      {
        call: "(0,eval)('typeof x; let x;')",
        source: "typeof x; let x;",
        mutation: "let x; typeof x;",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/new.target.js",
    sha256: "4b0dd1f11e227037535c7ab2ed79ae4f944dd5ecc07a99927eb9764fa8f3128c",
    modes: both,
    direct: false,
    calls: twice("(0,eval)('new.target;')", "new.target;"),
  },
  {
    path:
      "test/language/eval-code/indirect/" +
      "non-definable-function-with-function.js",
    sha256: "2450ea5804b3baf45ae0cbb19c07f537d1891179dfade7211411963cff06a921",
    modes: both,
    direct: false,
    calls: [
      {
        call:
          '(0,eval)("function shouldNotBeDefined1() {} function NaN() {} ' +
          'function shouldNotBeDefined2() {}")',
        source:
          "function shouldNotBeDefined1() {} function NaN() {} " +
          "function shouldNotBeDefined2() {}",
        mutation:
          "function shouldNotBeDefined1() {} function notNaN() {} " +
          "function shouldNotBeDefined2() {}",
      },
    ],
  },
  {
    path:
      "test/language/eval-code/indirect/" +
      "non-definable-function-with-variable.js",
    sha256: "d60c45d06003eb317a38414785f14d2d21e63f3b2d7ea57f36ebfe6f42b66791",
    modes: both,
    direct: false,
    calls: [
      {
        call:
          '(0,eval)("var shouldNotBeDefined1; function NaN() {} ' +
          'var shouldNotBeDefined2;")',
        source:
          "var shouldNotBeDefined1; function NaN() {} " +
          "var shouldNotBeDefined2;",
        mutation:
          "var shouldNotBeDefined1; function notNaN() {} " +
          "var shouldNotBeDefined2;",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/non-definable-global-function.js",
    sha256: "7270b912abc8428efd826bfe9dc098dd963ba878623ea2a80961903d6fc0626a",
    modes: both,
    direct: false,
    calls: [
      {
        call: '(0,eval)("function NaN() {}")',
        source: "function NaN() {}",
        mutation: "function notNaN() {}",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/non-definable-global-generator.js",
    sha256: "ca08b70986c89729f5e6ac6cc8d6dbb965ba00fcbb7a9106627125d58950a83b",
    modes: both,
    direct: false,
    calls: [
      {
        call: '(0,eval)("function* NaN() {}")',
        source: "function* NaN() {}",
        mutation: "function* notNaN() {}",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/non-definable-global-var.js",
    sha256: "a73e08fad3d88b9ad790da92bbf255365cdbd6d348759e64f1caf26f0256d058",
    modes: both,
    direct: false,
    calls: [
      {
        call: '(0,eval)("var unlikelyVariableName;")',
        source: "var unlikelyVariableName;",
        mutation: "0;",
      },
    ],
    reached: "if (nonExtensible !== true) throw new Error('skipped');",
  },
  {
    path: "test/language/eval-code/indirect/super-call.js",
    sha256: "4baabff3c6ce8406859b307ce3be9fe749b0de309592752b1291161bbb63f480",
    modes: both,
    direct: false,
    calls: twice("(0,eval)('super();')", "super();"),
  },
  {
    path: "test/language/eval-code/indirect/super-prop.js",
    sha256: "5ba3d03202aa5882f062f517b653a4813c0395238af3b43d6e8eab41d4d06398",
    modes: both,
    direct: false,
    calls: twice("(0,eval)('super.property;')", "super.property;"),
  },
  {
    path: "test/language/eval-code/indirect/this-value-func.js",
    sha256: "b8612a41ab235a1cc0b910b15c1d32e469abd301ce68a252629a2671afe19d6f",
    modes: both,
    direct: false,
    calls: [
      {
        call: "(0,eval)('this;')",
        source: "this;",
        mutation: "({});",
        expected: "globalThis",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/this-value-global.js",
    sha256: "2af074eb4e76d9eb3d682dfb1fa33e88f36bccb39651c0e44b9e27d08f83ebc8",
    modes: both,
    direct: false,
    calls: [
      {
        call: "(0,eval)('this;')",
        source: "this;",
        mutation: "({});",
        expected: "globalThis",
      },
    ],
  },
  {
    path:
      "test/language/eval-code/indirect/" +
      "var-env-func-init-global-update-non-configurable.js",
    sha256: "6e916b55962048ce784af650fcb16f1a78e8bab61689ea805f20bf37254f3edc",
    modes: both,
    direct: false,
    includes: ["propertyHelper.js"],
    calls: [
      {
        call: "(0,eval)('initial = f; function f() { return 2222; }')",
        source: "initial = f; function f() { return 2222; }",
        mutation: "initial = f; function f() { return 2223; }",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/var-env-func-init-multi.js",
    sha256: "ed094932817614d5d0ea7bd5394ae8a1d9755e68a0d434fa65e3caed56651aa8",
    modes: both,
    direct: false,
    calls: [
      {
        call:
          '(0,eval)(\'initial = f; function f() { return "first"; } ' +
          'function f() { return "second"; }\')',
        source:
          'initial = f; function f() { return "first"; } ' +
          'function f() { return "second"; }',
        mutation:
          'initial = f; function f() { return "second"; } ' +
          'function f() { return "first"; }',
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/var-env-func-non-strict.js",
    sha256: "648c1b37a651d2c9879133a9431a14b0a8d7e576925c9947ac053704df98923c",
    modes: both,
    direct: false,
    calls: [
      {
        call: '(0,eval)("function fun() {}")',
        source: "function fun() {}",
        mutation: "function notFun() {}",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/var-env-global-lex-non-strict.js",
    sha256: "8e1e59dfdc7776dcb5c08346ee39b788c0991a965b384913813a2af4741dd23a",
    modes: both,
    direct: false,
    calls: [{ call: "(0,eval)('var x;')", source: "var x;", mutation: thrown }],
  },
  {
    path: "test/language/eval-code/indirect/var-env-var-init-global-exstng.js",
    sha256: "9a001f113d4436a9e4675e6a85cef04edece5de45289251abbe184ba1255de18",
    modes: both,
    direct: false,
    includes: ["propertyHelper.js"],
    calls: [
      {
        call: "(0, eval)('initial = x; var x = 45;')",
        source: "initial = x; var x = 45;",
        mutation: "initial = x; var x = 46;",
      },
    ],
  },
  {
    path: "test/language/eval-code/indirect/var-env-var-non-strict.js",
    sha256: "e648932c81c7b8037d3666d9adaa9e366bdfd2ccd65852d180dd1133830f9944",
    modes: both,
    direct: false,
    calls: [
      {
        call: '(0,eval)("var x = 1;")',
        source: "var x = 1;",
        mutation: "var x = 2;",
      },
    ],
  },
];
