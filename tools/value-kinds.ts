/** Narrow a candidate to a Boolean domain value. */
export function isBoolean<Candidate>(
  value: Candidate,
): value is Candidate & boolean {
  return typeof value === "boolean";
}

/** Narrow a candidate to a Number domain value. */
export function isNumber<Candidate>(
  value: Candidate,
): value is Candidate & number {
  return typeof value === "number";
}

/** Narrow a candidate to a non-null Object domain value. */
export function isObject<Candidate>(
  value: Candidate,
): value is Candidate & object {
  return value !== null && typeof value === "object";
}

/** Narrow a candidate to a String domain value. */
export function isString<Candidate>(
  value: Candidate,
): value is Candidate & string {
  return typeof value === "string";
}
