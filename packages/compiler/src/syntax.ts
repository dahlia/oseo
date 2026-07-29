import type {
  ByteRange,
  Diagnostic,
  SourceInput,
  SourceRange,
} from "./source.ts";
/** Provenance retained for an optimization hint. */
export type HintProvenance = "jsdoc" | "typescript";

/** Primitive hint names accepted during M1. */
export type HintName =
  | "any"
  | "boolean"
  | "null"
  | "number"
  | "string"
  | "undefined"
  | "unknown";

/** An owned hint that cannot expose a bootstrap-parser node. */
export interface Hint {
  readonly name: HintName;
  readonly provenance: HintProvenance;
  readonly range: SourceRange;
}

export interface LocatedSyntax {
  readonly range: SourceRange;
  readonly byteRange?: ByteRange;
}

/** A call target admitted by the M1 language profile. */
export type SyntaxCallTarget =
  | (LocatedSyntax & {
      readonly kind: "console-log";
    })
  | (LocatedSyntax & {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    })
  | (LocatedSyntax & {
      readonly kind: "promise-intrinsic";
      readonly method: "all" | "race" | "reject" | "resolve";
    })
  | (LocatedSyntax & {
      readonly kind: "promise-intrinsic-direct";
      readonly method: "asyncCall" | "awaitThen" | "resolve" | "then";
    })
  | (LocatedSyntax & {
      readonly kind: "timer-intrinsic";
      readonly method: "clearTimeout" | "setTimeout";
    })
  | (LocatedSyntax & {
      readonly kind: "name";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly callee: SyntaxExpression;
      readonly kind: "dynamic";
    })
  | (LocatedSyntax & {
      /**
       * A `super()` call, admitted only directly inside a derived class
       * constructor. The parent constructor is the constructor's own
       * [[Prototype]], so the target carries no callee expression.
       */
      readonly kind: "super";
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property";
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      /**
       * A private member call, `this.#m()`. The callee is the private
       * element the object carries, and the object stays the receiver,
       * so the two are evaluated once each.
       */
      readonly kind: "private-method";
      readonly name: string;
      readonly object: SyntaxExpression;
    });

/** Binary operations selected before native backend lowering. */
export type BinaryOperator =
  | "!="
  | "!=="
  | "%"
  | "&"
  | "*"
  | "**"
  | "+"
  | "-"
  | "/"
  | "<"
  | "<<"
  | "<="
  | "=="
  | "==="
  | ">"
  | ">="
  | ">>"
  | ">>>"
  | "^"
  | "in"
  | "instanceof"
  | "|";

/** Unary operations selected before native backend lowering. */
/**
 * `to-string` is a frontend-synthesized conversion with ToString's
 * string preference; it has no source spelling and normalized template
 * substitutions are its only producer.
 */
export type UnaryOperator =
  | "!"
  | "+"
  | "-"
  | "to-string"
  | "typeof"
  | "void"
  | "~";

/** Short-circuit operators lowered through explicit control flow. */
export type LogicalOperator = "&&" | "??" | "||";

/** Operators admitted by compound assignment expressions. */
export type AssignmentOperator =
  | "%"
  | "&"
  | "&&"
  | "*"
  | "**"
  | "+"
  | "-"
  | "/"
  | "<<"
  | ">>"
  | ">>>"
  | "??"
  | "^"
  | "|"
  | "||";

/** Prefix and postfix operators that update one assignment target. */
export type UpdateOperator = "++" | "--";

/** One spread entry retained inside an owned array literal. */
export interface SyntaxArraySpreadElement extends LocatedSyntax {
  readonly argument: SyntaxExpression;
  readonly kind: "spread";
}

/** One ordinary, spread, or elided owned array literal entry. */
export type SyntaxArrayElement =
  | SyntaxArraySpreadElement
  | SyntaxExpression
  | undefined;

/** One spread entry retained inside an owned call argument list. */
export interface SyntaxSpreadArgument extends LocatedSyntax {
  readonly argument: SyntaxExpression;
  readonly kind: "spread";
}

/** One ordinary or spread owned call argument. */
export type SyntaxCallArgument = SyntaxExpression | SyntaxSpreadArgument;

