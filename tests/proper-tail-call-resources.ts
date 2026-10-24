import { readFileSync } from "node:fs";

import type {
  EmittedNativeSource,
  MirProgram,
  NativeToolchain,
  TargetDescription,
} from "../packages/compiler/src/index.ts";

/*
 * Resource outcome model for the native proper tail call negatives.
 *
 * A non-tail chain may stop at either native resource guard: the 256-level
 * call depth limit or the active native frame budget. Which one it reaches
 * depends on the toolchain, because the host C compiler lane charges each
 * callable slot past the fixed base eight times. Tests replay a chain's
 * calls through `simulateResources` and expect the exact guard it predicts.
 *
 * The model is not an oracle for slot allocation. Its numeric inputs are
 * explicit contracts read where they are defined: the frame ceiling, cost
 * formula, and call depth limit from the C runtime headers; the toolchain's
 * `-D` overrides from its build plan; and each function's slot count as the
 * backend declares it in the emitted dispatcher. Callers derive the call
 * sequence and its tail positions from the source and ECMA-262, never from
 * compiler tail flags or a native observation. Every extraction fails
 * closed rather than guessing.
 */

/** The native resource limits that apply to one toolchain. */
export interface FrameContract {
  readonly callableFrameBaseSlots: number;
  readonly callableFrameMultiplier: number;
  readonly maxActiveFrameSlots: number;
  readonly maxCallDepth: number;
}

/** Native frame charges a backend declared for one emitted program. */
export interface EmittedFrameCharges {
  /** Slot counts keyed by MIR function id, before the toolchain cost. */
  readonly functions: ReadonlyMap<number, number>;
  /** The script entry's charge, which the runtime does not scale. */
  readonly script: number;
}

/** A generated function's [[Call]]: one call level and its frame charge. */
export interface EnterEvent {
  readonly kind: "enter";
  readonly slots: number;
}

/** The innermost generated frame returns, throws, or leaves for a tail call. */
export interface LeaveEvent {
  readonly kind: "leave";
}

/**
 * A built-in, bound function, or Proxy [[Call]] that charges no frame and
 * gives its call level back before the next event, either by returning or by
 * forwarding through the tail call trampoline.
 */
export interface TransientEvent {
  readonly kind: "transient";
}

export type ResourceEvent = EnterEvent | LeaveEvent | TransientEvent;

export type ResourceGuard = "call-depth" | "frame-budget";

/** Where a simulated call sequence ends. */
export type ResourceOutcome =
  | { readonly kind: "completed"; readonly peakLiveFrames: number }
  | {
      readonly kind: ResourceGuard;
      /** Generated frames still live when the failing check runs. */
      readonly liveFrames: number;
    };

/** The `OSEO2001` message each runtime guard reports. */
const resourceMessages = {
  "call-depth": "Maximum call depth exceeded.",
  "frame-budget": "Maximum active native frame budget exceeded.",
} as const satisfies Record<ResourceGuard, string>;

const runtimeHeader = new URL(
  "../packages/runtime-c/native/oseo_runtime.h",
  import.meta.url,
);
const runtimeInternalHeader = new URL(
  "../packages/runtime-c/native/runtime_internal.h",
  import.meta.url,
);

/*
 * The cost macro this model implements, with whitespace and line
 * continuations removed. A different macro must fail the model.
 */
const callableFrameCostMacro =
  "#define OSEO_CALLABLE_FRAME_COST(slots) " +
  "((slots) <= OSEO_CALLABLE_FRAME_BASE_SLOTS ? (slots) : " +
  "(slots) > OSEO_CALLABLE_FRAME_BASE_SLOTS + " +
  "(OSEO_MAX_ACTIVE_FRAME_SLOTS - OSEO_CALLABLE_FRAME_BASE_SLOTS) / " +
  "OSEO_CALLABLE_FRAME_MULTIPLIER ? " +
  "OSEO_MAX_ACTIVE_FRAME_SLOTS + 1u : " +
  "OSEO_CALLABLE_FRAME_BASE_SLOTS + " +
  "((slots) - OSEO_CALLABLE_FRAME_BASE_SLOTS) * " +
  "OSEO_CALLABLE_FRAME_MULTIPLIER)";

/** A multiline pattern written as one string per source line. */
function sourceLines(...parts: readonly string[]): RegExp {
  return new RegExp(parts.join(String.raw`\n`), "gmu");
}

