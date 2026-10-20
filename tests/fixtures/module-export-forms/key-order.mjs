// ECMA-262 lists a module namespace's string keys in the code-unit order
// of [[Exports]]. V8, and so both Node.js and Deno, moves array-index
// names first, so the native scenario checks this entry against that
// order rather than against a reference host.
import * as names from "./numeric-names.mjs";
import * as values from "./values.mjs";

const show = (label, keys) => console.log(label, JSON.stringify(keys));
show("keys", Object.keys(names));
show("own names", Object.getOwnPropertyNames(names));
show("own keys", Reflect.ownKeys(names).map(String));
show("proxy keys", Reflect.ownKeys(new Proxy(names, {})).map(String));
// ECMA-262 leaves for-in order over a namespace unspecified (14.7.5.9);
// this line fixes Oseo's choice, the [[OwnPropertyKeys]] order.
const enumerated = [];
for (const key in names) enumerated.push(key);
show("for-in", enumerated);
show(
  "entries",
  Object.entries(names).map(([key]) => key),
);
const assigned = [];
Object.assign(
  new Proxy({}, { set: (target, key) => assigned.push(key) > 0 }),
  names,
);
show("assign order", assigned);
// A spread or rest copy builds an ordinary object, which moves array-index
// keys first again, so these lines show which names were copied, not the
// order in which CopyDataProperties read them.
const { value: omitted, ...rest } = names;
show("rest", Object.keys(rest));
show("spread", Object.keys({ ...names }));
show(
  "ordinary",
  Object.keys(Object.fromEntries(Object.keys(names).map((key) => [key, 0]))),
);
console.log(
  "values",
  omitted,
  names[2],
  names["4294967294"],
  names["01"],
  names[10] === values,
  names[""] === values,
  names[4294967295] === values,
);
names.increment();
console.log("live", names[2], names["4294967294"], names["01"], names.value);
