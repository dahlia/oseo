export let state = "starting";

await new Promise(function settle(resolve) {
  setTimeout(function finish() {
    state = "ready";
    resolve();
  }, 0);
});

console.log("dependency", state);
setTimeout(function later() {
  console.log("late timer");
}, 10);
