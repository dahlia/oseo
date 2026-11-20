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

import { early, lexical, peek } from "./cycle-a.mjs";

// This module evaluates before cycle-a.mjs: its var bindings already exist
// as undefined, while its let binding is still in the temporal dead zone.
export const records = [`early ${String(early)}`, `peek ${String(peek())}`];
try {
  records.push(`lexical ${lexical}`);
} catch (error) {
  records.push(`lexical ReferenceError ${error instanceof ReferenceError}`);
}
export const readEarly = () => early;
