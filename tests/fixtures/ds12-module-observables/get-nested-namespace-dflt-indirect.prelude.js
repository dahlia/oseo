// Static adaptation of the pinned test262 source:
// Upstream: await-ns-get-nested-namespace-dflt-indirect.js

function observe(ns) {
  var desc = Object.getOwnPropertyDescriptor(ns, "namedNS2");

  assert.sameValue(desc.enumerable, true, "ns.namedNS2: is enumerable");
  assert.sameValue(desc.writable, true, "ns.namedNS2: is writable");
  assert.sameValue(
    desc.configurable,
    false,
    "ns.namedNS2: is non-configurable",
  );

  var keys = Object.getOwnPropertyNames(ns.namedNS2);

  assert.sameValue(keys.length, 2);
  assert.sameValue(keys[0], "default");
  assert.sameValue(keys[1], "namedOther");

  desc = Object.getOwnPropertyDescriptor(ns.namedNS2, "namedOther");

  assert.sameValue(desc.value, null, "ns.namedNS2.namedOther value is null");
  assert.sameValue(
    desc.enumerable,
    true,
    "ns.namedNS2.namedOther: is enumerable",
  );
  assert.sameValue(desc.writable, true, "ns.namedNS2.namedOther: is writable");
  assert.sameValue(
    desc.configurable,
    false,
    "ns.namedNS2.namedOther: is non-configurable",
  );

  desc = Object.getOwnPropertyDescriptor(ns.namedNS2, "default");

  assert.sameValue(desc.value, 42, "ns.namedNS2.default value is 42");
  assert.sameValue(desc.enumerable, true, "ns.namedNS2.default is enumerable");
  assert.sameValue(desc.writable, true, "ns.namedNS2.default is writable");
  assert.sameValue(
    desc.configurable,
    false,
    "ns.namedNS2.default is non-configurable",
  );
}
