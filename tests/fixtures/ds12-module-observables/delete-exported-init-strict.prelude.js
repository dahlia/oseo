// Static adaptation of the pinned test262 source:
// Upstream: await-ns-delete-exported-init-strict.js

function observe(ns) {
  "use strict";

  assert.throws(
    TypeError,
    function () {
      delete ns.default;
    },
    "delete: default",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "default"),
    false,
    "Reflect.deleteProperty: default",
  );
  assert.sameValue(ns.default, 42, "binding unmodified: default");

  assert.throws(
    TypeError,
    function () {
      delete ns.local1;
    },
    "delete: local1",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "local1"),
    false,
    "Reflect.deleteProperty: local1",
  );
  assert.sameValue(ns.local1, "Test262", "binding unmodified: local1");

  assert.throws(
    TypeError,
    function () {
      delete ns.renamed;
    },
    "delete: renamed",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "renamed"),
    false,
    "Reflect.deleteProperty: renamed",
  );
  assert.sameValue(ns.renamed, "TC39", "binding unmodified: renamed");

  assert.throws(
    TypeError,
    function () {
      delete ns.indirect;
    },
    "delete: indirect",
  );
  assert.sameValue(
    Reflect.deleteProperty(ns, "indirect"),
    false,
    "Reflect.deleteProperty: indirect",
  );
  assert.sameValue(ns.indirect, "Test262", "binding unmodified: indirect");
}
