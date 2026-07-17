Promise.reject("unhandled before timer");

export const ready = await new Promise(function settle(resolve) {
  setTimeout(function finish() {
    console.log("timer ran before rejection report");
    resolve();
  }, 0);
});
