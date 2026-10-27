import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const suite = dirname(
  fileURLToPath(import.meta.resolve("test262/package.json")),
);
const [base, reviewed, upstream] = await Promise.all([
  readFile(new URL("test262/harness/base.js", import.meta.url), "utf8"),
  readFile(
    new URL("test262/harness/propertyHelper.js", import.meta.url),
    "utf8",
  ),
  readFile(join(suite, "harness/propertyHelper.js"), "utf8"),
]);

function observe(helper: string, program: string, strict: boolean): string {
  return String(
    runInNewContext(
      (strict ? '"use strict";\n' : "") + base + "\n" + helper + "\n" + program,
    ),
  );
}

for (const strict of [false, true]) {
  for (const verifier of ["verifyProperty", "verifyPrimordialProperty"]) {
    for (const extensible of [false, true]) {
      for (const restore of [undefined, false, true]) {
        const label =
          `${verifier}: strict=${strict}, extensible=${extensible}, ` +
          `restore=${restore}`;
        test(label, () => {
          const program = `
const events = [];
const target = {};
Object.defineProperty(target, 'item', {
  value: 0, writable: false, enumerable: false, configurable: true
});
if (!${extensible}) Object.preventExtensions(target);
const proxy = new Proxy(target, {
  deleteProperty(object, key) {
    events.push('delete:' + key);
    return Reflect.deleteProperty(object, key);
  },
  defineProperty(object, key, descriptor) {
    events.push('define:' + key);
    return Reflect.defineProperty(object, key, descriptor);
  }
});
let outcome;
try {
  outcome = ${verifier}(proxy, 'item', {
    value: 0, writable: false, enumerable: false, configurable: true
  }, ${restore === undefined ? "undefined" : `{ restore: ${restore} }`});
} catch (error) { outcome = error.name; }
JSON.stringify({ outcome, present: Object.hasOwn(target, 'item'), events });
`;
          const expected = JSON.stringify({
            outcome: restore === true && !extensible ? "TypeError" : true,
            present: restore === true && extensible,
            events:
              restore === true
                ? ["delete:item", "define:item"]
                : ["delete:item"],
          });
          assert.equal(observe(upstream, program, strict), expected);
          assert.equal(observe(reviewed, program, strict), expected);
        });
      }
    }
  }

  test(`restore preserves an abrupt token: strict=${strict}`, () => {
    const program = `
const token = {};
const target = {};
Object.defineProperty(target, 'item', {
  value: 0, writable: false, enumerable: false, configurable: true
});
const proxy = new Proxy(target, {
  defineProperty() { throw token; }
});
let caught = false;
try {
  verifyProperty(proxy, 'item', { configurable: true }, { restore: true });
} catch (error) { caught = error === token; }
JSON.stringify({ caught, present: Object.hasOwn(target, 'item') });
`;
    const expected = JSON.stringify({ caught: true, present: false });
    assert.equal(observe(upstream, program, strict), expected);
    assert.equal(observe(reviewed, program, strict), expected);
  });

  test(`restore defines a fixed property: strict=${strict}`, () => {
    const program = `
const events = [];
const target = {};
Object.defineProperty(target, 'item', {
  value: 0, writable: false, enumerable: false, configurable: false
});
Object.preventExtensions(target);
const proxy = new Proxy(target, {
  deleteProperty(object, key) {
    events.push('delete:' + key);
    return Reflect.deleteProperty(object, key);
  },
  defineProperty(object, key, descriptor) {
    events.push('define:' + key);
    return Reflect.defineProperty(object, key, descriptor);
  }
});
const result = verifyProperty(proxy, 'item', {
  value: 0, writable: false, enumerable: false, configurable: false
}, { restore: true });
JSON.stringify({ result, present: Object.hasOwn(target, 'item'), events });
`;
    const expected = JSON.stringify({
      result: true,
      present: true,
      events: ["delete:item", "define:item"],
    });
    assert.equal(observe(upstream, program, strict), expected);
    assert.equal(observe(reviewed, program, strict), expected);
  });

  test(`restore preserves an accessor: strict=${strict}`, () => {
    const program = `
const target = {};
const getter = function () { return 2; };
Object.defineProperty(target, 'item', { get: getter, configurable: true });
verifyProperty(target, 'item', {
  get: getter, set: undefined, configurable: true
}, { restore: true });
JSON.stringify({ same: Object.getOwnPropertyDescriptor(target, 'item').get ===
  getter, value: target.item });
`;
    const expected = JSON.stringify({ same: true, value: 2 });
    assert.equal(observe(upstream, program, strict), expected);
    assert.equal(observe(reviewed, program, strict), expected);
  });

  for (const field of ["writable", "enumerable", "configurable"]) {
    test(`behavior rejects a false ${field} flag: strict=${strict}`, () => {
      // Retain every real Object member, including prototype, so a missing
      // helper dependency cannot masquerade as a successful rejection.
      const prefix = `
const realDescriptor = Object.getOwnPropertyDescriptor;
Object = new Proxy(Object, {
  get(target, key) {
    if (key === 'getOwnPropertyDescriptor') {
      return function (object, name) {
        const found = realDescriptor(object, name);
        if (found !== undefined) found[${JSON.stringify(field)}] = false;
        return found;
      };
    }
    return Reflect.get(target, key);
  }
});
`;
      const program = `
const target = { item: 'fn' };
const descriptor = {
  value: 'fn', writable: true, enumerable: true, configurable: true
};
descriptor[${JSON.stringify(field)}] = false;
let rejected = false;
try { verifyProperty(target, 'item', descriptor); }
catch (error) { rejected = error instanceof Test262Error; }
JSON.stringify({ rejected });
`;
      const expected = JSON.stringify({ rejected: true });
      assert.equal(observe(prefix + upstream, program, strict), expected);
      assert.equal(observe(prefix + reviewed, program, strict), expected);
    });
  }

  for (const verifier of [
    "verifyCallableProperty",
    "verifyPrimordialCallableProperty",
  ]) {
    for (const restore of [undefined, false, true]) {
      test(`${verifier}: strict=${strict}, restore=${restore}`, () => {
        const program = `
const events = [];
const fn = function work(a, b) {};
const callable = new Proxy(fn, {
  deleteProperty(target, key) {
    events.push('delete:' + key);
    return Reflect.deleteProperty(target, key);
  },
  defineProperty(target, key, descriptor) {
    events.push('define:' + key);
    return Reflect.defineProperty(target, key, descriptor);
  }
});
const owner = {};
Object.defineProperty(owner, 'work', {
  value: callable, writable: true, enumerable: false, configurable: true
});
${verifier}(owner, 'work', 'work', 2, undefined,
  ${restore === undefined ? "undefined" : `{ restore: ${restore} }`});
JSON.stringify({ owner: Object.hasOwn(owner, 'work'),
  name: Object.hasOwn(fn, 'name'),
  length: Object.hasOwn(fn, 'length'), events });
`;
        const restored = restore === true;
        const expected = JSON.stringify({
          owner: restored,
          name: restored,
          length: restored,
          events: restored
            ? ["delete:name", "define:name", "delete:length", "define:length"]
            : ["delete:name", "delete:length"],
        });
        assert.equal(observe(upstream, program, strict), expected);
        assert.equal(observe(reviewed, program, strict), expected);
      });
    }
  }
}
