/* eslint-disable no-useless-concat -- Wrap pinned text without changing it. */
// Copyright 2009 the Sputnik authors. All rights reserved.
// Copyright (C) 2016 the V8 project authors. All rights reserved.
// Copyright (C) 2019 Leo Balter. All rights reserved.
// Derived assertion text retains the BSD license in the adjacent
// completion-record-cases.LICENSE file.

/** Fixed assertions split only at literal eval call expressions. */
export interface CompletionRecordCase {
  readonly path: string;
  readonly strict: boolean;
  readonly indirect: boolean;
  readonly parts: readonly string[];
  readonly sources: readonly string[];
}

/** All 81 pinned subjects, retaining every original assertion. */
export const completionRecordCases: readonly CompletionRecordCase[] = [
  {
    path: "test/built-ins/Boolean/S9.2_A1_T1.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(Boolean(undefined), false, 'Boolean(u" +
        "ndefined) must return false');\nassert.sameValue(Boole" +
        "an(void 0), false, 'Boolean(void 0) must return false'" +
        ");\nassert.sameValue(Boolean(",
      "), false, 'Boolean(eval(\"var x\")) must return false'" +
        ");\nassert.sameValue(Boolean(), false, 'Boolean() must" +
        " return false');",
    ],
    sources: ["var x"],
  },
  {
    path: "test/built-ins/String/S9.8_A1_T1.js",
    strict: true,
    indirect: false,
    parts: [
      'if (String(undefined) !== "undefined") {\n  throw ne' +
        "w Test262Error('#1: String(undefined) === \"undefined" +
        "\". Actual: ' + (String(undefined)));\n}\nif (String(v" +
        'oid 0) !== "undefined") {\n  throw new Test262Error(' +
        "'#2: String(void 0) === \"undefined\". Actual: ' + (St" +
        "ring(void 0)));\n}\nif (String(",
      ') !== "undefined") {\n  throw new Test262Error(\'#3: ' +
        'String(eval("var x")) === "undefined" . Actual: \' ' +
        "+ (String(",
      ")));\n}",
    ],
    sources: ["var x", "var x"],
  },
  {
    path: "test/built-ins/undefined/S15.1.1.3_A1.js",
    strict: true,
    indirect: false,
    parts: [
      'if (typeof(undefined) !== "undefined") {\n  throw ne' +
        "w Test262Error('#1: typeof(undefined) === \"undefined" +
        "\". Actual: ' + (typeof(undefined)));\n}\nif (undefine" +
        "d !== void 0) {\n  throw new Test262Error('#2: undefin" +
        "ed === void 0. Actual: ' + (undefined));\n}\nif (undef" +
        "ined !== ",
      ") {\n  throw new Test262Error('#3: undefined === eval(" +
        '"var x"). Actual: \' + (undefined));\n}',
    ],
    sources: ["var x"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-block.j" + "s",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '"{}") === undefined. Actual: \' + (',
      "));\n}",
    ],
    sources: ["{}", "{}"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-do-whil" + "e.js",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '"do ; while(false)") === undefined. Actual: \' + (',
      "));\n}",
    ],
    sources: ["do ; while(false)", "do ; while(false)"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-empty.j" + "s",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '";") === undefined. Actual: \' + (',
      "));\n}",
    ],
    sources: [";", ";"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-for.js",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '"for(false;false;false);") === undefined. Actual: \' ' +
        "+ (",
      "));\n}",
    ],
    sources: ["for(false;false;false);", "for(false;false;false);"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-if.js",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '"if (false) ;") === undefined. Actual: \' + ',
      ");\n}",
    ],
    sources: ["if (false) ;", "if (false) ;"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-switch." + "js",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '"switch(1){}") === undefined. Actual: \' + (',
      "));\n}",
    ],
    sources: ["switch(1){}", "switch(1){}"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-var.js",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '"var x = 1") === undefined. Actual: \' + (',
      "));\n}",
    ],
    sources: ["var x = 1", "var x = 1"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-empty-while.j" + "s",
    strict: true,
    indirect: false,
    parts: [
      "if (",
      " !== undefined) {\n  throw new Test262Error('#1: eval(" +
        '"while(false);") === undefined. Actual: \' + (',
      "));\n}",
    ],
    sources: ["while(false);", "while(false);"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-expr-obj.js",
    strict: true,
    indirect: false,
    parts: [
      "var x = {};\nvar y;\nif (",
      " !== x) {\n  throw new Test262Error('#1: var x = {}; e" +
        'val("y = x") === x. Actual: \' + (',
      "));\n}    \nif (",
      " !== x) {\n  throw new Test262Error('#2: var x = {}; e" +
        'val("x") === x. Actual: \' + (',
      "));\n}",
    ],
    sources: ["y = x", "y = x", "x", "x"],
  },
  {
    path: "test/language/eval-code/direct/cptn-nrml-expr-prim.js",
    strict: true,
    indirect: false,
    parts: [
      "var x;\nif (",
      " !== 1) {\n  throw new Test262Error('#1: eval(\"x = 1" +
        "\") === 1. Actual: ' + (",
      "));\n}\nif (",
      ' !== 1) {\n  throw new Test262Error(\'#2: eval("1") =' +
        "== 1. Actual: ' + (",
      "));\n}\nif (",
      " !== '1') {\n  throw new Test262Error('#3: eval(\"\\'1" +
        "\\'\") === \\'1\\'. Actual: ' + (",
      "));\n}\nx = 1;\nif (",
      " !== 2) {\n  throw new Test262Error('#4: x = 1; eval(" +
        '"++x") === 2. Actual: \' + (x));\n}',
    ],
    sources: ["x = 1", "x = 1", "1", "1", "'1'", "'1'", "++x"],
  },
  {
    path: "test/language/eval-code/direct/cptn-thrw-prim.js",
    strict: true,
    indirect: false,
    parts: [
      "try {\n  ",
      ";\n  throw new Test262Error('#1.1: throw 1 must throw " +
        "SyntaxError. Actual: ' + (",
      "));\n} catch(e) {\n  if (e !== 1) {\n    throw new Tes" +
        "t262Error('#1.2: throw 1 must throw SyntaxError. Actua" +
        "l: ' + (e));\n  }  \n}",
    ],
    sources: ["throw 1;", "throw 1;"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-block" + ".js",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["{}"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-do-wh" + "ile.js",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["do ; while(false)"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-empty" + ".js",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: [";"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-for.j" + "s",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["for(false;false;false);"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-if.js",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["if (false) ;"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-switc" + "h.js",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["switch(1){}"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-var.j" + "s",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["var x = 1"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-empty-while" + ".js",
    strict: true,
    indirect: true,
    parts: ["assert.sameValue(", ", undefined);"],
    sources: ["while(false);"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-expr-obj.js",
    strict: true,
    indirect: true,
    parts: [
      "var x = {};\nvar y;\nassert.sameValue(",
      ",  x, 'AssignmentExpression');\nassert.sameValue(",
      ", x, 'IdentifierReference');",
    ],
    sources: ["y = x", "x"],
  },
  {
    path: "test/language/eval-code/indirect/cptn-nrml-expr-prim.j" + "s",
    strict: true,
    indirect: true,
    parts: [
      "var x;\nassert.sameValue(",
      ", 1, 'AssignmentExpression');\nassert.sameValue(",
      ", 1, 'NumericLiteral');\nassert.sameValue(",
      ", '1', 'StringLiteral');\nx = 1;\nassert.sameValue(",
      ", 2, 'UpdateExpression');",
    ],
    sources: ["x = 1", "1", "'1'", "++x"],
  },
  {
    path: "test/language/expressions/concatenation/S9.8_A1_T2.js",
    strict: true,
    indirect: false,
    parts: [
      'if (undefined + "" !== "undefined") {\n  throw new' +
        ' Test262Error(\'#1: undefined + "" === "undefined".' +
        ' Actual: \' + (undefined + ""));\n}\nif (void 0 + "' +
        '" !== "undefined") {\n  throw new Test262Error(\'#2:' +
        ' void 0 + "" === "undefined". Actual: \' + (void 0 ' +
        '+ ""));\n}\nif (',
      ' + "" !== "undefined") {\n  throw new Test262Error' +
        '(\'#3: eval("var x") + "" === "undefined". Actual' +
        ": ' + (",
      ' + ""));\n}',
    ],
    sources: ["var x", "var x"],
  },
  {
    path:
      "test/language/expressions/division/no-magic-asi-from-b" + "lock-eval.js",
    strict: true,
    indirect: false,
    parts: [
      "var of = 4;\nvar g = 2;\nvar notRegExp = ",
      ";\nassert.sameValue(notRegExp, .1);",
    ],
    sources: ["{[42]}.8/of/g"],
  },
  {
    path: "test/language/expressions/does-not-equals/S11.9.2_A6.1" + ".js",
    strict: true,
    indirect: false,
    parts: [
      "if ((undefined != undefined) !== false) {\n  throw new" +
        " Test262Error('#1: (undefined != undefined) === false'" +
        ");\n}\nif ((void 0 != undefined) !== false) {\n  throw" +
        " new Test262Error('#2: (void 0 != undefined) === false" +
        "');\n}\nif ((undefined != ",
      ") !== false) {\n  throw new Test262Error('#3: (undefin" +
        'ed != eval("var x")) === false\');\n}\nif ((undefined' +
        " != null) !== false) {\n  throw new Test262Error('#4: " +
        "(undefined != null) === false');\n}\nif ((null != void" +
        " 0) !== false) {\n  throw new Test262Error('#5: (null " +
        "!= void 0) === false');\n}\nif ((null != null) !== fal" +
        "se) {\n  throw new Test262Error('#6: (null != null) ==" +
        "= false');\n}",
    ],
    sources: ["var x"],
  },
  {
    path: "test/language/expressions/equals/S11.9.1_A6.1.js",
    strict: true,
    indirect: false,
    parts: [
      "if ((undefined == undefined) !== true) {\n  throw new " +
        "Test262Error('#1: (undefined == undefined) === true');" +
        "\n}\nif ((void 0 == undefined) !== true) {\n  throw ne" +
        "w Test262Error('#2: (void 0 == undefined) === true');" +
        "\n}\nif ((undefined == ",
      ") !== true) {\n  throw new Test262Error('#3: (undefine" +
        'd == eval("var x")) === true\');\n}\nif ((undefined =' +
        "= null) !== true) {\n  throw new Test262Error('#4: (un" +
        "defined == null) === true');\n}\nif ((null == void 0) " +
        "!== true) {\n  throw new Test262Error('#5: (null == vo" +
        "id 0) === true');\n}\nif ((null == null) !== true) {\n" +
        "  throw new Test262Error('#6: (null == null) === true'" +
        ");\n}",
    ],
    sources: ["var x"],
  },
  {
    path: "test/language/expressions/logical-not/S9.2_A1_T2.js",
    strict: true,
    indirect: false,
    parts: [
      "if (!(undefined) !== true) {\n  throw new Test262Error" +
        "('#1: !(undefined) === true. Actual: ' + (!(undefined)" +
        "));\n}\nif (!(void 0) !== true) {\n  throw new Test262" +
        "Error('#2: !(undefined) === true. Actual: ' + (!(undef" +
        "ined)));\n}\nif (!(",
      ") !== true) {\n  throw new Test262Error('#3: !(eval(\"" +
        "var x\")) === true. Actual: ' + (!(",
      ")));\n}",
    ],
    sources: ["var x", "var x"],
  },
  {
    path:
      "test/language/expressions/strict-does-not-equals/S11.9" + ".5_A6.1.js",
    strict: true,
    indirect: false,
    parts: [
      "if (undefined !== undefined) {\n  throw new Test262Err" +
        "or('#1: undefined === undefined');\n}\nif (void 0 !== " +
        "undefined) {\n  throw new Test262Error('#2: void 0 ===" +
        " undefined');\n}\nif (undefined !== ",
      ") {\n  throw new Test262Error('#3: undefined === eval(" +
        '"var x")\');\n}',
    ],
    sources: ["var x"],
  },
  {
    path: "test/language/expressions/strict-equals/S11.9.4_A6.1.j" + "s",
    strict: true,
    indirect: false,
    parts: [
      "if (!(undefined === undefined)) {\n  throw new Test262" +
        "Error('#1: undefined === undefined');\n}\nif (!(void 0" +
        " === undefined)) {\n  throw new Test262Error('#2: void" +
        " 0 === undefined');\n}\nif (!(undefined === ",
      ")) {\n  throw new Test262Error('#3: undefined === eval" +
        '("var x")\');\n}',
    ],
    sources: ["var x"],
  },
  {
    path: "test/language/expressions/unary-plus/S9.3_A1_T2.js",
    strict: true,
    indirect: false,
    parts: [
      "if (isNaN(+(undefined)) !== true) {\n  throw new Test2" +
        "62Error('#1: +(undefined) === Not-a-Number. Actual: ' " +
        "+ (+(undefined)));\n}\nif (isNaN(+(void 0)) !== true) " +
        "{\n  throw new Test262Error('#2: +(void 0) === Not-a-N" +
        "umber. Actual: ' + (+(void 0)));\n}\nif (isNaN(+(",
      ")) !== true) {\n  throw new Test262Error('#3: +(eval(" +
        '"var x")) === Not-a-Number. Actual: \' + (+(',
      ")));\n}",
    ],
    sources: ["var x", "var x"],
  },
  {
    path:
      "test/language/statementList/eval-block-array-literal-w" + "ith-item.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Arr" +
        "ay.prototype);\nassert.sameValue(result.length, 1);\na" +
        "ssert.sameValue(result[0], 42);",
    ],
    sources: ["{}[42];"],
  },
  {
    path: "test/language/statementList/eval-block-array-literal.j" + "s",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Arr" +
        "ay.prototype);\nassert.sameValue(result.length, 0);",
    ],
    sources: ["{}[];"],
  },
  {
    path:
      "test/language/statementList/eval-block-arrow-function-" +
      "assignment-expr.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result(), 42);"],
    sources: ["{}() => 42;"],
  },
  {
    path:
      "test/language/statementList/eval-block-arrow-function-" +
      "functionbody.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result(), 42);"],
    sources: ["{}() => { return 42; };"],
  },
  {
    path: "test/language/statementList/eval-block-block-with-labe" + "ls.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(result, 42, 'it does not evaluate " +
        "to an Object with the property x');",
    ],
    sources: ["{}{x: 42};"],
  },
  {
    path: "test/language/statementList/eval-block-block.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, undefined);"],
    sources: ["{}{}"],
  },
  {
    path:
      "test/language/statementList/eval-block-expr-arrow-func" +
      "tion-boolean-literal.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, 42);"],
    sources: ["{}() => 1, 42;"],
  },
  {
    path: "test/language/statementList/eval-block-let-declaration" + ".js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, 42);"],
    sources: ["{}let a, b = 42, c;b;"],
  },
  {
    path: "test/language/statementList/eval-block-regexp-literal-" + "flags.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Reg" +
        "Exp.prototype);\nassert.sameValue(result.flags, 'g');" +
        "\nassert.sameValue(result.toString(), '/1/g');",
    ],
    sources: ["{}/1/g;"],
  },
  {
    path: "test/language/statementList/eval-block-regexp-literal." + "js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Reg" +
        "Exp.prototype);\nassert.sameValue(result.flags, '');\n" +
        "assert.sameValue(result.toString(), '/1/');",
    ],
    sources: ["{}/1/;"],
  },
  {
    path: "test/language/statementList/eval-block-with-statment-b" + "lock.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nvar expected = 3000;\nassert.sameValue(result, expe" + "cted);",
    ],
    sources: ["{length: 3000}{}"],
  },
  {
    path:
      "test/language/statementList/eval-class-array-literal-w" + "ith-item.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Arr" +
        "ay.prototype);\nassert.sameValue(result.length, 1);\na" +
        "ssert.sameValue(result[0], 42);",
    ],
    sources: ["class C {}[42];"],
  },
  {
    path: "test/language/statementList/eval-class-array-literal.j" + "s",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Arr" +
        "ay.prototype);\nassert.sameValue(result.length, 0);",
    ],
    sources: ["class C {}[];"],
  },
  {
    path:
      "test/language/statementList/eval-class-arrow-function-" +
      "assignment-expr.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result(), 42);"],
    sources: ["class C {}() => 42;"],
  },
  {
    path:
      "test/language/statementList/eval-class-arrow-function-" +
      "functionbody.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result(), 42);"],
    sources: ["class C {}() => { return 42; };"],
  },
  {
    path: "test/language/statementList/eval-class-block-with-labe" + "ls.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(result, 42, 'it does not evaluate " +
        "to an Object with the property x');",
    ],
    sources: ["class C {}{x: 42};"],
  },
  {
    path: "test/language/statementList/eval-class-block.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, undefined);"],
    sources: ["class C {}{}"],
  },
  {
    path:
      "test/language/statementList/eval-class-expr-arrow-func" +
      "tion-boolean-literal.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, 42);"],
    sources: ["class C {}() => 1, 42;"],
  },
  {
    path: "test/language/statementList/eval-class-let-declaration" + ".js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, 42);"],
    sources: ["class C {}let a, b = 42, c;b;"],
  },
  {
    path: "test/language/statementList/eval-class-regexp-literal-" + "flags.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Reg" +
        "Exp.prototype);\nassert.sameValue(result.flags, 'g');" +
        "\nassert.sameValue(result.toString(), '/1/g');",
    ],
    sources: ["class C {}/1/g;"],
  },
  {
    path: "test/language/statementList/eval-class-regexp-literal." + "js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Reg" +
        "Exp.prototype);\nassert.sameValue(result.flags, '');\n" +
        "assert.sameValue(result.toString(), '/1/');",
    ],
    sources: ["class C {}/1/;"],
  },
  {
    path: "test/language/statementList/eval-fn-array-literal-with" + "-item.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Arr" +
        "ay.prototype);\nassert.sameValue(result.length, 1);\na" +
        "ssert.sameValue(result[0], 42);",
    ],
    sources: ["function fn() {}[42];"],
  },
  {
    path: "test/language/statementList/eval-fn-array-literal.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Arr" +
        "ay.prototype);\nassert.sameValue(result.length, 0);",
    ],
    sources: ["function fn() {}[];"],
  },
  {
    path:
      "test/language/statementList/eval-fn-arrow-function-ass" +
      "ignment-expr.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result(), 42);"],
    sources: ["function fn() {}() => 42;"],
  },
  {
    path:
      "test/language/statementList/eval-fn-arrow-function-fun" + "ctionbody.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result(), 42);"],
    sources: ["function fn() {}() => { return 42; };"],
  },
  {
    path: "test/language/statementList/eval-fn-block-with-labels." + "js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(result, 42, 'it does not evaluate " +
        "to an Object with the property x');",
    ],
    sources: ["function fn() {}{x: 42};"],
  },
  {
    path: "test/language/statementList/eval-fn-block.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, undefined);"],
    sources: ["function fn() {}{}"],
  },
  {
    path:
      "test/language/statementList/eval-fn-expr-arrow-functio" +
      "n-boolean-literal.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, 42);"],
    sources: ["function fn() {}() => 1, 42;"],
  },
  {
    path: "test/language/statementList/eval-fn-let-declaration.js",
    strict: true,
    indirect: false,
    parts: ["var result = ", ";\nassert.sameValue(result, 42);"],
    sources: ["function fn() {}let a, b = 42, c;b;"],
  },
  {
    path: "test/language/statementList/eval-fn-regexp-literal-fla" + "gs.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Reg" +
        "Exp.prototype);\nassert.sameValue(result.flags, 'g');" +
        "\nassert.sameValue(result.toString(), '/1/g');",
    ],
    sources: ["function fn() {}/1/g;"],
  },
  {
    path: "test/language/statementList/eval-fn-regexp-literal.js",
    strict: true,
    indirect: false,
    parts: [
      "var result = ",
      ";\nassert.sameValue(Object.getPrototypeOf(result), Reg" +
        "Exp.prototype);\nassert.sameValue(result.flags, '');\n" +
        "assert.sameValue(result.toString(), '/1/');",
    ],
    sources: ["function fn() {}/1/;"],
  },
  {
    path: "test/language/statements/const/cptn-value.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(\n  ",
      ", undefined, 'Single declaration'\n);\nassert.sameValu" + "e(\n  ",
      ",\n  undefined,\n  'Multiple declarations'\n);\nassert" + ".sameValue(",
      ", 4);\nassert.sameValue(",
      ", 6);",
    ],
    sources: [
      "const test262id1 = 1;",
      "const test262id2 = 2, test262id3 = 3;",
      "4; const test262id5 = 5;",
      "6; let test262id7 = 7, test262id8 = 8;",
    ],
  },
  {
    path: "test/language/statements/do-while/cptn-abrupt-empty.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 3);\nassert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 6);",
    ],
    sources: [
      "1; do { break; } while (false)",
      "2; do { 3; break; } while (false)",
      "4; do { continue; } while (false)",
      "5; do { 6; continue; } while (false)",
    ],
  },
  {
    path: "test/language/statements/do-while/cptn-normal.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 3);"],
    sources: ["1; do { } while (false)", "2; do { 3; } while (false)"],
  },
  {
    path: "test/language/statements/empty/cptn-value.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 2);\nassert.sameValue(",
      ", 3);",
    ],
    sources: [";", "2;;", "3;;;"],
  },
  {
    path: "test/language/statements/for-in/S12.6.4_A3.1.js",
    strict: true,
    indirect: false,
    parts: [
      'var __str, __evaluated, arr;\n__str="";\n__evaluated' + " = ",
      ";\nif (__evaluated !== __str) {\n\tthrow new Test262Er" +
        "ror('#1: __evaluated === __str. Actual:  __evaluated =" +
        '==\'+ __evaluated  );\n}\nif (!( (__str.indexOf("2")!' +
        '==-1)&&(__str.indexOf("1")!==-1)&&(__str.indexOf("4' +
        '")!==-1)&&(__str.indexOf("3")!==-1) )) {\n\tthrow n' +
        'ew Test262Error(\'#2: (__str.indexOf("2")!==-1)&&(__s' +
        'tr.indexOf("1")!==-1)&&(__str.indexOf("4")!==-1)&&' +
        '(__str.indexOf("3")!==-1)\');\n}',
    ],
    sources: ["for(var ind in (arr=[2,1,4,3]))__str+=arr[ind]"],
  },
  {
    path: "test/language/statements/for-in/S12.6.4_A3.js",
    strict: true,
    indirect: false,
    parts: [
      'var __str, __evaluated, arr, ind;\n__str="";\n__eval' + "uated = ",
      ";\nif (__evaluated !== __str) {\n\tthrow new Test262Er" +
        "ror('#1: __evaluated === __str. Actual:  __evaluated =" +
        '==\'+ __evaluated  );\n}\nif (!( (__str.indexOf("2")!' +
        '==-1)&&(__str.indexOf("1")!==-1)&&(__str.indexOf("4' +
        '")!==-1)&&(__str.indexOf("3")!==-1) )) {\n\tthrow n' +
        'ew Test262Error(\'#2: (__str.indexOf("2")!==-1)&&(__s' +
        'tr.indexOf("1")!==-1)&&(__str.indexOf("4")!==-1)&&' +
        '(__str.indexOf("3")!==-1)\');\n}',
    ],
    sources: ["for(ind in (arr=[2,1,4,3]))__str+=arr[ind]"],
  },
  {
    path: "test/language/statements/for-in/S12.6.4_A4.1.js",
    strict: true,
    indirect: false,
    parts: [
      'var __str, __evaluated, hash;\n__str="";\n__evaluate' + "d = ",
      ';\nif ( !( (__evaluated.indexOf("a")!==-1)& (__evalu' +
        'ated.indexOf("b")!==-1)& (__evaluated.indexOf("c")' +
        '!==-1)&(__evaluated.indexOf("d")!==-1) ) ) {\n\tthro' +
        'w new Test262Error(\'#1: (__evaluated.indexOf("a")!==' +
        '-1)& (__evaluated.indexOf("b")!==-1)& (__evaluated.i' +
        'ndexOf("c")!==-1)&(__evaluated.indexOf("d")!==-1)\'' +
        ");\n}\nif (__str !== __evaluated) {\n\tthrow new Test2" +
        "62Error('#2: __str === __evaluated. Actual:  __str ===" +
        "'+ __str  );\n}",
    ],
    sources: [
      "for(var ind in (hash={2:'b',1:'a',4:'d',3:'c'}))__str+" + "=hash[ind]",
    ],
  },
  {
    path: "test/language/statements/for-in/S12.6.4_A4.js",
    strict: true,
    indirect: false,
    parts: [
      'var __str, __evaluated, hash, ind;\n__str="";\n__eva' + "luated = ",
      ';\nif ( !( (__evaluated.indexOf("a")!==-1)& (__evalu' +
        'ated.indexOf("b")!==-1)& (__evaluated.indexOf("c")' +
        '!==-1)&(__evaluated.indexOf("d")!==-1) ) ) {\n\tthro' +
        'w new Test262Error(\'#1: (__evaluated.indexOf("a")!==' +
        '-1)& (__evaluated.indexOf("b")!==-1)& (__evaluated.i' +
        'ndexOf("c")!==-1)&(__evaluated.indexOf("d")!==-1)\'' +
        ");\n}\nif (__str !== __evaluated) {\n\tthrow new Test2" +
        "62Error('#2: __str === __evaluated. Actual:  __str ===" +
        "'+ __str  );\n}",
    ],
    sources: [
      "for(ind in (hash={2:'b',1:'a',4:'d',3:'c'}))__str+=has" + "h[ind]",
    ],
  },
  {
    path: "test/language/statements/for-in/cptn-decl-abrupt-empty" + ".js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 3);\nassert.sameValue(\n  ",
      ",\n  undefined\n);\nassert.sameValue(\n  ",
      ",\n  6\n);",
    ],
    sources: [
      "1; for (var a in { x: 0 }) { break; }",
      "2; for (var b in { x: 0 }) { 3; break; }",
      "4; outer: do { for (var a in { x: 0 }) { continue oute" +
        "r; } } while (false)",
      "5; outer: do { for (var b in { x: 0 }) { 6; continue o" +
        "uter; } } while (false)",
    ],
  },
  {
    path: "test/language/statements/for-in/cptn-decl-itr.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 3);"],
    sources: [
      "1; for (var a in { x: 0 }) { }",
      "2; for (var b in { x: 0 }) { 3; }",
    ],
  },
  {
    path: "test/language/statements/for-in/cptn-decl-skip-itr.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);",
    ],
    sources: [
      "1; for (var a in undefined) { }",
      "2; for (var b in undefined) { 3; }",
      "4; for (var c in null) { }",
      "5; for (var d in null) { 6; }",
    ],
  },
  {
    path: "test/language/statements/for-in/cptn-decl-zero-itr.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);",
    ],
    sources: ["1; for (var a in {}) { }", "2; for (var b in {}) { 3; }"],
  },
  {
    path: "test/language/statements/for-in/cptn-expr-abrupt-empty" + ".js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", 3);\nassert.sameValue(\n  ",
      ",\n  undefined\n);\nassert.sameValue(\n  ",
      ",\n  6\n);",
    ],
    sources: [
      "var a; 1; for (a in { x: 0 }) { break; }",
      "var b; 2; for (b in { x: 0 }) { 3; break; }",
      "var a; 4; outer: do { for (a in { x: 0 }) { continue o" +
        "uter; } } while (false)",
      "var b; 5; outer: do { for (b in { x: 0 }) { 6; continu" +
        "e outer; } } while (false)",
    ],
  },
  {
    path: "test/language/statements/for-in/cptn-expr-itr.js",
    strict: true,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 3);"],
    sources: [
      "var a; 1; for (a in { x: 0 }) { }",
      "var b; 2; for (b in { x: 0 }) { 3; }",
    ],
  },
  {
    path: "test/language/statements/for-in/cptn-expr-skip-itr.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);",
    ],
    sources: [
      "var a; 1; for (a in undefined) { }",
      "var b; 2; for (b in undefined) { 3; }",
      "var c; 4; for (c in null) { }",
      "var d; 5; for (d in null) { 6; }",
    ],
  },
  {
    path: "test/language/statements/for-in/cptn-expr-zero-itr.js",
    strict: true,
    indirect: false,
    parts: [
      "assert.sameValue(",
      ", undefined);\nassert.sameValue(",
      ", undefined);",
    ],
    sources: ["var a; 1; for (a in {}) { }", "var b; 2; for (b in {}) { 3; }"],
  },
  {
    path: "test/language/statements/with/cptn-abrupt-empty.js",
    strict: false,
    indirect: false,
    parts: [
      "assert.sameValue(\n  ",
      ", 3\n);\nassert.sameValue(\n  ",
      ", undefined\n);\nassert.sameValue(\n  ",
      ", 10\n);\nassert.sameValue(\n  ",
      ", undefined\n);",
    ],
    sources: [
      "1; do { 2; with({}) { 3; break; } 4; } while (false);",
      "5; do { 6; with({}) { break; } 7; } while (false);",
      "8; do { 9; with({}) { 10; continue; } 11; } while (fal" + "se)",
      "12; do { 13; with({}) { continue; } 14; } while (false" + ")",
    ],
  },
  {
    path: "test/language/statements/with/cptn-nrml.js",
    strict: false,
    indirect: false,
    parts: ["assert.sameValue(", ", undefined);\nassert.sameValue(", ", 3);"],
    sources: ["1; with({}) { }", "2; with({}) { 3; }"],
  },
];
