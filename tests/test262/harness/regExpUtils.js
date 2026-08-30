/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

/*
 * The reviewed UnicodeSets cases exercise literal patterns and need only the
 * success-path aggregation from upstream's property-of-strings helper. Keep
 * its diagnostic-only formatting surface out of the admitted profile: when an
 * aggregate disagrees, these assertions still identify the expression and
 * preserve the semantic failure.
 */
function testPropertyOfStrings(args) {
  const regExp = args.regExp;
  const expression = args.expression;
  const matchStrings = args.matchStrings;
  const nonMatchStrings = args.nonMatchStrings;
  if (!regExp.test(matchStrings.join(""))) {
    let matchIndex = 0;
    while (matchIndex < matchStrings.length) {
      assert(
        regExp.test(matchStrings[matchIndex]),
        expression + " should match its reviewed string.",
      );
      matchIndex = matchIndex + 1;
    }
  }
  if (nonMatchStrings === undefined) return;
  if (regExp.test(nonMatchStrings.join(""))) {
    let nonMatchIndex = 0;
    while (nonMatchIndex < nonMatchStrings.length) {
      assert(
        !regExp.test(nonMatchStrings[nonMatchIndex]),
        expression + " should reject its reviewed non-match.",
      );
      nonMatchIndex = nonMatchIndex + 1;
    }
  }
}

const testExtendedCharacterClass = testPropertyOfStrings;

// The owned String.prototype.matchAll fallback cases use the pinned
// match-result validator from the same upstream helper.
function matchValidator(expectedEntries, expectedIndex, expectedInput) {
  return function (match) {
    assert.compareArray(match, expectedEntries, "Match entries");
    assert.sameValue(match.index, expectedIndex, "Match index");
    assert.sameValue(match.input, expectedInput, "Match input");
  };
}
