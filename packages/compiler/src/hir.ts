import type { Diagnostic, SourceRange } from "./source.ts";
import type {
  AssignmentOperator,
  BinaryOperator,
  BindingPatternMode,
  FunctionKind,
  Hint,
  LocatedSyntax,
  LogicalOperator,
  SyntaxFunction,
  SyntaxParameter,
  SyntaxThisMode,
  UnaryOperator,
} from "./syntax.ts";
/** One resolved identifier leaf with explicit binding identity. */
export interface HirBindingIdentifier extends LocatedSyntax {
  readonly bindingId: number;
  readonly functionNameBinding?: true;
  readonly hints: readonly Hint[];
  readonly importedBinding?: true;
  readonly kind: "binding-identifier";
  readonly mutable: boolean;
  readonly name: string;
  /**
   * Ordered innermost-first object environments consulted before this
   * lexical fallback when the target occurs inside `with`.
   */
  readonly withObjectBindingIds?: readonly number[];
}

/** One lexical assignment fallback behind an ordered `with` object chain. */
export interface HirWithBindingReference {
  readonly bindingId: number;
  readonly functionNameBinding?: boolean;
  readonly importedBinding?: boolean;
  readonly mutable: boolean;
  readonly name: string;
}

/** One resolved identifier read through active `with` environments. */
export interface HirWithReference extends LocatedSyntax {
  readonly fallback: HirExpression;
  readonly name: string;
  readonly objectBindingIds: readonly number[];
}

/** One identifier deletion resolved through active object environments. */
export interface HirWithDeleteReference extends LocatedSyntax {
  /** Result when no active object environment supplies the name. */
  readonly fallbackResult: boolean;
  readonly kind: "with-delete";
  readonly name: string;
  readonly objectBindingIds: readonly number[];
}

/** One resolved member reference used as an assignment-pattern leaf. */
export interface HirAssignmentMemberTarget extends LocatedSyntax {
  readonly key: HirExpression;
  readonly kind: "assignment-member";
  readonly object: HirExpression;
}

/** One resolved private reference used as an assignment-pattern leaf. */
export interface HirAssignmentPrivateTarget extends LocatedSyntax {
  readonly kind: "assignment-private";
  readonly object: HirExpression;
  readonly privateName: HirPrivateName;
}

/** One resolved initialized element in an array binding pattern. */
export interface HirBindingElement extends LocatedSyntax {
  readonly initializer?: HirExpression;
  readonly pattern: HirBindingPattern;
}

/** One resolved array binding pattern. */
export interface HirArrayBindingPattern extends LocatedSyntax {
  readonly elements: readonly (HirBindingElement | undefined)[];
  readonly kind: "array-binding-pattern";
  readonly rest?: HirBindingPattern;
}

/** One resolved property in an object binding pattern. */
export interface HirObjectBindingProperty extends LocatedSyntax {
  readonly initializer?: HirExpression;
  readonly key: HirExpression;
  readonly pattern: HirBindingPattern;
}

/** One resolved object binding pattern. */
export interface HirObjectBindingPattern extends LocatedSyntax {
  readonly kind: "object-binding-pattern";
  readonly properties: readonly HirObjectBindingProperty[];
  readonly rest?: HirBindingTarget;
}

/** One resolved leaf admitted by a declaration or assignment pattern. */
export type HirBindingTarget =
  | HirAssignmentMemberTarget
  | HirAssignmentPrivateTarget
  | HirBindingIdentifier;

/** One recursively resolved binding or assignment pattern. */
export type HirBindingPattern =
  | HirArrayBindingPattern
  | HirBindingTarget
  | HirObjectBindingPattern;

/** One resolved switch clause sharing the case-block scope. */
export interface HirSwitchCase {
  readonly body: readonly HirStatement[];
  readonly range: SourceRange;
  readonly test?: HirExpression;
}
/** One resolved identifier binding in a classic for statement head. */
export interface HirForBindingDeclaration {
  readonly bindingId: number;
  readonly declarationKind: "const" | "let" | "var";
  readonly hint: Hint | undefined;
  readonly initializer: HirExpression;
  readonly kind: "binding";
  readonly name: string;
  readonly range: SourceRange;
}

/** One resolved recursive pattern in a classic for statement head. */
export interface HirForPatternDeclaration {
  readonly declarationKind: "const" | "let" | "var";
  readonly initializer: HirExpression;
  readonly kind: "pattern";
  readonly pattern: HirBindingPattern;
  readonly range: SourceRange;
}

