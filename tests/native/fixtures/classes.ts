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
  {
    name: "class-inheritance",
    source: `
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  sum() {
    return this.x + this.y;
  }
  static origin() {
    return new this(0, 0);
  }
  static get label() {
    return "point";
  }
}
class Point3D extends Point {
  constructor(x, y, z) {
    super(x, y);
    this.z = z;
  }
  sum() {
    return super_sum(this) + this.z;
  }
  volume() {
    return this.x * this.y * this.z;
  }
}
function super_sum(value) {
  return value.x + value.y;
}
const point = new Point3D(2, 3, 4);
console.log(point.x, point.y, point.z, point.sum(), point.volume());
console.log(point instanceof Point3D, point instanceof Point);
console.log(Point3D.name, Point3D.length);
console.log(Point3D.prototype.constructor === Point3D);
// A derived class inherits static members through the constructor chain
// and instance members through the prototype chain.
console.log(Point3D.label, typeof Point3D.origin);
const origin = Point3D.origin();
console.log(origin.x, origin.y, origin.z, origin instanceof Point3D);
console.log(Object.keys(Point3D).length, Object.keys(Point3D.prototype).length);
const prototypeDescriptor = Object.getOwnPropertyDescriptor(
  Point3D,
  "prototype",
);
console.log(
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
);
// A derived class body with no constructor forwards every argument.
class Implicit extends Point {}
const implicit = new Implicit(5, 6);
console.log(Implicit.length, implicit.x, implicit.y, implicit.sum());
console.log(implicit instanceof Implicit, implicit instanceof Point);
console.log(Implicit.label);
// Three levels of inheritance keep one receiver.
class Base {
  constructor() {
    this.chain = "base";
  }
}
class Middle extends Base {
  constructor() {
    super();
    this.chain = this.chain + "-middle";
  }
}
class Leaf extends Middle {
  constructor() {
    super();
    this.chain = this.chain + "-leaf";
  }
}
const leaf = new Leaf();
console.log(leaf.chain, leaf instanceof Base, leaf instanceof Middle);
// An accessor and a method both resolve through the inherited prototype.
class Measured {
  get area() {
    return this.side * this.side;
  }
  set area(value) {
    this.side = value;
  }
}
class Square extends Measured {
  constructor(side) {
    super();
    this.side = side;
  }
}
const square = new Square(3);
console.log(square.area);
square.area = 5;
console.log(square.side, square.area);
// A derived class expression, named and anonymous.
const Anonymous = class extends Point {};
console.log(Anonymous.name, new Anonymous(1, 1).sum());
const NamedExpression = class Inner extends Point {
  static self() {
    return Inner === NamedExpression;
  }
};
console.log(NamedExpression.name, NamedExpression.self());
// A class extending an ordinary function reaches its prototype methods.
function Legacy(tag) {
  this.tag = tag;
}
Legacy.prototype.describe = function () {
  return "legacy:" + this.tag;
};
class Modern extends Legacy {
  constructor() {
    super("modern");
  }
}
const modern = new Modern();
console.log(modern.tag, modern.describe(), modern instanceof Legacy);
`,
  },
  {
    name: "class-super-binding",
    source: `
class Base {
  constructor() {
    this.base = true;
  }
}
function report(label, run) {
  try {
    console.log(label, "ok", run());
  } catch (error) {
    console.log(
      label,
      error instanceof ReferenceError,
      error instanceof TypeError,
    );
  }
}
// A derived constructor cannot reach this before super() runs.
class Early extends Base {
  constructor() {
    this.value = 1;
    super();
  }
}
report("early-this", () => new Early());
// Falling off the end of a derived constructor still reads this.
class Missing extends Base {
  constructor() {
    return;
  }
}
report("missing-super", () => new Missing());
// BindThisValue rejects a second super() in one invocation.
class Twice extends Base {
  constructor() {
    super();
    super();
  }
}
report("double-super", () => new Twice());
// A derived constructor returns this, an object, or throws.
class ReturnsNumber extends Base {
  constructor() {
    super();
    return 5;
  }
}
report("number-return", () => new ReturnsNumber());
class ReturnsUndefined extends Base {
  constructor() {
    super();
    return undefined;
  }
}
report("undefined-return", () => new ReturnsUndefined().base);
class ReturnsObject extends Base {
  constructor() {
    super();
    return { replaced: true };
  }
}
const replaced = new ReturnsObject();
console.log(replaced.replaced, replaced.base);
console.log(replaced instanceof ReturnsObject);
// super() adopts whatever the parent constructor produced, so a base that
// returns its own object replaces the allocated receiver.
class ReplacingBase {
  constructor() {
    return { fromBase: true };
  }
}
class Adopts extends ReplacingBase {
  constructor() {
    super();
    this.added = 1;
  }
}
const adopted = new Adopts();
console.log(adopted.fromBase, adopted.added, adopted instanceof Adopts);
// A conditional and a loop both reach one super() per invocation.
class Conditional extends Base {
  constructor(flag) {
    if (flag) {
      super();
      this.branch = "then";
    } else {
      super();
      this.branch = "else";
    }
  }
}
console.log(new Conditional(true).branch, new Conditional(false).branch);
// A return inside try leaves through finally, which may still run super().
class Deferred extends Base {
  constructor(mode) {
    try {
      if (mode === "defer") return;
      super();
      this.mode = "direct";
    } finally {
      if (mode === "defer") {
        super();
        this.mode = "deferred";
      }
    }
  }
}
console.log(new Deferred("defer").mode, new Deferred("direct").mode);
// An arrow reads the constructor's this binding, so one created before
// super() still observes the bound receiver afterwards.
class Arrowed extends Base {
  constructor() {
    const read = () => this.base;
    super();
    this.read = read;
  }
}
console.log(new Arrowed().read());
// An ordinary nested function keeps its own receiver, which strict class
// code leaves undefined.
class Nested extends Base {
  constructor() {
    super();
    function plain() {
      return this;
    }
    this.plain = plain() === undefined;
  }
}
console.log(new Nested().plain);
// A rest parameter forwards through super().
class Collected extends Base {
  constructor(...values) {
    super();
    this.count = values.length;
  }
}
console.log(new Collected(1, 2, 3).count, Collected.length);
// Calling a derived class without new still throws before any super().
try {
  Base();
} catch (error) {
  console.log("call-base", error instanceof TypeError);
}
try {
  Collected();
} catch (error) {
  console.log("call-derived", error instanceof TypeError);
}
`,
  },
  {
    name: "class-heritage-values",
    source: `
let order = "";
function step(name, value) {
  order = order + name + ";";
  return value;
}
class Base {
  constructor() {
    this.base = 1;
  }
}
// The heritage operand evaluates before any element key, inside the
// class's own scope.
class Ordered extends step("heritage", Base) {
  [step("first", "first")]() {
    return 1;
  }
  static [step("second", "second")]() {
    return 2;
  }
}
console.log(order, typeof new Ordered().first, typeof Ordered.second);
// A heritage expression reads the class-scope name in its dead zone.
try {
  class Recursive extends Recursive {}
  console.log("recursive defined");
} catch (error) {
  console.log("recursive", error instanceof ReferenceError);
}
// An extends operand must be null or a constructor.
function reject(label, run) {
  try {
    run();
    console.log(label, "defined");
  } catch (error) {
    console.log(label, error instanceof TypeError);
  }
}
reject("number", () => class extends 5 {});
reject("string", () => class extends "base" {});
reject("undefined", () => class extends undefined {});
reject("object", () => class extends {} {});
const arrow = () => 1;
reject("arrow", () => class extends arrow {});
class Methods {
  method() {
    return 1;
  }
}
reject("method", () => class extends Methods.prototype.method {});
// A constructor whose prototype is neither an object nor null is rejected.
function BadPrototype() {}
BadPrototype.prototype = 3;
reject("bad-prototype", () => class extends BadPrototype {});
// A null prototype is admitted; instances then inherit nothing.
function NullPrototype() {
  this.own = 1;
}
NullPrototype.prototype = null;
class FromNull extends NullPrototype {
  constructor() {
    super();
  }
}
console.log(new FromNull().own, typeof FromNull.prototype);
// extends null makes the class derived with no reachable super
// constructor, so construction always throws.
class ExtendsNull extends null {}
reject("extends-null", () => new ExtendsNull());
class ExtendsNullExplicit extends null {
  constructor() {
    super();
  }
}
reject("extends-null-explicit", () => new ExtendsNullExplicit());
// A getter on the parent supplies the prototype the class links to.
const carrier = {};
Object.defineProperty(carrier, "target", { value: Base });
class FromGetter extends carrier.target {}
console.log(new FromGetter().base, new FromGetter() instanceof Base);
// A class expression as a heritage operand is evaluated once per
// evaluation of the enclosing class.
function makeDerived() {
  return class extends Base {
    constructor() {
      super();
      this.derived = 1;
    }
  };
}
const First = makeDerived();
const Second = makeDerived();
console.log(First === Second, new First().base, new First().derived);
console.log(new First() instanceof Second, new First() instanceof Base);
`,
  },
  {
    name: "class-new-target",
    source: `
function ordinary() {
  return new.target;
}
console.log(ordinary() === undefined, new ordinary() !== undefined);
function named() {
  return new.target === undefined ? "call" : new.target.name;
}
console.log(named(), new named() instanceof named);
class Reporting {
  constructor() {
    this.target = new.target;
    this.targetName = new.target.name;
  }
  method() {
    return new.target;
  }
  static make() {
    return new.target;
  }
}
const reporting = new Reporting();
console.log(reporting.target === Reporting, reporting.targetName);
console.log(reporting.method() === undefined, Reporting.make() === undefined);
// new.target stays the constructed class through every super() hop.
class Derived extends Reporting {
  constructor() {
    super();
    this.own = new.target;
  }
}
const derived = new Derived();
console.log(derived.target === Derived, derived.targetName);
console.log(derived.own === Derived);
class Deeper extends Derived {}
const deeper = new Deeper();
console.log(deeper.target === Deeper, deeper.targetName);
console.log(deeper.own === Deeper);
// The receiver a derived construction allocates comes from new.target's
// prototype, so the base constructor already sees the derived prototype.
class Checking {
  constructor() {
    this.isDeeper = this instanceof Deeper;
  }
}
class CheckedMiddle extends Checking {}
class CheckedLeaf extends CheckedMiddle {}
console.log(new CheckedLeaf() instanceof Checking, new CheckedLeaf().isDeeper);
// A generator function and an asynchronous function are not
// constructors, so new.target inside them is always undefined.
function* generated() {
  yield new.target === undefined;
}
console.log(generated().next().value);
async function awaited() {
  return new.target === undefined;
}
awaited().then((value) => console.log("async", value));
`,
  },
  {
    name: "class-derived-return-hints",
    source: `
// Every return of a derived constructor leaves through the this binding
// super() initializes, so a number result is a TypeError. A parameter
// hint must not let the addition specialization return the sum before
// that rejection, and the hinted and unhinted twins must agree.
class Rooted {
  constructor() {
    this.tag = "rooted";
  }
}
class HintedReturn extends Rooted {
  constructor(left: number, right: number) {
    return left + right;
  }
}
class PlainReturn extends Rooted {
  constructor(left, right) {
    return left + right;
  }
}
function report(label, make) {
  try {
    console.log(label, "returned", typeof make());
  } catch (error) {
    console.log(label, "threw", error.constructor.name);
  }
}
report("hinted small", function () { return new HintedReturn(1, 2); });
report("plain small", function () { return new PlainReturn(1, 2); });
// A falsified hint reaches the same rejection.
report("hinted strings", function () { return new HintedReturn("a", "b"); });
report("plain strings", function () { return new PlainReturn("a", "b"); });
report("hinted overflow", function () {
  return new HintedReturn(140737488355327, 1);
});
report("hinted double", function () { return new HintedReturn(0.5, 0.25); });
// An object return still stands as written whether or not it is hinted.
class HintedObject extends Rooted {
  constructor(left: number, right: number) {
    return { sum: left + right };
  }
}
console.log(new HintedObject(1, 2).sum);
console.log(new HintedObject(1, 2) instanceof Rooted);
`,
    // Enabling specialization leaves the generic addition call count
    // unchanged, which is what proves the addition specialization never
    // rewrote a derived constructor. The guard counters are shared with
    // the property inline cache, so they record its reads here.
    specialization: {
      genericCallsDisabled: 8,
      genericCallsEnabled: 8,
      hits: 5,
      misses: 8,
      overflowMisses: 0,
    },
  },
  {
    name: "class-error-subclass",
    source: `
// A derived construction passes its new target to the parent, and an
// error constructor takes the instance prototype from that target, so a
// subclass instance is an instance of the subclass.
class AppError extends Error {}
const appError = new AppError("boom");
console.log(appError instanceof AppError, appError instanceof Error);
console.log(appError.message, appError.name, appError.constructor === AppError);
class TypedError extends TypeError {}
const typedError = new TypedError("typed");
console.log(typedError instanceof TypedError, typedError instanceof TypeError);
console.log(typedError instanceof Error, typedError.message);
console.log(typedError.constructor === TypedError, typedError.name);
class LeafError extends AppError {}
const leafError = new LeafError("leaf");
console.log(leafError instanceof LeafError, leafError instanceof AppError);
console.log(leafError instanceof Error, leafError.message);
// A direct construction supplies itself as the new target, so an
// unsubclassed error keeps the callee prototype.
const plain = new Error("plain");
console.log(plain instanceof Error, plain.constructor === Error, plain.name);
const typed = new TypeError("t");
console.log(typed.constructor === TypeError, typed instanceof AppError);
// A subclass constructor runs its own body after super() returns the
// error the parent allocated.
class CodedError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
const coded = new CodedError("coded", 42);
console.log(coded instanceof CodedError, coded.message, coded.code);
console.log(coded.name, \`\${coded}\`, Object.keys(coded).length);
try {
  throw new AppError("thrown");
} catch (error) {
  console.log(error instanceof AppError, error.message);
}
`,
  },
  {
    name: "class-super-property",
    source: `
// A super property reference starts its lookup at the home object's
// prototype and keeps 'this' as its receiver, so an override still
// reaches the definition it shadows.
class Shape {
  constructor(name) {
    this.name = name;
  }
  describe() {
    return "shape:" + this.name;
  }
  get area() {
    return 0;
  }
  label() {
    return this.describe() + "/" + this.area;
  }
}
class Square extends Shape {
  constructor(side) {
    super("square");
    this.side = side;
    this.initial = super.describe();
  }
  describe() {
    return "square<" + super.describe() + ">";
  }
  get area() {
    return this.side * this.side;
  }
  both() {
    return super.area + "," + this.area;
  }
  parentLabel() {
    return super.label();
  }
  handle() {
    return super.describe;
  }
}
const square = new Square(3);
console.log(square.describe(), square.initial, square.name, square.side);
console.log(square.both(), square.area);
// The parent method runs against the derived receiver, so the call it
// makes dispatches back through the override.
console.log(square.parentLabel());
console.log(square.handle() === Shape.prototype.describe);
// A reference is a property lookup, not a call, so the value survives
// detached from any receiver.
const detached = square.handle();
console.log(detached === Shape.prototype.describe, typeof detached);
// A class between the reference and the definition is skipped only by
// the prototype chain, never by the reference itself.
class Rounded extends Square {}
class Chamfered extends Rounded {
  describe() {
    return "chamfered[" + super.describe() + "]";
  }
}
const chamfered = new Chamfered(2);
console.log(chamfered.describe(), chamfered.area);
console.log(typeof super_free);
function super_free() {
  return 0;
}
`,
  },
  {
    name: "class-super-assignment",
    source: `
// A super assignment looks the key up through the home object's
// prototype but writes to the receiver, so it reaches a setter defined
// on the parent and otherwise creates the property on the instance.
class Store {
  constructor() {
    this.tag = "base";
  }
  set recorded(value) {
    this.log = "parent-set:" + value + ":" + this.tag;
  }
  get recorded() {
    return "parent-get:" + this.log;
  }
}
Store.prototype.total = 100;
Store.prototype.count = 20;
class Tracked extends Store {
  constructor() {
    super();
    this.tag = "t";
  }
  writeThroughSetter() {
    super.recorded = 5;
    return this.log;
  }
  readThroughGetter() {
    return super.recorded;
  }
  // The receiver's own accessor is never consulted, because the write
  // defines an own property instead of assigning through the chain.
  set shadowed(value) {
    this.shadowRan = true;
  }
  writeShadowed() {
    super.shadowed = 7;
    return this.shadowed + "/" + this.shadowRan;
  }
  // A compound assignment reads through the parent and writes to the
  // receiver, so the parent's value seeds an own property that later
  // reads no longer see.
  compound() {
    super.total += 5;
    return this.total + "," + super.total;
  }
  increment() {
    const before = super.count++;
    const after = ++super.count;
    return before + "," + after + "," + this.count;
  }
  detached() {
    super.absent = super.absent + 1;
    return this.absent;
  }
}
const tracked = new Tracked();
console.log(tracked.writeThroughSetter(), tracked.readThroughGetter());
console.log(tracked.writeShadowed());
console.log(Object.getOwnPropertyDescriptor(tracked, "shadowed").value);
console.log(tracked.compound(), tracked.total);
console.log(tracked.increment(), tracked.count);
console.log(tracked.detached());
// A write that reaches a read-only parent property fails, because a
// class body is strict code.
class Sealed {}
Object.defineProperty(Sealed.prototype, "fixed", {
  value: "F",
  writable: false,
});
class Attempt extends Sealed {
  write() {
    try {
      super.fixed = 1;
      return "assigned";
    } catch (error) {
      return error.constructor.name + ":" + (super.fixed === "F");
    }
  }
}
console.log(new Attempt().write());
// The created property is an ordinary own data property of the
// receiver, and the parent object never changes.
class Base {}
class Writer extends Base {
  fill() {
    super.made = "own";
    return this.made;
  }
}
const writer = new Writer();
console.log(writer.fill(), "made" in Base.prototype);
const descriptor = Object.getOwnPropertyDescriptor(writer, "made");
console.log(descriptor.writable, descriptor.enumerable);
console.log(descriptor.configurable);
`,
  },
  {
    name: "class-super-computed",
    source: `
// A computed super reference evaluates its receiver before its key, so
// a reference inside a derived constructor observes the 'this'
// temporal dead zone before the key expression runs.
let order = "";
function key(name) {
  order = order + "key:" + name + " ";
  return name;
}
class Base {
  constructor() {
    this.kind = "base";
  }
  greet() {
    return "hello:" + this.kind;
  }
  get value() {
    return "base-value";
  }
}
Base.prototype.data = "base-data";
class Derived extends Base {
  constructor(mode) {
    if (mode === "early") {
      try {
        super[key("early")];
      } catch (error) {
        order = order + "caught:" + error.constructor.name + " ";
      }
    }
    super();
    this.kind = "derived";
  }
  read(name) {
    return super[key(name)];
  }
  call(name) {
    return super[key(name)]();
  }
  write(name, value) {
    super[key(name)] = value;
    return this[name];
  }
  greet() {
    return "override";
  }
}
const derived = new Derived("early");
console.log(order);
console.log(derived.read("data"), derived.read("value"));
console.log(derived.call("greet"), derived.greet());
console.log(derived.write("stored", 12), "stored" in Base.prototype);
console.log(order);
// A key that is not a string is converted once, and a symbol key
// reaches the same lookup.
const marker = Symbol("marker");
class Keyed extends Base {
  reach() {
    return super[marker];
  }
  reachIndex() {
    return super[1];
  }
}
Base.prototype[marker] = "symbol-value";
Base.prototype[1] = "index-value";
console.log(new Keyed().reach(), new Keyed().reachIndex());
// A nested class body takes its own home object, so an inner reference
// never reaches the outer class.
class Outer extends Base {
  build() {
    class Inner extends Base {
      read() {
        return super.data;
      }
    }
    return new Inner().read() + "/" + super.data;
  }
}
console.log(new Outer().build());
// MakeSuperPropertyReference obtains the home object's prototype after
// the key expression has produced its value, so a key that replaces
// that prototype is observed by the reference it precedes.
const replacement = {
  pick: "new",
  run() {
    return "new-call";
  },
  set slot(value) {
    order = order + "new-setter:" + value + " ";
  },
};
class Old {}
Old.prototype.pick = "old";
Old.prototype.run = function () {
  return "old-call";
};
Object.defineProperty(Old.prototype, "slot", {
  set(value) {
    order = order + "old-setter:" + value + " ";
  },
});
class Swap extends Old {
  read() {
    return super[swap("pick")];
  }
  invoke() {
    return super[swap("run")]();
  }
  store() {
    super[swap("slot")] = "v";
  }
}
function swap(name) {
  Object.setPrototypeOf(Swap.prototype, replacement);
  return name;
}
function reset() {
  Object.setPrototypeOf(Swap.prototype, Old.prototype);
}
const swapper = new Swap();
reset();
console.log(swapper.read());
reset();
console.log(swapper.invoke());
reset();
order = "";
swapper.store();
console.log(order);
// PutValue converts the key, so an assignment holds the key
// expression's raw value until the right side has been evaluated. The
// ordinary and the super form share that order.
const late = {
  toString() {
    order = order + "key ";
    return "slot";
  },
};
const plain = {};
order = "";
plain[late] = ((order = order + "right "), 1);
console.log(order, plain.slot);
class Holder extends Old {}
class Late extends Holder {
  put() {
    super[late] = ((order = order + "right "), 2);
    return this.slot;
  }
}
order = "";
console.log(new Late().put(), order);
`,
  },
  {
    name: "class-super-static",
    source: `
// A static element's home object is the constructor itself, so its
// super references walk the constructor chain that 'extends' links,
// while an instance element walks the prototype chain.
class Registry {
  static create(tag) {
    return "registry:" + tag + ":" + this.label;
  }
  static get label() {
    return "registry";
  }
  static set label(value) {
    this.assigned = "registry-set:" + value;
  }
  static describe() {
    return "static-describe";
  }
  instance() {
    return "instance";
  }
}
Registry.stored = "registry-stored";
class Scoped extends Registry {
  static create(tag) {
    return "scoped<" + super.create(tag) + ">";
  }
  static get label() {
    return "scoped";
  }
  static both() {
    return super.label + "," + this.label;
  }
  static write() {
    super.label = 3;
    return this.assigned;
  }
  static shared() {
    return super.stored;
  }
  static handle() {
    return super.describe === Registry.describe;
  }
  instance() {
    return "scoped-instance/" + super.instance();
  }
}
console.log(Scoped.create("a"));
console.log(Scoped.both(), Scoped.label);
console.log(Scoped.write(), Scoped.assigned);
console.log(Scoped.shared(), Scoped.handle());
console.log(new Scoped().instance());
// The static reference reads the constructor chain, so an own static
// property of the derived class does not shadow what super names.
Scoped.stored = "scoped-stored";
console.log(Scoped.shared(), Scoped.stored);
// A three-level chain reaches through every intermediate constructor.
class Nested extends Scoped {
  static create(tag) {
    return "nested[" + super.create(tag) + "]";
  }
}
console.log(Nested.create("b"));
console.log(Nested.label, Object.keys(Nested).length);
`,
  },
  {
    name: "class-super-cache",
    source: `
// A super read uses the same inline cache as an ordinary property read,
// guarded on the object the lookup starts at. A data property that the
// parent's own prototype object holds hits that cache, while a
// definition further up the chain and an accessor always leave the fast
// path for the generic lookup.
class Root {
  get accessed() {
    return "accessor:" + this.mark;
  }
}
Root.prototype.deep = "root-deep";
class Middle extends Root {
  method() {
    return "middle-method";
  }
}
Middle.prototype.near = "middle-near";
class Leaf extends Middle {
  constructor() {
    super();
    this.mark = "leaf";
  }
  cached() {
    return super.near;
  }
  inherited() {
    return super.deep;
  }
  accessor() {
    return super.accessed;
  }
  called() {
    return super.method();
  }
}
const leaf = new Leaf();
let report = "";
let index = 0;
while (index < 4) {
  report = report + leaf.cached() + " " + leaf.inherited() + " ";
  report = report + leaf.accessor() + " " + leaf.called() + " ";
  index = index + 1;
}
console.log(report);
// Replacing the parent's own property changes the shape the cache
// recorded, so the next read reports the new value.
Middle.prototype.near = "replaced";
console.log(leaf.cached(), leaf.inherited(), leaf.accessor());
// The cached slot belongs to the parent prototype, not to the receiver,
// so an own property of the receiver never satisfies the reference.
leaf.near = "own";
console.log(leaf.cached(), leaf.near);
`,
    // The counters record that a super read shares the ordinary
    // property inline cache: the parent prototype's own data property
    // hits the cached slot, while the inherited property and the
    // accessor take the generic lookup on every execution.
    specialization: {
      genericCallsDisabled: 41,
      genericCallsEnabled: 41,
      hits: 9,
      misses: 16,
      overflowMisses: 0,
    },
  },
  {
    name: "class-fields",
    source: `
// A field is an own data property of the instance, created in class-body
// order before the constructor body runs, and never on the prototype.
class Field {
  first = 1;
  second;
  third = this.first + 1;
}
const value = new Field();
console.log(value.first, value.second, value.third);
console.log("second" in value, Object.keys(value).length);
console.log(
  Object.keys(value)[0],
  Object.keys(value)[1],
  Object.keys(value)[2],
);
const descriptor = Object.getOwnPropertyDescriptor(value, "first");
console.log(
  descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
console.log(Object.getOwnPropertyDescriptor(Field.prototype, "first"));
console.log(Object.keys(Field.prototype).length, Field.name, Field.length);
// Each instance owns its own copy.
const other = new Field();
other.first = 9;
console.log(value.first, other.first);
class Constructed {
  before = "field";
  constructor(argument) {
    console.log("constructor sees", this.before);
    this.after = argument;
  }
  method() {
    return this.before + ":" + this.after;
  }
}
const constructed = new Constructed("argument");
console.log(constructed.method(), Object.keys(constructed).length);
// A field is defined, not assigned, so an inherited setter never runs and
// a non-writable inherited property does not reject the definition.
class Setter {
  set stored(incoming) {
    console.log("setter ran", incoming);
  }
}
class DefinesOver extends Setter {
  stored = "defined";
}
const defined = new DefinesOver();
console.log(defined.stored, Object.keys(defined).length);
class Locked {}
Object.defineProperty(Locked.prototype, "fixed", {
  configurable: false,
  enumerable: false,
  value: "prototype",
  writable: false,
});
class OverLocked extends Locked {
  fixed = "own";
}
console.log(new OverLocked().fixed, Locked.prototype.fixed);
// A field shadows a prototype method of the same name.
class Shadowing {
  method = "field";
}
Shadowing.prototype.method = "prototype";
console.log(new Shadowing().method, Shadowing.prototype.method);
`,
  },
  {
    name: "class-field-order",
    source: `
// Every element key is evaluated once, in class-body order, when the
// class is defined; every initializer runs once per instance, in the
// same order, and a method or static element only chooses its target.
let trace = "";
function step(mark, value) {
  trace = trace + mark + " ";
  return value;
}
class Ordered {
  [step("key-a", "alpha")] = step("init-a", 1);
  [step("key-method", "method")]() {
    return "method";
  }
  [step("key-b", "beta")] = step("init-b", 2);
  static [step("key-static", "onClass")]() {
    return "static";
  }
  [step("key-c", "gamma")];
}
console.log(trace);
trace = "";
const first = new Ordered();
console.log(trace, first.alpha, first.beta, first.gamma);
trace = "";
const second = new Ordered();
console.log(trace, second.alpha);
console.log(Object.keys(first).length, Object.keys(first)[2]);
console.log(typeof first.method, typeof Ordered.onClass);
// A key that completes abruptly stops the class definition before any
// later key runs, and no instance can exist to run an initializer.
trace = "";
try {
  const Rejected = class {
    [step("key-first", "kept")] = step("never", 0);
    [(() => {
      throw new TypeError("key rejected");
    })()] = 1;
    [step("key-last", "unreached")] = 2;
  };
  console.log("unreachable", typeof Rejected);
} catch (error) {
  console.log(trace, error instanceof TypeError, error.message);
}
// An initializer that completes abruptly stops the remaining fields and
// leaves the instance unreachable.
class Thrower {
  before = "set";
  failing = (() => {
    throw new RangeError("initializer rejected");
  })();
  after = "unreached";
}
try {
  new Thrower();
} catch (error) {
  console.log(error instanceof RangeError, error.message);
}
`,
  },
  {
    name: "class-field-inheritance",
    source: `
// A base class initializes its fields before its constructor body, so a
// base constructor cannot observe a derived field; a derived class
// initializes its own where super() returns.
class Base {
  baseField = "base";
  constructor(label) {
    this.label = label;
    console.log("base sees", this.baseField, this.derivedField);
  }
}
class Derived extends Base {
  derivedField = "derived";
  constructor() {
    super("from derived");
    console.log("derived sees", this.baseField, this.derivedField, this.label);
  }
}
const derived = new Derived();
console.log(Object.keys(derived).length, Object.keys(derived)[0]);
console.log(Object.keys(derived)[1], Object.keys(derived)[2]);
// The implicit derived constructor forwards its arguments and still
// initializes the fields the body declared.
class Implicit extends Base {
  implicitField = "implicit";
}
const implicit = new Implicit("passed");
console.log(implicit.label, implicit.implicitField, implicit.baseField);
// Fields follow whichever super() call the body reached.
class Late extends Base {
  lateField = "late";
  constructor(flag) {
    if (flag) {
      super("through if");
    } else {
      super("through else");
    }
    console.log("late", this.lateField, this.label);
  }
}
new Late(true);
new Late(false);
// A derived constructor that replaces its result keeps the fields on the
// receiver super() produced, which the replacement never carries.
class Replaced extends Base {
  replacedField = "replaced";
  constructor() {
    super("replaced");
    return { substitute: true };
  }
}
const replaced = new Replaced();
console.log(replaced.substitute, replaced.replacedField);
// A second super() is rejected before it can initialize the fields
// again, so each field keeps the single value it already has.
class Twice extends Base {
  counted = "once";
  constructor() {
    super("first");
    this.counted = "changed";
    try {
      super("second");
    } catch (error) {
      console.log(error instanceof ReferenceError, this.counted);
    }
  }
}
new Twice();
// A base class field initializer runs before parameter defaults, which
// is where [[Construct]] performs it for a base constructor.
class Defaulted {
  seed = 4;
  constructor(first = this.seed, second = first + 1) {
    console.log("defaults", first, second);
  }
}
new Defaulted();
new Defaulted(9);
`,
  },
  {
    name: "class-field-scope",
    source: `
// A field initializer is its own function body: it reads the class
// scope instead of the constructor parameters, provides the receiver an
// arrow function nested in it captures, and sees no new target.
const shared = "outer";
class Scoped {
  fromOuter = shared;
  fromSelf = Scoped.name;
  fromTarget = new.target;
  constructor(shared) {
    this.fromParameter = shared;
  }
}
const scoped = new Scoped("parameter");
console.log(scoped.fromOuter, scoped.fromSelf, scoped.fromParameter);
console.log(scoped.fromTarget);
const Anonymous = class {
  inner = Anonymous === undefined;
};
console.log(new Anonymous().inner, Anonymous.name);
class Arrows {
  captured = () => this;
  nested = () => () => this.captured;
}
const arrows = new Arrows();
console.log(
  arrows.captured() === arrows,
  arrows.nested()() === arrows.captured,
);
// NamedEvaluation names an anonymous initializer from the field key,
// including a computed key evaluated once per class evaluation.
const computed = "dynamic";
const marker = Symbol("marker");
class Names {
  plain = function () {};
  arrow = (first, second) => first + second;
  [computed] = function () {};
  [marker] = class {};
  [3] = function () {};
  "quoted name" = class {};
  wrapped = (0, function () {});
}
const names = new Names();
console.log(names.plain.name, names.arrow.name, names.dynamic.name);
console.log(names[marker].name, names[3].name, names["quoted name"].name);
console.log(names.wrapped.name === "", names.arrow.length, names.plain.length);
class Factory {
  static make(key) {
    return class {
      [key] = function () {};
    };
  }
}
const madeFirst = new (Factory.make("first"))();
const madeSecond = new (Factory.make("second"))();
console.log(madeFirst.first.name, madeSecond.second.name);
// A field key follows ToPropertyKey, so an ordinary object key becomes
// its string and a numeric key its number text.
const coerced = {
  toString() {
    return "fromToString";
  },
};
class Keys {
  0 = "zero";
  1.5 = "one point five";
  [coerced] = "coerced";
}
const keys = new Keys();
console.log(keys[0], keys[1.5], keys.fromToString);
console.log(Object.keys(keys)[0], Object.keys(keys).length);
`,
  },
  {
    name: "class-field-super",
    source: `
// A field initializer carries the class prototype as its home object,
// so a super reference in it reads the parent's prototype with the
// instance under construction as the receiver.
class Base {
  label = "base";
  describe() {
    return "base:" + this.label;
  }
  get computedLabel() {
    return "accessor:" + this.label;
  }
}
class Derived extends Base {
  label = "derived";
  fromSuperCall = super.describe();
  fromSuperAccessor = super.computedLabel;
  detached = super.describe;
  own = this.fromSuperCall + "!";
}
const derived = new Derived();
console.log(derived.label, derived.fromSuperCall, derived.fromSuperAccessor);
console.log(derived.own, typeof derived.detached);
// A three-level chain reads the nearest parent, and a nested class
// definition inside an initializer takes its own home object.
class Middle extends Base {
  describe() {
    return "middle:" + this.label;
  }
}
class Leaf extends Middle {
  label = "leaf";
  reached = super.describe();
  nested = new (class extends Base {
    fromOwnParent = super.describe();
  })();
}
const leaf = new Leaf();
console.log(leaf.reached, leaf.nested.fromOwnParent);
`,
  },
  {
    name: "class-field-hints",
    source: `
// A constructor that initializes fields keeps them on every path the
// addition specialization can take, including its guard misses, and an
// unhinted twin agrees with it.
class Summed {
  tag = "summed";
  constructor(left: number, right: number) {
    return left + right;
  }
}
class Plain {
  tag = "plain";
  constructor(left, right) {
    return left + right;
  }
}
function report(label, made) {
  console.log(label, made.tag, typeof made);
}
report("hinted numbers", new Summed(1, 2));
report("plain numbers", new Plain(1, 2));
report("hinted strings", new Summed("a", "b"));
report("plain strings", new Plain("a", "b"));
report("hinted overflow", new Summed(140737488355327, 1));
report("hinted double", new Summed(0.5, 0.25));
class Adder {
  base = 10;
  add(left: number, right: number) {
    return left + right;
  }
}
const adder = new Adder();
console.log(
  adder.base,
  adder.add(1, 2),
  adder.add("x", "y"),
  adder.add(0.5, 1),
);
`,
    specialization: {
      genericCallsDisabled: 9,
      genericCallsEnabled: 7,
      hits: 2,
      misses: 11,
      overflowMisses: 1,
    },
  },
  {
    name: "class-private-fields",
    source: `
// A private field is not a property: no key observation reaches it, and
// a public property of the same spelling stays independent of it.
class Box {
  #value = 1;
  #empty;
  ["#value"] = "public";
  read() {
    return this.#value;
  }
  readEmpty() {
    return this.#empty;
  }
  write(next) {
    this.#value = next;
    return this.#value;
  }
}
const box = new Box();
console.log(box.read(), typeof box.readEmpty(), box.write(7), box.read());
console.log(Object.keys(box).length, Object.keys(box)[0]);
console.log(box["#value"], box.read());
console.log(Object.getOwnPropertyDescriptor(box, "#value").value);
console.log(Object.getOwnPropertyDescriptor(Box.prototype, "#value"));
const other = new Box();
console.log(other.read(), box.read());

// The initializer runs once per instance with the instance as its
// receiver, and an arrow inside it captures that instance.
class Counted {
  #self = this;
  #arrow = () => this;
  same() {
    return this.#self === this && this.#arrow() === this;
  }
}
console.log(new Counted().same());

// A base constructor that replaces its result leaves the private
// elements on the instance the class allocated, not on the replacement.
class Replaced {
  #kept = 1;
  constructor(swap) {
    if (swap) return { swapped: true };
  }
  read() {
    return this.#kept;
  }
}
console.log(new Replaced(false).read());
const swapped = new Replaced(true);
console.log(swapped.swapped);
const detached = { read: Replaced.prototype.read };
try {
  detached.read();
} catch (error) {
  console.log("swapped-brand", error instanceof TypeError);
}
`,
  },
  {
    name: "class-private-methods",
    source: `
// A private method is installed on the instance rather than on the
// prototype, so no prototype observation reports it, and every instance
// shares the one function the class created.
class Machine {
  #state = 0;
  #advance(step) {
    this.#state = this.#state + step;
    return this.#state;
  }
  run(step) {
    return this.#advance(step);
  }
  method() {
    return this.#advance;
  }
}
const machine = new Machine();
console.log(machine.run(2), machine.run(3));
console.log(Object.keys(Machine.prototype).length, Object.keys(machine).length);
console.log(Object.getOwnPropertyDescriptor(Machine.prototype, "#advance"));
console.log(machine.method().name, machine.method().length);
console.log(machine.method() === new Machine().method());
console.log(typeof machine.method(), "prototype" in machine.method());
try {
  new (machine.method())();
} catch (error) {
  console.log("not-a-constructor", error instanceof TypeError);
}

// Every private method is installed before any field initializer runs,
// so an initializer reaches a method its class declares later.
class Ordered {
  #seeded = this.#seed();
  #seed() {
    return "seeded";
  }
  read() {
    return this.#seeded;
  }
}
console.log(new Ordered().read());

// A private method is not writable.
class Frozen {
  #step() {
    return 1;
  }
  overwrite() {
    try {
      this.#step = 2;
    } catch (error) {
      return error instanceof TypeError;
    }
    return "assigned";
  }
}
console.log(new Frozen().overwrite());

// A private method still carries the class prototype as its home
// object, so super reaches the parent exactly as an ordinary method.
class Parent {
  describe() {
    return "parent";
  }
}
class Child extends Parent {
  #describe() {
    return super.describe() + "/child";
  }
  read() {
    return this.#describe();
  }
}
console.log(new Child().read());
`,
  },
  {
    name: "class-private-accessors",
    source: `
// A getter and a setter under one private name describe one element,
// whichever order the class body defines them in.
class Celsius {
  #kelvin = 273.15;
  get #degrees() {
    return this.#kelvin - 273.15;
  }
  set #degrees(value) {
    this.#kelvin = value + 273.15;
  }
  read() {
    return this.#degrees;
  }
  write(value) {
    this.#degrees = value;
    return this.#kelvin;
  }
}
const celsius = new Celsius();
console.log(celsius.read(), celsius.write(100), celsius.read());
console.log(Object.keys(Celsius.prototype).length);

class Reversed {
  #store = 1;
  set #doubled(value) {
    this.#store = value / 2;
  }
  get #doubled() {
    return this.#store * 2;
  }
  round(value) {
    this.#doubled = value;
    return this.#doubled;
  }
}
console.log(new Reversed().round(10));

// A half-declared accessor rejects the operation it has no function
// for, and reports it as a TypeError rather than undefined.
class Half {
  #hidden = "kept";
  get #readable() {
    return this.#hidden;
  }
  set #writable(value) {
    this.#hidden = value;
  }
  readReadable() {
    return this.#readable;
  }
  writeReadable() {
    try {
      this.#readable = "next";
    } catch (error) {
      return error instanceof TypeError;
    }
    return "assigned";
  }
  readWritable() {
    try {
      return this.#writable;
    } catch (error) {
      return error instanceof TypeError;
    }
  }
  writeWritable(value) {
    this.#writable = value;
    return this.#hidden;
  }
}
const half = new Half();
console.log(half.readReadable(), half.writeReadable(), half.readWritable());
console.log(half.writeWritable("written"), half.readReadable());

// An accessor half runs against the instance that carries the element,
// and a setter reports the assigned value rather than its own result.
class Reported {
  #stored = 0;
  set #slot(value) {
    this.#stored = value * 2;
    return "ignored";
  }
  assign(value) {
    const produced = (this.#slot = value);
    return typeof produced + ":" + produced + ":" + this.#stored;
  }
}
console.log(new Reported().assign(4));
`,
  },
  {
    name: "class-private-brand-checks",
    source: `
// A private name is created once per class evaluation, so instances of
// two evaluations of one class expression never satisfy each other.
function make() {
  return class {
    #tag = "tagged";
    read() {
      return this.#tag;
    }
  };
}
const First = make();
const Second = make();
const first = new First();
console.log(first.read(), new Second().read());
const crossed = { read: Second.prototype.read };
try {
  crossed.read();
} catch (error) {
  console.log("cross-evaluation", error instanceof TypeError);
}

// A plain object, a primitive receiver, and a prototype that never ran
// the constructor all fail the same brand check.
class Branded {
  #brand = true;
  read() {
    return this.#brand;
  }
}
const detached = { read: Branded.prototype.read };
try {
  detached.read();
} catch (error) {
  console.log("plain-object", error instanceof TypeError);
}
const inherited = Object.create(Branded.prototype);
const wrapped = { read: inherited.read };
try {
  wrapped.read();
} catch (error) {
  console.log("uninitialized", error instanceof TypeError);
}
try {
  Branded.prototype.read();
} catch (error) {
  console.log("prototype-receiver", error instanceof TypeError);
}

// Private names are per class, not inherited: a derived class that
// spells the same name declares its own, and each half of the chain
// reads only what its own body installed.
class Base {
  #shared = "base";
  fromBase() {
    return this.#shared;
  }
}
class Derived extends Base {
  #shared = "derived";
  fromDerived() {
    return this.#shared;
  }
}
const derived = new Derived();
console.log(derived.fromBase(), derived.fromDerived());
const base = new Base();
const derivedReader = { fromDerived: Derived.prototype.fromDerived };
try {
  derivedReader.fromDerived();
} catch (error) {
  console.log("base-lacks-derived", error instanceof TypeError);
}
console.log(base.fromBase(), derived instanceof Base);

// A derived constructor installs its own elements where super()
// returns, so a private read before super() reports the this binding's
// temporal dead zone rather than a brand failure.
class Early extends Base {
  #own = 1;
  constructor(read) {
    if (read) {
      try {
        this.#own;
      } catch (error) {
        super();
        this.reported = error instanceof ReferenceError;
        return;
      }
    }
    super();
    this.reported = "reached";
  }
  read() {
    return this.#own;
  }
}
console.log(new Early(true).reported, new Early(false).reported);
console.log(new Early(false).read());
`,
  },
  {
    name: "class-cross-private-access",
    source: `
// A declaring class may apply each instance private element to another
// instance. The selected object supplies the field storage, method
// receiver, and accessor receiver.
class Pair {
  #value;
  constructor(value) {
    this.#value = value;
  }
  #add(step) {
    this.#value = this.#value + step;
    return this.#value;
  }
  get #doubled() {
    return this.#value * 2;
  }
  set #doubled(value) {
    this.#value = value / 2;
  }
  read(other) {
    return other.#value;
  }
  write(other, value) {
    other.#value = value;
    return other.#value;
  }
  call(other, step) {
    return other.#add(step);
  }
  getOther(other) {
    return other.#doubled;
  }
  setOther(other, value) {
    other.#doubled = value;
    return other.#doubled;
  }
}
const left = new Pair(2);
const right = new Pair(5);
console.log(
  left.read(right),
  left.write(right, 8),
  left.call(right, 3),
  left.getOther(right),
  left.setOther(right, 20),
  left.read(right),
  left.read(left),
);
for (const value of [{}, Pair.prototype, null, 1]) {
  try {
    left.read(value);
  } catch (error) {
    console.log("instance brand", error instanceof TypeError);
  }
}

// Static private fields, methods, and accessors live on the declaring
// constructor. A reference through the class name reaches that object,
// while a subclass and an instance fail the same private-name check.
class Registry {
  static #count = 1;
  static #step(amount) {
    Registry.#count = Registry.#count + amount;
    return Registry.#count;
  }
  static get #doubled() {
    return Registry.#count * 2;
  }
  static set #doubled(value) {
    Registry.#count = value / 2;
  }
  static run() {
    Registry.#doubled = 10;
    return Registry.#step(2) + ":" + Registry.#doubled;
  }
  static field(target) {
    return target.#count;
  }
  static method(target) {
    return target.#step(1);
  }
  static accessor(target) {
    target.#doubled = 18;
    return target.#doubled;
  }
}
console.log(Registry.run(), Registry.field(Registry));
console.log(Registry.method(Registry), Registry.accessor(Registry));
class DerivedRegistry extends Registry {}
for (const value of [DerivedRegistry, new Registry(), {}]) {
  for (const probe of [Registry.field, Registry.method, Registry.accessor]) {
    try {
      probe(value);
    } catch (error) {
      console.log("static brand", error instanceof TypeError);
    }
  }
}
console.log(Object.keys(Registry).length);
console.log(Object.getOwnPropertyDescriptor(Registry, "#step"));

// A private method may still contain a guarded specialization. Truthful
// values hit it, while false hints miss into the compiled generic path;
// both routes keep the cross-instance receiver and private storage.
class Hinted {
  #value = 0;
  #add(left: number, right: number) {
    return left + right;
  }
  apply(other, left, right) {
    other.#value = other.#add(left, right);
    return other.#value;
  }
}
const hinted = new Hinted();
const other = new Hinted();
console.log(hinted.apply(other, 1, 2));
console.log(hinted.apply(other, "a", "b"));
`,
  },
  {
    name: "class-private-updates",
    source: `
// Compound assignment and the update operators read the element once
// and write it once, through the same private name.
class Tally {
  #count = 1;
  step() {
    const post = this.#count++;
    const pre = ++this.#count;
    const decrement = this.#count--;
    return post + ":" + pre + ":" + decrement + ":" + this.#count;
  }
  compound() {
    this.#count += 10;
    this.#count *= 2;
    this.#count **= 2;
    this.#count ||= 99;
    this.#count &&= this.#count - 1;
    return this.#count;
  }
  nullish() {
    this.#count = undefined;
    this.#count ??= "filled";
    return this.#count;
  }
}
const tally = new Tally();
console.log(tally.step());
console.log(tally.compound());
console.log(tally.nullish());

// An accessor element runs its getter and setter once each for a
// compound assignment, in that order.
class Logged {
  #stored = 1;
  #reads = 0;
  #writes = 0;
  get #slot() {
    this.#reads = this.#reads + 1;
    return this.#stored;
  }
  set #slot(value) {
    this.#writes = this.#writes + 1;
    this.#stored = value;
  }
  run() {
    this.#slot += 5;
    return this.#stored + ":" + this.#reads + ":" + this.#writes;
  }
}
console.log(new Logged().run());

// A private field holds any value the language admits, including a
// function, an object, and a nested class instance.
class Holder {
  #payload;
  set(value) {
    this.#payload = value;
    return this;
  }
  get() {
    return this.#payload;
  }
}
const holder = new Holder();
console.log(typeof holder.set(() => 1).get());
console.log(holder.set({ nested: 2 }).get().nested);
console.log(holder.set(new Holder().set("deep")).get().get());
`,
  },
  {
    name: "class-private-hints",
    source: `
// The addition specialization only rewrites a two-parameter body whose
// one statement returns the sum, so private state cannot enter that
// body. What it can do is surround it: a class that declares private
// fields, a private method, and a private accessor still specializes
// its hinted method, and every guard path leaves the private elements
// intact. An unhinted twin agrees with it.
class Hinted {
  #calls = 0;
  #tag = "hinted";
  #record() {
    this.#calls = this.#calls + 1;
    return this.#calls;
  }
  get #summary() {
    return this.#tag + ":" + this.#calls;
  }
  add(left: number, right: number) {
    return left + right;
  }
  run(left, right) {
    const sum = this.add(left, right);
    this.#record();
    return this.#summary + ":" + sum;
  }
}
class Plain {
  #calls = 0;
  #tag = "plain";
  #record() {
    this.#calls = this.#calls + 1;
    return this.#calls;
  }
  get #summary() {
    return this.#tag + ":" + this.#calls;
  }
  add(left, right) {
    return left + right;
  }
  run(left, right) {
    const sum = this.add(left, right);
    this.#record();
    return this.#summary + ":" + sum;
  }
}
const hinted = new Hinted();
const plain = new Plain();
console.log(hinted.run(1, 2));
console.log(plain.run(1, 2));
console.log(hinted.run("a", "b"));
console.log(plain.run("a", "b"));
console.log(hinted.run(0.5, 0.25));
console.log(hinted.run(140737488355327, 1));
console.log(hinted.run(3, 4));
`,
    specialization: {
      genericCallsDisabled: 42,
      genericCallsEnabled: 40,
      hits: 2,
      misses: 2,
      overflowMisses: 1,
    },
  },
  {
    name: "class-static-fields",
    source: `
// A static field is an own data property of the constructor, defined
// once when the class is, and it reaches neither the prototype nor an
// instance.
class Registry {
  static first = 1;
  static second;
  static third = Registry.first + 1;
}
console.log(Registry.first, Registry.second, Registry.third);
console.log("second" in Registry, Object.keys(Registry).length);
console.log(
  Object.keys(Registry)[0],
  Object.keys(Registry)[1],
  Object.keys(Registry)[2],
);
const descriptor = Object.getOwnPropertyDescriptor(Registry, "first");
console.log(
  descriptor.value,
  descriptor.writable,
  descriptor.enumerable,
  descriptor.configurable,
);
console.log(Object.getOwnPropertyDescriptor(Registry.prototype, "first"));
console.log(Object.keys(Registry.prototype).length);
const made = new Registry();
console.log("first" in made, made.first, Object.keys(made).length);
// The initializer's receiver is the class, so this reads the
// constructor and a nested arrow captures it.
class Receiver {
  static self = this;
  static named = this.name;
  static arrow = () => this;
  static loose = function () {
    return typeof this;
  };
}
console.log(
  Receiver.self === Receiver,
  Receiver.named,
  Receiver.arrow() === Receiver,
);
// A static field is defined, not assigned, so it replaces the
// configurable name and length properties a class starts with.
class Renamed {
  static name = "replaced";
  static length = 5;
}
const renamed = Object.getOwnPropertyDescriptor(Renamed, "name");
console.log(
  Renamed.name,
  Renamed.length,
  renamed.writable,
  renamed.enumerable,
  renamed.configurable,
);
// The property the definition installs stays writable and configurable.
class Mutable {
  static counter = 0;
}
Mutable.counter = Mutable.counter + 1;
console.log(Mutable.counter, delete Mutable.counter, Mutable.counter);
// A subclass inherits a static field it does not redeclare and owns the
// one it does.
class Base {
  static tag = "base";
}
class Redefines extends Base {
  static tag = "sub";
}
class Silent extends Base {}
console.log(Base.tag, Redefines.tag, Silent.tag);
console.log(Object.getOwnPropertyDescriptor(Silent, "tag"));
// A static and an instance field of the same name are separate
// properties of separate objects.
class Both {
  shared = "instance";
  static shared = "static";
}
console.log(new Both().shared, Both.shared);
`,
  },
  {
    name: "class-static-field-order",
    source: `
// Every element key evaluates once, in class-body order, while the
// class is defined. A static field's initializer waits until the whole
// body is in place, so it runs after every key and every method, in
// static-element order, and an instance field's initializer waits for
// construction.
let trace = "";
function step(mark, value) {
  trace = trace + mark + " ";
  return value;
}
class Ordered {
  [step("key-alpha", "alpha")] = step("init-alpha", 1);
  static [step("key-beta", "beta")] = step("static-beta", 2);
  [step("key-method", "method")]() {
    return "method";
  }
  static [step("key-gamma", "gamma")] = step("static-gamma", 3);
  [step("key-delta", "delta")] = step("init-delta", 4);
  static [step("key-static-method", "shared")]() {
    return "shared";
  }
}
console.log("definition", trace);
trace = "";
const made = new Ordered();
console.log("construction", trace);
console.log(made.alpha, made.delta, Ordered.beta, Ordered.gamma);
console.log(Ordered.shared(), made.method());
// A static initializer runs after every method is defined and after the
// class-scope binding is initialized, so it reaches both.
class Late {
  static byName = Late.compute();
  static byThis = this.compute() + 1;
  static compute() {
    return 10;
  }
}
console.log(Late.byName, Late.byThis);
// An abrupt static initializer stops the class definition where it
// threw, leaving the earlier definitions performed and the later ones
// unreached.
let ran = "";
function note(mark) {
  ran = ran + mark + " ";
  return mark;
}
try {
  class Abrupt {
    static before = note("before");
    static bad = undefined.missing;
    static after = note("after");
  }
} catch (error) {
  console.log("abrupt initializer", error instanceof TypeError, ran);
}
// An abrupt static key stops the definition before any initializer runs.
ran = "";
try {
  class AbruptKey {
    static [note("key")] = note("value");
    static [undefined.missing] = 1;
  }
} catch (error) {
  console.log("abrupt key", error instanceof TypeError, ran);
}
// A static field can name an anonymous definition, exactly as an
// instance field does, including through a computed key.
class Names {
  static plain = function () {};
  static arrow = () => 1;
  static ["computed"] = function () {};
  static #hidden = function () {};
  static hiddenName() {
    return this.#hidden.name;
  }
}
console.log(
  Names.plain.name,
  Names.arrow.name,
  Names.computed.name,
  Names.hiddenName(),
);
`,
  },
  {
    name: "class-static-private-fields",
    source: `
// A static private field is a private element the constructor itself
// carries. It is not a property, so no key observation, enumeration, or
// descriptor read reaches it, and only the declaring class body names
// it.
class Counter {
  static #count = 0;
  static #label;
  static read() {
    return this.#count;
  }
  static label() {
    return this.#label;
  }
  static bump() {
    this.#count = this.#count + 1;
    return this.#count;
  }
}
console.log(Counter.read(), Counter.label(), Counter.bump(), Counter.bump());
console.log(Object.keys(Counter).length, "#count" in Counter);
console.log(Object.getOwnPropertyDescriptor(Counter, "count"));
// A static private field reads another one declared before it, because
// the static initializers run in source order.
class Chained {
  static #base = 2;
  static #doubled = this.#base * 2;
  static report() {
    return this.#base + ":" + this.#doubled;
  }
}
console.log(Chained.report());
// Reading a static private field before its own definition runs finds
// no element, so the brand check reports a TypeError.
try {
  class TooEarly {
    static early = TooEarly.probe();
    static #later = 1;
    static probe() {
      return this.#later;
    }
  }
} catch (error) {
  console.log("too early", error instanceof TypeError);
}
// Each class evaluation creates its own private names, so a constructor
// from one evaluation never satisfies another's element, and a subclass
// that inherits the reader carries no element of its own.
function make(value) {
  return class {
    static #brand = value;
    static read() {
      return this.#brand;
    }
  };
}
const first = make("first");
const second = make("second");
console.log(first.read(), second.read());
class Derived extends first {}
try {
  Derived.read();
} catch (error) {
  console.log("derived brand", error instanceof TypeError);
}
// An instance of the declaring class carries no static element, so the
// same private name read through an instance fails its brand check.
class Instances {
  static #only = "class";
  static read() {
    return this.#only;
  }
  probe() {
    return this.#only;
  }
}
console.log(Instances.read());
try {
  new Instances().probe();
} catch (error) {
  console.log("instance brand", error instanceof TypeError);
}
// The update operators read and write one static private element once.
class Steps {
  static #n = 1;
  static run() {
    this.#n++;
    this.#n += 5;
    return this.#n;
  }
}
console.log(Steps.run(), Steps.run());
// A static private field holds any value, including a function the
// class calls through the same name.
class Holder {
  static #fn = function () {
    return "held";
  };
  static #missing;
  static run() {
    return this.#fn();
  }
  static callMissing() {
    return this.#missing();
  }
}
console.log(Holder.run());
try {
  Holder.callMissing();
} catch (error) {
  console.log("not callable", error instanceof TypeError);
}
// A static private field and an instance private field of the same
// class stay separate elements on separate objects.
class Split {
  static #shared = "class";
  #shared2 = "instance";
  static readStatic() {
    return this.#shared;
  }
  readInstance() {
    return this.#shared2;
  }
}
console.log(Split.readStatic(), new Split().readInstance());
`,
  },
  {
    name: "class-static-field-inheritance",
    source: `
// A derived class's static fields run after the whole parent class
// definition, so every parent static field is already in place.
let trace = "";
function step(mark, value) {
  trace = trace + mark + " ";
  return value;
}
class Parent {
  static one = step("parent-one", 1);
  static two = step("parent-two", 2);
  static describe() {
    return "parent";
  }
  static get badge() {
    return "badge";
  }
}
class Child extends Parent {
  static three = step("child-three", Child.one + Child.two);
  static inherited = this.one;
  static viaSuper = super.describe() + "-child";
  static badgeCopy = super.badge;
}
class Grandchild extends Child {
  static four = step("grandchild-four", Grandchild.three + 1);
  static chain = super.describe() + ":" + this.viaSuper;
}
console.log("order", trace);
console.log(Child.three, Child.inherited, Child.viaSuper, Child.badgeCopy);
console.log(Grandchild.four, Grandchild.chain, Grandchild.one);
console.log(Parent.viaSuper, Object.getOwnPropertyDescriptor(Parent, "three"));
// A static field initializer reads through the constructor chain, so a
// parent static field it does not shadow reports the parent's value and
// a redeclared one reports its own.
class Shadowing extends Parent {
  static one = this.one + 10;
  static two = super.two;
}
console.log(Shadowing.one, Shadowing.two, Parent.one);
// A static field on a derived class is defined after the parent's, so a
// parent static method the child calls already sees the parent value.
class Reporting {
  static value = "parent";
  static report() {
    return this.value;
  }
}
class Reported extends Reporting {
  static value = "child";
}
console.log(Reporting.report(), Reported.report());
// A class expression as the heritage operand finishes its own static
// fields before the derived class starts.
const Derived = class extends class {
  static seed = step("anonymous-seed", 5);
} {
  static grown = step("derived-grown", this.seed * 2);
};
console.log(trace, Derived.grown, Derived.seed);
`,
  },
  {
    name: "class-static-field-hints",
    source: `
// Static elements surround a hinted method without changing the
// specialization it takes: the hinted class and its unhinted twin agree
// on every guard path, including the misses a string operand, a double
// operand, and an overflow force.
class Hinted {
  static base = 10;
  static #offset = 5;
  static bump(left: number, right: number) {
    return left + right;
  }
  static combined = Hinted.bump(Hinted.base, 2);
  static hidden = Hinted.bump(Hinted.reveal(), 1);
  static reveal() {
    return this.#offset;
  }
}
class Plain {
  static base = 10;
  static bump(left, right) {
    return left + right;
  }
  static combined = Plain.bump(Plain.base, 2);
}
console.log(Hinted.combined, Plain.combined, Hinted.hidden, Hinted.reveal());
console.log(Hinted.bump(1, 2), Plain.bump(1, 2));
console.log(Hinted.bump("a", "b"), Plain.bump("a", "b"));
console.log(Hinted.bump(0.5, 0.25), Plain.bump(0.5, 0.25));
console.log(Hinted.bump(140737488355327, 1), Plain.bump(140737488355327, 1));
`,
    specialization: {
      genericCallsDisabled: 11,
      genericCallsEnabled: 8,
      hits: 3,
      misses: 7,
      overflowMisses: 1,
    },
  },
  {
    name: "class-static-blocks",
    source: `
// A static initialization block runs once, while the class is defined,
// with the constructor as its receiver. It declares no element and
// evaluates no key, so nothing about the block itself is observable.
class Setup {
  static {
    this.ready = true;
  }
}
console.log(Setup.ready, Object.keys(Setup).length, Object.keys(Setup)[0]);
const readied = Object.getOwnPropertyDescriptor(Setup, "ready");
console.log(readied.writable, readied.enumerable, readied.configurable);
console.log(Object.keys(Setup.prototype).length, "ready" in new Setup());
// Several blocks run in source order, and each one sees what the
// earlier ones left behind.
let trace = "";
class Ordered {
  static {
    trace = trace + "first ";
    this.count = 1;
  }
  static {
    trace = trace + "second ";
    this.count = this.count + 1;
  }
  static {
    trace = trace + "third";
  }
}
console.log(trace, Ordered.count);
// The receiver of a block is the constructor itself, so a nested arrow
// captures the class while an ordinary nested function keeps its own
// strict receiver, and new.target is undefined.
class Receiver {
  static {
    const arrow = () => this;
    const loose = function () {
      return typeof this;
    };
    console.log(
      this === Receiver,
      this.name,
      arrow() === Receiver,
      loose(),
      new.target,
    );
  }
}
// The class-scope binding is initialized before any static element
// runs, so a block reaches the class by name and reaches a method
// declared later in the body.
class Named {
  static {
    console.log(Named === this, this.compute(), typeof Named.prototype.later);
  }
  static compute() {
    return 7;
  }
  later() {
    return "later";
  }
}
// A class expression is named before its static elements run.
const anonymous = class {
  static {
    console.log(this.name, typeof this);
  }
};
console.log(anonymous.name);
// A class whose only element is a static block declares no instance
// element, so construction adds nothing to an instance.
class Bare {
  static {
    this.marked = 1;
  }
}
console.log(Object.keys(new Bare()).length, Bare.marked);
`,
  },
  {
    name: "class-static-block-order",
    source: `
// Every element key evaluates once, in class-body order, while the
// class is defined. A static block, like a static field initializer,
// waits until the whole body is in place, and the two interleave in
// source order.
let trace = "";
function step(mark, value) {
  trace = trace + mark + " ";
  return value;
}
class Ordered {
  static [step("key-alpha", "alpha")] = step("static-alpha", 1);
  static {
    step("block-one", 0);
    this.fromBlock = this.alpha + 1;
  }
  [step("key-instance", "instance")] = step("init-instance", 2);
  static [step("key-beta", "beta")] = step("static-beta", 3);
  static {
    step("block-two", 0);
  }
  [step("key-method", "method")]() {
    return "method";
  }
}
console.log("definition", trace);
trace = "";
const made = new Ordered();
console.log("construction", trace);
console.log(Ordered.alpha, Ordered.fromBlock, Ordered.beta, made.instance);
// A static block runs after every method is defined and after the
// class-scope binding is initialized, so a static field declared after
// it reads what the block left behind.
class Late {
  static {
    this.seeded = this.compute();
  }
  static derived = Late.seeded + 1;
  static compute() {
    return 10;
  }
}
console.log(Late.seeded, Late.derived);
// An abrupt block stops the class definition where it threw, leaving
// the earlier static elements performed and the later ones unreached.
let ran = "";
function note(mark) {
  ran = ran + mark + " ";
  return mark;
}
try {
  class Abrupt {
    static before = note("before");
    static {
      note("block");
      undefined.missing;
    }
    static after = note("after");
  }
} catch (error) {
  console.log("abrupt block", error instanceof TypeError, ran);
}
// A class declaration whose block throws never initializes its
// binding, so nothing after the declaration is reached.
ran = "";
try {
  class Declared {
    static {
      note("declared");
      throw new RangeError("stop");
    }
  }
  console.log("unreachable", typeof Declared);
} catch (error) {
  console.log("abrupt declaration", error instanceof RangeError, ran);
}
`,
  },
  {
    name: "class-static-block-scope",
    source: `
// A static block is its own function body: it declares var, let, const,
// and function bindings that no other element and no enclosing scope
// reaches, and the class scope is what it closes over.
let outer = "outer";
class Scoped {
  static {
    var counted = 1;
    let shifted = 2;
    const fixed = 3;
    function total() {
      return counted + shifted + fixed;
    }
    console.log(total(), outer, typeof Scoped);
  }
  static {
    // A second block is a separate body, so its own var declaration
    // shadows nothing and starts undefined here.
    var counted = 10;
    console.log(counted);
  }
}
// A block reaches the static private elements the class declares,
// through the constructor its receiver is.
class Hidden {
  static #count = 0;
  static #label = "start";
  static {
    this.#count = this.#count + 1;
    this.#label = this.#label + "-run";
    this.report = this.#count + " " + this.#label;
  }
  static read() {
    return this.#count;
  }
}
console.log(Hidden.report, Hidden.read());
console.log(Object.keys(Hidden).length, Object.keys(Hidden)[0]);
// Every class evaluation runs its blocks afresh against the class that
// evaluation created.
function make(tag) {
  return class {
    static {
      this.tag = tag;
    }
  };
}
const first = make("one");
const second = make("two");
console.log(first.tag, second.tag, first === second);
// A nested class inside a block is an ordinary class, and its own block
// runs while the outer one is still running.
let nesting = "";
class Outer {
  static {
    nesting = nesting + "outer-start ";
    class Inner {
      static {
        nesting = nesting + "inner ";
      }
    }
    nesting = nesting + "outer-end";
    this.nested = typeof Inner;
  }
}
console.log(nesting, Outer.nested);
// A block reaches the loops, conditionals, and try statements every
// other function body admits.
class Control {
  static {
    let sum = 0;
    for (let index = 0; index < 4; index = index + 1) {
      if (index === 2) continue;
      sum = sum + index;
    }
    try {
      throw new TypeError("caught");
    } catch (error) {
      sum = sum + (error instanceof TypeError ? 10 : 0);
    } finally {
      sum = sum + 100;
    }
    this.sum = sum;
  }
}
console.log(Control.sum);
`,
  },
  {
    name: "class-static-block-super",
    source: `
// A static block carries the constructor as its home object, so
// super.x inside one starts at the parent constructor, exactly as a
// static field initializer and a static method do.
class Base {
  static tag = "base";
  static describe() {
    return "base-describe";
  }
}
class Derived extends Base {
  static {
    this.fromSuper = super.tag;
    this.calledSuper = super.describe();
  }
  static describe() {
    return "derived-describe";
  }
}
console.log(Derived.fromSuper, Derived.calledSuper);
console.log(Derived.describe(), Derived.tag);
// A class definition completes before the class that extends it
// begins, so a parent's static block always runs before its child's.
let order = "";
class Parent {
  static {
    order = order + "parent ";
  }
}
class Child extends Parent {
  static {
    order = order + "child ";
  }
}
class Grandchild extends Child {
  static {
    order = order + "grandchild";
  }
}
console.log(order);
// A static block reaches an inherited static element through the
// constructor its receiver is.
class Counter {
  static value = 1;
  static next() {
    return this.value + 1;
  }
}
class Doubling extends Counter {
  static {
    this.doubled = this.next() * 2;
  }
}
console.log(Doubling.doubled, Doubling.value, Doubling.next());
// A super reference in a block reads through the chain a two-level
// heritage builds.
class Root {
  static level() {
    return "root";
  }
}
class Middle extends Root {
  static level() {
    return "middle";
  }
}
class Leaf extends Middle {
  static {
    this.seen = super.level();
  }
  static level() {
    return "leaf";
  }
}
console.log(Leaf.seen, Leaf.level());
// The block still receives the derived constructor, so a static field
// the parent declared is defined on the parent while the block writes
// to the child.
class Shared {
  static owned = "parent";
}
class Overwrites extends Shared {
  static {
    this.owned = "child";
  }
}
console.log(Shared.owned, Overwrites.owned);
console.log(Object.keys(Overwrites).length, Object.keys(Shared).length);
`,
  },
  {
    name: "class-static-block-hints",
    source: `
// Static blocks surround a hinted method without changing the
// specialization it takes: the hinted class and its unhinted twin agree
// on every guard path, including the misses a string operand, a double
// operand, and an overflow force.
class Hinted {
  static seed = 3;
  static bump(left: number, right: number) {
    return left + right;
  }
  static {
    this.base = Hinted.bump(this.seed, 7);
  }
  static combined = Hinted.bump(Hinted.base, 2);
  static {
    this.total = Hinted.bump(this.combined, 0);
  }
}
class Plain {
  static seed = 3;
  static bump(left, right) {
    return left + right;
  }
  static {
    this.base = Plain.bump(this.seed, 7);
  }
  static combined = Plain.bump(Plain.base, 2);
  static {
    this.total = Plain.bump(this.combined, 0);
  }
}
console.log(Hinted.base, Hinted.combined, Hinted.total);
console.log(Plain.base, Plain.combined, Plain.total);
console.log(Hinted.bump(1, 2), Plain.bump(1, 2));
console.log(Hinted.bump("a", "b"), Plain.bump("a", "b"));
console.log(Hinted.bump(0.5, 0.25), Plain.bump(0.5, 0.25));
console.log(Hinted.bump(140737488355327, 1), Plain.bump(140737488355327, 1));
`,
    specialization: {
      genericCallsDisabled: 14,
      genericCallsEnabled: 10,
      hits: 4,
      misses: 14,
      overflowMisses: 1,
    },
  },
];
