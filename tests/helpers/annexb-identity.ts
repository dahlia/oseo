/** Core reflection only; the excluded accessor bodies are never invoked. */
export function annexbIdentityProgram(value: number): string {
  return `
(function () {
  const P = Object.prototype;
  const K = "__proto__";
  const original = Object.getOwnPropertyDescriptor(P, K);
  const get = original.get;
  const set = original.set;
  const all = Object.getOwnPropertyDescriptors(P)[K];
  console.log("identities", typeof get, typeof set, get !== set,
    all.get === get, all.set === set,
    get !== Object.getPrototypeOf, set !== Object.setPrototypeOf);
  console.log("metadata", get.name, set.name, get.length, set.length,
    Object.getPrototypeOf(get) === Function.prototype,
    Object.getPrototypeOf(set) === Function.prototype,
    Object.hasOwn(get, "prototype"), Object.hasOwn(set, "prototype"));
  const name = Object.getOwnPropertyDescriptor(get, "name");
  const length = Object.getOwnPropertyDescriptor(set, "length");
  console.log("attributes", name.writable, name.enumerable, name.configurable,
    length.writable, length.enumerable, length.configurable,
    original.enumerable, original.configurable);
  console.log("text",
    Function.prototype.toString.call(get).includes("[native code]"),
    Function.prototype.toString.call(set).includes("[native code]"));
  let nonconstructors = 0;
  for (const fn of [get, set, get.bind(null), new Proxy(set, {})]) {
    try { Reflect.construct(fn, []); }
    catch (error) { if (error instanceof TypeError) nonconstructors++; }
  }
  console.log("construct", nonconstructors);
  const before = Reflect.ownKeys(P).join(",");
  function userGet() { return ${value}; }
  function userSet(value) { this.identityValue = value; }
  Object.defineProperty(P, K, { get: userGet });
  let descriptor = Object.getOwnPropertyDescriptor(P, K);
  console.log("partial get", descriptor.get === userGet,
    descriptor.set === set, ({}).__proto__ === ${value});
  Object.defineProperty(P, K, original);
  Object.defineProperty(P, K, { set: userSet });
  descriptor = Object.getOwnPropertyDescriptor(P, K);
  const receiver = {};
  receiver.__proto__ = ${value};
  console.log("partial set", descriptor.get === get,
    descriptor.set === userSet, receiver.identityValue === ${value});
  Object.defineProperty(P, K, original);
  Object.defineProperty(P, K, { get: undefined });
  descriptor = Object.getOwnPropertyDescriptor(P, K);
  console.log("undefined", descriptor.get === undefined,
    descriptor.set === set, ({}).__proto__ === undefined);
  Object.defineProperty(P, K, original);
  console.log("order", Reflect.ownKeys(P).join(",") === before);
  P.identityMarker = ${value};
  const deleted = delete P.__proto__;
  console.log("delete", deleted,
    Object.getOwnPropertyDescriptor(P, K) === undefined);
  Object.defineProperty(P, K, original);
  const keys = Reflect.ownKeys(P);
  descriptor = Object.getOwnPropertyDescriptor(P, K);
  console.log("recreate", keys[keys.length - 1] === K,
    descriptor.get === get, descriptor.set === set);
  delete P.identityMarker;
  for (const operation of ["seal", "freeze"]) {
    const copy = {};
    Object.defineProperty(copy, K, original);
    const proxy = new Proxy(copy, {
      getOwnPropertyDescriptor(target, key) {
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    });
    Object[operation](proxy);
    const sealed = Object.getOwnPropertyDescriptors(proxy)[K];
    console.log(operation, sealed.get === get, sealed.set === set,
      sealed.configurable, Reflect.defineProperty(proxy, K, { get: get }),
      Reflect.defineProperty(proxy, K, { set: set }),
      Reflect.defineProperty(proxy, K, { get: undefined }),
      Reflect.defineProperty(proxy, K, { get: userGet }));
  }
  const intercepted = new Proxy(get, { apply() { return ${value}; } });
  console.log("proxy apply", intercepted() === ${value});
})();
`;
}

/** Independent oracle for the normative native identity contract. */
export const annexbIdentityExpected: string = [
  "identities function function true true true true true",
  "metadata get __proto__ set __proto__ 0 1 true true false false",
  "attributes false false true false false true false true",
  "text true true",
  "construct 4",
  "partial get true true true",
  "partial set true true true",
  "undefined true true true",
  "order true",
  "delete true true",
  "recreate true true true",
  "seal true true false true true false false",
  "freeze true true false true true false false",
  "proxy apply true",
  "",
].join("\n");

/**
 * Deno 2.9.7 exposes JavaScript __proto__ functions in this reference Script.
 * Keep that metadata discrepancy separate from the normative native oracle.
 * All descriptor mutation, identity and integrity observations stay the same.
 */
export const annexbIdentityDenoExpected: string = annexbIdentityExpected
  .replace(
    "metadata get __proto__ set __proto__ 0 1 true true false false",
    "metadata __proto__ __proto__ 0 1 true true true true",
  )
  .replace("text true true", "text false false")
  .replace("construct 4", "construct 0");
