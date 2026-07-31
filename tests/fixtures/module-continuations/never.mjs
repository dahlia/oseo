const iterator = {
  [Symbol.asyncIterator]: function () {
    return {
      next: function () {
        return Promise.resolve({ value: 1, done: false });
      },
      return: function () {
        console.log("never close called");
        return new Promise(function () {});
      },
    };
  },
};

for await (const value of iterator) {
  console.log("never body", value);
  break;
}
