// The pinned upstream revision defines compareArray and
// assert.compareArray in its base assertion harness and keeps this include
// as a compatibility shim. The reviewed base harness does the same, so this
// include only confirms the base definitions are present.
if (assert.compareArray === undefined) {
  throw new Test262Error("The base harness must define compareArray.");
}
