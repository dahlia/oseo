/**
 * A native-only observation of identifier reads through a selected Object
 * Environment Record. ECMA-262 2025 9.1.1.2.6 GetBindingValue repeats
 * HasProperty on the object HasBinding selected, so a binding an
 * `@@unscopables` getter or a Proxy `has` trap removes in between reads
 * `undefined` in non-strict code and throws ReferenceError in strict code,
 * including under `typeof` and before a call evaluates its arguments. A
 * call still receives the selected object as `this`, and an abrupt second
 * `has` propagates. An optional call `f?.()` takes the same steps: a
 * binding gone before Get short-circuits the non-strict chain before its
 * arguments, and a present one is called with the selected Proxy as
 * `this`. The expected text follows that algorithm and the pinned
 * test262 get-binding-value cases under *test/language/statements/with/*.
 * Node.js and Deno (V8) skip the second HasProperty, and Bun (JSC) differs
 * from both, so *tests/native.ts* compares the compiled program with this
 * text instead of with reference engines.
 */
export const withGetBindingValueSource: string = `
var lines = [];
function show(f) {
  try {
    return String(f());
  } catch (e) {
    return e.constructor.name;
  }
}
function disappearing(name) {
  var env = {};
  env[name] = 0;
  Object.defineProperty(env, Symbol.unscopables, {
    configurable: true,
    get: function () {
      delete env[name];
      return undefined;
    },
  });
  return env;
}
function traced(target, log) {
  return new Proxy(target, {
    has(t, k) {
      if (k !== "x") return false;
      log.push("has:" + String(k));
      return Reflect.has(t, k);
    },
    get(t, k, r) {
      log.push("get:" + String(k));
      return Reflect.get(t, k, r);
    },
  });
}
function flicker(log, answers) {
  return new Proxy({ x: 1 }, {
    has(t, k) {
      if (k !== "x") return false;
      var a = answers.shift();
      log.push("has:" + String(k) + "=" + a);
      if (a === "throw") throw new RangeError("has");
      return a;
    },
    get(t, k, r) {
      log.push("get:" + String(k));
      return Reflect.get(t, k, r);
    },
  });
}
function tracedCall(log, answers) {
  var environment = new Proxy({
    f: function () {
      "use strict";
      log.push("call");
      return this === environment;
    },
  }, {
    has(t, k) {
      if (k !== "f") return false;
      var a = answers.shift();
      log.push("has:" + String(k) + "=" + a);
      if (a === "throw") throw new RangeError("has");
      return a;
    },
    get(t, k, r) {
      log.push("get:" + String(k));
      return Reflect.get(t, k, r);
    },
  });
  return environment;
}
function run(strict) {
  var s = strict ? "strict" : "sloppy";
  var r;
  var log;
  var env0 = { eval, get [Symbol.unscopables]() { delete this.eval; } };
  with (env0) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return eval; });
        })()
      : show(function () { return eval; });
  }
  lines.push("R0 " + s + " coordinator-eval-probe " + r);
  with (disappearing("eval")) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return eval; });
        })()
      : show(function () { return eval; });
  }
  lines.push("R1 " + s + " root-eval-probe " + r);
  r = (function (x) {
    with (disappearing("x")) {
      return strict
        ? (function () {
            "use strict";
            return show(function () { return x; });
          })()
        : show(function () { return x; });
    }
  })("lexical");
  lines.push("R2 " + s + " disappear-lexical-fallback " + r);
  with ({ x: 7 }) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return x; });
        })()
      : show(function () { return x; });
  }
  lines.push("R3 " + s + " present " + r);
  with (Object.create({ x: 8 })) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return x; });
        })()
      : show(function () { return x; });
  }
  lines.push("R4 " + s + " inherited " + r);
  with (disappearing("x")) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return typeof x; });
        })()
      : show(function () { return typeof x; });
  }
  lines.push("T1 " + s + " typeof-disappear " + r);
  with ({}) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return typeof x; });
        })()
      : show(function () { return typeof x; });
  }
  lines.push("T2 " + s + " typeof-all-miss " + r);
  log = [];
  function args() {
    log.push("args");
    return 0;
  }
  with (disappearing("f")) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return f(args()); });
        })()
      : show(function () { return f(args()); });
  }
  lines.push("C1 " + s + " call-disappear " + r + " [" + log + "]");
  var env = { f: function () { return this === env; } };
  with (env) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return f(); });
        })()
      : show(function () { return f(); });
  }
  lines.push("C2 " + s + " call-present-this " + r);
  log = [];
  with (traced({ x: 1 }, log)) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return x; });
        })()
      : show(function () { return x; });
  }
  lines.push("P1 " + s + " proxy-present " + r + " [" + log + "]");
  log = [];
  with (flicker(log, [true, false])) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return x; });
        })()
      : show(function () { return x; });
  }
  lines.push("P2 " + s + " proxy-flicker " + r + " [" + log + "]");
  log = [];
  with (flicker(log, [true, "throw"])) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return x; });
        })()
      : show(function () { return x; });
  }
  lines.push("P3 " + s + " proxy-has-throws " + r + " [" + log + "]");
  log = [];
  with ({ x: 2 }) {
    with (flicker(log, [false])) {
      r = strict
        ? (function () {
            "use strict";
            return show(function () { return x; });
          })()
        : show(function () { return x; });
    }
  }
  lines.push("P4 " + s + " proxy-miss-next " + r + " [" + log + "]");
  log = [];
  with (disappearing("f")) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return f?.(args()); });
        })()
      : show(function () { return f?.(args()); });
  }
  lines.push("O1 " + s + " optional-call-disappear " + r + " [" + log + "]");
  log = [];
  with (tracedCall(log, [true, true])) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return f?.(args()); });
        })()
      : show(function () { return f?.(args()); });
  }
  lines.push("O2 " + s + " optional-call-proxy " + r + " [" + log + "]");
  log = [];
  with (tracedCall(log, [true, false])) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return f?.(args()); });
        })()
      : show(function () { return f?.(args()); });
  }
  lines.push("O3 " + s + " optional-call-flicker " + r + " [" + log + "]");
  log = [];
  with (tracedCall(log, [true, "throw"])) {
    r = strict
      ? (function () {
          "use strict";
          return show(function () { return f?.(args()); });
        })()
      : show(function () { return f?.(args()); });
  }
  lines.push("O4 " + s + " optional-call-has-throws " + r + " [" + log + "]");
}
run(false);
run(true);
var survivor = { x: "kept" };
for (var index = 0; index < 16; index = index + 1) {
  Object.defineProperty({}, "item", { value: { index: index } });
}
with (survivor) {
  lines.push("G1 sloppy collection " + show(function () { return x; }));
}
for (var i = 0; i < lines.length; i = i + 1) console.log(lines[i]);
`;

