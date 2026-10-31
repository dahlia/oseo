import * as ns from "./empty_FIXTURE.mjs";
observe(ns);
await Promise.resolve(ns).then(observe);
console.log("ok");
