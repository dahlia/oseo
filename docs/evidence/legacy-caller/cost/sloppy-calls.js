function add(a, b) {
  return a + b;
}
function run() {
  var total = 0;
  for (var i = 0; i < 20000000; i++) total = add(total, i & 7);
  return total;
}
console.log(run());
