// Static adaptation of the pinned test262 source:
// Upstream: await-ns-delete-non-exported-no-strict.js

function observe(ns) {
  assert(delete ns.undef, "delete: undef");
  assert(Reflect.deleteProperty(ns, "undef"), "Reflect.deleteProperty: undef");

  assert(delete ns.default, "delete: default");
  assert(
    Reflect.deleteProperty(ns, "default"),
    "Reflect.deleteProperty: default",
  );

  assert.sameValue(
    delete ns[Symbol.toStringTag],
    false,
    "delete: Symbol.toStringTag",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, Symbol.toStringTag),
    false,
    "Reflect.deleteProperty: Symbol.toStringTag",
  );

  var sym = Symbol("test262");
  assert(delete ns[sym], "delete: symbol");
  assert(Reflect.deleteProperty(ns, sym), "Reflect.deleteProperty: symbol");
}
