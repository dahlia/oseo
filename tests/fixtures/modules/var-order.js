x = 1;
var x;
var late = x + 1;
console.log("var order", x, late, typeof trailing);
// eslint-disable-next-line no-unassigned-vars -- Hoisting is observed.
var trailing;
