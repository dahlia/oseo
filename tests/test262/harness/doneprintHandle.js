/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// Upstream doneprintHandle appends the failure value to the marker. The
// admitted profile has no safe generic string coercion yet, so the reviewed
// harness prints the bare failure marker; the runner records stdout and
// stderr as the failure evidence.
function $DONE(error) {
  if (error) {
    console.log("Test262:AsyncTestFailure:");
  } else {
    console.log("Test262:AsyncTestComplete");
  }
}
