Object.assign = function (target, source) {
  target.value = source.value;
  return this === Object ? target : { value: "wrong receiver" };
};
