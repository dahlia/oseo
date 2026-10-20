export let value = 1;
const starValue = "star string";
export { starValue as "*", value as "☿", value as "" };
export function increment() {
  value += 1;
}
