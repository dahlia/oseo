import * as ns from "./module-code_FIXTURE.mjs";
observe(ns);
await Promise.resolve(ns).then(observe);
console.log("ok");
