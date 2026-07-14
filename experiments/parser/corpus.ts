/** A checked-in source fixture used by every parser candidate and host. */
export interface CorpusCase {
  readonly id: string;
  readonly source: string;
}

/** Parser fixtures covering accepted, invalid, and unsupported M1 forms. */
export const corpus: readonly CorpusCase[] = [
  {
    id: "valid-m1.ts",
    source:
      "function add(left: number, right: number) {\n" +
      "  const sum = left + right;\n" +
      "  return sum;\n" +
      "}\n" +
      "console.log(add(1, 2));\n",
  },
  {
    id: "jsdoc.js",
    source:
      "/** @param {number} value @returns {number} */\n" +
      "function identity(value) {\n" +
      "  return value;\n" +
      "}\n",
  },
  {
    id: "invalid.ts",
    source: "function broken( {\n",
  },
  {
    id: "recoverable.ts",
    source: "function duplicate(value, value) { return value; }\n",
  },
  {
    id: "unsupported.ts",
    source: "const double = (value: number) => value * 2;\n",
  },
  {
    id: "unicode.ts",
    source: "function café(값: number) { return 값; }\n",
  },
  {
    id: "comments.ts",
    source:
      "/* before */ function choose(flag: boolean) {\n" +
      "  return /* result */ flag ? 1 : 0;\n" +
      "}\n",
  },
  {
    id: "crlf.ts",
    source: "function lines(value: number) {\r\n  return value;\r\n}\r\n",
  },
];