/** One property or call step in an optional chain. */
export type SyntaxOptionalChainLink =
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "member";
      /** Whether this step performs the chain's nullish guard. */
      readonly optional: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxCallArgument[];
      /**
       * True when parentheses ended the optional chain before this ordinary
       * call. The call retains the member receiver, but a short-circuited
       * chain calls `undefined` instead of skipping it.
       */
      readonly chainBoundary?: true;
      readonly kind: "call";
      /** Whether this step performs the chain's nullish guard. */
      readonly optional: boolean;
    });

/** One data, shorthand, method, or accessor owned object literal entry. */
export interface SyntaxObjectDefinition {
  /** A get or set accessor; absent for a data, shorthand, or method
   * property. */
  readonly accessorKind?: "get" | "set";
  readonly key: SyntaxExpression;
  readonly kind: "definition";
  readonly value: SyntaxExpression;
}

/** One spread entry retained inside an owned object literal. */
export interface SyntaxObjectSpreadProperty extends LocatedSyntax {
  readonly argument: SyntaxExpression;
  readonly kind: "spread";
}

/** One defined or spread owned object literal property. */
export type SyntaxObjectProperty =
  | SyntaxObjectDefinition
  | SyntaxObjectSpreadProperty;

/**
 * One private element name in a class body, such as `#count`. A private
 * name is not a property key: a fresh one exists per class evaluation,
 * only the declaring class body reaches it, and it never becomes a
 * string or symbol an own-property observation can report.
 */
export interface SyntaxPrivateName extends LocatedSyntax {
  readonly kind: "private-name";
  /** The declared name, including its leading `#`. */
  readonly name: string;
}

/** One method or accessor definition in an owned class body. */
export interface SyntaxClassMethod extends LocatedSyntax {
  /** A get or set accessor; absent for an ordinary method definition. */
  readonly accessorKind?: "get" | "set";
  readonly key: SyntaxExpression | SyntaxPrivateName;
  readonly kind: "method";
  /**
   * True for a `static` element, which is defined on the constructor
   * itself instead of on its prototype object.
   */
  readonly staticPlacement?: true;
  readonly value: SyntaxFunction;
}

/**
 * One field definition in an owned class body. The key is evaluated
 * once, where the element appears, while the initializer runs once per
 * instance, so the two live in different execution contexts.
 */
export interface SyntaxClassField extends LocatedSyntax {
  /**
   * The initializer expression, absent for a field declared without one,
   * whose value is `undefined`. It is a separate function body: it takes
   * the instance under construction as its receiver and reaches the
   * class scope rather than the constructor's parameters.
   */
  readonly initializer?: SyntaxExpression;
  readonly key: SyntaxExpression | SyntaxPrivateName;
  readonly kind: "field";
  /**
   * True for a `static` field, which the class definition itself defines
   * on the constructor once rather than on each instance. Its
   * initializer takes the constructor as its receiver.
   */
  readonly staticPlacement?: true;
}

/**
 * One `static { ... }` initialization block in an owned class body. A
 * block declares no element and evaluates no key: it is a statement list
 * the class definition runs once, in source order among the other static
 * elements.
 */
export interface SyntaxClassStaticBlock extends LocatedSyntax {
  /**
   * The block's statements as their own parameterless function body. It
   * takes the constructor as its receiver and carries it as the home
   * object, so `this` is the class and `super.x` starts at the parent
   * constructor.
   */
  readonly body: SyntaxFunction;
  readonly kind: "static-block";
}

/** One element admitted by an owned class body. */
export type SyntaxClassElement =
  | SyntaxClassField
  | SyntaxClassMethod
  | SyntaxClassStaticBlock;

