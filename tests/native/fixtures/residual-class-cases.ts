/* eslint-disable no-useless-concat -- Preserve pinned source text. */
// Derived from Test262; BSD license in completion-record-cases.LICENSE.

/** Pinned ordinary class assertions and their mutation programs. */
export interface ResidualClassCase {
  readonly path: string;
  readonly source: string;
  readonly mutations: readonly string[];
}

/** Static class witnesses and one mutation per value assertion. */
export const residualClassCases: readonly ResidualClassCase[] = [
  {
    path:
      "test/language/statements/class/elements/arro" +
      "w-body-private-direct-eval-err-contains-newt" +
      "arget.js",
    source:
      "var executed = false;\nclass C {\n  #x = (exec" +
      "uted = true, () => new.target);\n  x() {\n    " +
      "this.#x();\n  }\n}\n\nvar c = new C();\n\nassert.s" +
      "ameValue(executed, true);\nassert.sameValue(c" +
      ".x(), undefined);",
    mutations: [
      "var executed = false;\nclass C {\n  #x = (exec" +
        "uted = true, () => new.target);\n  x() {\n    " +
        "this.#x();\n  }\n}\n\nvar c = new C();\n\nassert.s" +
        'ameValue((executed, "wrong"), true);\nassert.' +
        "sameValue(c.x(), undefined);",
      "var executed = false;\nclass C {\n  #x = (exec" +
        "uted = true, () => new.target);\n  x() {\n    " +
        "this.#x();\n  }\n}\n\nvar c = new C();\n\nassert.s" +
        "ameValue(executed, true);\nassert.sameValue((" +
        'c.x(), "wrong"), undefined);',
    ],
  },
  {
    path:
      "test/language/statements/class/elements/nest" +
      "ed-private-direct-eval-err-contains-newtarge" +
      "t.js",
    source:
      "var executed = false;\nclass C {\n  #x = (exec" +
      "uted = true, new.target);\n}\n\nvar c = new C()" +
      ";\n\nassert.sameValue(executed, true);\nassert." +
      "sameValue(c.x, undefined);",
    mutations: [
      "var executed = false;\nclass C {\n  #x = (exec" +
        "uted = true, new.target);\n}\n\nvar c = new C()" +
        ';\n\nassert.sameValue((executed, "wrong"), tru' +
        "e);\nassert.sameValue(c.x, undefined);",
      "var executed = false;\nclass C {\n  #x = (exec" +
        "uted = true, new.target);\n}\n\nvar c = new C()" +
        ";\n\nassert.sameValue(executed, true);\nassert." +
        'sameValue((c.x, "wrong"), undefined);',
    ],
  },
  {
    path:
      "test/language/statements/class/elements/priv" +
      "ate-direct-eval-err-contains-newtarget.js",
    source:
      "var executed = false;\nclass C {\n  #x = (exec" +
      "uted = true, new.target);\n}\n\nvar c = new C()" +
      ";\n\nassert.sameValue(executed, true);\nassert." +
      "sameValue(c.x, undefined);",
    mutations: [
      "var executed = false;\nclass C {\n  #x = (exec" +
        "uted = true, new.target);\n}\n\nvar c = new C()" +
        ';\n\nassert.sameValue((executed, "wrong"), tru' +
        "e);\nassert.sameValue(c.x, undefined);",
      "var executed = false;\nclass C {\n  #x = (exec" +
        "uted = true, new.target);\n}\n\nvar c = new C()" +
        ";\n\nassert.sameValue(executed, true);\nassert." +
        'sameValue((c.x, "wrong"), undefined);',
    ],
  },
  {
    path:
      "test/language/statements/class/elements/priv" +
      "ate-static-setter-visible-to-direct-eval.js",
    source:
      "class C {\n  static set #m(v) {\n    this._v =" +
      " v;\n  }\n\n  static setWithEval() {\n    this.#" +
      'm = "Test262";\n  }\n}\n\nclass D {\n  static set' +
      " #m(v) {\n    throw new Test262Error('should " +
      "never be called');\n  }\n}\n\nC.setWithEval();\na" +
      "ssert.sameValue(C._v, 'Test262');\n\nassert.th" +
      "rows(TypeError, function() {\n  C.getWithEval" +
      ".call(D);\n}, 'invalid access to a static pri" +
      "vate getter');",
    mutations: [
      "class C {\n  static set #m(v) {\n    this._v =" +
        " v;\n  }\n\n  static setWithEval() {\n    this.#" +
        'm = "Test262";\n  }\n}\n\nclass D {\n  static set' +
        " #m(v) {\n    throw new Test262Error('should " +
        "never be called');\n  }\n}\n\nC.setWithEval();\na" +
        "ssert.sameValue((C._v, \"wrong\"), 'Test262');" +
        "\n\nassert.throws(TypeError, function() {\n  C." +
        "getWithEval.call(D);\n}, 'invalid access to a" +
        " static private getter');",
    ],
  },
  {
    path:
      "test/language/statements/class/elements/stat" +
      "ic-field-init-with-this.js",
    source:
      "class C {\n  static f = 'test';\n  static g = " +
      "this.f + '262';\n  static h = this.g + 'test'" +
      ";\n}\n\nassert.sameValue(C.f, 'test');\nassert.s" +
      "ameValue(C.g, 'test262');\nassert.sameValue(C" +
      ".h, 'test262test');",
    mutations: [
      "class C {\n  static f = 'test';\n  static g = " +
        "this.f + '262';\n  static h = this.g + 'test'" +
        ";\n}\n\nassert.sameValue((C.f, \"wrong\"), 'test'" +
        ");\nassert.sameValue(C.g, 'test262');\nassert." +
        "sameValue(C.h, 'test262test');",
      "class C {\n  static f = 'test';\n  static g = " +
        "this.f + '262';\n  static h = this.g + 'test'" +
        ";\n}\n\nassert.sameValue(C.f, 'test');\nassert.s" +
        "ameValue((C.g, \"wrong\"), 'test262');\nassert." +
        "sameValue(C.h, 'test262test');",
      "class C {\n  static f = 'test';\n  static g = " +
        "this.f + '262';\n  static h = this.g + 'test'" +
        ";\n}\n\nassert.sameValue(C.f, 'test');\nassert.s" +
        "ameValue(C.g, 'test262');\nassert.sameValue((" +
        "C.h, \"wrong\"), 'test262test');",
    ],
  },
];