const defaultBasePattern = sourceLines(
  String.raw`^#ifndef OSEO_CALLABLE_FRAME_BASE_SLOTS`,
  String.raw`#define OSEO_CALLABLE_FRAME_BASE_SLOTS (\d+)u`,
  "#endif$",
);
const defaultMultiplierPattern = sourceLines(
  String.raw`^#ifndef OSEO_CALLABLE_FRAME_MULTIPLIER`,
  String.raw`#define OSEO_CALLABLE_FRAME_MULTIPLIER (\d+)u`,
  "#endif$",
);
const dispatcherCasePattern = sourceLines(
  String.raw`^ {4}case (\d+)u:`,
  String.raw` {8}result = oseo_frame_enter\(context, ` +
    String.raw`OSEO_CALLABLE_FRAME_COST\((\d+)u\)\);`,
  String.raw` {8}if \(result\.status == OSEO_STATUS_NORMAL\) \{`,
  String.raw` {12}result = oseo_function_(\d+)\(`,
  "[^\n]*",
  "[^\n]*",
  String.raw` {12}oseo_frame_leave\(context, ` +
    String.raw`OSEO_CALLABLE_FRAME_COST\((\d+)u\)\);$`,
);
const scriptChargePattern = sourceLines(
  String.raw`^ {4}result = oseo_frame_enter\(`,
  String.raw` {8}&context, (\d+)u\);$`,
);
const impossibleBodyGuard = new RegExp(
  String.raw`return oseo_frame_enter\(context, ` +
    String.raw`OSEO_MAX_ACTIVE_FRAME_SLOTS \+ 1u\);`,
  "gu",
);

function single(text: string, pattern: RegExp, what: string): number {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1 || matches[0]![1] == null) {
    throw new Error(`Expected exactly one ${what}; found ${matches.length}.`);
  }
  const value = Number(matches[0]![1]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`The ${what} is not a positive integer.`);
  }
  return value;
}

/**
 * Every `-D` or `-U` argument naming an `OSEO_` macro, with a separated
 * macro operand joined to its option.
 */
function runtimeMacroArguments(
  compilerArguments: readonly string[],
): readonly string[] {
  return compilerArguments.flatMap((argument, index) => {
    const option = argument.slice(0, 2);
    if (option !== "-D" && option !== "-U") return [];
    const name = argument.slice(2) || compilerArguments[index + 1] || "";
    return name.startsWith("OSEO_") ? [`${option}${name}`] : [];
  });
}

/**
 * The runtime's frame contract after the given compiler arguments. Only
 * `-DOSEO_CALLABLE_FRAME_MULTIPLIER=Nu` and
 * `-DOSEO_CALLABLE_FRAME_BASE_SLOTS=Nu` may change it; any other argument
 * naming an `OSEO_` macro is rejected because the model cannot evaluate it.
 */
export function runtimeFrameContract(
  compilerArguments: readonly string[] = [],
): FrameContract {
  const header = readFileSync(runtimeHeader, "utf8");
  const macro = header.match(
    /^#define OSEO_CALLABLE_FRAME_COST\(slots\)(?:[^\n]*\\\n)*[^\n]*$/mu,
  );
  if (
    macro == null ||
    macro[0].replace(/\\\n/gu, " ").replace(/\s+/gu, " ") !==
      callableFrameCostMacro
  ) {
    throw new Error("OSEO_CALLABLE_FRAME_COST changed; update the model.");
  }
  const defaults = {
    base: single(header, defaultBasePattern, "default frame base"),
    multiplier: single(
      header,
      defaultMultiplierPattern,
      "default frame multiplier",
    ),
  };
  const overrides = new Map<string, number>();
  for (const argument of runtimeMacroArguments(compilerArguments)) {
    const parsed = argument.match(
      /^-D(OSEO_CALLABLE_FRAME_(?:MULTIPLIER|BASE_SLOTS))=(\d+)u$/u,
    );
    const value = parsed == null ? Number.NaN : Number(parsed[2]);
    if (
      parsed == null ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      (overrides.has(parsed[1]!) && overrides.get(parsed[1]!) !== value)
    ) {
      throw new Error(`Unsupported runtime macro argument: ${argument}`);
    }
    overrides.set(parsed[1]!, value);
  }
  return {
    callableFrameBaseSlots:
      overrides.get("OSEO_CALLABLE_FRAME_BASE_SLOTS") ?? defaults.base,
    callableFrameMultiplier:
      overrides.get("OSEO_CALLABLE_FRAME_MULTIPLIER") ?? defaults.multiplier,
    maxActiveFrameSlots: single(
      header,
      /^#define OSEO_MAX_ACTIVE_FRAME_SLOTS (\d+)u$/gmu,
      "active frame ceiling",
    ),
    maxCallDepth: single(
      readFileSync(runtimeInternalHeader, "utf8"),
      /^#define OSEO_MAX_CALL_DEPTH \(\(size_t\)(\d+)u\)$/gmu,
      "call depth limit",
    ),
  };
}

