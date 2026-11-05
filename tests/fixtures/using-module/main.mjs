import { exported, log, resource } from "./dependency.mjs";

log.push(`imported ${typeof exported[Symbol.dispose]}`);
using first = resource("main sync");
await using second = {
  async [Symbol.asyncDispose]() {
    log.push("dispose main async");
  },
};
await using nothing = null;
log.push("main body");
Promise.resolve().then(() => {
  log.push("microtask after body");
});
await null;
log.push("after await");
setTimeout(() => {
  console.log(log.join("\n"));
}, 0);
