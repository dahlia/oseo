let evaluations = 0;
export function bump() {
  evaluations += 1;
}
export function count() {
  return evaluations;
}
