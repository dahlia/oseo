/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
