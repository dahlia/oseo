import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  bodyColumnLimit,
  checkCommitMessage,
  checkCommitTrailers,
  effectiveCommentChar,
  formatCommitMessageReport,
  stripCommentary,
  subjectColumnLimit,
} from "../tools/check-commit-message.ts";

import { checkCommitMessages } from "../tools/check-commit-messages.ts";

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

for (const trailer of [
  "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>",
  "co-authored-by: Claude <noreply@anthropic.com>",
  "CO-AUTHORED-BY: cLaUdE <bot@example.com>",
  "Co-authored-by: Assistant <NOREPLY@ANTHROPIC.COM>",
  "Co-authored-by: Assistant <bot@mail.anthropic.com>",
  "Co-authored-by: Assistant (noreply@anthropic.com)",
  "Co-authored-by: Assistant noreply@anthropic.com, reviewed by Bob",
  "Co-authored-by \t: Claude",
  "Co-authored-by:\n\tClaude Opus 5 <bot@example.com>",
  "Claude-Session: https://claude.ai/code/session_example",
  "cLaUdE-sEsSiOn:",
  "CLAUDE-SESSION: anything",
]) {
  test(`commit message rejects trailer ${JSON.stringify(trailer)}`, () => {
    const text = `Subject\n\n${trailer}\n`;
    const problems = checkCommitMessage(text);
    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.line, 3);
    assert.equal(problems[0]?.column, null);
    const report = formatCommitMessageReport(
      problems,
      text,
      ".git/COMMIT_EDITMSG",
    );
    assert.match(report, /line 3:/u);
    assert.match(report, /Use Assisted-by: AGENT:MODEL instead/u);
    assert.match(report, /kept in .git\/COMMIT_EDITMSG/u);
  });
}

for (const body of [
  "Co-authored-by: Jane Doe <jane@example.com>",
  "CO-AUTHORED-BY: Jane Doe <jane@anthropic.com.example.org>",
  "Co-authored-by: Claudette <claudette@example.com>",
  "Co-authored-by: Human <human@anthropic.community>",
  "Assisted-by: Claude Code:claude-opus-5",
  "Explain Co-authored-by: Claude and Claude-Session: in prose.",
  "Co-authored-by: Claude\n\nThis earlier example is body text.",
  "Claude-Session: example\n\nThis earlier example is body text.",
  "Ordinary paragraph\nCo-authored-by: Claude",
  "    Co-authored-by: Claude",
  "`Claude-Session: example`",
  "---\n\nCo-authored-by: Jane Doe <jane@example.com>",
]) {
  test(`commit message accepts body ${JSON.stringify(body)}`, () => {
    assert.deepEqual(checkCommitMessage(`Subject\n\n${body}\n`), []);
  });
}

test("trailer check follows Git's mixed-block and continuation rules", () => {
  const text =
    "Subject\n\nExplanation\nSigned-off-by: Human\nCo-authored-by: Claude\n";
  assert.equal(checkCommitTrailers(text)[0]?.line, 5);
  assert.equal(
    checkCommitTrailers("Subject\n\nOther: value\n Claude-Session: example\n")
      .length,
    0,
  );
  assert.equal(
    checkCommitTrailers("Subject\n\n---\n\nClaude-Session: example\n").length,
    1,
    "commit messages are not patches, so --- is not a divider",
  );
});

test("trailer reports locate repeated keys in the footer", () => {
  const text = [
    "Subject",
    "",
    "Co-authored-by: Claude",
    "",
    "An example above.",
    "",
    "Co-authored-by: Human <human@example.com>",
    "Co-authored-by: Claude",
    "Claude-Session: example",
    "Co-authored-by: Claude Opus 5",
    "",
  ].join("\n");
  assert.deepEqual(
    checkCommitTrailers(text).map((problem) => problem.line),
    [8, 9, 10],
  );
});

/** Isolate commit identities and hooks from the caller's checkout. */
interface CommitFixture {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly git: (...args: string[]) => string;
}

