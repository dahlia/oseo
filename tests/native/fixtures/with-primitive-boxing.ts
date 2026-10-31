import type { Fixture } from "../fixture.ts";

/** ToObject identity, receiver, exotic String properties and abrupt entry. */
export const boxingFixtures: readonly Fixture[] = [
  {
    name: "with-primitive-boxing",
    nonStrictScript: true,
    source: `
function box() { 'use strict'; return this; }
for (var prototype of [Number.prototype, Boolean.prototype,
    String.prototype, BigInt.prototype, Symbol.prototype]) {
  prototype.box = box;
  prototype.probe = 17;
}
/** @param {{ probe: number }} value */
function enter(value) {
  var fallback = 1;
  var Object = function () { throw new Error('shadow Object'); };
  with (value) {
    fallback = 42;
    console.log('probe', probe, typeof box());
    return [function () { return box(); }, function () { return probe; }];
  }
}
for (var value of [2, -0, NaN, Infinity, true, false, '', 'a😀',
    12n, Symbol('value')]) {
  var closures = enter(value);
  var wrapper = closures[0]();
  console.log('same', wrapper === closures[0](),
    Object.is(wrapper.valueOf(), value));
  wrapper.probe = 23;
  console.log('retained', closures[1]());
}
with ('a😀') {
  console.log('string', length, charAt(0),
    Object.getOwnPropertyDescriptor(box(), '0').writable,
    Object.getOwnPropertyDescriptor(box(), 'length').configurable);
  length = 99;
  console.log('readonly', length);
}
var object = { probe: 7, box: box };
var closures = enter(object);
console.log('object', closures[0]() === object);
var log = [];
var hostile = new Proxy(object, {
  has(target, key) {
    if (key === 'probe') log.push(key);
    return Reflect.has(target, key);
  },
  get(target, key, receiver) {
    if (key === Symbol.toPrimitive) throw new Error('must not coerce');
    return Reflect.get(target, key, receiver);
  },
});
with (hostile) { console.log('proxy', probe, box() === hostile); }
console.log('has', log.includes('probe'));
Number.prototype[Symbol.unscopables] = { probe: true };
var probe = 'fallback';
with (2) { console.log('blocked', probe); }
var entered = 0;
for (var value of [null, undefined]) {
  try { with (value) { entered++; } }
  catch (error) { console.log('nullish', error.name, entered); }
}
var evaluated = 0;
function operand() { evaluated++; return 3; }
with (operand()) { console.log('once', evaluated); }
try { with ((function () { throw new RangeError('operand'); })()) {} }
catch (error) { console.log('operand', error.name); }
`,
  },
];