const unscopablesGet = "get:Symbol(Symbol.unscopables)";

/** The ECMA-262 2025 observation of {@link withGetBindingValueSource}. */
export const withGetBindingValueExpected: string =
  [
    "R0 sloppy coordinator-eval-probe undefined",
    "R1 sloppy root-eval-probe undefined",
    "R2 sloppy disappear-lexical-fallback undefined",
    "R3 sloppy present 7",
    "R4 sloppy inherited 8",
    "T1 sloppy typeof-disappear undefined",
    "T2 sloppy typeof-all-miss undefined",
    "C1 sloppy call-disappear TypeError [args]",
    "C2 sloppy call-present-this true",
    `P1 sloppy proxy-present 1 [has:x,${unscopablesGet},has:x,get:x]`,
    `P2 sloppy proxy-flicker undefined [has:x=true,${unscopablesGet},` +
      "has:x=false]",
    `P3 sloppy proxy-has-throws RangeError [has:x=true,${unscopablesGet},` +
      "has:x=throw]",
    "P4 sloppy proxy-miss-next 2 [has:x=false]",
    "O1 sloppy optional-call-disappear undefined []",
    `O2 sloppy optional-call-proxy true [has:f=true,${unscopablesGet},` +
      "has:f=true,get:f,args,call]",
    `O3 sloppy optional-call-flicker undefined [has:f=true,${unscopablesGet},` +
      "has:f=false]",
    `O4 sloppy optional-call-has-throws RangeError [has:f=true,` +
      `${unscopablesGet},has:f=throw]`,
    "R0 strict coordinator-eval-probe ReferenceError",
    "R1 strict root-eval-probe ReferenceError",
    "R2 strict disappear-lexical-fallback ReferenceError",
    "R3 strict present 7",
    "R4 strict inherited 8",
    "T1 strict typeof-disappear ReferenceError",
    "T2 strict typeof-all-miss undefined",
    "C1 strict call-disappear ReferenceError []",
    "C2 strict call-present-this true",
    `P1 strict proxy-present 1 [has:x,${unscopablesGet},has:x,get:x]`,
    `P2 strict proxy-flicker ReferenceError [has:x=true,${unscopablesGet},` +
      "has:x=false]",
    `P3 strict proxy-has-throws RangeError [has:x=true,${unscopablesGet},` +
      "has:x=throw]",
    "P4 strict proxy-miss-next 2 [has:x=false]",
    "O1 strict optional-call-disappear ReferenceError []",
    `O2 strict optional-call-proxy true [has:f=true,${unscopablesGet},` +
      "has:f=true,get:f,args,call]",
    "O3 strict optional-call-flicker ReferenceError [has:f=true," +
      `${unscopablesGet},has:f=false]`,
    `O4 strict optional-call-has-throws RangeError [has:f=true,` +
      `${unscopablesGet},has:f=throw]`,
    "G1 sloppy collection kept",
  ].join("\n") + "\n";
