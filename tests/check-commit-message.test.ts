import assert from "node:assert/strict";
import test from "node:test";

import {
  bodyColumnLimit,
  checkCommitMessage,
  effectiveCommentChar,
  formatCommitMessageReport,
  stripCommentary,
  subjectColumnLimit,
} from "../tools/check-commit-message.ts";

const valid = [
  "Check in the M5b work graph",
  "",
  "M5b covers 86 built-in families whose order matters, so the queue is",
  "checked in as a machine-readable graph.",
  "",
  "Assisted-by: Claude Code:claude-opus-5",
].join("\n");

test("commit message accepts a conventional message", () => {
  assert.deepEqual(checkCommitMessage(valid), []);
});

test("commit message accepts a plain merge subject", () => {
  assert.deepEqual(checkCommitMessage("Merge branch 'm5b-symbols'\n"), []);
});

test("commit message rejects an over-long subject", () => {
  const subject = "x".repeat(subjectColumnLimit);
  const problems = checkCommitMessage(`${subject}\n`);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.line, 1);
  assert.match(problems[0]?.message ?? "", /columns, at or past/u);
});

test("commit message accepts a subject one column under the limit", () => {
  assert.deepEqual(
    checkCommitMessage(`${"x".repeat(subjectColumnLimit - 1)}\n`),
    [],
  );
});

test("commit message rejects an over-long body line", () => {
  const body = "word ".repeat(40).trim();
  const problems = checkCommitMessage(`Subject\n\n${body}\n`);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.line, 3);
  assert.match(problems[0]?.message ?? "", /past the 100-column limit/u);
});

test("commit message allows an over-long unbreakable token", () => {
  const url = `https://example.com/${"a".repeat(bodyColumnLimit)}`;
  assert.deepEqual(checkCommitMessage(`Subject\n\n${url}\n`), []);
});

test("commit message still rejects prose wrapped around a long token", () => {
  const url = `https://example.com/${"a".repeat(bodyColumnLimit)}`;
  const prose = "word ".repeat(30).trim();
  const problems = checkCommitMessage(`Subject\n\n${prose} ${url}\n`);
  assert.equal(problems.length, 1, "one long token does not excuse the line");
  assert.equal(problems[0]?.line, 3);
});

test("commit message excerpt neutralizes terminal control sequences", () => {
  // The line has to be wrappable prose. One unbreakable token would exempt
  // it, leaving no problem and no excerpt, and the assertions below would
  // then hold no matter what renderPrintable did.
  const prose = "word ".repeat(30).trim();
  const text = `Subject\n\n\u001b[31mred\u001b[0m ${prose}\n`;
  const problems = checkCommitMessage(text);
  assert.equal(problems.length, 1, "the line is reported, so it is rendered");
  const report = formatCommitMessageReport(
    problems,
    text,
    ".git/COMMIT_EDITMSG",
  );
  assert.ok(report.includes("red"), "the excerpt is in the report");
  assert.ok(!report.includes("\u001b"), "no escape reaches the terminal");
});

test("commit message rejects a flattened one-line message", () => {
  const text =
    "Merge branch 'm5b-error-options'\\n\\nLand M5b node " +
    "error-aggregate-and-options and record the ratchet numbers.\n";
  const problems = checkCommitMessage(text);
  assert.ok(
    problems.some((problem) => /literal \\n or \\t/u.test(problem.message)),
    "the flattened line breaks are reported",
  );
});

test("commit message allows writing about an escape sequence", () => {
  const text = [
    "Reject malformed commit messages",
    "",
    "The hook rejects a subject at 80 columns and a body line past 100,",
    "and a message whose breaks arrived as a literal \\n.",
    "",
    "Assisted-by: Claude Code:claude-opus-5",
  ].join("\n");
  assert.deepEqual(checkCommitMessage(text), []);
});

test("commit message rejects an escaped break on a flattened line", () => {
  const text = [
    "Subject",
    "",
    `First paragraph.\\n\\n${"word ".repeat(25).trim()}`,
  ].join("\n");
  const problems = checkCommitMessage(text);
  assert.ok(
    problems.some((problem) => /where a break belongs/u.test(problem.message)),
    "the escaped break is reported",
  );
});

test("commit message allows prose naming a doubled escape", () => {
  const text = [
    "Explain the paragraph break convention",
    "",
    "A literal \\n\\n denotes a paragraph break.",
  ].join("\n");
  assert.deepEqual(checkCommitMessage(text), []);
});

