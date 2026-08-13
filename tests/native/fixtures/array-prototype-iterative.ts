import type { Fixture } from "../fixture.ts";

export const arrayPrototypeIterativeFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "array-prototype-iterative",
    source: `
for (const name of ["every", "forEach", "some"]) {
  const method = Array.prototype[name];
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, name);
  console.log(
    "metadata",
    name,
    method.name,
    method.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
  try { new method(() => true); } catch (error) {
    console.log("not constructor", name, error instanceof TypeError);
  }
}

for (const name of ["every", "forEach", "some"]) {
  const method = Array.prototype[name];
  let lengthRead = false;
  try {
    method.call({ get length() { lengthRead = true; return 0; } }, null);
  } catch (error) {
    console.log("callable order", name, lengthRead, error instanceof TypeError);
  }
  for (const receiver of [null, undefined]) {
    try { method.call(receiver, () => true); } catch (error) {
      console.log("receiver", name, error instanceof TypeError);
    }
  }
}

const marker = { marker: true };
const argumentSubject = [10, 20];
for (const name of ["every", "forEach", "some"]) {
  const seen = [];
  const result = Array.prototype[name].call(
    argumentSubject,
    function (value, index, object) {
      seen.push(value, index, object === argumentSubject, this === marker);
      return name === "some" ? index === 1 : true;
    },
    marker,
  );
  console.log("arguments", name, ...seen, String(result));
}

const inherited = [];
inherited.length = 4;
inherited[0] = 1;
Array.prototype[1] = 2;
inherited[3] = 4;
console.log(
  "holes inherited",
  inherited.every((value, index) => value === index + 1),
);
delete Array.prototype[1];

Object.defineProperty(Array.prototype, "0", {
  get() { return 9; },
  configurable: true,
});
const ownOverride = [11];
console.log(
  "own override",
  Object.prototype.hasOwnProperty.call(ownOverride, "0"),
  ownOverride[0],
  ownOverride.every((value) => value === 11),
);
delete Array.prototype[0];

for (const name of ["every", "forEach", "some"]) {
  const values = [1, 2, 3, 4];
  const seen = [];
  const result = values[name](function (value, index) {
    seen.push(value);
    if (index === 0) {
      delete values[2];
      values.push(5);
    }
    return name === "every" ? value < 4 : value === 2;
  });
  console.log("delete append", name, ...seen, String(result));
}

const filled = [1, , 3];
const filledSeen = [];
filled.forEach((value, index) => {
  filledSeen.push(value);
  if (index === 0) filled[1] = 2;
});
console.log("fill future", ...filledSeen);

const fillPastSnapshot = [1];
fillPastSnapshot.forEach(() => {
  fillPastSnapshot[1] = 9;
});
console.log(
  "fill past snapshot",
  fillPastSnapshot.length,
  fillPastSnapshot[1],
);

const shortened = [1, 2, 3];
Array.prototype[2] = 30;
const shortenedSeen = [];
shortened.forEach((value, index) => {
  shortenedSeen.push(value);
  if (index === 0) shortened.length = 1;
});
console.log("shorten inherited", ...shortenedSeen);
delete Array.prototype[2];

const arrayLike = { 0: "a", 2: "c", length: 3 };
const genericSeen = [];
const genericResult = Array.prototype.forEach.call(
  arrayLike,
  function (value, index, object) {
    genericSeen.push(value, index, object === arrayLike, this === marker);
  },
  marker,
);
console.log("generic", ...genericSeen, genericResult === undefined);
const stringSeen = [];
Array.prototype.forEach.call("ab", (value, index) => {
  stringSeen.push(value + index);
});
console.log("string", ...stringSeen);

let getterOrder = "";
const accessorSubject = {
  get length() { getterOrder = getterOrder + "l"; return 1; },
  get 0() { getterOrder = getterOrder + "g"; return 1; },
};
Array.prototype.forEach.call(accessorSubject, () => {
  getterOrder = getterOrder + "c";
});
console.log("get order", getterOrder);

for (const name of ["every", "forEach", "some"]) {
  try {
    [1].constructor.prototype[name].call([1], () => {
      throw new TypeError("callback");
    });
  } catch (error) {
    console.log("abrupt", name, error instanceof TypeError);
  }
}

const collected = [{ value: 1 }, { value: 2 }, { value: 3 }];
let total = 0;
collected.forEach((entry) => {
  const pressure = { entry };
  total = total + pressure.entry.value;
});
console.log("collected", total);

/** @param {string} value */
function hinted(value) { return value.charAt(0); }
console.log("hint", hinted("hit"));
console.log("false hint", hinted(new String("miss")));
const originalCharAt = String.prototype.charAt;
let turn = 0;
while (turn < 2) {
  console.log("guard", hinted("guard"));
  if (turn === 0) String.prototype.iterativeMarker = 1;
  turn = turn + 1;
}
console.log("method stable", String.prototype.charAt === originalCharAt);
`,
  },
];
