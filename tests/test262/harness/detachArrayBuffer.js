/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream helper delegates to the $262 host object, which this
// profile does not provide. ArrayBuffer.prototype.transferToFixedLength
// performs exactly the DetachArrayBuffer the hook needs on its argument
// and reports a separate zero-length copy, which this helper discards.
// Every reviewed case that includes this file observes the buffer's
// detached state afterwards rather than the detaching operation itself,
// so the observation under test is unchanged. An already detached buffer
// stays detached instead of reporting the TypeError the copy would.
function $DETACHBUFFER(buffer) {
  if (!buffer.detached) {
    buffer.transferToFixedLength(0);
  }
}
