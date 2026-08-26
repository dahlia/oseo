import * as mixed from "./mixed.mjs";
import * as descriptors from "./value.mjs";

// A module namespace as the properties argument: every export is an own
// enumerable property whose sorted key order drives the collection pass,
// and each descriptor is read through the namespace's binding cells. The
// exported function is an object too, so it converts to an all-default
// descriptor rather than being skipped.
const created = Object.create(null, descriptors);
const firstDescriptor = Object.getOwnPropertyDescriptor(created, "first");
console.log(
  "collected",
  created.first,
  created.second,
  typeof created.bump,
  firstDescriptor.writable,
  firstDescriptor.enumerable,
  firstDescriptor.configurable,
  Object.getPrototypeOf(created),
);
descriptors.bump();
const live = Object.create(null, descriptors);
console.log(
  "live",
  live.first,
  Object.getOwnPropertyDescriptor(live, "first").writable,
);

// A non-object export aborts the collection pass before any definition,
// and the fresh target is discarded with the abrupt completion.
try {
  Object.create(null, mixed);
} catch (error) {
  console.log("mixed namespace", error instanceof TypeError);
}

// A module namespace as the prototype: the created object inherits every
// export through the namespace's binding cells, and a later bump stays
// visible through the shared descriptor object.
const overNamespace = Object.create(descriptors);
console.log(
  "namespace prototype",
  Object.getPrototypeOf(overNamespace) === descriptors,
  overNamespace.first.value,
  Object.keys(overNamespace).length,
);