/** An expression in the parser-independent M1 syntax tree. */
export type SyntaxExpression =
  | (LocatedSyntax & {
      readonly argument: SyntaxExpression;
      readonly kind: "await";
    })
  | (LocatedSyntax & {
      /** Absent for a bare `yield`, which sends `undefined` out. */
      readonly argument?: SyntaxExpression;
      /**
       * True for `yield*`, which delegates every resumption to the
       * operand's iterator. The grammar requires an operand, so a
       * delegating expression always carries an `argument`.
       */
      readonly delegate?: true;
      readonly kind: "yield";
    })
  | (LocatedSyntax & {
      readonly kind: "binding-set";
      readonly name: string;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "binding-update";
      readonly name: string;
      readonly operator: AssignmentOperator;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "binding-step";
      readonly name: string;
      readonly operator: UpdateOperator;
      readonly prefix: boolean;
    })
  | (LocatedSyntax & {
      readonly kind: "destructuring-set";
      readonly pattern: SyntaxAssignmentPattern;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly elements: readonly SyntaxArrayElement[];
      readonly kind: "array";
    })
  | (LocatedSyntax & {
      readonly kind: "binary";
      readonly left: SyntaxExpression;
      readonly operator: BinaryOperator;
      readonly right: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxCallArgument[];
      readonly kind: "call";
      readonly target: SyntaxCallTarget;
    })
  | (LocatedSyntax & {
      readonly alternate: SyntaxExpression;
      readonly consequent: SyntaxExpression;
      readonly kind: "conditional";
      readonly test: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "logical";
      readonly left: SyntaxExpression;
      readonly operator: LogicalOperator;
      readonly right: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly expressions: readonly SyntaxExpression[];
      readonly kind: "sequence";
    })
  | (LocatedSyntax & {
      readonly functionValue: SyntaxFunction;
      /** Function name inferred independently from a storage binding. */
      readonly inferredName?: string;
      readonly kind: "function";
    })
  | (LocatedSyntax & {
      readonly kind: "identifier";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly kind: "null";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxCallArgument[];
      readonly callee: SyntaxExpression;
      readonly kind: "new";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxCallArgument[];
      readonly kind: "promise-construct";
    })
  | (LocatedSyntax & {
      /**
       * The class constructor, synthesized with an empty body when the
       * class body omits one. Its function value carries the class name
       * and becomes the class itself.
       */
      readonly constructorFunction: SyntaxFunction;
      readonly elements: readonly SyntaxClassElement[];
      /**
       * The `extends` operand. Its presence makes the class derived, so
       * the constructor must reach `this` through `super()`, even when
       * the operand evaluates to `null`.
       */
      readonly heritage?: SyntaxExpression;
      readonly kind: "class";
      /**
       * The ClassName bound in the class's own lexical environment. Only
       * the class body reaches it, and it stays immutable there even when
       * an outer declaration binding of the same name is assignable.
       */
      readonly nameBinding?: string;
    })
  | (LocatedSyntax & {
      readonly kind: "object";
      readonly properties: readonly SyntaxObjectProperty[];
    })
  | (LocatedSyntax & {
      /**
       * The base and left-to-right property or call steps of one optional
       * chain. Keeping the chain intact lets one guarded step skip every
       * following unguarded step without evaluating the base twice.
       */
      readonly base: SyntaxExpression;
      readonly kind: "optional-chain";
      readonly links: readonly SyntaxOptionalChainLink[];
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-delete";
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-get";
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-set";
      readonly object: SyntaxExpression;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-update";
      readonly object: SyntaxExpression;
      readonly operator: AssignmentOperator;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-step";
      readonly object: SyntaxExpression;
      readonly operator: UpdateOperator;
      readonly prefix: boolean;
    })
  | (LocatedSyntax & {
      /**
       * A private member reference, `this.#x`. The name resolves in the
       * class body that declares it rather than against the object, so
       * it carries the declared name instead of a key expression, and
       * the object is checked for the element at run time.
       */
      readonly kind: "private-get";
      readonly name: string;
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "private-set";
      readonly name: string;
      readonly object: SyntaxExpression;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "private-update";
      readonly name: string;
      readonly object: SyntaxExpression;
      readonly operator: AssignmentOperator;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "private-step";
      readonly name: string;
      readonly object: SyntaxExpression;
      readonly operator: UpdateOperator;
      readonly prefix: boolean;
    })
  | (LocatedSyntax & {
      readonly kind: "number";
      readonly value: number;
    })
  | (LocatedSyntax & {
      readonly kind: "string";
      readonly value: string;
    })
  | (LocatedSyntax & {
      readonly kind: "this";
    })
  | (LocatedSyntax & {
      /**
       * The `super` operand of a property reference. It stands only as
       * the `object` of a property get, set, update, or step expression
       * or of a `property` call target: the reference reads or writes
       * through the running function's home object while keeping `this`
       * as its receiver, so an operand that escaped those positions
       * would have no receiver to carry.
       */
      readonly kind: "super-base";
    })
  | (LocatedSyntax & {
      readonly kind: "new-target";
    })
  | (LocatedSyntax & {
      readonly argument: SyntaxExpression;
      readonly kind: "unary";
      readonly operator: UnaryOperator;
    })
  | (LocatedSyntax & {
      readonly kind: "undefined";
    });

