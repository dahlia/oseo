/** A recursively structured value produced by the repository's data parsers. */
export type StructuredDataValue =
  | StructuredDataRecord
  | readonly StructuredDataValue[]
  | boolean
  | null
  | number
  | string;

/** A keyed document whose values retain their parsed data contract. */
export interface StructuredDataRecord {
  readonly [key: string]: StructuredDataValue | undefined;
}

function isStructuredDataRecord(
  value: unknown,
  ancestors: WeakSet<object>,
  validated: WeakSet<object>,
): value is StructuredDataRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (validated.has(value)) return true;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((entry) =>
    isStructuredDataValue(entry, ancestors, validated),
  );
  ancestors.delete(value);
  if (valid) validated.add(value);
  return valid;
}

function isStructuredDataValue(
  value: unknown,
  ancestors: WeakSet<object>,
  validated: WeakSet<object>,
): value is StructuredDataValue {
  if (
    value == null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    if (validated.has(value)) return true;
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const valid = value.every((entry) =>
      isStructuredDataValue(entry, ancestors, validated),
    );
    ancestors.delete(value);
    if (valid) validated.add(value);
    return valid;
  }
  return isStructuredDataRecord(value, ancestors, validated);
}

function structuredDataRecord(
  value: unknown,
  description: string,
  kind: "mapping" | "object",
): StructuredDataRecord {
  if (!isStructuredDataRecord(value, new WeakSet(), new WeakSet())) {
    throw new Error(`${description} must be a ${kind}.`);
  }
  return value;
}

/**
 * Validate a complete parsed data tree whose root is described as a mapping.
 */
export function parsedMapping(
  value: unknown,
  description: string,
): StructuredDataRecord {
  return structuredDataRecord(value, description, "mapping");
}

/**
 * Validate a complete parsed data tree whose root is described as an object.
 */
export function parsedObject(
  value: unknown,
  description: string,
): StructuredDataRecord {
  return structuredDataRecord(value, description, "object");
}