/** One resolved declaration in a classic for statement head. */
export type HirForDeclaration =
  | HirForBindingDeclaration
  | HirForPatternDeclaration;
/** One resolved for-of target with explicit binding identity. */
export type HirForOfTarget =
  | {
      readonly bindingId: number;
      readonly declarationKind: "const" | "let" | "var";
      readonly hint: Hint | undefined;
      readonly kind: "declaration";
      readonly mutable: boolean;
      readonly name: string;
      readonly range: SourceRange;
    }
  | {
      readonly declarationKind: "const" | "let" | "var";
      readonly kind: "pattern-declaration";
      readonly pattern: HirBindingPattern;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "assignment-pattern";
      readonly pattern: HirBindingPattern;
      readonly range: SourceRange;
    }
  | {
      readonly bindingId: number;
      readonly functionNameBinding?: true;
      readonly importedBinding?: true;
      readonly kind: "binding";
      readonly mutable: boolean;
      readonly name: string;
      readonly range: SourceRange;
      readonly withObjectBindingIds?: readonly number[];
    }
  | {
      readonly key: HirExpression;
      readonly kind: "property";
      readonly object: HirExpression;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "private";
      readonly object: HirExpression;
      readonly privateName: HirPrivateName;
      readonly range: SourceRange;
    };

/**
 * The named error constructors the profile admits as intrinsic values.
 * An unshadowed reference to one of these names resolves to the
 * runtime-owned constructor instead of an unknown-binding diagnostic.
 */
export type ErrorIntrinsicName =
  | "Error"
  | "EvalError"
  | "RangeError"
  | "ReferenceError"
  | "SyntaxError"
  | "TypeError"
  | "URIError";

const errorIntrinsicNames: readonly ErrorIntrinsicName[] = [
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
];

export function errorIntrinsicName(
  name: string,
): ErrorIntrinsicName | undefined {
  return errorIntrinsicNames.find((candidate) => candidate === name);
}

/**
 * How ECMA-262's global object already binds one intrinsic global name,
 * which is what decides whether a Script's own top-level declaration of
 * that name creates an ordinary global-object property.
 *
 * `restricted` names the three value properties ECMA-262 defines as
 * non-writable, non-enumerable, and non-configurable, which is what
 * makes HasRestrictedGlobalProperty true for them. `replaceable` names
 * the intrinsic objects, which are writable and configurable, so a
 * function declaration may legally replace them.
 *
 * Only names this profile admits as values belong here. A name it
 * recognizes solely as a call target, such as `Object` or `console`,
 * is not a value in this realm; referring to one by name is already a
 * source-located diagnostic, so no declaration of it can collide with
 * an intrinsic property.
 */
export type IntrinsicGlobalKind = "replaceable" | "restricted";

/**
 * How the global object binds `name`, or `undefined` when it is an
 * ordinary name this realm gives no intrinsic value.
 */
export function intrinsicGlobalKind(
  name: string,
): IntrinsicGlobalKind | undefined {
  if (name === "undefined" || name === "NaN" || name === "Infinity") {
    return "restricted";
  }
  if (name === "Symbol" || errorIntrinsicName(name) != null) {
    return "replaceable";
  }
  return undefined;
}

/**
 * True for an anonymous function or class definition, which
 * NamedEvaluation names from the key or binding that stores it. A static
 * key is already resolved during HIR name inference; this decides
 * whether a key must also reach the closure at run time.
 */
export function anonymousDefinition(expression: HirExpression): boolean {
  if (expression.kind === "function") return expression.name === "";
  return (
    expression.kind === "class" &&
    expression.constructorFunction.kind === "function" &&
    expression.constructorFunction.name === ""
  );
}

/** A resolved call target in HIR. */
export type HirCallTarget =
  | {
      readonly kind: "console-log";
    }
  | {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    }
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
  | {
      readonly callee: HirExpression;
      readonly kind: "dynamic";
    }
  | {
      /**
       * A `super()` call. It constructs the enclosing constructor's
       * [[Prototype]] and binds the result to the derived constructor's
       * `this` binding, which the target names so lowering can reach it
       * without re-resolving the class.
       */
      readonly kind: "super";
      readonly thisBinding: HirClassThisBinding;
    }
  | {
      readonly key: HirExpression;
      readonly kind: "method";
      readonly object: HirExpression;
    }
  | {
      /**
       * A private member call. The callee is the private element the
       * object carries, and the object stays the receiver, so no
       * property lookup and no separate receiver expression exist.
       */
      readonly kind: "private-method";
      readonly object: HirExpression;
      readonly privateName: HirPrivateName;
    };