/** One plain function parameter and its retained hints. */
export interface SyntaxParameter extends LocatedSyntax {
  readonly hints: readonly Hint[];
  readonly name: string;
  /** Collect every remaining call argument into a fresh array. */
  readonly rest?: true;
}

/** One identifier leaf in an owned binding pattern. */
export interface SyntaxBindingIdentifier extends LocatedSyntax {
  readonly hints: readonly Hint[];
  readonly kind: "binding-identifier";
  readonly name: string;
}

/** One member reference used as a destructuring assignment target. */
export interface SyntaxAssignmentMemberTarget extends LocatedSyntax {
  readonly key: SyntaxExpression;
  readonly kind: "assignment-member";
  readonly object: SyntaxExpression;
}

/** One initialized element in an owned recursive pattern. */
export interface SyntaxBindingElement<
  Pattern = SyntaxBindingPattern,
> extends LocatedSyntax {
  readonly initializer?: SyntaxExpression;
  readonly pattern: Pattern;
}

/** One parser-independent array binding pattern. */
export interface SyntaxArrayBindingPattern<
  Pattern = SyntaxBindingPattern,
> extends LocatedSyntax {
  readonly elements: readonly (SyntaxBindingElement<Pattern> | undefined)[];
  readonly kind: "array-binding-pattern";
  readonly rest?: Pattern;
}

/** One named or computed property in an owned recursive pattern. */
export interface SyntaxObjectBindingProperty<
  Pattern = SyntaxBindingPattern,
> extends LocatedSyntax {
  /** Preserve whether the source property name used computed syntax. */
  readonly computed?: true;
  readonly initializer?: SyntaxExpression;
  readonly key: SyntaxExpression;
  readonly pattern: Pattern;
}

/** One parser-independent object binding pattern. */
export interface SyntaxObjectBindingPattern<
  Pattern = SyntaxBindingPattern,
  Rest = SyntaxBindingIdentifier,
> extends LocatedSyntax {
  readonly kind: "object-binding-pattern";
  readonly properties: readonly SyntaxObjectBindingProperty<Pattern>[];
  readonly rest?: Rest;
}

/** One identifier leaf admitted by a declaration binding pattern. */
export type SyntaxBindingTarget = SyntaxBindingIdentifier;

/** One leaf admitted by a destructuring assignment pattern. */
export type SyntaxAssignmentTarget =
  | SyntaxAssignmentMemberTarget
  | SyntaxBindingIdentifier;

/** One recursively owned declaration binding pattern. */
export type SyntaxBindingPattern =
  | SyntaxArrayBindingPattern<SyntaxBindingPattern>
  | SyntaxBindingTarget
  | SyntaxObjectBindingPattern<SyntaxBindingPattern, SyntaxBindingTarget>;

/** One recursively owned destructuring assignment pattern. */
export type SyntaxAssignmentPattern =
  | SyntaxArrayBindingPattern<SyntaxAssignmentPattern>
  | SyntaxAssignmentTarget
  | SyntaxObjectBindingPattern<SyntaxAssignmentPattern, SyntaxAssignmentTarget>;

/** How a resolved binding pattern stores each identifier leaf. */
export type BindingPatternMode = "declare" | "initialize" | "write";

/** One switch clause; a missing test marks the default clause. */
export interface SyntaxSwitchCase {
  readonly body: readonly SyntaxStatement[];
  readonly range: SourceRange;
  readonly test?: SyntaxExpression;
}

/** One identifier binding declared by a classic for statement head. */
export interface SyntaxForBindingDeclaration {
  readonly declarationKind: "const" | "let" | "var";
  readonly hint: Hint | undefined;
  readonly initializer: SyntaxExpression;
  readonly kind: "binding";
  readonly name: string;
  readonly range: SourceRange;
}

/** One recursive binding pattern declared by a classic for statement head. */
export interface SyntaxForPatternDeclaration {
  readonly declarationKind: "const" | "let" | "var";
  readonly initializer: SyntaxExpression;
  readonly kind: "pattern";
  readonly pattern: SyntaxBindingPattern;
  readonly range: SourceRange;
}

