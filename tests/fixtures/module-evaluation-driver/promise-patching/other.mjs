import "./patch.mjs";
console.log("other start");
await undefined;
console.log("other done", thenCalls());
