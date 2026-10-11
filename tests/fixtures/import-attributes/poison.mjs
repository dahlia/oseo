JSON.parse = function () {
  throw new Error("mutable JSON.parse called");
};
