import type { ErrorIntrinsicName } from "./hir.ts";
import type { SourceRange } from "./source.ts";
import type {
  BinaryOperator,
  FunctionKind,
  HintName,
  HintProvenance,
  LocatedSyntax,
  UnaryOperator,
} from "./syntax.ts";
/** A primitive constant retained without lossy textual serialization. */
export type MirConstant =
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "undefined" };

/** A direct call target independent of HIR and source syntax. */
export type MirCallTarget =
  | { readonly kind: "await" }
  | { readonly kind: "console-log" }
  | { readonly kind: "dynamic" }
  | {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    }
  | { readonly kind: "promise-constructor" }
  | {
      readonly kind: "promise-intrinsic";
      readonly method:
        | "all"
        | "asyncCall"
        | "awaitThen"
        | "race"
        | "reject"
        | "resolve"
        | "then";
    }
  | {
      readonly kind: "timer-intrinsic";
      readonly method: "clearTimeout" | "setTimeout";
    }
  | { readonly functionId: number; readonly kind: "function" };

/** Hint data copied into MIR without retaining a HIR or syntax object. */
export interface MirHint {
  readonly name: HintName;
  readonly provenance: HintProvenance;
  readonly range: SourceRange;
}

/** Compiler-owned policy for removable guarded specialization. */
export type SpecializationMode = "disabled" | "enabled";

/** Explicit compiler orchestration options, independent of process globals. */
export interface CompilerOptions {
  readonly observeSpecialization?: boolean;
  readonly specialization?: SpecializationMode;
}

/** One MIR-owned function parameter and its specialization hints. */
export interface MirParameter {
  readonly bindingId: number;
  readonly hints: readonly MirHint[];
  readonly name: string;
  readonly range: SourceRange;
  /** Collect every remaining call argument into a fresh array. */
  readonly rest?: true;
}

/** One script-owned lexical binding shared by declared functions. */
export interface MirGlobalBinding {
  readonly id: number;
  readonly name: string;
}

/** One control destination and the cleanup nesting active at that point. */
export interface MirControlTarget {
  readonly blockId: number;
  readonly cleanupDepth: number;
}

/** One inspectable backend-neutral MIR operation. */
export interface MirOperation {
  readonly argumentListId?: number;
  readonly arguments: readonly number[];
  readonly arrayLength?: number;
  readonly bindingId?: number;
  readonly cacheId?: number;
  readonly constant?: MirConstant;
  readonly detail: string;
  readonly id: number;
  readonly kind:
    | "add-smi-checked"
    | "argument-list-append"
    | "argument-list-create"
    | "array-append"
    | "array-append-hole"
    | "array-create"
    | "binary"
    | "binding-reset"
    | "box-smi"
    | "branch"
    | "call"
    | "check-status"
    | "constant"
    | "caught"
    | "completion-set"
    | "construct"
    | "construct-receiver"
    | "error-intrinsic"
    | "symbol-intrinsic"
    | "count-guard-hit"
    | "count-guard-miss"
    | "count-overflow-miss"
    | "function-create"
    | "guard-object"
    | "guard-shape"
    | "guard-smi"
    | "initialize"
    | "iterator-close"
    | "iterator-get"
    | "iterator-next"
    | "join"
    | "load-fixed-slot"
    | "module-namespace-create"
    | "object-coercible"
    | "object-create"
    | "object-rest"
    | "property-key"
    | "property-delete"
    | "property-get"
    | "property-set"
    | "read"
    | "receiver"
    | "root-store"
    | "safepoint"
    | "unbox-smi"
    | "unary"
    | "update-property-cache"
    | "write";
  readonly mutable?: boolean;
  readonly namespaceBindingIds?: readonly number[];
  readonly namespaceNames?: readonly string[];
  readonly checkedResult?: number;
  readonly abruptTarget?: MirControlTarget;
  readonly completionKind?: "jump" | "normal" | "return" | "throw";
  readonly completionSlot?: number;
  readonly completionTarget?: MirControlTarget;
  readonly errorName?: ErrorIntrinsicName;
  readonly functionId?: number;
  readonly functionKind?: FunctionKind;
  readonly functionLength?: number;
  readonly functionName?: string;
  readonly functionNameBinding?: boolean;
  readonly importedBinding?: boolean;
  readonly hint?: MirHint;
  readonly iteratorNextMethodResult?: number;
  readonly iteratorDoneState?: number;
  readonly iteratorValueResult?: number;
  readonly operator?: BinaryOperator | UnaryOperator;
  readonly range: SourceRange;
  readonly target?: MirCallTarget;
}

/** A MIR block terminator. */
export type MirTerminator =
  | {
      readonly kind: "branch";
      readonly test: number;
      readonly whenFalse: number;
      readonly whenTrue: number;
    }
  | {
      readonly kind: "jump";
      readonly target: number;
      readonly values?: readonly number[];
    }
  | {
      readonly kind: "return";
      readonly value: number;
    }
  | {
      readonly completionSlot: number;
      readonly kind: "resume-completion";
      readonly outerAbrupt?: MirControlTarget;
      readonly outerFinalizer?: MirControlTarget;
    }
  | {
      readonly kind: "unreachable";
    };

/** One deterministic control-flow block. */
export interface MirBlock {
  readonly id: number;
  readonly operations: readonly MirOperation[];
  readonly parameters?: readonly number[];
  readonly terminator: MirTerminator;
}

/** Inspectable identity and control-flow anchors for one specialization. */
export interface MirSpecialization {
  readonly genericBlock: number;
  readonly hints: readonly MirHint[];
  readonly joinBlock: number;
  readonly kind: "smi-add";
  readonly range: SourceRange;
}

/** MIR for one declared function or script. */
export interface MirFunction extends LocatedSyntax {
  readonly blocks: readonly MirBlock[];
  /** JavaScript `length`, independent from the call ABI parameter count. */
  readonly functionLength: number;
  readonly id: number;
  readonly kind: "mir-function";
  readonly localBindingIds?: readonly number[];
  readonly name: string;
  /** Number of positional parameters consumed by the generated function. */
  readonly parameterCount: number;
  readonly parameters: readonly MirParameter[];
  readonly rootSlotCount: number;
  readonly selfBindingId?: number;
  readonly specialization?: MirSpecialization;
  readonly strict?: boolean;
}

/** Backend-neutral MIR for one source script. */
export interface MirProgram {
  readonly functions: readonly MirFunction[];
  readonly globalBindings: readonly MirGlobalBinding[];
  readonly kind: "mir-program";
  readonly script: MirFunction;
  readonly sourceId: string;
  readonly specialization: SpecializationMode;
  readonly observeSpecialization: boolean;
}

export interface MutableMirBlock {
  readonly id: number;
  readonly operations: MirOperation[];
  parameters?: number[];
  terminator: MirTerminator | undefined;
}

export interface MirBuilder {
  readonly abruptTargets: MirControlTarget[];
  readonly blocks: MutableMirBlock[];
  readonly loops: {
    readonly breakTarget: MirControlTarget;
    readonly continueTarget: MirControlTarget;
  }[];
  readonly labels: {
    readonly breakTarget: MirControlTarget;
    readonly continueTarget?: MirControlTarget;
    readonly name: string;
  }[];
  /** Labels waiting for the next loop lowering to claim their targets. */
  readonly pendingLabels: string[];
  readonly finalizers: MirControlTarget[];
  current: MutableMirBlock;
  nextValue: number;
  readonly specialization: SpecializationMode;
}
