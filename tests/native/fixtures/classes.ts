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
];
