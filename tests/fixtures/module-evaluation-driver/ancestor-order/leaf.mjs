console.log("leaf start");
Promise.resolve()
  .then(() => console.log("tick 1"))
  .then(() => console.log("tick 2"))
  .then(() => console.log("tick 3"))
  .then(() => console.log("tick 4"));
await 0;
console.log("leaf done");
