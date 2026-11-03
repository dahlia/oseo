import "./patch.mjs";
console.log("waiting start");
await null;
console.log("waiting done", thenCalls());
