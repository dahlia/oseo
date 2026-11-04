const first = await import("./thrower.mjs").catch((error) => error);
const second = await import("./thrower.mjs").catch((error) => error);
console.log("same error", first === second, first.message);
const late = await import("./thrower.mjs").then(
  () => "fulfilled",
  (error) => error === first,
);
console.log("later request", late);
const afterAwait = await import("./throws-after-await.mjs").catch((e) => e);
const afterAgain = await import("./throws-after-await.mjs").catch((e) => e);
console.log("after await", afterAwait.message, afterAwait === afterAgain);