function fixture(t: test.TestContext): CommitFixture {
  const cwd = mkdtempSync(join(tmpdir(), "oseo-commit-message-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(cwd, "empty-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test Author",
    GIT_AUTHOR_EMAIL: "author@example.com",
    GIT_COMMITTER_NAME: "Test Committer",
    GIT_COMMITTER_EMAIL: "committer@example.com",
    MISE_TRUSTED_CONFIG_PATHS: cwd,
  };
  const git = (...args: string[]): string =>
    execFileSync("git", args, {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  git("init", "--initial-branch=main");
  return { cwd, env, git };
}

test("range check covers introduced commits and all-zero pushes", (t) => {
  const { cwd, git } = fixture(t);
  git("commit", "--allow-empty", "-m", "Published\n\nClaude-Session: old");
  const root = git("rev-parse", "HEAD");
  git("commit", "--allow-empty", "-m", "x".repeat(100));
  assert.deepEqual(checkCommitMessages(`${root}..HEAD`, cwd), {
    count: 1,
    reports: [],
  });
  assert.deepEqual(checkCommitMessages("HEAD..HEAD", cwd), {
    count: 0,
    reports: [],
  });
  git("commit", "--allow-empty", "-m", "New\n\nCo-authored-by: Claude");
  const result = checkCommitMessages(`${root}..HEAD`, cwd);
  assert.equal(result.count, 2);
  assert.equal(result.reports.length, 1);
  assert.match(result.reports[0] ?? "", /line 3:.*Co-authored-by/u);
  assert.match(result.reports[0] ?? "", /Assisted-by: AGENT:MODEL/u);
  const all = checkCommitMessages("HEAD", cwd);
  assert.equal(all.count, 3);
  assert.equal(all.reports.length, 2);
  assert.deepEqual(checkCommitMessages(`${"0".repeat(40)}..HEAD`, cwd), all);
  assert.deepEqual(checkCommitMessages(`${"0".repeat(64)}..HEAD`, cwd), all);
});

test("range check includes merged side branches and merge messages", (t) => {
  const { cwd, git } = fixture(t);
  git("commit", "--allow-empty", "-m", "Root");
  const root = git("rev-parse", "HEAD");
  git("switch", "-c", "side");
  git("commit", "--allow-empty", "-m", "Side\n\nClaude-Session: side");
  git("switch", "main");
  git("commit", "--allow-empty", "-m", "Main");
  git("merge", "--no-ff", "side", "-m", "Merge\n\nClaude-Session: merge");
  const result = checkCommitMessages(`${root}..HEAD`, cwd);
  assert.equal(result.count, 3);
  assert.equal(result.reports.length, 2);
});

test("range CLI fails on invalid revisions and forbidden trailers", (t) => {
  const { cwd, env, git } = fixture(t);
  git("commit", "--allow-empty", "-m", "Root\n\nClaude-Session: root");
  const script = new URL("../tools/check-commit-messages.ts", import.meta.url);
  for (const range of [
    "missing..HEAD",
    "HEAD...HEAD",
    "--all",
    "..HEAD",
    "HEAD..",
    "",
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(script), range], {
      cwd,
      env,
    });
    assert.notEqual(result.status, 0, range);
  }
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(script), `${"0".repeat(40)}..HEAD`],
    {
      cwd,
      env,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Claude-Session/u);
});

test(
  "installed commit-msg hook rejects commit and merge without losing messages",
  {
    skip:
      process.platform === "win32" ? "hook installation is Unix-only" : false,
  },
  (t) => {
    const { cwd, env, git } = fixture(t);
    // Run the real installer with only its required tasks. The fixture's
    // pre-commit gate is a no-op; repository checks run separately.
    const mise = readFileSync(new URL("../mise.toml", import.meta.url), "utf8");
    const task = (name: string): string => {
      const start = mise.indexOf(`[tasks.${name}]`);
      assert.ok(start >= 0);
      const end = mise.indexOf("\n[tasks.", start + 1);
      return mise.slice(start, end < 0 ? undefined : end);
    };
    writeFileSync(
      join(cwd, "mise.toml"),
      [
        '[tasks.check]\nrun = "true"\n',
        task('"check:commit-message"'),
        task("install-hooks"),
      ].join("\n"),
    );
    mkdirSync(join(cwd, "tools"));
    copyFileSync(
      new URL("../tools/check-commit-message.ts", import.meta.url),
      join(cwd, "tools/check-commit-message.ts"),
    );
    git("commit", "--allow-empty", "-m", "Root");
    git("switch", "-c", "side");
    git("commit", "--allow-empty", "-m", "Side");
    git("switch", "main");
    execFileSync("mise", ["run", "install-hooks"], { cwd, env, stdio: "pipe" });
    const original = git("rev-parse", "HEAD");
    const message =
      "Change\n\nCo-authored-by: Claude Opus 5 <noreply@anthropic.com>";
    const rejected = spawnSync(
      "git",
      ["commit", "--allow-empty", "-m", message],
      {
        cwd,
        env,
        encoding: "utf8",
      },
    );
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Use Assisted-by: AGENT:MODEL instead/u);
    assert.equal(git("rev-parse", "HEAD"), original);
    assert.equal(
      readFileSync(join(cwd, ".git/COMMIT_EDITMSG"), "utf8").trim(),
      message,
    );
    const mergeMessage =
      "Merge side\n\nClaude-Session: https://claude.ai/code/session_test";
    const merge = spawnSync(
      "git",
      ["merge", "--no-ff", "side", "-m", mergeMessage],
      {
        cwd,
        env,
        encoding: "utf8",
      },
    );
    assert.notEqual(merge.status, 0);
    assert.match(merge.stderr, /Use Assisted-by: AGENT:MODEL instead/u);
    assert.equal(git("rev-parse", "HEAD"), original);
    assert.equal(
      readFileSync(join(cwd, ".git/MERGE_MSG"), "utf8").trim(),
      mergeMessage,
    );
    writeFileSync(
      join(cwd, ".git/MERGE_MSG"),
      "Merge side\n\nAssisted-by: AGENT:MODEL\n",
    );
    git("-c", "core.editor=true", "commit");
    assert.equal(
      git("rev-list", "--parents", "-1", "HEAD").split(" ").length,
      3,
    );
  },
);

