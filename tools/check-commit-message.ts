import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * The column at which a subject line stops being a summary.
 *
 * The commit convention asks for 50, and this is deliberately not that. This
 * check rejects a message that went wrong mechanically; it does not argue with
 * an author who needed four more words. A subject this long is almost always a
 * body that lost its line breaks.
 */
export const subjectColumnLimit = 80;

/**
 * The column at which a body line stops being wrapped prose.
 *
 * The convention asks for 72, so this leaves the same deliberate margin as
 * {@link subjectColumnLimit}.
 */
export const bodyColumnLimit = 100;

/** How much of an offending line the report prints before eliding it. */
const excerptColumnLimit = 110;

/**
 * One rejected property of a commit message.
 *
 * Both prose fields are written for whoever has to fix the message, which is
 * often an unattended agent with no other diagnosis available: `message` says
 * what is wrong and `remedy` says what to do instead.
 */
export interface CommitMessageProblem {
  /** One-based line number in the message with commentary removed. */
  readonly line: number;
  /** One-based column the report points at, or null for a whole-line fault. */
  readonly column: number | null;
  readonly message: string;
  readonly remedy: string;
}

/** The scissors line `git commit --verbose` writes above the staged diff. */
function scissorsLine(commentChar: string): string {
  return `${commentChar} ------------------------ >8 ------------------------`;
}

/**
 * Drop the commentary Git adds to a message it is about to have edited, and
 * trim each surviving line the way Git's default cleanup does.
 *
 * `commentChar` must be the repository's effective comment prefix, since that
 * decides which lines are Git's editor scaffold and which are content. It also
 * builds the scissors marker, so a repository with a custom prefix does not
 * end up checking the verbose diff below it. Conflict notes that `git merge`
 * adds are ordinary comments, which is why a conflicted merge is not a special
 * case.
 *
 * The trimming mirrors the default `strip` cleanup: trailing whitespace goes,
 * and leading and trailing blank lines go, because Git drops all of those
 * before storing and measuring them would reject a message Git would have
 * stored intact.
 *
 * Other cleanup modes are not modeled. `verbatim` keeps comments, trailing
 * whitespace, and blank lines; `whitespace` and `scissors` keep comments that
 * this removes. Against a commit using one of those, this check is more
 * permissive than the stored message deserves rather than stricter, which is
 * the direction a hook should fail in.
 */
export function stripCommentary(
  text: string,
  commentChar: string = "#",
): readonly string[] {
  const scissors = scissorsLine(commentChar);
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (line === scissors) break;
    if (commentChar !== "" && line.startsWith(commentChar)) continue;
    lines.push(line.replace(/\s+$/u, ""));
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }
  return lines;
}

/**
 * Count a line in Unicode code points.
 *
 * The reports call this a column because the repository's line checks do, but
 * it is a code-point count: a wide character still counts once and a combining
 * mark counts separately. The limits here are loose enough that the difference
 * never decides a well-formed message.
 */
function columns(line: string): number {
  return [...line].length;
}

/**
 * Whether an over-long line is long only because of one unbreakable token.
 *
 * CONTRIBUTING.md exempts a URL from the line limit wherever it appears, and a
 * long path behaves the same way, so a line carrying one has no valid form.
 * Removing the token has to bring the rest within the limit, which is the same
 * test *tools/check-lines.ts* applies to manifest lines: one long URL must not
 * excuse a whole flattened paragraph around it.
 */
function isUnwrappable(line: string, limit: number): boolean {
  const longest = line
    .split(/\s+/u)
    .reduce(
      (worst, token) => (columns(token) > columns(worst) ? token : worst),
      "",
    );
  if (columns(longest) <= limit) return false;
  return columns(line) - columns(longest) <= limit;
}

/**
 * Whether a line's escape sequences stand where line breaks should have been.
 *
 * Flagging every literal `\n` would reject a message that merely writes about
 * one, which a change to this very check has to do, and a sentence can name a
 * doubled sequence just as legitimately. So the test needs both halves of the
 * mistake's shape: an escaped paragraph break, on a line already too long to
 * be prose someone wrapped. Every message this repository has lost breaks in
 * has both, because the whole body ended up on the one line.
 */
