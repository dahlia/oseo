import type { Fixture } from "../fixture.ts";

/** Re-evaluate identical private spellings while earlier classes stay live. */
export function privateNameLifetimeSource(values: readonly number[]): string {
  return `
const classes = [];
const instances = [];
for (const value of [${values.join(", ")}]) {
  class First {
    #𐐀 = value;
    #read() { return this.#𐐀; }
    read() { return this.#read(); }
    static has(other) { return #𐐀 in other; }
  }
  class Second {
    #𐐀 = value + 1;
    get read() { return this.#𐐀; }
  }
  class Third {
    static #𐐀 = value + 2;
    static read() { return this.#𐐀; }
  }
  classes.push([First, Second, Third]);
  instances.push([new First(), new Second()]);
}
for (let i = 0; i < classes.length; i = i + 1) {
  console.log(instances[i][0].read(), instances[i][1].read,
    classes[i][2].read());
  console.log(classes[i][0].has(instances[i][0]),
    classes[i][0].has(instances[(i + 1) % classes.length][0]));
  try {
    classes[i][0].prototype.read.call(instances[i][1]);
  } catch (error) { console.log("brand", error instanceof TypeError); }
}
/**
 * @param {number} left
 * @param {number} right
 */
function hinted(left, right) { return left + right; }
console.log(hinted(3, 1), hinted("false", 1));
`;
}

export const privateNameLifetimeFixtures: readonly Fixture[] = [
  {
    name: "class-private-name-lifetimes",
    source: privateNameLifetimeSource([2, 9, -4]),
  },
];
