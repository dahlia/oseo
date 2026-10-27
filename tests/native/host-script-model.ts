/** One generated operation against a realm Global Environment. */
export interface ScriptCommand {
  readonly kind:
    | "const"
    | "delete"
    | "function"
    | "let"
    | "read"
    | "throw"
    | "var"
    | "write";
  readonly name: "a" | "b";
  readonly realm: 0 | 1;
  readonly value: number;
}
interface Binding {
  readonly value: number;
  readonly callable: boolean;
  readonly mutable: boolean;
  readonly configurable: boolean;
}

/** Independent Global Environment records without source evaluation. */
export function hostScriptModel(
  commands: readonly ScriptCommand[],
  legacyDenoVarCheck = false,
): string {
  const realms = [0, 1].map(() => ({
    lexical: new Map<string, Binding>(),
    object: new Map<string, Binding>(),
    varNames: new Set<string>(),
  }));
  return (
    commands
      .map((entry) => {
        const realm = realms[entry.realm]!;
        const lexical = realm.lexical.get(entry.name);
        const property = realm.object.get(entry.name);
        const found = lexical ?? property;
        const binding = {
          value: entry.value,
          callable: entry.kind === "function",
          mutable: entry.kind !== "const",
          configurable: false,
        };
        switch (entry.kind) {
          case "const":
          case "let":
          case "throw":
            if (
              lexical != null ||
              property?.configurable === false ||
              (legacyDenoVarCheck && realm.varNames.has(entry.name))
            )
              return "error:SyntaxError";
            realm.lexical.set(entry.name, binding);
            return entry.kind === "throw"
              ? `thrown:${entry.value}`
              : "undefined";
          case "var":
          case "function":
            if (lexical != null) return "error:SyntaxError";
            // Only the legacy Deno observer consults declared var names.
            realm.varNames.add(entry.name);
            realm.object.set(entry.name, {
              ...binding,
              configurable:
                entry.kind === "var" && property != null
                  ? property.configurable
                  : false,
            });
            return "undefined";
          case "write":
            if (lexical != null && !lexical.mutable) return "error:TypeError";
            (lexical != null ? realm.lexical : realm.object).set(entry.name, {
              ...binding,
              callable: false,
              configurable:
                lexical != null ? false : (property?.configurable ?? true),
            });
            return String(entry.value);
          case "read":
            return found == null
              ? "error:ReferenceError"
              : `${found.callable ? "function:" : ""}${found.value}`;
          case "delete":
            if (
              lexical != null ||
              property?.configurable === false ||
              (legacyDenoVarCheck && realm.varNames.has(entry.name))
            )
              return "false";
            realm.object.delete(entry.name);
            realm.varNames.delete(entry.name);
            return "true";
        }
      })
      .join("\n") + "\nxy\n"
  );
}
