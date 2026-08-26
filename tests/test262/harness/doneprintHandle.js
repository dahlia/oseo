/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// Upstream doneprintHandle appends the failure value to the marker, which
// the admitted profile can now compose: generic string coercion routes an
// arbitrary object through %Object.prototype.toString%, @@toPrimitive, and
// @@toStringTag. ToString still rejects a Symbol, and an object can convert
// abruptly through a throwing method or getter, a non-callable pair, or a
// null prototype, so the composition is guarded and falls back to the bare
// marker rather than replacing a case's failure report with a thrown
// conversion.
function $DONE(error) {
  if (!error) {
    console.log("Test262:AsyncTestComplete");
    return;
  }
  let detail = "";
  try {
    if (typeof error === "object" && error !== null && "name" in error) {
      detail = error.name + ": " + error.message;
    } else {
      detail = "Test262Error: " + (error.message || error);
    }
  } catch (conversion) {
    detail = "";
  }
  console.log("Test262:AsyncTestFailure:" + detail);
}
