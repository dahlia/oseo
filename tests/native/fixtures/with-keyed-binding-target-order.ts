/**
 * A native-only observation of keyed object pattern identifier leaves
 * inside `with`. KeyedBindingInitialization and
 * KeyedDestructuringAssignmentEvaluation resolve the leaf after its
 * property key and before GetV and the default initializer, then write the
 * Object Environment Record selected then, even when a getter or the
 * default later removes or adds that binding. Node.js and Deno (V8) still
 * resolve the leaf after GetV and the default, which is why the reviewed
 * test262 case fails there, so *tests/native.ts* compares the compiled
 * program with the ECMA-262 trace instead of with those references.
 */
export const withKeyedBindingTargetOrderSource: string = `
const log = [];
function traced(target) {
  return new Proxy(target, {
    has(object, key) {
      log.push("has " + String(key));
      return Reflect.has(object, key);
    },
  });
}
function report(label, ...values) {
  console.log(label, log.join(","), ...values);
  log.length = 0;
}
function computedMiss() {
  var target = "outer";
  const key = {
    toString() {
      log.push("key");
      return "p";
    },
  };
  const source = {
    get p() {
      log.push("get");
      return undefined;
    },
  };
  with (traced({})) {
    var { [key]: target = (log.push("default"), "fallback") } = source;
  }
  report("computed miss", target);
}
function getterDeletesSelected() {
  var target = "outer";
  const object = { target: "object" };
  const source = {
    get p() {
      log.push("get");
      delete object.target;
      return "value";
    },
  };
  with (traced(object)) {
    var { p: target } = source;
  }
  report("getter deletes", target, Object.keys(object).join("/"),
    object.target);
}
function defaultAddsBinding() {
  var target = "outer";
  const object = {};
  const source = {};
  with (traced(object)) {
    var { p: target = ((object.target = "added"), "default") } = source;
  }
  report("default adds", target, object.target);
}
function unscopablesBlock() {
  var target = "outer";
  const object = { target: "object" };
  Object.defineProperty(object, Symbol.unscopables, {
    get() {
      log.push("unscopables");
      return { target: true };
    },
  });
  const source = {
    get p() {
      log.push("get");
      return "value";
    },
  };
  with (traced(object)) {
    var { p: target } = source;
  }
  report("unscopables", target, object.target);
}
function nestedAndSiblings() {
  var first = "outer";
  var second = "outer";
  const source = {
    get a() {
      log.push("get a");
      return {
        get b() {
          log.push("get b");
          return 1;
        },
      };
    },
    get c() {
      log.push("get c");
      return 2;
    },
  };
  with (traced({})) {
    var { a: { b: first }, c: second } = source;
  }
  report("nested", first, second);
}
function shorthandDefault() {
  var target = "outer";
  const source = {
    get target() {
      log.push("get");
      return undefined;
    },
  };
  with (traced({})) {
    var { target = (log.push("default"), "fallback") } = source;
  }
  report("shorthand", target);
}
function lookupThrows() {
  var target = "outer";
  const environment = new Proxy({}, {
    has(object, key) {
      if (key === "target") throw new RangeError("lookup");
      return false;
    },
  });
  const source = {
    get p() {
      log.push("get");
      return "value";
    },
  };
  try {
    with (environment) {
      var { p: target } = source;
    }
  } catch (error) {
    log.push(error.name);
  }
  report("lookup throws", target);
}
function unscopablesThrows() {
  var target = "outer";
  const object = { target: "object" };
  Object.defineProperty(object, Symbol.unscopables, {
    get() {
      log.push("unscopables");
      throw new RangeError("unscopables");
    },
  });
  const source = {
    get p() {
      log.push("get");
      return "value";
    },
  };
  try {
    with (traced(object)) {
      var { p: target } = source;
    }
  } catch (error) {
    log.push(error.name);
  }
  report("unscopables throws", target, object.target);
}
// KeyedDestructuringAssignmentEvaluation shares the order: the target
// reference precedes GetV, and sloppy and strict PutValue then differ
// only in SetMutableBinding's treatment of a deleted selected property.
function assignmentGetterDeletes(strict) {
  var target = "outer";
  const object = { target: "object" };
  const source = {
    get p() {
      log.push("get");
      delete object.target;
      return "value";
    },
  };
  with (traced(object)) {
    if (strict) {
      (function () {
        "use strict";
        try {
          ({ p: target } = source);
        } catch (error) {
          log.push(error.name);
        }
      })();
    } else {
      ({ p: target } = source);
    }
  }
  report("assignment deletes " + strict, target,
    "target" in object ? object.target : "absent");
}
function assignmentDefaultAdds(strict) {
  var target = "outer";
  const object = {};
  const source = {};
  const key = {
    toString() {
      log.push("key");
      return "p";
    },
  };
  with (traced(object)) {
    if (strict) {
      (function () {
        "use strict";
        ({ [key]: target = ((object.target = "added"), "default") } =
          source);
      })();
    } else {
      ({ [key]: target = ((object.target = "added"), "default") } = source);
    }
  }
  report("assignment adds " + strict, target, object.target);
}
computedMiss();
getterDeletesSelected();
defaultAddsBinding();
unscopablesBlock();
nestedAndSiblings();
shorthandDefault();
lookupThrows();
unscopablesThrows();
assignmentGetterDeletes(false);
assignmentGetterDeletes(true);
assignmentDefaultAdds(false);
assignmentDefaultAdds(true);
`;

/** One case's report line: its label, ordered trace, and final values. */
function keyedTrace(
  label: string,
  steps: readonly string[],
  ...values: readonly string[]
): string {
  return `${[label, steps.join(","), ...values].join(" ")}\n`;
}

/** The ECMA-262 trace and final bindings of each case, in program order. */
export const withKeyedBindingTargetOrderExpected: string = [
  keyedTrace(
    "computed miss",
    ["has source", "has key", "key", "has target", "get", "has log", "default"],
    "fallback",
  ),
  keyedTrace(
    "getter deletes",
    ["has source", "has target", "get", "has target"],
    "outer",
    "target",
    "value",
  ),
  keyedTrace(
    "default adds",
    ["has source", "has target", "has object"],
    "default",
    "added",
  ),
  keyedTrace(
    "unscopables",
    ["has source", "has target", "unscopables", "get"],
    "value",
    "object",
  ),
  keyedTrace(
    "nested",
    ["has source", "get a", "has first", "get b", "has second", "get c"],
    "1",
    "2",
  ),
  keyedTrace(
    "shorthand",
    ["has source", "has target", "get", "has log", "default"],
    "fallback",
  ),
  keyedTrace("lookup throws", ["RangeError"], "outer"),
  keyedTrace(
    "unscopables throws",
    ["has source", "has target", "unscopables", "RangeError"],
    "outer",
    "object",
  ),
  keyedTrace(
    "assignment deletes false",
    ["has strict", "has source", "has target", "get", "has target"],
    "outer",
    "value",
  ),
  keyedTrace(
    "assignment deletes true",
    [
      "has strict",
      "has source",
      "has target",
      "get",
      "has target",
      "has log",
      "ReferenceError",
    ],
    "outer",
    "absent",
  ),
  ...[false, true].map((strict) =>
    keyedTrace(
      `assignment adds ${String(strict)}`,
      [
        "has strict",
        "has source",
        "has key",
        "key",
        "has target",
        "has object",
      ],
      "default",
      "added",
    ),
  ),
].join("");