/** One resolved spread entry retained inside an HIR array literal. */
export interface HirArraySpreadElement extends LocatedSyntax {
  readonly argument: HirExpression;
  readonly kind: "spread";
}

/** One ordinary, spread, or elided HIR array literal entry. */
export type HirArrayElement = HirArraySpreadElement | HirExpression | undefined;

/**
 * One resolved template object argument. Its strings contain no bindings,
 * so resolution preserves the owned frontend data unchanged.
 */
export interface HirTemplateObject extends LocatedSyntax {
  readonly cooked: readonly (string | undefined)[];
  readonly kind: "template-object";
  readonly raw: readonly string[];
}

/** One resolved spread entry retained inside an HIR call argument list. */
export interface HirSpreadArgument extends LocatedSyntax {
  readonly argument: HirExpression;
  readonly kind: "spread";
}

/** One ordinary or spread HIR call argument. */
export type HirCallArgument = HirExpression | HirSpreadArgument;

/** One resolved property or call step in an optional chain. */
export type HirOptionalChainLink =
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "member";
      readonly optional: boolean;
    })
  | (LocatedSyntax & {
      readonly kind: "private-member";
      readonly optional: boolean;
      readonly privateName: HirPrivateName;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirCallArgument[];
      readonly chainBoundary?: true;
      readonly kind: "call";
      readonly optional: boolean;
    });

/** One data, shorthand, method, or accessor HIR object literal entry. */
export interface HirObjectDefinition {
  /** A get or set accessor; absent for a data, shorthand, or method
   * property. */
  readonly accessorKind?: "get" | "set";
  readonly key: HirExpression;
  readonly kind: "definition";
  /**
   * Whether this colon-form definition sets [[Prototype]] instead of an
   * own property. At most one may appear in each object literal.
   */
  readonly prototypeSetter?: true;
  readonly value: HirExpression;
}

/** One resolved spread entry retained inside an HIR object literal. */
export interface HirObjectSpreadProperty extends LocatedSyntax {
  readonly argument: HirExpression;
  readonly kind: "spread";
}

/** One defined or spread HIR object literal property. */
export type HirObjectProperty = HirObjectDefinition | HirObjectSpreadProperty;

/**
 * One resolved private name. The binding holds the private name value
 * the class evaluation created, so every element and reference in the
 * class body reaches the same identity, and a second evaluation of the
 * same class creates a distinct one.
 */
export interface HirPrivateName {
  readonly bindingId: number;
  /** The declared name, including its leading `#`. */
  readonly name: string;
}

/**
 * A private element name standing where a class element key stands. It
 * is not an expression: it names an element the object carries outside
 * its properties, so lowering never converts it to a property key.
 */
export interface HirPrivateNameKey extends LocatedSyntax {
  readonly kind: "private-name";
  readonly privateName: HirPrivateName;
}

/** One resolved method or accessor definition in an HIR class body. */
export interface HirClassMethod extends LocatedSyntax {
  /** A get or set accessor; absent for an ordinary method definition. */
  readonly accessorKind?: "get" | "set";
  readonly key: HirExpression | HirPrivateNameKey;
  readonly kind: "method";
  /**
   * True for a `static` element, which is defined on the constructor
   * itself instead of on its prototype object.
   */
  readonly staticPlacement?: true;
  readonly value: HirExpression;
}

/**
 * One resolved field definition in an HIR class body. The initializer
 * is resolved as its own function, so it reads the class scope instead
 * of the constructor's parameters and takes the object the field is
 * defined on as its receiver: the instance under construction for an
 * instance field and the constructor itself for a `static` one.
 */
export interface HirClassField extends LocatedSyntax {
  /**
   * The closure that produces the field's value, absent for a field
   * declared without an initializer, whose value is `undefined`.
   */
  readonly initializer?: HirExpression;
  readonly key: HirExpression | HirPrivateNameKey;
  /**
   * Where the evaluated key is stored for the initializer to read,
   * present only when the initializer is an anonymous definition whose
   * key is not a static string. The cell is created and filled where
   * the element appears, so the closure that captures it observes the
   * one key evaluation the class body performs.
   */
  readonly keyNameBindingId?: number;
  readonly kind: "field";
  /**
   * True for a `static` field, which the class definition defines on the
   * constructor after every element is in place, rather than recording
   * for each instance the constructor builds.
   */
  readonly staticPlacement?: true;
}

