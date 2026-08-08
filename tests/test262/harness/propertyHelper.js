/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

function verifyProperty(object, name, descriptor) {
  // Preserve statics while verifying the global binding or a static itself.
  const { defineProperty, getOwnPropertyDescriptor, keys } = Object;
  const actual = getOwnPropertyDescriptor(object, name);
  if (descriptor === undefined) {
    assert.sameValue(actual, undefined);
    return true;
  }
  assert(actual !== undefined, "The property must be an own property.");
  const hasValue = "value" in descriptor;
  if (hasValue) {
    assert.sameValue(actual.value, descriptor.value);
    assert.sameValue(object[name], descriptor.value);
  }
  if ("writable" in descriptor) {
    assert.sameValue(actual.writable, descriptor.writable);
  }
  if ("enumerable" in descriptor) {
    assert.sameValue(actual.enumerable, descriptor.enumerable);
  }
  if ("configurable" in descriptor) {
    assert.sameValue(actual.configurable, descriptor.configurable);
  }
  if ("writable" in descriptor) {
    const originalValue = actual.value;
    let writeValue = name === "length" ? 0xffffffff : "unlikelyValue";
    if (originalValue === writeValue) writeValue = 0xfffffffe;
    try {
      object[name] = writeValue;
    } catch (error) {}
    const writable = object[name] === writeValue;
    assert.sameValue(writable, descriptor.writable);
    if (writable) object[name] = originalValue;
  }

  if ("enumerable" in descriptor) {
    let enumerable;
    if (typeof name === "symbol") {
      enumerable = Object.prototype.propertyIsEnumerable.call(object, name);
    } else {
      const key = "" + name;
      const enumerableKeys = keys(object);
      let index = 0;
      enumerable = false;
      while (index < enumerableKeys.length) {
        if (enumerableKeys[index] === key) enumerable = true;
        index = index + 1;
      }
    }
    assert.sameValue(enumerable, descriptor.enumerable);
  }

  if ("configurable" in descriptor) {
    try {
      delete object[name];
    } catch (error) {}
    const configurable = getOwnPropertyDescriptor(object, name) === undefined;
    assert.sameValue(configurable, descriptor.configurable);
    if (configurable) defineProperty(object, name, actual);
  }
  return true;
}
