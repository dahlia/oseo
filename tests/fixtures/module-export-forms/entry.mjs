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

import { bump, destructured, early, empty, peek } from "./cycle-a.mjs";
import { records } from "./cycle-b.mjs";
import reexportsDefault, {
  "☿" as mercury,
  "string name" as named,
  value as shadow,
  space,
} from "./reexports.mjs";
import * as reexports from "./reexports.mjs";
import { "*" as star } from "./values.mjs";
import * as values from "./values.mjs";

console.log("cycle", records.join(", "));
console.log("var", early, empty, destructured, peek());
bump();
console.log("var live", early);
console.log(
  "namespace identity",
  space === values,
  named === values,
  reexportsDefault === values,
  shadow === values,
  reexports.space === values,
);
console.log("string star", star, values["*"], typeof values);
console.log("names", JSON.stringify(Object.keys(values)));
console.log("reexport names", JSON.stringify(Object.keys(reexports)));
console.log(
  "live before",
  values.value,
  values["☿"],
  values[""],
  space.value,
  mercury,
);
values.increment();
console.log(
  "live after",
  values.value,
  values["☿"],
  values[""],
  space.value,
  mercury,
);
