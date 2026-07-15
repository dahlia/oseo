function add(left: number, right: number): number {
  return left + right;
}

function choose(value: unknown): string {
  if (value) return "yes";
  return "no";
}

console.log("native-fixture=??/" + add(40, 2));
console.log(choose(0), choose("x"));
