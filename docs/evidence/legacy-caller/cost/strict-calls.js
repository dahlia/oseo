"use strict";
function add(a, b) {
  return a + b;
}
function run() {
  let total = 0;
  for (let i = 0; i < 20000000; i++) total = add(total, i & 7);
  return total;
}
console.log(run());
