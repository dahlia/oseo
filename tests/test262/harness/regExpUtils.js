/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The owned String.prototype.matchAll fallback cases use only the pinned
// match-result validator from regExpUtils.js. The later RegExp nodes own the
// broader regular-expression helper surface.
function matchValidator(expectedEntries, expectedIndex, expectedInput) {
  return function (match) {
    assert.compareArray(match, expectedEntries, "Match entries");
    assert.sameValue(match.index, expectedIndex, "Match index");
    assert.sameValue(match.input, expectedInput, "Match input");
  };
}
