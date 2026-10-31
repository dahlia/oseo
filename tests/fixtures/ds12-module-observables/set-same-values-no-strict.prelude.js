// Static adaptation of the pinned test262 source:
// Upstream: await-ns-set-same-values-no-strict.js

function observe(ns) {
  assert.sameValue(
    Reflect.set(ns, "local1", "Test262"),
    false,
    "Reflect.set: local1",
  );
  assert.sameValue(
    (ns.local1 = "Test262"),
    "Test262",
    "AssignmentExpression: local1",
  );

  assert.sameValue(
    Reflect.set(ns, "renamed", "TC39"),
    false,
    "Reflect.set: renamed",
  );
  assert.sameValue(
    (ns.renamed = "TC39"),
    "TC39",
    "AssignmentExpression: renamed",
  );

  assert.sameValue(
    Reflect.set(ns, "indirect", "Test262"),
    false,
    "Reflect.set: indirect",
  );
  assert.sameValue(
    (ns.indirect = "Test262"),
    "Test262",
    "AssignmentExpression: indirect",
  );

  assert.sameValue(
    Reflect.set(ns, "default", 42),
    false,
    "Reflect.set: default",
  );
  assert.sameValue((ns.default = 42), 42, "AssignmentExpression: default");

  assert.sameValue(
    Reflect.set(ns, Symbol.toStringTag, ns[Symbol.toStringTag]),
    false,
    "Reflect.set: Symbol.toStringTag",
  );
  assert.sameValue(
    (ns[Symbol.toStringTag] = ns[Symbol.toStringTag]),
    "Module",
    "AssignmentExpression: Symbol.toStringTag",
  );
}
