// A primitive thrown before the first await is the rejection value.
if (globalThis.alwaysTrue !== false) throw "primitive";
await null;