test("commit message ignores trailing whitespace Git would strip", () => {
  const line = "x".repeat(72) + " ".repeat(40);
  assert.deepEqual(checkCommitMessage(`Subject\n\n${line}\n`), []);
});

test("commit message builds the scissors marker from the prefix", () => {
  const text = [
    "Subject",
    "",
    "Body.",
    "; ------------------------ >8 ------------------------",
    `diff ${"word ".repeat(30).trim()}`,
  ].join("\n");
  assert.deepEqual(checkCommitMessage(text, ";"), []);
});

test("commit message rejects a non-blank second line", () => {
  const problems = checkCommitMessage("Subject\nBody starts too early\n");
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.line, 2);
  assert.match(problems[0]?.message ?? "", /is not blank/u);
});

test("commit message rejects an empty message", () => {
  const problems = checkCommitMessage("\n\n# a comment\n");
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.message, "the message is empty");
  assert.match(problems[0]?.remedy ?? "", /subject line/u);
});

test("commit message ignores comments and the verbose diff", () => {
  const text = [
    "Subject",
    "",
    "Body.",
    "# Please enter the commit message for your changes.",
    "# ------------------------ >8 ------------------------",
    `diff ${"word ".repeat(30).trim()}`,
  ].join("\n");
  assert.deepEqual(checkCommitMessage(text), []);
});

test("commit message strips trailing blank lines", () => {
  assert.deepEqual(stripCommentary("Subject\n\n\n"), ["Subject"]);
});

test("commit message reports an over-long subject only once", () => {
  const subject = "x ".repeat(60).trim();
  const problems = checkCommitMessage(`${subject}\n`);
  assert.equal(problems.length, 1, "the body limit does not repeat it");
  assert.equal(problems[0]?.line, 1);
});

test("commit message report shows the line and how to fix it", () => {
  const text =
    "Merge branch 'x'\\n\\nLand the node and record the ratchet numbers " +
    "so the next unit can find them.\n";
  const report = formatCommitMessageReport(
    checkCommitMessage(text),
    text,
    ".git/MERGE_MSG",
  );
  assert.match(report, /line 1, column \d+/u, "it points at a column");
  assert.match(report, /\^/u, "it draws a caret under the fault");
  assert.match(report, /heredoc/u, "it names the remedy");
  assert.match(report, /\.git\/MERGE_MSG/u, "it names the message file");
  assert.match(
    report,
    /not need to be redone/u,
    "it says the change itself is fine",
  );
});

test("commit message allows a single line mentioning an escape", () => {
  assert.deepEqual(checkCommitMessage("Document the \\n escape\n"), []);
});

test("commit message honors a configured comment character", () => {
  const text = ["Subject", "", "Body.", "; a scaffold line"].join("\n");
  assert.deepEqual(checkCommitMessage(text, ";"), []);
  assert.deepEqual(stripCommentary(text, ";"), ["Subject", "", "Body."]);
});

test("commit message excerpt neutralizes bidirectional controls", () => {
  const prose = "word ".repeat(30).trim();
  const text = `Subject\n\n\u2066reordered\u2069 ${prose}\n`;
  const problems = checkCommitMessage(text);
  assert.equal(problems.length, 1, "the line is reported, so it is rendered");
  const report = formatCommitMessageReport(
    problems,
    text,
    ".git/COMMIT_EDITMSG",
  );
  assert.ok(report.includes("reordered"), "the excerpt is in the report");
  assert.ok(!report.includes("\u2066"), "isolates do not reach the terminal");
  assert.ok(!report.includes("\u2069"), "isolates do not reach the terminal");
});

test("commit message ignores leading blank lines Git would strip", () => {
  assert.deepEqual(checkCommitMessage("\nSubject\n\nBody.\n"), []);
  assert.deepEqual(stripCommentary("\n\nSubject\n"), ["Subject"]);
});

test("commit message treats the auto comment value case-insensitively", () => {
  assert.equal(effectiveCommentChar("auto"), "#");
  assert.equal(effectiveCommentChar("AUTO"), "#");
  assert.equal(effectiveCommentChar("Auto"), "#");
  assert.equal(effectiveCommentChar(""), "#");
  assert.equal(effectiveCommentChar(";"), ";");
  assert.equal(effectiveCommentChar("//"), "//");
  // Whitespace in a prefix is significant, so it survives verbatim.
  assert.equal(effectiveCommentChar(" // "), " // ");
  assert.equal(effectiveCommentChar("  "), "  ");
});