/**
 * One resolved `static { ... }` initialization block. The block body is
 * resolved as its own function, so it reads the class scope and takes
 * the constructor as its receiver, and the class definition calls that
 * closure once and discards whatever it produces.
 */
export interface HirClassStaticBlock extends LocatedSyntax {
  /** The closure holding the block's statements. */
  readonly body: HirExpression;
  readonly kind: "static-block";
}

/** One element admitted by an HIR class body. */
export type HirClassElement =
  | HirClassField
  | HirClassMethod
  | HirClassStaticBlock;

/**
 * The immutable binding a named class holds in its own lexical
 * environment. Only the class body reaches it.
 */
export interface HirClassNameBinding {
  readonly bindingId: number;
  readonly name: string;
}

/**
 * The `this` binding a derived class constructor owns. It starts
 * uninitialized, so reading `this` before `super()` throws a
 * `ReferenceError`, and `super()` initializes it with whatever the parent
 * constructor produced. A base class constructor has no such binding and
 * reads its receiver directly.
 */
export interface HirClassThisBinding {
  readonly bindingId: number;
}

/** A resolved, normalized HIR expression. */
export type HirExpression =
  | (LocatedSyntax & {
      readonly argument: HirExpression;
      readonly kind: "await";
    })
  | (LocatedSyntax & {
      /** Absent for a bare `yield`, which sends `undefined` out. */
      readonly argument?: HirExpression;
      /**
       * True for `yield*`, which delegates every resumption to the
       * operand's iterator. The grammar requires an operand, so a
       * delegating expression always carries an `argument`.
       */
      readonly delegate?: true;
      readonly kind: "yield";
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly functionNameBinding?: boolean;
      readonly importedBinding?: boolean;
      readonly kind: "binding-set";
      readonly mutable: boolean;
      readonly name: string;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly functionNameBinding?: boolean;
      readonly importedBinding?: boolean;
      readonly kind: "binding-update";
      readonly mutable: boolean;
      readonly name: string;
      readonly operator: AssignmentOperator;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly functionNameBinding?: boolean;
      readonly importedBinding?: boolean;
      readonly kind: "binding-step";
      readonly mutable: boolean;
      readonly name: string;
      readonly operator: "++" | "--";
      readonly prefix: boolean;
    })
  | (LocatedSyntax & {
      readonly fallback: HirWithBindingReference;
      readonly kind: "with-set";
      readonly name: string;
      readonly objectBindingIds: readonly number[];
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly fallback: HirWithBindingReference;
      readonly kind: "with-update";
      readonly name: string;
      readonly objectBindingIds: readonly number[];
      readonly operator: AssignmentOperator;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly fallback: HirWithBindingReference;
      readonly kind: "with-step";
      readonly name: string;
      readonly objectBindingIds: readonly number[];
      readonly operator: "++" | "--";
      readonly prefix: boolean;
    })
  | (LocatedSyntax & {
      readonly kind: "destructuring-set";
      readonly pattern: HirBindingPattern;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly elements: readonly HirArrayElement[];
      readonly kind: "array";
    })
  | HirTemplateObject
  | (LocatedSyntax & {
      readonly kind: "binary";
      readonly left: HirExpression;
      readonly operator: BinaryOperator;
      readonly right: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirCallArgument[];
      readonly kind: "call";
      readonly target: HirCallTarget;
    })
  | (LocatedSyntax & {
      readonly alternate: HirExpression;
      readonly consequent: HirExpression;
      readonly kind: "conditional";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "logical";
      readonly left: HirExpression;
      readonly operator: LogicalOperator;
      readonly right: HirExpression;
    })
  | (LocatedSyntax & {
      readonly expressions: readonly HirExpression[];
      readonly kind: "sequence";
    })
  | (LocatedSyntax & {
      readonly functionId: number;
      readonly functionKind: FunctionKind;
      readonly kind: "function";
      readonly name: string;
      readonly functionLength: number;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly kind: "binding";
      readonly name: string;
    })
  | (HirWithReference & {
      readonly kind: "with-get";
    })
  | (LocatedSyntax & {
      readonly errorName: ErrorIntrinsicName;
      readonly kind: "error-intrinsic";
    })
  | (LocatedSyntax & {
      readonly kind: "symbol-intrinsic";
    })
  | (LocatedSyntax & {
      readonly kind: "null";
    })
  | (LocatedSyntax & {
      readonly entries: readonly {
        readonly bindingId: number;
        readonly name: string;
      }[];
      readonly kind: "module-namespace";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirCallArgument[];
      readonly callee: HirExpression;
      readonly kind: "new";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirCallArgument[];
      readonly kind: "promise-construct";
    })
  | (LocatedSyntax & {
      /**
       * The class constructor closure, whose `name` is the class name and
       * whose value is the class itself.
       */
      readonly constructorFunction: HirExpression;
      readonly elements: readonly HirClassElement[];
      /**
       * The evaluated `extends` operand, present exactly for a derived
       * class. It is evaluated in the class's own lexical environment,
       * before the constructor closure exists.
       */
      readonly heritage?: HirExpression;
      readonly kind: "class";
      /**
       * Present only for a named class. It is initialized after every
       * element is defined, so a computed key that reads it observes the
       * temporal dead zone.
       */
      readonly nameBinding?: HirClassNameBinding;
      /**
       * The private names this class body declares, in declaration
       * order. The class evaluation creates one value per entry before
       * any element is defined, so every element and every reference in
       * the body shares that identity and a second evaluation of the
       * same class produces names no earlier instance carries.
       */
      readonly privateNames?: readonly HirPrivateName[];
    })
  | (LocatedSyntax & {
      readonly kind: "object";
      readonly properties: readonly HirObjectProperty[];
    })
  | (LocatedSyntax & {
      readonly base: HirExpression;
      /** Delete the final live reference, or return true on a short path. */
      readonly delete?: true;
      readonly kind: "optional-chain";
      readonly links: readonly HirOptionalChainLink[];
    })
  | (LocatedSyntax & {
      /** The evaluated non-reference value is discarded after abrupt checks. */
      readonly argument: HirExpression;
      readonly kind: "delete-value";
    })
  | HirWithDeleteReference
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-delete";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-get";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-set";
      readonly object: HirExpression;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-update";
      readonly object: HirExpression;
      readonly operator: AssignmentOperator;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-step";
      readonly object: HirExpression;
      readonly operator: "++" | "--";
      readonly prefix: boolean;
    })
  | (LocatedSyntax & {
      /**
       * A private member reference. The name is already resolved to the
       * class body that declared it, so lowering reads the private name
       * value from its binding and asks the object for that element
       * instead of looking a property key up along a prototype chain.
       */
      readonly kind: "private-get";
      readonly object: HirExpression;
      readonly privateName: HirPrivateName;
    })
  | (LocatedSyntax & {
      /**
       * A private brand check. The name is resolved lexically, so
       * lowering only evaluates the selected object and asks whether it
       * carries the corresponding private element.
       */
      readonly kind: "private-in";
      readonly object: HirExpression;
      readonly privateName: HirPrivateName;
    })
  | (LocatedSyntax & {
      readonly kind: "private-set";
      readonly object: HirExpression;
      readonly privateName: HirPrivateName;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "private-update";
      readonly object: HirExpression;
      readonly operator: AssignmentOperator;
      readonly privateName: HirPrivateName;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "private-step";
      readonly object: HirExpression;
      readonly operator: "++" | "--";
      readonly prefix: boolean;
      readonly privateName: HirPrivateName;
    })
  | (LocatedSyntax & {
      /** Separator-free source digits, without the radix prefix or `n`. */
      readonly digits: string;
      readonly kind: "bigint";
      readonly radix: 2 | 8 | 10 | 16;
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
      readonly thisMode: SyntaxThisMode;
    })
  | (LocatedSyntax & {
      /**
       * The `super` operand of a property reference. It stands only as
       * the `object` of a property get, set, update, or step expression
       * or of a `method` call target. Lowering starts the lookup at the
       * running function's home object prototype and keeps `receiver` as
       * the value a getter, setter, or method call receives as `this`,
       * which is the resolved `this` of the enclosing class element and
       * therefore the derived constructor's binding where one exists.
       */
      readonly kind: "super-base";
      readonly receiver: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "new-target";
    })
  | (LocatedSyntax & {
      readonly argument: HirExpression;
      readonly kind: "unary";
      readonly operator: UnaryOperator;
    })
  | (LocatedSyntax & {
      readonly kind: "undefined";
    });