function looksLikeFlattenedBreaks(line: string, limit: number): boolean {
  return /\\[nt]\s*\\[nt]/u.test(line) && columns(line) > limit;
}

/**
 * Report every way a commit message is malformed rather than merely unusual.
 *
 * The thresholds are deliberately looser than the convention. Style belongs to
 * review; this catches the mechanical failures that make a message unreadable
 * later, above all a message whose line breaks were written as literal escape
 * sequences by a shell quoting mistake. That has happened on this repository,
 * and the resulting merge commit stores its whole body on one line.
 */
export function checkCommitMessage(
  text: string,
  commentChar: string = "#",
): readonly CommitMessageProblem[] {
  const lines = stripCommentary(text, commentChar);
  const problems: CommitMessageProblem[] = [];

  if (lines.every((line) => line.trim() === "")) {
    return [
      {
        line: 1,
        column: null,
        message: "the message is empty",
        remedy:
          "Write a subject line of 50 columns or fewer saying what the " +
          "change does, then a blank line, then the body.",
      },
    ];
  }

  const subject = lines[0] ?? "";
  if (columns(subject) >= subjectColumnLimit) {
    problems.push({
      line: 1,
      column: subjectColumnLimit,
      message:
        `the subject is ${columns(subject)} columns, at or past the ` +
        `${subjectColumnLimit}-column limit`,
      remedy:
        "Summarize the change in 50 columns or fewer and move the detail " +
        "into the body. A subject this long is usually a body whose line " +
        "breaks were lost, so check that the message has real line breaks.",
    });
  }

  if (lines.length > 1 && lines[1]?.trim() !== "") {
    problems.push({
      line: 2,
      column: null,
      message: "the line after the subject is not blank",
      remedy:
        "Leave line 2 empty. Git treats the first paragraph as the subject, " +
        "so without the blank line the whole opening paragraph becomes one.",
    });
  }

  for (const [index, line] of lines.entries()) {
    const width = columns(line);
    // The subject has its own, tighter limit, so reporting it twice would
    // only bury the remedy that actually applies to it.
    const overWrapped =
      index > 0 &&
      width > bodyColumnLimit &&
      !isUnwrappable(line, bodyColumnLimit);
    if (overWrapped) {
      problems.push({
        line: index + 1,
        column: bodyColumnLimit + 1,
        message:
          `this line is ${width} columns, past the ${bodyColumnLimit}-` +
          "column limit",
        remedy:
          "Wrap the body at 72 columns. A whole paragraph on one line is " +
          "the usual cause; break it at word boundaries.",
      });
    }
    // The subject has the tighter limit, so use it for line 1.
    const escapeLimit = index === 0 ? subjectColumnLimit : bodyColumnLimit;
    if (looksLikeFlattenedBreaks(line, escapeLimit)) {
      problems.push({
        line: index + 1,
        column: line.search(/\\[nt]/u) + 1 || null,
        message:
          "this line contains a literal \\n or \\t where a break belongs",
        remedy:
          "The message was quoted so its escape sequences never became " +
          "whitespace. Pass it through a heredoc instead of an escape:\n" +
          "    git commit -m \"$(cat <<'EOF'\n" +
          "    Subject line\n" +
          "\n" +
          "    Body wrapped at 72 columns.\n" +
          "    EOF\n" +
          '    )"',
      });
    }
  }

  return problems;
}

/**
 * Replace anything that would act on the terminal rather than print.
 *
 * The excerpt is attacker-influenced text: whoever wrote the message chose it,
 * and it goes straight to a terminal. An escape sequence in it could rewrite
 * the diagnostic around it. Each replacement is one code point wide so the
 * caret still lands under the column the report names.
 */
function renderPrintable(line: string): string {
  return [...line]
    .map((point) => {
      const code = point.codePointAt(0) ?? 0;
      const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
      const isBidi = /\p{Bidi_Control}/u.test(point);
      return isControl || isBidi ? "�" : point;
    })
    .join("");
}

