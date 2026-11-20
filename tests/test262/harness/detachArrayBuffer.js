/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

/* Oseo source license
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

// The upstream helper delegates to the $262 host object, which this
// profile does not provide. ArrayBuffer.prototype.transferToFixedLength
// performs exactly the DetachArrayBuffer the hook needs on its argument
// and reports a separate zero-length copy, which this helper discards.
// Every reviewed case that includes this file observes the buffer's
// detached state afterwards rather than the detaching operation itself,
// so the observation under test is unchanged. An already detached buffer
// stays detached instead of reporting the TypeError the copy would.
function $DETACHBUFFER(buffer) {
  if (!buffer.detached) {
    buffer.transferToFixedLength(0);
  }
}