/** A resolved HIR statement with explicit binding identity. */
export type HirStatement =
  | (LocatedSyntax & {
      readonly body: readonly HirStatement[];
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
      readonly body: HirStatement;
      readonly kind: "do-while";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "labeled";
      readonly label: string;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly declarations?: readonly HirForDeclaration[];
      readonly init?: HirExpression;
      readonly kind: "for";
      readonly test?: HirExpression;
      readonly update?: HirExpression;
    })
  | (LocatedSyntax & {
      /** `for await`, which awaits each asynchronous iteration step. */
      readonly awaited?: true;
      readonly body: HirStatement;
      readonly iterable: HirExpression;
      readonly kind: "for-of";
      readonly target: HirForOfTarget;
    })
  | (LocatedSyntax & {
      readonly cases: readonly HirSwitchCase[];
      readonly discriminant: HirExpression;
      /**
       * Every clause's function declaration, instantiated once at
       * CaseBlock entry regardless of which clause runs, which is
       * ECMA-262's BlockDeclarationInstantiation for a CaseBlock. Absent
       * when no clause declares a function.
       */
      readonly functionInits?: readonly HirStatement[];
      readonly kind: "switch";
    })
  | (LocatedSyntax & {
      readonly declarationKind: "const" | "let" | "var";
      readonly initializer: HirExpression;
      readonly kind: "binding-pattern";
      readonly mode: BindingPatternMode;
      readonly pattern: HirBindingPattern;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "binding-init";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "const";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "let";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression;
      readonly kind: "expression";
    })
  | (LocatedSyntax & {
      /**
       * True when `bindingId` names a parameter or the implicit
       * `arguments` binding that FunctionDeclarationInstantiation already
       * initialized, so this statement writes through that existing
       * binding instead of initializing a fresh one.
       */
      readonly alreadyInitialized?: true;
      readonly bindingId: number;
      readonly functionId: number;
      readonly functionKind: FunctionKind;
      readonly functionName: string;
      readonly kind: "function-init";
      readonly name: string;
      readonly functionLength: number;
    })
  | (LocatedSyntax & {
      readonly alternate: HirStatement | undefined;
      readonly consequent: HirStatement;
      readonly kind: "if";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression | undefined;
      readonly kind: "return";
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression;
      readonly kind: "throw";
    })
  | (LocatedSyntax & {
      readonly block: HirStatement;
      readonly handler:
        | {
            readonly body: HirStatement;
            /**
             * Resolved CatchParameter, or `undefined` for the optional
             * catch binding form, which binds nothing and resolves its
             * body without a catch-parameter scope.
             */
            readonly pattern: HirBindingPattern | undefined;
            readonly range: SourceRange;
          }
        | undefined;
      readonly finalizer: HirStatement | undefined;
      readonly kind: "try";
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "while";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      /**
       * Hidden uninitialized fallbacks used only when an object property
       * may supply a name that has no statically owned lexical binding.
       */
      readonly fallbackBindings: readonly {
        readonly bindingId: number;
        readonly name: string;
      }[];
      readonly kind: "with";
      /** Hidden cell containing the evaluated object for this execution. */
      readonly objectBindingId: number;
      readonly object: HirExpression;
    });

