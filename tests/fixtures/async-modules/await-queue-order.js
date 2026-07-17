const ready = Promise.resolve(0);

ready.then(function enqueueNested() {
  Promise.resolve().then(function nested() {
    console.log("nested");
  });
});

await ready;
console.log("after");
