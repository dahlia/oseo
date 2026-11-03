function run() {
  var total = 0;
  var values = [1, 2, 3, 4, 5, 6, 7, 8];
  function visit(value) {
    total += value;
  }
  for (var i = 0; i < 2500000; i++) values.forEach(visit);
  return total;
}
console.log(run());
