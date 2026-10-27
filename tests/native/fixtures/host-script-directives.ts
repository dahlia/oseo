/** Fixed Script completion regressions, separate from generated domains. */
export const directiveCases = [
  { source: '"hello";', value: "hello", strict: false },
  { source: '"use strict";', value: "use strict", strict: true },
  { source: '"first"; "last";', value: "last", strict: false },
  { source: '"use strict"; "last";', value: "last", strict: true },
  { source: '"\\x68ello";', value: "hello", strict: false },
  { source: '"\\u{1f600}";', value: "😀", strict: false },
  { source: '"line\\\nend";', value: "lineend", strict: false },
  { source: '"\\x75se strict";', value: "use strict", strict: false },
] as const;

const suffix = `
/** @param {number} left @param {number} right */
function add(left, right) { return left + right; }
print(add('x', 'y'));
`;

export interface DirectiveScriptFixture {
  readonly name: string;
  readonly source: string;
  readonly expected: string;
}

export const directiveScriptFixtures: readonly DirectiveScriptFixture[] = [
  {
    name: "directive values and cooked escapes",
    source:
      directiveCases
        .map(
          ({ source }) => `print($262.evalScript(${JSON.stringify(source)}));`,
        )
        .join("\n") + suffix,
    expected:
      "hello\nuse strict\nlast\nlast\nhello\n😀\nlineend\nuse strict\nxy\n",
  },
  {
    name: "empty declarations retain the last directive",
    source:
      `
print($262.evalScript('"var"; var directiveVar = 1;'));
print($262.evalScript('"let"; let directiveLet = 2;'));
print($262.evalScript('"const"; const directiveConst = 3;'));
print($262.evalScript('"function"; function directiveFunction() {}'));
print($262.evalScript('"class"; class DirectiveClass {}'));
print($262.evalScript('"empty"; ; {}'));
print($262.evalScript('"use strict"; var strictDirectiveVar = 4;'));
print(directiveVar + directiveLet + directiveConst + strictDirectiveVar);
` + suffix,
    expected: "var\nlet\nconst\nfunction\nclass\nempty\nuse strict\n10\nxy\n",
  },
  {
    name: "later completion and strictness remain independent",
    source:
      `
print($262.evalScript('"before"; 42; var directiveAfter = 1;'));
print($262.evalScript('"before"; if (false) 42;'));
print($262.evalScript('"before"; try { "protected"; } finally { "ignored"; }'));
print($262.evalScript('"\\\\x75se strict"; directiveSloppy = 7;'));
print(directiveSloppy);
try { $262.evalScript('"use strict"; directiveStrictMissing = 1;'); }
catch (error) { print(error instanceof ReferenceError); }
print($262.evalScript('; "after empty";'));
print($262.evalScript('("parenthesized");'));
` + suffix,
    expected:
      "42\nundefined\nprotected\n7\n7\ntrue\nafter empty\nparenthesized\nxy\n",
  },
  {
    name: "directive completion preserves realms and abrupt boundaries",
    source:
      `
const realm = $262.createRealm();
const detached = realm.evalScript;
print(detached('"foreign"; var directiveRealmVar = 9;'));
print(realm.global.directiveRealmVar);
print(typeof globalThis.directiveRealmVar);
const marker = {};
realm.global.directiveMarker = marker;
try { detached('"before"; throw directiveMarker;'); }
catch (error) { print(error === marker); }
try { detached('"before"; let = ;'); }
catch (error) { print(error instanceof realm.global.SyntaxError); }
print($262.evalScript('"caller restored";'));
` + suffix,
    expected: "foreign\n9\nundefined\ntrue\ntrue\ncaller restored\nxy\n",
  },
] as const;