/**
 * The frame contract a toolchain compiles for `target`, read from the
 * arguments of a build plan it constructs but nobody executes. Every step
 * that compiles C (`-c`) must pass the same runtime macros, and a step that
 * passes any, such as a combined compile and link, must pass those too.
 */
export function toolchainFrameContract(
  toolchain: NativeToolchain,
  target: TargetDescription,
): FrameContract {
  const directory = "/oseo-frame-contract";
  const plan = toolchain.createBuildPlan({
    generatedSourcePath: `${directory}/generated.c`,
    runtimeDirectory: directory,
    runtimeSourcePaths: [`${directory}/runtime.c`],
    target,
    workingDirectory: directory,
  });
  const macros = plan.requests
    .filter(
      (request) =>
        request.args.includes("-c") ||
        runtimeMacroArguments(request.args).length > 0,
    )
    .map((request) => runtimeMacroArguments(request.args));
  const distinct = new Set(macros.map((list) => JSON.stringify(list)));
  if (plan.requests.length === 0 || distinct.size > 1) {
    throw new Error("Build steps disagree on the native frame contract.");
  }
  return runtimeFrameContract(macros[0] ?? []);
}

/** `OSEO_CALLABLE_FRAME_COST(slots)` under `contract`. */
export function callableFrameCost(
  contract: FrameContract,
  slots: number,
): number {
  const base = contract.callableFrameBaseSlots;
  if (slots <= base) return slots;
  const limit =
    base +
    Math.floor(
      (contract.maxActiveFrameSlots - base) / contract.callableFrameMultiplier,
    );
  if (slots > limit) return contract.maxActiveFrameSlots + 1;
  return base + (slots - base) * contract.callableFrameMultiplier;
}

/**
 * Read every frame charge from one emitted program's dispatcher and script
 * entry. Each generated function must have exactly one charge, and no other
 * frame entry may exist, so an emission change cannot go unnoticed.
 */
