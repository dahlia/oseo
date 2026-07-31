function closingIterator(label, completion) {
  return {
    [Symbol.asyncIterator]: function () {
      return {
        next: function () {
          return Promise.resolve({ value: 3, done: false });
        },
        return: function () {
          console.log(label, "close called");
          return Promise.resolve().then(function () {
            console.log(label, "close settled");
            if (completion === "reject") {
              throw new TypeError("close");
            }
            return { value: undefined, done: true };
          });
        },
      };
    },
  };
}

try {
  for await (const value of closingIterator("fulfilled", "fulfill")) {
    console.log("fulfilled body", value);
    break;
  }
  console.log("fulfilled completed");
} catch (error) {
  console.log("fulfilled caught", error.name);
}

try {
  for await (const value of closingIterator("close-error", "reject")) {
    console.log("close-error body", value);
    break;
  }
  console.log("close-error completed");
} catch (error) {
  console.log("close-error caught", error.name);
}

try {
  for await (const value of closingIterator("body-error", "reject")) {
    console.log("body-error body", value);
    throw new RangeError("body");
  }
} catch (error) {
  console.log("body-error caught", error.name);
}