test("range check preserves text below prefixless scissors", (t) => {
  const { cwd, git } = fixture(t);
  const text = [
    "Subject",
    "",
    "Body",
    " ------------------------ >8 ------------------------",
    "",
    "Co-authored-by: Claude",
    "",
  ].join("\n");
  git("commit", "--allow-empty", "--cleanup=verbatim", "-m", text);
  const result = checkCommitMessages("HEAD", cwd);
  assert.equal(result.count, 1);
  assert.equal(result.reports.length, 1);
  assert.match(result.reports[0] ?? "", /line 6:/u);
});

test("trailer check maps configured aliases back to source lines", (t) => {
  const { cwd, git } = fixture(t);
  git("config", "trailer.sob.key", "Signed-off-by");
  git("config", "trailer.ca.key", "Co-authored-by");
  git("config", "trailer.session.key", "Claude-Session");
  const human = "Subject\n\nsob: Human <human@example.com>\n";
  assert.deepEqual(checkCommitTrailers(human, "", cwd), []);
  git("commit", "--allow-empty", "-m", human);
  assert.deepEqual(checkCommitMessages("HEAD", cwd), { count: 1, reports: [] });
  const text = [
    "Subject",
    "",
    "sob: Human <human@example.com>",
    "ca: Claude",
    "session: example",
    "",
  ].join("\n");
  const problems = checkCommitTrailers(text, "", cwd);
  assert.deepEqual(
    problems.map((problem) => problem.line),
    [4, 5],
  );
  const report = formatCommitMessageReport(problems, text, "COMMIT_EDITMSG");
  assert.match(report, /ca: Claude/u);
  assert.match(report, /session: example/u);
});