/** A resolved function parameter. */
export interface HirParameter extends SyntaxParameter {
  readonly bindingId: number;
}

/** One statically resolved HIR function. */
export interface HirFunction extends LocatedSyntax {
  /**
   * The implicit non-strict `arguments` binding initialized from the call
   * arguments before parameter initialization.
   */
  readonly argumentsBindingId?: number;
  /**
   * True when `argumentsBindingId`'s object is the mapped arguments
   * exotic object rather than the ordinary unmapped snapshot. ECMA-262
   * admits the mapped form only for a non-strict function whose
   * parameter list is simple; a present `argumentsBindingId` with this
   * absent keeps the existing unmapped object.
   */
  readonly argumentsMapped?: true;
  readonly body: readonly HirStatement[];
  /**
   * Present exactly on a derived class constructor. Every `return` leaves
   * through this binding, so a constructor that never reached `super()`
   * throws a `ReferenceError` instead of producing an unbound receiver.
   */
  readonly derivedThisBindingId?: number;
  /**
   * The binding holding the field key that names this class field
   * initializer's anonymous result, which is ECMA-262's
   * [[ClassFieldInitializerName]]. Present only on such an initializer.
   */
  readonly fieldKeyBindingId?: number;
  /** JavaScript `length`, independent from the call ABI parameter count. */
  readonly functionLength: number;
  readonly functionKind: FunctionKind;
  /**
   * Number of leading HIR statements that a generator call executes before
   * returning its suspended generator object.
   */
  readonly generatorCallStatementCount?: number;
  readonly id: number;
  /**
   * True on a class constructor whose class declares instance fields.
   * The constructor runs them against the instance under construction:
   * a base constructor before its body, and a derived one where
   * `super()` returns.
   */
  readonly initializesInstanceElements?: true;
  readonly kind: "hir-function";
  readonly localBindingIds: readonly number[];
  readonly name: string;
  readonly parameters: readonly HirParameter[];
  readonly returnHints: readonly Hint[];
  readonly selfBindingId?: number;
  readonly strict?: boolean;
}

