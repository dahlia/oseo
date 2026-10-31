// Static adaptation of the pinned test262 source:
// Upstream: await-ns-get-nested-namespace-dflt-direct.js

function observe(ns) {
  var desc = Object.getOwnPropertyDescriptor(ns, "productionNS2");

  assert.sameValue(desc.enumerable, true, "ns.productionNS2: is enumerable");
  assert.sameValue(desc.writable, true, "ns.productionNS2: is writable");
  assert.sameValue(
    desc.configurable,
    false,
    "ns.productionNS2: is non-configurable",
  );

  var keys = Object.getOwnPropertyNames(ns.productionNS2);

  assert.sameValue(keys.length, 2);
  assert.sameValue(keys[0], "default");
  assert.sameValue(keys[1], "productionOther");

  desc = Object.getOwnPropertyDescriptor(ns.productionNS2, "productionOther");

  assert.sameValue(
    desc.value,
    null,
    "ns.productionNS2.productionOther: value is null",
  );
  assert.sameValue(
    desc.enumerable,
    true,
    "ns.productionNS2.productionOther: is enumerable",
  );
  assert.sameValue(
    desc.writable,
    true,
    "ns.productionNS2.productionOther: is writable",
  );
  assert.sameValue(
    desc.configurable,
    false,
    "ns.productionNS2.productionOther: is non-configurable",
  );

  desc = Object.getOwnPropertyDescriptor(ns.productionNS2, "default");

  assert.sameValue(desc.value, 42, "ns.productionNS2.default value is 42");
  assert.sameValue(
    desc.enumerable,
    true,
    "ns.productionNS2.default is enumerable",
  );
  assert.sameValue(desc.writable, true, "ns.productionNS2.default is writable");
  assert.sameValue(
    desc.configurable,
    false,
    "ns.productionNS2.default is non-configurable",
  );
}