/** Render one offending line with a caret under the column at fault. */
function renderExcerpt(line: string, column: number | null): string {
  const points = [...renderPrintable(line)];
  const shown =
    points.length > excerptColumnLimit
      ? `${points.slice(0, excerptColumnLimit).join("")}…`
      : points.join("");
  const excerpt = `    ${shown}`;
  if (column == null || column > excerptColumnLimit) return excerpt;
  return `${excerpt}\n    ${" ".repeat(column - 1)}^`;
}

/**
 * Build the whole rejection report.
 *
 * Kept separate from the entry point so the wording is testable, and written
 * so that reading it is enough to fix the message without opening this file.
 */
export function formatCommitMessageReport(
  problems: readonly CommitMessageProblem[],
  text: string,
  messagePath: string,
  commentChar: string = "#",
): string {
  const lines = stripCommentary(text, commentChar);
  const count =
    problems.length === 1 ? "1 problem" : `${problems.length} problems`;
  const sections = problems.map((problem) => {
    const source = lines[problem.line - 1] ?? "";
    const place =
      problem.column == null
        ? `line ${problem.line}`
        : `line ${problem.line}, column ${problem.column}`;
    return [
      `${place}: ${problem.message}`,
      renderExcerpt(source, problem.column),
      problem.remedy.replace(/^/gmu, "  "),
    ].join("\n");
  });
  return [
    `The commit message was rejected: ${count}.`,
    "",
    sections.join("\n\n"),
    "",
    "Only the message is wrong. The change itself was not rejected and does",
    "not need to be redone or abandoned.",
    "",
    `What you wrote is kept in ${messagePath}.`,
    "Edit that file and commit again with --file, or let a merge in progress",
    "pick it up from a plain `git commit`.",
    "",
    `The limits are a subject under ${subjectColumnLimit} columns and body`,
    `lines of at most ${bodyColumnLimit}. The convention asks for 50 and 72,`,
    "so a message that follows it never reaches either limit.",
  ].join("\n");
}

/**
 * Turn the last configured comment value into the prefix to strip with.
 *
 * `auto` means Git picks a character the message does not already begin with,
 * which cannot be recovered from the finished file, so it falls back to the
 * default. Git compares that keyword without regard to case, so `AUTO` must
 * fall back too rather than being taken as a literal four-character prefix.
 *
 * Every other value is returned exactly as configured. A prefix may carry
 * significant whitespace, as `" // "` does, and trimming it would strip lines
 * the prefix does not actually mark.
 */
export function effectiveCommentChar(configured: string): string {
  if (configured === "" || configured.toLowerCase() === "auto") return "#";
  return configured;
}

/**
 * Read the repository's effective comment prefix from Git's configuration.
 *
 * Any failure to run Git falls back to the default rather than rejecting:
 * refusing a commit because a configuration read failed would be worse than
 * checking a scaffold line.
 */
function configuredCommentChar(): string {
  // core.commentString and core.commentChar are aliases, and Git takes
  // whichever it reads last rather than preferring either name. Listing the
  // whole configuration preserves that order; asking for each name in turn
  // would impose a precedence Git does not have.
  let last = "";
  try {
    const listing = execFileSync("git", ["config", "--list"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of listing.split("\n")) {
      const match = /^core\.comment(?:char|string)=(.*)$/u.exec(line);
      if (match?.[1] != null) last = match[1];
    }
  } catch {
    return "#";
  }
  return effectiveCommentChar(last);
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const messagePath = process.argv[2];
  if (messagePath == null) {
    process.stderr.write(
      "check-commit-message needs the path Git passes to the commit-msg " +
        "hook.\n",
    );
    process.exit(2);
  }
  const commentChar = configuredCommentChar();
  const text = readFileSync(messagePath, "utf8");
  const problems = checkCommitMessage(text, commentChar);
  if (problems.length > 0) {
    const report = formatCommitMessageReport(
      problems,
      text,
      messagePath,
      commentChar,
    );
    process.stderr.write(`${report}\n`);
    process.exit(1);
  }
  const kept = stripCommentary(text, commentChar).length;
  console.log(`commit-message passed lines=${kept}`);
}