export function emittedFrameCharges(
  emitted: EmittedNativeSource,
): EmittedFrameCharges {
  if (emitted.compilationUnits != null) {
    throw new Error("The model reads only a standalone generated source.");
  }
  const source = emitted.source;
  const functions = new Map<number, number>();
  const cases = source.matchAll(dispatcherCasePattern);
  for (const [, codeId, slots, functionId, leftSlots] of cases) {
    if (
      codeId !== functionId ||
      slots !== leftSlots ||
      functions.has(Number(functionId))
    ) {
      throw new Error(`Ambiguous frame charge for function ${functionId}.`);
    }
    functions.set(Number(functionId), Number(slots));
  }
  const definitions = [
    ...source.matchAll(/^static OseoResult oseo_function_(\d+)\($/gmu),
  ].map((match) => Number(match[1]));
  if (
    definitions.length !== functions.size ||
    definitions.some((id) => !functions.has(id))
  ) {
    throw new Error("Some generated functions have no frame charge.");
  }
  const script = single(source, scriptChargePattern, "script charge");
  // Dispatcher cases, the script entry, and the impossible-body guard that
  // each function and the script carry.
  const entries = source.match(/oseo_frame_enter\(/gu)?.length ?? 0;
  const guards = source.match(impossibleBodyGuard)?.length ?? 0;
  if (
    guards !== functions.size + 1 ||
    entries !== functions.size + 1 + guards
  ) {
    throw new Error("The emitted program has an unmodeled frame entry.");
  }
  return { functions, script };
}

/**
 * Replay one call sequence against the runtime's checks in their order:
 * `oseo_call_enter` refuses a level at the call depth limit, and then the
 * dispatcher's `oseo_frame_enter` refuses a charge above the remaining
 * budget. The script entry's charge is live throughout.
 */
export function simulateResources(
  contract: FrameContract,
  scriptCharge: number,
  events: readonly ResourceEvent[],
): ResourceOutcome {
  const frames: number[] = [];
  let active = scriptCharge;
  let peakLiveFrames = 0;
  for (const event of events) {
    if (event.kind === "leave") {
      const cost = frames.pop();
      if (cost == null) throw new Error("A leave event has no frame.");
      active -= cost;
      continue;
    }
    if (frames.length >= contract.maxCallDepth) {
      return { kind: "call-depth", liveFrames: frames.length };
    }
    if (event.kind === "transient") continue;
    const cost = callableFrameCost(contract, event.slots);
    if (cost > contract.maxActiveFrameSlots - active) {
      return { kind: "frame-budget", liveFrames: frames.length };
    }
    active += cost;
    frames.push(cost);
    peakLiveFrames = Math.max(peakLiveFrames, frames.length);
  }
  return { kind: "completed", peakLiveFrames };
}

/**
 * A strict function that calls itself outside tail position `calls` times
 * in all, making `iterations` frameless built-in calls before each nested
 * call, as a for-of head calls `@@iterator` and `next`.
 */
export function recursionEvents(
  slots: number,
  calls: number,
  iterations: number,
): readonly ResourceEvent[] {
  return Array.from({ length: calls }, (): readonly ResourceEvent[] => [
    { kind: "enter", slots },
    ...Array.from({ length: iterations }, () => ({
      kind: "transient" as const,
    })),
  ]).flat();
}

function escapePattern(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

/**
 * The complete standard error of a native run that one guard stopped: one
 * diagnostic line for `sourceId`, at any position, and nothing else.
 */
export function resourceDiagnostic(
  sourceId: string,
  guard: ResourceGuard,
): RegExp {
  return new RegExp(
    `^${escapePattern(sourceId)}:\\d+:\\d+: error\\[OSEO2001\\]: ` +
      `${escapePattern(resourceMessages[guard])}\\n$`,
    "u",
  );
}

/** Slot counts of the generated functions a non-tail chain enters. */
export interface ChainCharges {
  readonly base: ReadonlyMap<number, number>;
  readonly handler: ReadonlyMap<number, number>;
  readonly hop: ReadonlyMap<number, number>;
  readonly nonTail: ReadonlyMap<number, number>;
  readonly script: number;
  readonly tag: ReadonlyMap<number, number>;
}

/**
 * The shape of a generated chain from
 * *tests/property/m5-proper-tail-calls.property.test.ts* that the resource
 * model reads. Its printer fixes the source layout `chainCharges` relies on.
 */
export interface NonTailChain {
  readonly context:
    | "catch-finally"
    | "for-of"
    | "operand"
    | "sloppy"
    | "stored"
    | "try";
  readonly depth: number;
  readonly hops: readonly {
    readonly definition: string;
    readonly form: string;
  }[];
  readonly throwAtBottom: boolean;
}

/**
 * Assign each emitted frame charge to its role in the printed chain by the
 * source text where the function starts: a hop, the immediately invoked
 * arrow carrying its non-tail context, a concise hop's base case arrow, or
 * the trap handler or tag function that forwards to a hop.
 */
export function chainCharges(
  source: string,
  mir: MirProgram,
  emitted: EmittedNativeSource,
): ChainCharges {
  const charges = emittedFrameCharges(emitted);
  const lines = source.split("\n");
  const roles = {
    base: new Map<number, number>(),
    handler: new Map<number, number>(),
    hop: new Map<number, number>(),
    nonTail: new Map<number, number>(),
    tag: new Map<number, number>(),
  };
  for (const functionValue of mir.functions) {
    const { column, line } = functionValue.range.start;
    const text = lines[line - 1] ?? "";
    const start = text.slice(column - 1);
    const owner =
      /^(?:function hop|const hop|const holder|class Hop)(\d)/u.exec(text)?.[1];
    const trap = /^const trap(\d) = /u.exec(lines[line - 2] ?? "")?.[1];
    const tag = /^const tag(\d) = /u.exec(text)?.[1];
    const [role, index] =
      owner != null &&
      /^(?:function hop\d\(|\(n\) => |(?:static )?hop\()/u.test(start)
        ? (["hop", owner] as const)
        : owner != null && /^\(\) => \{ (?:try|for) /u.test(start)
          ? (["nonTail", owner] as const)
          : owner != null && /^\(\) => \{ (?:return|throw) /u.test(start)
            ? (["base", owner] as const)
            : trap != null && start.startsWith("apply(target, ")
              ? (["handler", trap] as const)
              : tag != null && start.startsWith("(strings, ...values) => ")
                ? (["tag", tag] as const)
                : [undefined, undefined];
    if (role == null) continue;
    const slots = charges.functions.get(functionValue.id);
    if (slots == null || roles[role].has(Number(index))) {
      throw new Error(`Ambiguous ${role} ${index} frame charge.`);
    }
    roles[role].set(Number(index), slots);
  }
  return { ...roles, script: charges.script };
}

/** Call forms that reach a hop through one frameless forwarding [[Call]]. */
const forwardingForms: ReadonlySet<string> = new Set([
  "apply",
  "bound",
  "call",
  "proxy",
  "reflect",
]);

/**
 * Replay a non-tail chain's calls in order and predict where it stops. Tail
 * positions follow ECMA-262 15.10: a call in a try block, a catch with a
 * finally, a for-of body, an operand, or a stored value is not one, and a
 * call in non-strict code never is. A class body is strict even in a
 * non-strict script. A tail call leaves its frame before the callee enters.
 * Function.prototype.call and apply, Reflect.apply, bound functions, and
 * Proxy [[Call]] take one transient call level and no frame. A for-of head
 * calls `@@iterator` and one `next` before its body; a spread argument calls
 * `@@iterator` and `next` twice; `new RangeError` takes one level. After the
 * bottom the chain only unwinds, which no guard checks.
 */
export function nonTailResources(
  testCase: NonTailChain,
  charges: ChainCharges,
  contract: FrameContract,
): ResourceOutcome {
  const slots = (
    role: Exclude<keyof ChainCharges, "script">,
    index: number,
  ) => {
    const value = charges[role].get(index);
    if (value == null) throw new Error(`Missing ${role} ${index} charge.`);
    return value;
  };
  const { hops } = testCase;
  const strictScript = testCase.context !== "sloppy";
  const nonTailFunction =
    testCase.context === "try" ||
    testCase.context === "catch-finally" ||
    testCase.context === "for-of";
  const events: ResourceEvent[] = [];
  const transient = (count: number) => {
    for (let index = 0; index < count; index += 1) {
      events.push({ kind: "transient" });
    }
  };
  events.push({ kind: "enter", slots: slots("hop", 0) });
  for (let n = testCase.depth, index = 0; ; n -= 1) {
    const hop = hops[index]!;
    const strict = strictScript || hop.definition === "static";
    if (n === 0) {
      if (hop.definition === "concise") {
        if (strict) events.push({ kind: "leave" });
        events.push({ kind: "enter", slots: slots("base", index) });
      }
      if (testCase.throwAtBottom) transient(1);
      break;
    }
    if (strictScript && nonTailFunction) {
      // Every generated wrapper keeps the hop's call of that arrow in tail
      // position, so the hop leaves before the arrow enters.
      events.push({ kind: "leave" });
      events.push({ kind: "enter", slots: slots("nonTail", index) });
      if (testCase.context === "for-of") transient(2);
    } else if (!strictScript && strict) {
      // Every generated wrapper keeps a static method's call in tail
      // position.
      events.push({ kind: "leave" });
    }
    const next = (index + 1) % hops.length;
    if (hop.form === "trap" || hop.form === "tagged") {
      if (hop.form === "trap") transient(1);
      events.push({
        kind: "enter",
        slots: slots(hop.form === "trap" ? "handler" : "tag", next),
      });
      transient(3);
      if (strictScript) events.push({ kind: "leave" });
    } else if (forwardingForms.has(hop.form)) {
      transient(1);
    } else if (hop.form !== "plain" && hop.form !== "optional") {
      throw new Error(`Unmodeled call form ${hop.form}.`);
    }
    events.push({ kind: "enter", slots: slots("hop", next) });
    index = next;
  }
  return simulateResources(contract, charges.script, events);
}
