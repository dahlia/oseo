import type {
  EmittedNativeSource,
  NativeBackend,
  SyntheticNativeModule,
} from "@oseo/compiler";

function escapeCString(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (character === "\\") {
      result += "\\\\";
    } else if (character === '"') {
      result += '\\"';
    } else if (character === "?") {
      result += "\\?";
    } else if (character === "\n") {
      result += "\\n";
    } else if (codePoint != null && codePoint >= 0x20 && codePoint <= 0x7e) {
      result += character;
    } else {
      const bytes = new TextEncoder().encode(character);
      for (const byte of bytes) {
        result += `\\${byte.toString(8).padStart(3, "0")}`;
      }
    }
  }
  return result;
}

/** Deterministic C11 backend used only by the M0 synthetic fixture. */
export const cBackend: NativeBackend = {
  emit(input: SyntheticNativeModule): EmittedNativeSource {
    const line = escapeCString(input.outputLine);
    return {
      source:
        '#include "oseo_runtime.h"\n\n' +
        "int main(void) {\n" +
        `    return oseo_runtime_write_line("${line}");\n` +
        "}\n",
      sourceName: "generated.c",
    };
  },
};
