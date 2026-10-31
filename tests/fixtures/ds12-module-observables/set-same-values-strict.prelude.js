// Static adaptation of the pinned test262 source:
// Upstream: await-ns-set-same-values-strict.js

function observe(ns) {
  "use strict";

  assert.sameValue(
    Reflect.set(ns, "local1", "Test262"),
    false,
    "Reflect.set: local1",
  );
  assert.throws(
    TypeError,
    function () {
      ns.local1 = "Test262";
    },
    "AssignmentExpression: local1",
  );

  assert.sameValue(
    Reflect.set(ns, "renamed", "TC39"),
    false,
    "Reflect.set: renamed",
  );
  assert.throws(
    TypeError,
    function () {
      ns.renamed = "TC39";
    },
    "AssignmentExpression: renamed",
  );

  assert.sameValue(
    Reflect.set(ns, "indirect", "Test262"),
    false,
    "Reflect.set: indirect",
  );
  assert.throws(
    TypeError,
    function () {
      ns.indirect = "Test262";
    },
    "AssignmentExpression: indirect",
  );

  assert.sameValue(
    Reflect.set(ns, "default", 42),
    false,
    "Reflect.set: default",
  );
  assert.throws(
    TypeError,
    function () {
      ns.default = 42;
    },
    "AssignmentExpression: default",
  );

  assert.sameValue(
    Reflect.set(ns, Symbol.toStringTag, ns[Symbol.toStringTag]),
    false,
    "Reflect.set: Symbol.toStringTag",
  );
  assert.throws(
    TypeError,
    function () {
      ns[Symbol.toStringTag] = ns[Symbol.toStringTag];
    },
    "AssignmentExpression: Symbol.toStringTag",
  );
}
