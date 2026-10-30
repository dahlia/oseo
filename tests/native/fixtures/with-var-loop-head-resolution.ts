import type { Fixture } from "../fixture.ts";

/** Fixed with-hit, miss, blocking and per-iteration lookup regressions. */
export const withVarLoopHeadFixtures: readonly Fixture[] = [
  {
    name: "with-var-loop-head-resolution",
    nonStrictScript: true,
    source: `
var hv = 'g'; var held = { hv: 0, hk: 0 };
with (held) {
  var hv = 5; for (var hk in { z: 1 }) {} var { hp: hv } = { hp: 6 };
}
console.log(hv, held.hv, held.hk, typeof hk);
function heads() {
  var x = 'outer';
  const object = { x: 0 };
  with (object) {
    for (var x of [1, 'two', null]) {}
  }
  console.log(x, object.x);
  with (object) { for (var x = 4; false;) {} }
  console.log(x, object.x);
  with (object) { for (var x = 5; false;) {} }
  console.log(x, object.x);
  const blocked = { x: 0, [Symbol.unscopables]: { x: true } };
  with (blocked) { for (var x of [6]) {} }
  console.log(x, blocked.x);
  const inherited = Object.create({ x: 0 });
  with (inherited) { for (var x in { key: 0 }) {} }
  console.log(x, inherited.x, Object.hasOwn(inherited, 'x'));
  const inner = {};
  with (object) { with (inner) { for (var x of [7]) {} } }
  console.log(x, object.x, inner.x);
  with (object) {
    for (var x of [8, 9]) { delete object.x; }
  }
  console.log(x, object.x);
  with (object) { for (let x of [10]) { console.log('let', x); } }
  console.log(x, object.x);
  const frozen = Object.freeze({ x: 0 });
  with (frozen) { for (var x of [11]) {} }
  console.log(x, frozen.x);
}
heads();
function closing() {
  var x = 'outer';
  const log = [];
  const iterable = {
    [Symbol.iterator]() {
      return {
        next() { log.push('next'); return { value: 1, done: false }; },
        return() { log.push('close'); return {}; },
      };
    },
  };
  const object = new Proxy({}, {
    has(target, key) {
      if (key === 'x') { log.push('resolve'); throw new RangeError('lookup'); }
      return Reflect.has(target, key);
    },
  });
  try { with (object) { for (var x of iterable) {} } }
  catch (error) { log.push(error.name); }
  console.log(log.join(','), x);
}
closing();
async function asyncHeads() {
  var x = 'outer';
  const object = { x: 0 };
  with (object) { for await (var x of [1, 'two']) {} }
  console.log('await', x, object.x);
}
asyncHeads();
`,
  },
];

/**
 * IteratorBindingInitialization resolves an identifier before stepping or
 * draining the iterator. Fixed native expectations use ECMA-262 2025 8.6.3;
 * V8 resolves var-binding leaves later, so it is not an oracle here.
 */
export const withArrayBindingOrderSource: string = `
function run(mode) {
  var x = 'outer';
  const object = {};
  const log = [];
  const environment = new Proxy(object, {
    has(target, key) {
      if (key === 'x') log.push('resolve');
      return Reflect.has(target, key);
    },
  });
  const iterable = {
    [Symbol.iterator]() {
      let n = 0;
      return {
        next() {
          log.push('next');
          object.x = 'added';
          return { value: ++n, done: n > 2 };
        },
        return() { log.push('close'); return {}; },
      };
    },
  };
  with (environment) {
    if (mode === 'element') { var [x] = iterable; }
    if (mode === 'rest') { var [...x] = iterable; }
    if (mode === 'default') { var [x = (object.x = 'added', 3)] = []; }
    if (mode === 'loop') { for (var [x] of [iterable]) {} }
  }
  console.log(mode, log.join(','),
    Array.isArray(x) ? x.join('/') : x, object.x);
}
run('element'); run('rest'); run('default'); run('loop');
function classic() {
  var x = 'outer';
  const object = { x: 0 };
  with (object) { for (var x = (delete object.x, 4); false;) {} }
  console.log('classic deletes', x, object.x);
  delete object.x;
  with (object) { for (var x = (object.x = 9, 5); false;) {} }
  console.log('classic adds', x, object.x);
}
classic();
function abrupt(strict, lookupThrows) {
  var x = 'outer';
  const log = [];
  const object = { x: 'object' };
  const environment = new Proxy(object, {
    has(target, key) {
      if (key === 'x') {
        log.push('resolve');
        if (lookupThrows) throw new RangeError('lookup');
      }
      return Reflect.has(target, key);
    },
  });
  const iterable = {
    [Symbol.iterator]() {
      return {
        next() {
          log.push('next'); delete object.x;
          return { done: false, value: 'value' };
        },
        return() { log.push('close'); return {}; },
      };
    },
  };
  try {
    with (environment) {
      if (strict) {
        (function () { 'use strict'; [x] = iterable; })();
      } else { var [x] = iterable; }
    }
  } catch (error) { log.push(error.name); }
  console.log('abrupt', strict, lookupThrows,
    log.join(','), x, object.x);
}
abrupt(false, true); abrupt(true, false);
`;

/** Specified traces, including IteratorClose after a single bound element. */
export const withArrayBindingOrderExpected: string =
  "element resolve,next,close 1 added\n" +
  "rest resolve,next,next,next 1/2 added\n" +
  "default resolve 3 added\n" +
  "loop resolve,next,close 1 added\n" +
  "classic deletes outer 4\n" +
  "classic adds 5 9\n" +
  "abrupt false true resolve,close,RangeError outer object\n" +
  "abrupt true false resolve,next,resolve,close,ReferenceError " +
  "outer undefined\n";
