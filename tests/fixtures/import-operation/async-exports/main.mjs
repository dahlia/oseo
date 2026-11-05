const resolved = await import("./resolves.mjs");
console.log("after await", resolved.value, resolved.late);
const viaThen = await import("./resolves.mjs").then(
  (namespace) => namespace.value,
);
console.log("cached", viaThen);
const rejection = await import("./rejects.mjs").then(
  () => "fulfilled",
  (error) => `${error.constructor.name}: ${error.message}`,
);
console.log("rejected", rejection);
const early = await import("./rejects-early.mjs").then(
  () => "fulfilled",
  (error) => error,
);
console.log("rejected before await", early);