/** One binding declaration in a classic for statement head. */
export type SyntaxForDeclaration =
  | SyntaxForBindingDeclaration
  | SyntaxForPatternDeclaration;

/** One source-level assignment or declaration target in a for-of head. */
export type SyntaxForOfTarget =
  | {
      readonly declarationKind: "const" | "let" | "var";
      readonly hint: Hint | undefined;
      readonly kind: "declaration";
      readonly name: string;
      readonly range: SourceRange;
    }
  | {
      readonly declarationKind: "const" | "let" | "var";
      readonly kind: "pattern-declaration";
      readonly pattern: SyntaxBindingPattern;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "assignment-pattern";
      readonly pattern: SyntaxAssignmentPattern;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "binding";
      readonly name: string;
      readonly range: SourceRange;
    }
  | {
      readonly key: SyntaxExpression;
      readonly kind: "property";
      readonly object: SyntaxExpression;
      readonly range: SourceRange;
    };

/** Runtime call and construction identity retained for every function. */
export type FunctionKind =
  | "arrow"
  | "async"
  | "async-arrow"
  | "async-generator"
  | "class"
  | "generator"
  | "method"
  | "ordinary";

/** A statement in the parser-independent M1 syntax tree. */
export type SyntaxStatement =
  | (LocatedSyntax & {
      readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
      readonly kind: "block";
    })
  | (LocatedSyntax & {
      readonly kind: "break";
      readonly label?: string;
    })
  | (LocatedSyntax & {
      readonly kind: "continue";
      readonly label?: string;
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly kind: "do-while";
      readonly test: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly kind: "labeled";
      readonly label: string;
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly declarations?: readonly SyntaxForDeclaration[];
      readonly init?: SyntaxExpression;
      readonly kind: "for";
      readonly test?: SyntaxExpression;
      readonly update?: SyntaxExpression;
    })
  | (LocatedSyntax & {
      /**
       * `for await (... of ...)`, which acquires the iterator through
       * `Symbol.asyncIterator` and awaits every step. The flag is absent
       * on a synchronous head rather than `false`, so the two heads stay
       * distinguishable by presence in printed and structural evidence.
       */
      readonly awaited?: true;
      readonly body: SyntaxStatement;
      readonly iterable: SyntaxExpression;
      readonly kind: "for-of";
      readonly target: SyntaxForOfTarget;
    })
  | (LocatedSyntax & {
      readonly cases: readonly SyntaxSwitchCase[];
      readonly discriminant: SyntaxExpression;
      readonly kind: "switch";
    })
  | (LocatedSyntax & {
      readonly declarationKind: "const" | "let" | "var";
      readonly initializer: SyntaxExpression;
      readonly kind: "binding-pattern";
      readonly mode: BindingPatternMode;
      readonly pattern: SyntaxBindingPattern;
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "binding-init";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "const";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "let";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression;
      readonly kind: "expression";
    })
  | (LocatedSyntax & {
      readonly alternate: SyntaxStatement | undefined;
      readonly consequent: SyntaxStatement;
      readonly kind: "if";
      readonly test: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression | undefined;
      readonly kind: "return";
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression;
      readonly kind: "throw";
    })
  | (LocatedSyntax & {
      readonly block: SyntaxStatement;
      readonly handler:
        | {
            readonly body: SyntaxStatement;
            readonly pattern: SyntaxBindingPattern;
            readonly range: SourceRange;
          }
        | undefined;
      readonly finalizer: SyntaxStatement | undefined;
      readonly kind: "try";
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly kind: "while";
      readonly test: SyntaxExpression;
    });

/** A top-level function declaration in owned syntax. */
export interface SyntaxFunction extends LocatedSyntax {
  /** Internal declaration binding when it differs from the function name. */
  readonly bindingName?: string;
  readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
  /** JavaScript `length`, which can differ from the ABI parameter count. */
  readonly functionLength?: number;
  readonly functionKind?: FunctionKind;
  /**
   * True on a class constructor whose class body declares at least one
   * instance field. Such a constructor runs the field initializers its
   * class recorded: a base constructor before its body, and a derived
   * one where `super()` returns.
   */
  readonly initializesInstanceElements?: true;
  readonly kind: "function";
  readonly name: string | undefined;
  readonly parameters: readonly SyntaxParameter[];
  readonly returnHints: readonly Hint[];
  readonly strict?: boolean;
}

