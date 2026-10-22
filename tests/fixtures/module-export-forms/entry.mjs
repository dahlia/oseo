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