/** One script environment cell required outside the script statement list. */
export interface HirGlobalBinding {
  readonly id: number;
  readonly name: string;
}

/**
 * One resolved global-object property and the declaration that creates
 * it. The declaration kind selects between CreateGlobalVarBinding and
 * CreateGlobalFunctionBinding when the name already has a property.
 */
export interface HirGlobalObjectBinding extends HirGlobalBinding {
  readonly declaration: "function" | "var";
}

/** A normalized script and its statically callable functions. */
export interface HirProgram {
  readonly body: readonly HirStatement[];
  readonly functions: readonly HirFunction[];
  readonly globalBindings?: readonly HirGlobalBinding[];
  /**
   * The resolved var-scoped top-level bindings a Script's global object
   * binds as properties, in GlobalDeclarationInstantiation order. Each
   * entry names the same binding the script statement list writes, so a
   * property read and a binding read observe one storage location.
   */
  readonly globalObjectBindings?: readonly HirGlobalObjectBinding[];
  readonly kind: "hir-program";
  readonly range: SourceRange;
  readonly sourceId: string;
  readonly strict?: boolean;
}

/** Result of profile validation and HIR name resolution. */
export interface HirResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly program?: HirProgram;
}

export interface Binding {
  /**
   * True once this name's id names a parameter or the implicit
   * `arguments` binding that FunctionDeclarationInstantiation already
   * initialized before a same-name top-level function declaration's own
   * instantiation step. Set the first time such a declaration reuses the
   * outer binding, and carried forward by every later redeclaration of
   * the same name in that scope, since `buildFunctionInits` keeps only
   * the last one and it still targets that same already-initialized id.
   */
  readonly alreadyInitialized?: true;
  /** True only for an implicit non-strict `arguments` object binding. */
  readonly argumentsObject?: true;
  readonly functionId?: number;
  readonly functionNameBinding?: boolean;
  readonly id: number;
  readonly importedBinding?: boolean;
  readonly mutable: boolean;
  readonly name: string;
  readonly pendingDeclaration?: boolean;
}

export interface ResolveState {
  /**
   * True while resolving a function form whose implicit `arguments` object
   * is deliberately unavailable in the current function profile.
   */
  argumentsObjectUnavailable: boolean;
  nextBindingId: number;
  readonly diagnostics: Diagnostic[];
  readonly functionInfo: Map<
    SyntaxFunction,
    {
      /**
       * True when `bindingId` names a parameter or the implicit
       * `arguments` binding that FunctionDeclarationInstantiation already
       * initialized before this declaration's own instantiation step, so
       * the function-init statement must write through the existing
       * binding rather than initialize a fresh one.
       */
      readonly alreadyInitialized?: true;
      readonly bindingId?: number;
      readonly id: number;
    }
  >;
  readonly hirFunctions: HirFunction[];
  /** Active labels of the function being resolved; loops accept continue. */
  readonly labels: { readonly loop: boolean; readonly name: string }[];
  nextFunctionId: number;
  readonly sourceId: string;
  /**
   * Hidden fallback bindings owned by each currently resolved `with`
   * statement, ordered outermost first.
   */
  readonly withFallbacks: Map<string, Binding>[];
  /** Empty scope markers mapped to their hidden object binding identity. */
  readonly withScopes: Map<Map<string, Binding>, number>;
  /**
   * The derived constructor `this` binding in scope, if any. It reaches
   * every arrow function nested in that constructor and stops at the next
   * function that provides its own receiver.
   */
  thisBinding?: HirClassThisBinding | undefined;
}
