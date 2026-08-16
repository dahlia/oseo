// The owned matchAll cases use the pinned test262 iterator comparison
// contract. Keep this reviewed harness explicit so exhaustion and the final
// undefined iterator value remain observable to the compiled program.
assert.compareIterator = function (iterator, validators, message) {
  const detail = message || "";
  let index = 0;
  for (; index < validators.length; index = index + 1) {
    const result = iterator.next();
    assert(
      !result.done,
      "Iterator ended before value " + index + ". " + detail,
    );
    validators[index](result.value);
  }
  const result = iterator.next();
  assert(result.done, "Iterator produced more than " + index + " values.");
  assert.sameValue(
    result.value,
    undefined,
    "An exhausted iterator must return undefined. " + detail,
  );
};
