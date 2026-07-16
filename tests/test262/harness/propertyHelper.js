/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

function verifyProperty(object, name, descriptor) {
  const actual = Object.getOwnPropertyDescriptor(object, name);
  assert(actual !== undefined, "The property must be an own property.");
  assert.sameValue(actual.value, descriptor.value);
  assert.sameValue(object[name], descriptor.value);
  assert.sameValue(actual.writable, descriptor.writable);
  assert.sameValue(actual.enumerable, descriptor.enumerable);
  assert.sameValue(actual.configurable, descriptor.configurable);

  let writeValue = "unlikelyValue";
  if (descriptor.value === writeValue) writeValue = "unlikelyValue2";
  try {
    object[name] = writeValue;
  } catch (error) {}
  const writable = object[name] === writeValue;
  assert.sameValue(writable, descriptor.writable);
  if (writable) object[name] = descriptor.value;

  const keys = Object.keys(object);
  let index = 0;
  let enumerable = false;
  while (index < keys.length) {
    if (keys[index] === name) enumerable = true;
    index = index + 1;
  }
  assert.sameValue(enumerable, descriptor.enumerable);

  try {
    delete object[name];
  } catch (error) {}
  const configurable =
    Object.getOwnPropertyDescriptor(object, name) === undefined;
  assert.sameValue(configurable, descriptor.configurable);
  if (configurable) Object.defineProperty(object, name, actual);
  return true;
}
