import type { Fixture } from "../fixture.ts";

export const classFixtures: readonly Fixture[] = [
  {
    name: "class-definitions",
    source: `
class Empty {}
console.log(typeof Empty, Empty.name, Empty.length);
console.log(typeof Empty.prototype, Empty.prototype.constructor === Empty);
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  sum() {
    return this.x + this.y;
  }
  scale(factor) {
    return this.sum() * factor;
  }
}
console.log(Point.name, Point.length);
const point = new Point(2, 3);
console.log(point.x, point.y, point.sum(), point.scale(4));
console.log(point instanceof Point);
console.log(point.constructor === Point);
console.log(Object.keys(point).length, Object.keys(Point.prototype).length);
console.log(
  Object.getOwnPropertyDescriptor(Point.prototype, "sum") === undefined,
);
const methodDescriptor = Object.getOwnPropertyDescriptor(
  Point.prototype,
  "sum",
);
console.log(
  typeof methodDescriptor.value,
  methodDescriptor.writable,
  methodDescriptor.enumerable,
  methodDescriptor.configurable,
);
const constructorDescriptor = Object.getOwnPropertyDescriptor(
  Point.prototype,
  "constructor",
);
console.log(
  constructorDescriptor.writable,
  constructorDescriptor.enumerable,
  constructorDescriptor.configurable,
);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Point,
  "prototype",
);
console.log(
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
);
console.log(Point.prototype.sum.name, Point.prototype.scale.length);
console.log("prototype" in Point.prototype.sum);
`,
  },
  {
    name: "class-identity",
    source: `
class Counted {
  constructor(start) {
    this.value = start;
  }
  next() {
    this.value = this.value + 1;
    return this.value;
  }
}
const first = new Counted(0);
const second = new Counted(10);
console.log(first.next(), first.next(), second.next());
console.log(first instanceof Counted, second instanceof Counted);
console.log(first.next === second.next, first.next === Counted.prototype.next);
try {
  Counted(1);
} catch (error) {
  console.log("call without new", error instanceof TypeError);
}
const detached = Counted.prototype.next;
try {
  new detached();
} catch (error) {
  console.log("method construct", error instanceof TypeError);
}
class Replaced {
  constructor() {
    return { replaced: true };
  }
}
console.log(new Replaced().replaced);
class Primitive {
  constructor() {
    this.kept = 1;
    return 5;
  }
}
console.log(new Primitive().kept);
function outer(tag) {
  class Tagged {
    constructor() {
      this.tag = tag;
    }
    own() {
      return this.constructor === Tagged;
    }
  }
  return Tagged;
}
const First = outer("first");
const Second = outer("second");
console.log(First === Second, new First().tag, new Second().own());
`,
  },
  {
    name: "class-name-binding",
    source: `
const Anonymous = class {};
console.log(Anonymous.name);
const Renamed = class Inner {
  self() {
    return Inner;
  }
  same(other) {
    return Inner === other;
  }
};
console.log(Renamed.name);
const renamed = new Renamed();
console.log(renamed.self() === Renamed, renamed.same(Renamed));
class Reassigned {
  read() {
    return Reassigned;
  }
}
const readBefore = new Reassigned();
const original = Reassigned;
Reassigned = 7;
console.log(Reassigned, readBefore.read() === original);
const Frozen = class Locked {
  rename() {
    Locked = 1;
  }
};
function strictRename() {
  try {
    new Frozen().rename();
  } catch (error) {
    console.log("inner rebind", error instanceof TypeError);
  }
}
strictRename();
try {
  new Hoisted();
} catch (error) {
  console.log("temporal dead zone", error instanceof ReferenceError);
}
class Hoisted {}
console.log(typeof Hoisted);
const holder = { Field: class {} };
console.log(holder.Field.name);
const computedKey = "Computed";
const computedHolder = {
  [computedKey]: class {},
  [computedKey + "Named"]: class Kept {},
  [computedKey + "Fn"]: function () {},
};
console.log(
  computedHolder.Computed.name,
  computedHolder.ComputedNamed.name,
  computedHolder.ComputedFn.name,
);
console.log((class {}).name, (class Explicit {}).name);
`,
  },
  {
    name: "class-evaluation-order",
    nonStrictScript: true,
    source: `
let order = "";
function key(name) {
  order = order + name;
  return name;
}
class Ordered {
  constructor() {
    this.made = true;
  }
  [key("first")]() {
    return "first";
  }
  [key("second")]() {
    return "second";
  }
}
console.log(order);
const ordered = new Ordered();
console.log(ordered.first(), ordered.second(), ordered.made);
let keyNames = "";
for (const name of Object.keys(Ordered.prototype)) {
  keyNames = keyNames + name + ",";
}
console.log("prototype keys", keyNames);
console.log(Ordered.prototype.first.name, Ordered.prototype.second.name);
class Replacing {
  duplicate() {
    return 1;
  }
  duplicate() {
    return 2;
  }
}
console.log(new Replacing().duplicate());
try {
  class Reads {
    [Reads]() {
      return 0;
    }
  }
} catch (error) {
  console.log("class binding dead zone", error instanceof ReferenceError);
}
const thrown = (() => {
  try {
    class Aborted {
      [key(fail())]() {
        return 0;
      }
    }
  } catch (error) {
    return error.message;
  }
  return "none";
})();
console.log(thrown);
function fail() {
  throw new Error("key failure");
}
// A computed key is class-body code, so it is strict even here.
const readOnly = {};
Object.defineProperty(readOnly, "kept", { value: 1, writable: false });
try {
  class StrictKey {
    [(readOnly.kept = 2, "m")]() {
      return 1;
    }
  }
  console.log("strict key assignment completed", readOnly.kept);
} catch (error) {
  console.log("strict key assignment rejected", error instanceof TypeError);
}
const permanent = {};
Object.defineProperty(permanent, "kept", { value: 1, configurable: false });
try {
  class StrictDelete {
    [(delete permanent.kept, "m")]() {
      return 1;
    }
  }
  console.log("strict key delete completed");
} catch (error) {
  console.log("strict key delete rejected", error instanceof TypeError);
}
let strictOrder = "";
class Nested {
  outerMethod() {
    class Inner {
      innerMethod() {
        return "inner";
      }
    }
    strictOrder = strictOrder + new Inner().innerMethod();
    return Inner.name;
  }
}
console.log(new Nested().outerMethod(), strictOrder);
`,
  },
  {
    name: "class-accessors",
    source: `
class Box {
  constructor(start) {
    this.stored = start;
  }
  get item() {
    return this.stored;
  }
  set item(value) {
    this.stored = value * 2;
  }
  get doubled() {
    return this.stored + this.stored;
  }
  set only(value) {
    this.written = value;
  }
  plain() {
    return this.stored;
  }
}
const box = new Box(3);
console.log(box.item, box.doubled, box.plain());
box.item = 5;
console.log(box.item, box.stored);
box.only = 7;
console.log(box.written, box.only);
console.log(Object.keys(box).length, Object.keys(Box.prototype).length);
const pair = Object.getOwnPropertyDescriptor(Box.prototype, "item");
console.log(
  typeof pair.get,
  typeof pair.set,
  pair.enumerable,
  pair.configurable,
  "value" in pair,
  "writable" in pair,
);
const getterOnly = Object.getOwnPropertyDescriptor(Box.prototype, "doubled");
console.log(typeof getterOnly.get, getterOnly.set);
const setterOnly = Object.getOwnPropertyDescriptor(Box.prototype, "only");
console.log(setterOnly.get, typeof setterOnly.set);
console.log(pair.get.name, pair.set.name, pair.get.length, pair.set.length);
console.log("prototype" in pair.get, "prototype" in pair.set);
try {
  new pair.get();
} catch (error) {
  console.log("accessor construct", error instanceof TypeError);
}
// A class body is strict everywhere, so writing a getter-only accessor
// from a method rejects without depending on the script's strictness.
class Writer {
  write(target) {
    try {
      target.doubled = 1;
      return "assigned";
    } catch (error) {
      return error instanceof TypeError ? "rejected" : "other";
    }
  }
}
console.log(new Writer().write(box), box.doubled);
const second = new Box(1);
console.log(second.item, box.item);
console.log(
  Object.getOwnPropertyDescriptor(Box.prototype, "item").get ===
    Object.getOwnPropertyDescriptor(second.constructor.prototype, "item").get,
);
const Anonymous = class {
  get value() {
    return "anonymous";
  }
};
console.log(new Anonymous().value, Anonymous.name);
`,
  },
  {
    name: "class-accessor-names",
    source: `
let order = "";
function key(name) {
  order = order + name;
  return name;
}
const iterator = Symbol.iterator;
class Named {
  get plain() {
    return "plain";
  }
  set "spaced name"(value) {
    this.spaced = value;
  }
  get 7() {
    return "numeric";
  }
  get [key("computed")]() {
    return "computed";
  }
  set [key("written")](value) {
    this.stored = value;
  }
  get [iterator]() {
    return "symbol";
  }
}
console.log("order", order);
const proto = Named.prototype;
console.log(Object.getOwnPropertyDescriptor(proto, "plain").get.name);
console.log(Object.getOwnPropertyDescriptor(proto, "spaced name").set.name);
console.log(Object.getOwnPropertyDescriptor(proto, "7").get.name);
console.log(Object.getOwnPropertyDescriptor(proto, "computed").get.name);
console.log(Object.getOwnPropertyDescriptor(proto, "written").set.name);
console.log(Object.getOwnPropertyDescriptor(proto, iterator).get.name);
const named = new Named();
console.log(named.plain, named[7], named.computed, named[iterator]);
named["spaced name"] = 1;
named.written = 2;
console.log(named.spaced, named.stored);
class Replaced {
  get item() {
    return "first";
  }
  set item(value) {
    this.written = value;
  }
  get item() {
    return "second";
  }
  method() {
    return "method";
  }
  get method() {
    return "accessor";
  }
  get replaced() {
    return "accessor";
  }
  replaced() {
    return "data";
  }
}
const replaced = new Replaced();
console.log(replaced.item, replaced.method, replaced.replaced());
replaced.item = 3;
console.log(replaced.written);
const methodDescriptor = Object.getOwnPropertyDescriptor(
  Replaced.prototype,
  "method",
);
console.log(typeof methodDescriptor.get, "value" in methodDescriptor);
const replacedDescriptor = Object.getOwnPropertyDescriptor(
  Replaced.prototype,
  "replaced",
);
console.log(typeof replacedDescriptor.value, replacedDescriptor.get);
class Deferred {
  set value([first, second]) {
    this.parts = first + second;
  }
  set fallback(value = 4) {
    this.taken = value;
  }
}
const deferred = new Deferred();
deferred.value = [1, 2];
deferred.fallback = undefined;
console.log(deferred.parts, deferred.taken);
console.log(
  Object.getOwnPropertyDescriptor(Deferred.prototype, "fallback").set.length,
);
`,
  },
  {
    name: "class-strict-body",
    nonStrictScript: true,
    source: `
class Strict {
  constructor() {
    this.frozen = {};
    Object.defineProperty(this.frozen, "item", {
      value: 1,
      writable: false,
    });
  }
  reject() {
    try {
      this.frozen.item = 2;
      return "assigned";
    } catch (error) {
      return "rejected";
    }
  }
  undefinedReceiver() {
    return this === undefined;
  }
}
const strict = new Strict();
console.log(strict.reject(), strict.frozen.item);
const unbound = Strict.prototype.undefinedReceiver;
console.log(unbound());
class Collected {
  constructor(size) {
    this.parts = "";
    for (let index = 0; index < size; index = index + 1) {
      this.parts = this.parts + index;
    }
  }
  read() {
    return this.parts;
  }
}
console.log(new Collected(4).read());
console.log(new Collected(0).read() === "");
`,
  },
  {
    name: "class-static-members",
    source: `
class Registry {
  constructor(label) {
    this.label = label;
  }
  static create(label) {
    return new Registry(label);
  }
  static get kind() {
    return "registry";
  }
  static set kind(value) {
    Registry.recorded = value;
  }
  static owner() {
    return this === Registry;
  }
  read() {
    return this.label;
  }
}
console.log(Registry.create("first").read(), Registry.kind, Registry.owner());
Registry.kind = "written";
console.log(Registry.recorded, Registry.kind);
// A static member lives on the constructor, never on the prototype, and
// an instance therefore does not inherit it.
console.log(
  typeof Registry.create,
  Registry.prototype.create,
  typeof Registry.prototype.read,
  Registry.read,
  new Registry("x").create,
);
let names = "";
for (const key of Object.keys(Registry)) {
  names = names + key + ",";
}
console.log("keys", names, Object.keys(Registry.prototype).length);
const methodDescriptor = Object.getOwnPropertyDescriptor(Registry, "create");
console.log(
  typeof methodDescriptor.value,
  methodDescriptor.writable,
  methodDescriptor.enumerable,
  methodDescriptor.configurable,
);
const accessorDescriptor = Object.getOwnPropertyDescriptor(Registry, "kind");
console.log(
  typeof accessorDescriptor.get,
  typeof accessorDescriptor.set,
  accessorDescriptor.enumerable,
  accessorDescriptor.configurable,
  "value" in accessorDescriptor,
);
console.log(
  Registry.create.name,
  Registry.create.length,
  accessorDescriptor.get.name,
  accessorDescriptor.set.name,
  accessorDescriptor.get.length,
  accessorDescriptor.set.length,
);
// A static member reuses the non-constructible method kind, so it has no
// own prototype property and new on it throws.
console.log("prototype" in Registry.create, "prototype" in Registry.owner);
try {
  new Registry.create("x");
} catch (error) {
  console.log("static construct", error instanceof TypeError);
}
// A detached static method keeps class-body strictness, so an undefined
// receiver stays undefined instead of becoming the global object.
const detached = Registry.owner;
console.log(detached());
class Split {
  static shared() {
    return "static";
  }
  shared() {
    return "prototype";
  }
}
console.log(
  Split.shared(),
  new Split().shared(),
  Split.shared === Split.prototype.shared,
);
const Anonymous = class {
  static label() {
    return "anonymous";
  }
};
console.log(Anonymous.label(), Anonymous.name);
`,
  },
  {
    name: "class-static-keys",
    source: `
let order = "";
function key(name) {
  order = order + name;
  return name;
}
const marker = Symbol("marker");
// ClassDefinitionEvaluation walks elements in source order and only
// chooses a different target for a static one, so a computed static key
// and a computed prototype key interleave by position.
class Mixed {
  [key("a")]() {
    return "prototype-a";
  }
  static [key("b")]() {
    return "static-b";
  }
  static get [key("c")]() {
    return "static-c";
  }
  [key("d")]() {
    return "prototype-d";
  }
}
console.log(order, Mixed.b(), Mixed.c, new Mixed().a(), new Mixed().d());
class Keys {
  static 7() {
    return "numeric";
  }
  static "spaced name"() {
    return "spaced";
  }
  static [marker]() {
    return "symbol";
  }
  static ["computed"]() {
    return "computed";
  }
}
console.log(
  Keys[7](),
  Keys["spaced name"](),
  Keys[marker](),
  Keys.computed(),
);
console.log(
  Keys[7].name,
  Keys["spaced name"].name,
  Keys[marker].name,
  Keys.computed.name,
);
// A static element defines an own property of the constructor, so it
// replaces the name and length the class itself installed.
class Shadow {
  static name() {
    return "shadowed name";
  }
  static length() {
    return "shadowed length";
  }
}
console.log(typeof Shadow.name, Shadow.name(), Shadow.length());
// Only prototype is reserved on a class constructor; a static element
// under a computed prototype key rejects because the property is
// non-writable and non-configurable.
try {
  class Reserved {
    static ["prototype"]() {
      return "never";
    }
  }
  console.log("defined prototype");
} catch (error) {
  console.log("static prototype", error instanceof TypeError);
}
class Named {
  static ["constructor"]() {
    return "static constructor";
  }
}
console.log(Named.constructor(), Named.prototype.constructor === Named);
class Replaced {
  static value() {
    return "first";
  }
  static get value() {
    return "accessor";
  }
  static value() {
    return "second";
  }
}
console.log(
  Replaced.value(),
  Object.getOwnPropertyDescriptor(Replaced, "value").get,
);
class Paired {
  static get item() {
    return Paired.stored;
  }
  static set item(value) {
    Paired.stored = value * 2;
  }
}
Paired.item = 5;
console.log(Paired.item, Paired.stored);
const paired = Object.getOwnPropertyDescriptor(Paired, "item");
console.log(typeof paired.get, typeof paired.set, paired.get.name);
const Self = class Inner {
  static self() {
    return Inner === Self;
  }
  static get inner() {
    return Inner.name;
  }
};
console.log(Self.self(), Self.inner, Self.name);
`,
  },
];
