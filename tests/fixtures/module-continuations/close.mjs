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

function closingIterator(label, completion) {
  return {
    [Symbol.asyncIterator]: function () {
      return {
        next: function () {
          return Promise.resolve({ value: 3, done: false });
        },
        return: function () {
          console.log(label, "close called");
          return Promise.resolve().then(function () {
            console.log(label, "close settled");
            if (completion === "reject") {
              throw new TypeError("close");
            }
            return { value: undefined, done: true };
          });
        },
      };
    },
  };
}

try {
  for await (const value of closingIterator("fulfilled", "fulfill")) {
    console.log("fulfilled body", value);
    break;
  }
  console.log("fulfilled completed");
} catch (error) {
  console.log("fulfilled caught", error.name);
}

try {
  for await (const value of closingIterator("close-error", "reject")) {
    console.log("close-error body", value);
    break;
  }
  console.log("close-error completed");
} catch (error) {
  console.log("close-error caught", error.name);
}

try {
  for await (const value of closingIterator("body-error", "reject")) {
    console.log("body-error body", value);
    throw new RangeError("body");
  }
} catch (error) {
  console.log("body-error caught", error.name);
}
