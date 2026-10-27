/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// Copyright (C) 2017 Mathias Bynens. All rights reserved.
// These three helpers retain the pinned test262 regExpUtils.js operations.
// Upstream's BSD license is retained in tests/test262/harness/LICENSE.
function buildString(args) {
  const loneCodePoints = args.loneCodePoints;
  const ranges = args.ranges;
  const CHUNK_SIZE = 10000;
  let result = String.fromCodePoint.apply(null, loneCodePoints);
  for (let i = 0; i < ranges.length; i++) {
    let range = ranges[i];
    let start = range[0];
    let end = range[1];
    let codePoints = [];
    for (let length = 0, codePoint = start; codePoint <= end; codePoint++) {
      codePoints[length++] = codePoint;
      if (length === CHUNK_SIZE) {
        result += String.fromCodePoint.apply(null, codePoints);
        codePoints.length = length = 0;
      }
    }
    result += String.fromCodePoint.apply(null, codePoints);
  }
  return result;
}

function printCodePoint(codePoint) {
  const hex = codePoint.toString(16).toUpperCase().padStart(6, "0");
  return `U+${hex}`;
}

function testPropertyEscapes(regExp, string, expression) {
  if (!regExp.test(string)) {
    for (let symbol of string) {
      let formatted = printCodePoint(symbol.codePointAt(0));
      assert(
        regExp.test(symbol),
        `\`${expression}\` should match ${formatted} (\`${symbol}\`)`,
      );
    }
  }
}

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
