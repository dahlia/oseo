/** Fixed control flow large enough to cross helper and C-unit boundaries. */
const decisions = Array.from(
  { length: 96 },
  (_, index) => `      if (selector === ${index}) sum = sum + held.value;`,
).join("\n");

/** Keep one live heap object across backward edges, handlers and suspension. */
export const materializedBodySource: string = `
let finished = 0;
function* walk(seed) {
  let sum = seed;
  const held = { value: 7 };
  try {
    for (let pass = 0; pass < 3; pass++) {
      const selector = pass === 0 ? 0 : pass === 1 ? 95 : -1;
${decisions}
      try {
        if (pass === 1) throw held;
      } catch (error) {
        sum = sum + error.value;
      } finally {
        sum = sum + 1;
      }
      yield { sum: sum, held: held };
      held.value = held.value + 1;
    }
  } finally {
    finished = held.value;
    console.log("finally", finished);
  }
  return sum;
}
const iterator = walk(10);
const first = iterator.next();
console.log("first", first.value.sum, first.value.held.value, first.done);
const second = iterator.next();
console.log("second", second.value.sum, second.value.held.value, second.done);
const third = iterator.next();
console.log("third", third.value.sum, third.value.held.value, third.done);
const last = iterator.next();
console.log("last", last.value, last.done, finished, first.value.held.value);
`;

/** Independent observations for three loop passes and the final resumption. */
export const materializedBodyStdout: string =
  "first 18 7 false\nsecond 35 8 false\nthird 36 9 false\n" +
  "finally 10\nlast 36 true 10 10\n";

/** Uncaught language throw after the same complete large program. */
export const materializedBodyThrowSource: string =
  materializedBodySource + 'throw new RangeError("packed throw");\n';

/** Original language location, independent of aggregate C line numbering. */
export const materializedBodyThrowLine: number =
  materializedBodySource.split("\n").length;
