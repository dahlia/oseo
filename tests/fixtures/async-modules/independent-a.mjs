function operand() {
  console.log("operand");
  return 1;
}

console.log("a start");
const value = operand() + (await Promise.resolve(1));
console.log("a done", value);
