const iterator = {
  [Symbol.asyncIterator]: function () {
    return {
      next: function () {
        console.log("never step called");
        return new Promise(function () {});
      },
    };
  },
};

for await (const value of iterator) {
  console.log("never step body", value);
}
