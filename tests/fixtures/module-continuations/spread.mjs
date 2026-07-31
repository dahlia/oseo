let iteratorCount = 0;
const source = {
  [Symbol.iterator]: function () {
    iteratorCount += 1;
    console.log("spread iterator", iteratorCount);
    let emitted = false;
    return {
      next: function () {
        if (emitted) return { value: undefined, done: true };
        emitted = true;
        return { value: 4, done: false };
      },
    };
  },
};

const values = [...source, await Promise.resolve(5)];
console.log("spread values", values[0], values[1], iteratorCount);
