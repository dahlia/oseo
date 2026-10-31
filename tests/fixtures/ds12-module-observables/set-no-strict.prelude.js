// Static adaptation of the pinned test262 source:
// Upstream: await-ns-set-no-strict.js

var sym = Symbol("test262");

function observe(ns) {
  assert.sameValue(Reflect.set(ns, "local1"), false, "Reflect.set: local1");
  assert.sameValue((ns.local1 = null), null, "AssignmentExpression: local1");

  assert.sameValue(Reflect.set(ns, "local2"), false, "Reflect.set: local2");
  assert.sameValue((ns.local2 = null), null, "AssignmentExpression: local2");

  assert.sameValue(Reflect.set(ns, "renamed"), false, "Reflect.set: renamed");
  assert.sameValue((ns.renamed = null), null, "AssignmentExpression: renamed");

  assert.sameValue(Reflect.set(ns, "indirect"), false, "Reflect.set: indirect");
  assert.sameValue(
    (ns.indirect = null),
    null,
    "AssignmentExpression: indirect",
  );

  assert.sameValue(Reflect.set(ns, "default"), false, "Reflect.set: default");
  assert.sameValue((ns.default = null), null, "AssignmentExpression: default");

  assert.sameValue(
    Reflect.set(ns, Symbol.toStringTag, null),
    false,
    "Reflect.set: Symbol.toStringTag",
  );
  assert.sameValue(
    (ns[Symbol.toStringTag] = null),
    null,
    "AssignmentExpression: Symbol.toStringTag",
  );

  assert.sameValue(Reflect.set(ns, sym), false, "Reflect.set: sym");
  assert.sameValue((ns[sym] = null), null, "AssignmentExpression: sym");
}