/** One owned M1 script, with no parser-specific values. */
export interface SyntaxProgram extends LocatedSyntax {
  readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
  readonly kind: "program";
  readonly sourceId: string;
  readonly strict?: boolean;
}

/** Production frontend output for owned M1 syntax. */
export interface FrontendResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly parsed: boolean;
  readonly program?: SyntaxProgram;
  readonly sourceId: string;
}

/** Replaceable source frontend boundary owned by compiler core. */
export interface SourceFrontend {
  parse(input: SourceInput): FrontendResult;
}

/** One source-located module specifier retained outside a bootstrap AST. */
export interface SyntaxModuleSpecifier extends LocatedSyntax {
  readonly byteRange: ByteRange;
  readonly value: string;
}

/** One imported binding or side-effect-only dependency. */
export interface SyntaxImportEntry extends LocatedSyntax {
  readonly byteRange: ByteRange;
  readonly importedName: "*" | "default" | string | undefined;
  readonly localName: string | undefined;
  readonly specifier: SyntaxModuleSpecifier;
}

/** One exported name before graph linking. */
export type SyntaxExportEntry =
  | (LocatedSyntax & {
      readonly exportedName: string;
      readonly kind: "local";
      readonly localName: string;
    })
  | (LocatedSyntax & {
      readonly exportedName: string;
      readonly importedName: string;
      readonly kind: "indirect";
      readonly specifier: SyntaxModuleSpecifier;
    })
  | (LocatedSyntax & {
      readonly kind: "star";
      readonly specifier: SyntaxModuleSpecifier;
    })
  | (LocatedSyntax & {
      readonly declaration: SyntaxExpression | SyntaxFunction;
      readonly exportedName: "default";
      readonly kind: "default";
    });

/** Parser-independent syntax for one M4 ECMAScript module. */
export interface SyntaxModule extends LocatedSyntax {
  readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
  readonly exports: readonly SyntaxExportEntry[];
  readonly imports: readonly SyntaxImportEntry[];
  readonly kind: "module";
  readonly sourceId: string;
}

/** Production frontend output for owned module syntax. */
export interface ModuleFrontendResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly module?: SyntaxModule;
  readonly parsed: boolean;
  readonly sourceId: string;
}

/** Replaceable module frontend boundary owned by compiler core. */
export interface ModuleSourceFrontend {
  parseModule(input: SourceInput): ModuleFrontendResult;
}

/** Source and stable content identity supplied by a compiler host. */
export interface LoadedModuleSource extends SourceInput {
  readonly sourceHash: string;
}

/** Owned result of loading one canonical module identifier. */
export interface ModuleLoadResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly source?: LoadedModuleSource;
}

/** Import site that caused a dependency module to be loaded. */
export interface ModuleLoadReferrer {
  readonly importerId: string;
  readonly specifier: SyntaxModuleSpecifier;
}

/** Host-neutral source loader used during graph discovery. */
export interface ModuleLoader {
  load(
    canonicalId: string,
    referrer?: ModuleLoadReferrer,
  ): Promise<ModuleLoadResult>;
}

/** Owned result of resolving one source specifier. */
export interface ModuleResolutionResult {
  readonly canonicalId?: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** Host-neutral module resolution policy. */
export interface ModuleResolver {
  resolve(
    importerId: string,
    specifier: SyntaxModuleSpecifier,
  ): ModuleResolutionResult;
}

/** One resolved dependency edge in source order. */
export interface ModuleDependency {
  readonly canonicalId: string;
  readonly specifier: SyntaxModuleSpecifier;
}

/** One resolved source occurrence before dependency deduplication. */
export interface ModuleResolution extends ModuleDependency {}

/** One uniquely identified node in a closed module graph. */
export interface ModuleGraphNode {
  readonly canonicalId: string;
  readonly dependencies: readonly ModuleDependency[];
  readonly resolutions: readonly ModuleResolution[];
  readonly sourceHash: string;
  readonly syntax: SyntaxModule;
}

/** Deterministic closed graph rooted at one canonical entry. */
export interface ModuleGraph {
  readonly entryId: string;
  readonly kind: "module-graph";
  readonly modules: readonly ModuleGraphNode[];
}

/** Result of host-neutral module graph discovery. */
export interface ModuleGraphResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly graph?: ModuleGraph;
}
