/* eslint-disable no-underscore-dangle, no-unused-vars */

const __oseoDefineProperty = Object.defineProperty;
const __oseoGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const __oseoKeys = Object.keys;
const __oseoPropertyIsEnumerable = Object.prototype.propertyIsEnumerable;

/*
 * A displayable label for one property key. A symbol key cannot reach
 * string concatenation, which throws a TypeError, and symbol
 * description reflection is outside the admitted profile, so a symbol
 * key reports a fixed label instead. No reviewed case asserts on these
 * message texts; they exist so a failure names the property.
 */
function __oseoKeyLabel(name) {
  return typeof name === "symbol" ? "[symbol]" : "" + name;
}

function __oseoSameValue(left, right) {
  if (left === 0 && right === 0) return 1 / left === 1 / right;
  if (left !== left && right !== right) return true;
  return left === right;
}

function __oseoIsWritable(object, name, verifyName, value) {
  const actual = __oseoGetOwnPropertyDescriptor(object, name);
  const hadValue = actual !== undefined;
  const oldValue = object[name];
  let newValue = value || (name === "length" ? 0xffffffff : "unlikelyValue");
  if (arguments.length < 4 && __oseoSameValue(newValue, oldValue)) {
    newValue = newValue + "2";
  }
  try {
    object[name] = newValue;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  const writable = __oseoSameValue(object[verifyName || name], newValue);
  if (writable) {
    if (hadValue) object[name] = oldValue;
    else delete object[name];
  }
  return writable;
}

function __oseoIsEnumerable(object, name) {
  if (typeof name === "symbol") {
    return __oseoPropertyIsEnumerable.call(object, name);
  }
  const key = "" + name;
  const enumerableKeys = __oseoKeys(object);
  let index = 0;
  while (index < enumerableKeys.length) {
    if (enumerableKeys[index] === key) return true;
    index = index + 1;
  }
  return false;
}

function __oseoIsConfigurable(object, name) {
  try {
    delete object[name];
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  return __oseoGetOwnPropertyDescriptor(object, name) === undefined;
}

function verifyProperty(object, name, descriptor) {
  const actual = __oseoGetOwnPropertyDescriptor(object, name);
  if (descriptor === undefined) {
    assert.sameValue(actual, undefined);
    return true;
  }
  assert(actual !== undefined, "The property must be an own property.");
  const fields = __oseoKeys(descriptor);
  let fieldIndex = 0;
  while (fieldIndex < fields.length) {
    const field = fields[fieldIndex];
    if (
      field !== "value" &&
      field !== "writable" &&
      field !== "enumerable" &&
      field !== "configurable" &&
      field !== "get" &&
      field !== "set"
    ) {
      throw new Test262Error("Invalid descriptor field: " + field);
    }
    fieldIndex = fieldIndex + 1;
  }
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
  if ("get" in descriptor) {
    assert.sameValue(actual.get, descriptor.get);
  }
  if ("set" in descriptor) {
    assert.sameValue(actual.set, descriptor.set);
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
      const enumerableKeys = __oseoKeys(object);
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
    const configurable =
      __oseoGetOwnPropertyDescriptor(object, name) === undefined;
    assert.sameValue(configurable, descriptor.configurable);
    if (configurable) __oseoDefineProperty(object, name, actual);
  }
  return true;
}

/*
 * The upstream helper's primordial variant asks `verifyProperty` to
 * restore whatever its writability and configurability probes changed,
 * so that verifying a property of a shared intrinsic leaves that
 * intrinsic as it found it. This reviewed `verifyProperty` always
 * restores, so the two are the same check.
 */
function verifyPrimordialProperty(object, name, descriptor) {
  return verifyProperty(object, name, descriptor);
}

function verifyEqualTo(object, name, value) {
  if (!__oseoSameValue(object[name], value)) {
    throw new Test262Error(
      "Expected obj[" +
        __oseoKeyLabel(name) +
        "] to equal " +
        value +
        ", actually " +
        object[name],
    );
  }
}

function verifyWritable(object, name, verifyName, value) {
  if (!verifyName) {
    assert(
      __oseoGetOwnPropertyDescriptor(object, name).writable,
      "Expected obj[" + __oseoKeyLabel(name) + "] to have writable:true.",
    );
  }
  if (!__oseoIsWritable(object, name, verifyName, value)) {
    throw new Test262Error(
      "Expected obj[" + __oseoKeyLabel(name) + "] to be writable, but was not.",
    );
  }
}

function verifyNotWritable(object, name, verifyName, value) {
  if (!verifyName) {
    assert(
      !__oseoGetOwnPropertyDescriptor(object, name).writable,
      "Expected obj[" + __oseoKeyLabel(name) + "] to have writable:false.",
    );
  }
  if (__oseoIsWritable(object, name, verifyName)) {
    throw new Test262Error(
      "Expected obj[" + __oseoKeyLabel(name) + "] NOT to be writable, but was.",
    );
  }
}

function verifyEnumerable(object, name) {
  assert(
    __oseoGetOwnPropertyDescriptor(object, name).enumerable,
    "Expected obj[" + __oseoKeyLabel(name) + "] to have enumerable:true.",
  );
  if (!__oseoIsEnumerable(object, name)) {
    throw new Test262Error(
      "Expected obj[" +
        __oseoKeyLabel(name) +
        "] to be enumerable, but was not.",
    );
  }
}

function verifyNotEnumerable(object, name) {
  assert(
    !__oseoGetOwnPropertyDescriptor(object, name).enumerable,
    "Expected obj[" + __oseoKeyLabel(name) + "] to have enumerable:false.",
  );
  if (__oseoIsEnumerable(object, name)) {
    throw new Test262Error(
      "Expected obj[" +
        __oseoKeyLabel(name) +
        "] NOT to be enumerable, but was.",
    );
  }
}

function verifyConfigurable(object, name) {
  assert(
    __oseoGetOwnPropertyDescriptor(object, name).configurable,
    "Expected obj[" + __oseoKeyLabel(name) + "] to have configurable:true.",
  );
  if (!__oseoIsConfigurable(object, name)) {
    throw new Test262Error(
      "Expected obj[" +
        __oseoKeyLabel(name) +
        "] to be configurable, but was not.",
    );
  }
}

function verifyNotConfigurable(object, name) {
  assert(
    !__oseoGetOwnPropertyDescriptor(object, name).configurable,
    "Expected obj[" + __oseoKeyLabel(name) + "] to have configurable:false.",
  );
  if (__oseoIsConfigurable(object, name)) {
    throw new Test262Error(
      "Expected obj[" +
        __oseoKeyLabel(name) +
        "] NOT to be configurable, but was.",
    );
  }
}
