// Static adaptation of the pinned test262 source:
// Upstream: await-ns-delete-exported-init-no-strict.js

function observe(ns) {
  assert.sameValue(delete ns.default, false, "delete: default");
  assert.sameValue(
    Reflect.deleteProperty(ns, "default"),
    false,
    "Reflect.deleteProperty: default",
  );
  assert.sameValue(ns.default, 42, "binding unmodified: default");

  assert.sameValue(delete ns.local1, false, "delete: local1");
  assert.sameValue(
    Reflect.deleteProperty(ns, "local1"),
    false,
    "Reflect.deleteProperty: local1",
  );
  assert.sameValue(ns.local1, "Test262", "binding unmodified: local1");

  assert.sameValue(delete ns.renamed, false, "delete: renamed");
  assert.sameValue(
    Reflect.deleteProperty(ns, "renamed"),
    false,
    "Reflect.deleteProperty: renamed",
  );
  assert.sameValue(ns.renamed, "TC39", "binding unmodified: renamed");

  assert.sameValue(delete ns.indirect, false, "delete: indirect");
  assert.sameValue(
    Reflect.deleteProperty(ns, "indirect"),
    false,
    "Reflect.deleteProperty: indirect",
  );
  assert.sameValue(ns.indirect, "Test262", "binding unmodified: indirect");
}
