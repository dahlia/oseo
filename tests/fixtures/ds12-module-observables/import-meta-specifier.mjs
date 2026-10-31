const meta = import.meta;
assert.sameValue(Object.getPrototypeOf(meta), null);
if (
  !Object.prototype.hasOwnProperty.call(meta, "toString") &&
  !Object.prototype.hasOwnProperty.call(meta, "valueOf") &&
  !Object.prototype.hasOwnProperty.call(meta, Symbol.toPrimitive)
) {
  assert.throws(TypeError, () => String(meta));
}
console.log("ok");
