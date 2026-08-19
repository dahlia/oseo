import { isBoolean, isNumber, isObject, isString } from "./value-kinds.ts";

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

/** An unvalidated value admitted at a structured-data parsing boundary. */
export type StructuredDataInput<Candidate = never> =
  | Candidate
  | StructuredDataValue
  | undefined;

function isStructuredDataRecord<Candidate>(
  value: StructuredDataInput<Candidate>,
  ancestors: WeakSet<object>,
  validated: WeakSet<object>,
): value is StructuredDataInput<Candidate> & StructuredDataRecord {
  if (!isObject(value) || Array.isArray(value)) {
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

function isStructuredDataValue<Candidate>(
  value: StructuredDataInput<Candidate>,
  ancestors: WeakSet<object>,
  validated: WeakSet<object>,
): value is StructuredDataInput<Candidate> & StructuredDataValue {
  if (value == null || isBoolean(value) || isNumber(value) || isString(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    if (validated.has(value)) return true;
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    let valid = true;
    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];
      if (
        !(index in value) ||
        entry === undefined ||
        !isStructuredDataValue(entry, ancestors, validated)
      ) {
        valid = false;
        break;
      }
    }
    ancestors.delete(value);
    if (valid) validated.add(value);
    return valid;
  }
  return isStructuredDataRecord(value, ancestors, validated);
}

function structuredDataRecord<Candidate>(
  value: StructuredDataInput<Candidate>,
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
export function parsedMapping<Candidate>(
  value: StructuredDataInput<Candidate>,
  description: string,
): StructuredDataRecord {
  return structuredDataRecord(value, description, "mapping");
}

/**
 * Validate a complete parsed data tree whose root is described as an object.
 */
export function parsedObject<Candidate>(
  value: StructuredDataInput<Candidate>,
  description: string,
): StructuredDataRecord {
  return structuredDataRecord(value, description, "object");
}
