import type { Fixture } from "../fixture.ts";

export const bigintFixtures: readonly Fixture[] = [
  {
    name: "bigint-primitive",
    source: `
console.log(0n, 1n, 123_456_789_012_345_678_901n);
console.log(0b1010_0101n, 0o7_654_321n, 0xdead_beef_cafe_baben);
console.log(typeof 0n, !!0n, !!-1n);
console.log(\`\${9007199254740993n}\`);
const keys = { [9007199254740993n]: "exact" };
console.log(keys["9007199254740993"]);

console.log(999999999999999999999n + 2n);
console.log(1n - 999999999999999999999n);
console.log(12345678901234567890n * -9876543210987654321n);
console.log(-17n / 5n, -17n % 5n, 17n / -5n, 17n % -5n);
console.log(3n ** 40n, 0n ** 0n, (-1n) ** 101n);
console.log(~0n, ~-1n, 0xf0f0n & 0x0ff0n);
console.log(-5n | 2n, -5n ^ 2n, 1n << 95n, -9n >> 2n);
console.log(8n << -2n, 8n >> -2n);
console.log(0n << 340282366920938463463374607431768211456n);

console.log(9007199254740993n === 9007199254740993n);
console.log(9007199254740993n === 9007199254740992n);
console.log(9007199254740993n == "9007199254740993");
console.log(255n == "0xFF", 255n == "0XfF", 5n == "0b101");
console.log(63n == "0O77", 5n == "  +5  ", -5n == " -5 ");
console.log(9007199254740993n == 9007199254740992);
console.log(9007199254740993n > 9007199254740992);
console.log(9007199254740993n < 9007199254740994);
console.log(10n < "11", 10n < "bad", -2n < -1.5);
console.log(1n < Infinity, -1n > -Infinity, 1n < NaN);

for (const operation of [
  function () { return 1n + 1; },
  function () { return 1 + 1n; },
  function () { return +1n; },
  function () { return 1n >>> 0n; },
]) {
  try { operation(); } catch (error) {
    console.log(error instanceof TypeError);
  }
}
try { 1n / 0n; } catch (error) {
  console.log(error instanceof RangeError);
}
try { 2n ** -1n; } catch (error) {
  console.log(error instanceof RangeError);
}
try { 1n << 340282366920938463463374607431768211456n; } catch (error) {
  console.log(error instanceof RangeError);
}
try { 2n ** 1073741824n; } catch (error) {
  console.log(error instanceof RangeError);
}

let value = 10n;
console.log(value += 3n, value -= 2n, value *= 4n, value /= 3n);
console.log(value %= 5n, value **= 3n, value |= 8n, value &= 10n);
console.log(value ^= 3n, value <<= 65n, value >>= 64n);
console.log(value++, value, ++value, value--, --value);

let updateOrder = "";
const updateHolder = {
  get value() {
    updateOrder += "get ";
    return 5n;
  },
  set value(next) {
    updateOrder += "set " + next + " ";
  },
};
console.log(updateHolder.value++, updateOrder);

let abruptUpdateOrder = "";
const abruptUpdateHolder = {
  get value() {
    abruptUpdateOrder += "get ";
    return {
      [Symbol.toPrimitive]() {
        abruptUpdateOrder += "coerce ";
        throw new Error("update-stop");
      },
    };
  },
  set value(_next) {
    abruptUpdateOrder += "set ";
  },
};
try {
  abruptUpdateHolder.value++;
} catch (error) {
  console.log(error.message, abruptUpdateOrder);
}

let order = "";
const holder = { first: 4n, second: 100n };
const key = {
  [Symbol.toPrimitive]() {
    order += "key ";
    return order === "key " ? "first" : "second";
  },
};
function object() { order += "object "; return holder; }
function right() { order += "right "; return 3n; }
console.log(object()[key] += right(), holder.second, order);

let abruptOrder = "";
const abruptHolder = { value: 8n };
function abruptObject() {
  abruptOrder += "object ";
  return abruptHolder;
}
function abruptKey() {
  abruptOrder += "key ";
  return "value";
}
function abruptRight() {
  abruptOrder += "right ";
  throw new Error("stop");
}
try {
  abruptObject()[abruptKey()] += abruptRight();
} catch (error) {
  console.log(error.message, abruptHolder.value, abruptOrder);
}

let mixedOrder = "";
const mixedHolder = { value: 12n };
function mixedObject() {
  mixedOrder += "object ";
  return mixedHolder;
}
function mixedKey() {
  mixedOrder += "key ";
  return "value";
}
function mixedRight() {
  mixedOrder += "right ";
  return 1;
}
try {
  mixedObject()[mixedKey()] += mixedRight();
} catch (error) {
  console.log(error instanceof TypeError, mixedHolder.value, mixedOrder);
}

let survivor = 1n << 300n;
for (let index = 0; index < 40; index += 1) {
  survivor = survivor + (1n << 200n);
}
console.log(survivor > (1n << 300n), survivor >> 200n);
`,
  },
  {
    name: "bigint-false-number-hint",
    source: `
/** @param {number} left @param {number} right */
function add(left, right) { return left + right; }
console.log(add(9007199254740993n, 2n));
`,
    specialization: {
      genericCallsDisabled: 1,
      genericCallsEnabled: 1,
      hits: 0,
      misses: 1,
      overflowMisses: 0,
    },
  },
];
