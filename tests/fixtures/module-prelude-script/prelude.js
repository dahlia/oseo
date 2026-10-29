// A sloppy Script the realm evaluates before the module graph links.
var counter = 0;
let lexical = "script let";
const fixed = "script const";
var shadowed = "global";
function record(label) {
  counter += 1;
  log.push(label + ":" + counter);
}
var log = [];
implicitGlobal = "sloppy";
var sloppyThis = (function () {
  return this === globalThis;
})();
var retained = (function () {
  const cells = [];
  for (let index = 0; index < 64; index += 1) cells.push({ index });
  return () => cells.reduce((sum, cell) => sum + cell.index, 0);
})();
