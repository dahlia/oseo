/*
 * An independent model of the Uint8Array base64 and hex methods, written
 * from the ECMAScript 2026 text (23.3.2.1, 23.3.2.2, 23.3.3.12 to
 * 23.3.3.15, and the FromBase64 and FromHex operations). It shares no code
 * with the C runtime.
 *
 * The model is JavaScript source text that installs the six functions on
 * the Uint8Array of the realm that evaluates it: a Node.js reference
 * process, which lacks them, or a node:vm context. It must accept any
 * value a program passes, so it is kept as source rather than typed code.
 */

/** Source text that installs the model in the realm that evaluates it. */
export const base64ModelPrelude: string = String.raw`
(function installUint8ArrayBase64Model() {
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const tagGetter = Object.getOwnPropertyDescriptor(
    typedArrayPrototype,
    Symbol.toStringTag,
  ).get;
  const validate = typedArrayPrototype.entries;
  const lengthGetter = Object.getOwnPropertyDescriptor(
    typedArrayPrototype,
    "length",
  ).get;
  const standard =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function fail(kind) {
    if (kind === "syntax") throw new SyntaxError("model");
    throw new TypeError("model");
  }
  // ValidateUint8Array.
  function validateUint8Array(value) {
    let tag;
    try {
      tag = tagGetter.call(value);
    } catch {
      fail("type");
    }
    if (tag !== "Uint8Array") fail("type");
    return value;
  }
  // IsTypedArrayOutOfBounds through ValidateTypedArray, then the length.
  function boundedLength(view) {
    validate.call(view);
    return lengthGetter.call(view);
  }
  function getOptionsObject(options) {
    if (options === undefined) return Object.create(null);
    if (
      (typeof options === "object" && options !== null) ||
      typeof options === "function"
    ) {
      return options;
    }
    return fail("type");
  }
  function alphabetOf(options) {
    const alphabet = options.alphabet;
    if (alphabet === undefined) return "base64";
    if (alphabet !== "base64" && alphabet !== "base64url") fail("type");
    return alphabet;
  }
  function lastChunkHandlingOf(options) {
    const handling = options.lastChunkHandling;
    if (handling === undefined) return "loose";
    if (
      handling !== "loose" &&
      handling !== "strict" &&
      handling !== "stop-before-partial"
    ) {
      fail("type");
    }
    return handling;
  }
  function skipAsciiWhitespace(text, index) {
    while (index < text.length) {
      const char = text[index];
      if (
        char !== "\t" &&
        char !== "\n" &&
        char !== "\f" &&
        char !== "\r" &&
        char !== " "
      ) {
        break;
      }
      index += 1;
    }
    return index;
  }
  // DecodeBase64Chunk; null stands for a thrown SyntaxError.
  function decodeChunk(chunk, throwOnExtraBits) {
    const length = chunk.length;
    const padded =
      length === 2 ? chunk + "AA" : length === 3 ? chunk + "A" : chunk;
    let bits = 0;
    for (const char of padded) bits = bits * 64 + standard.indexOf(char);
    const bytes = [
      Math.floor(bits / 65536),
      Math.floor(bits / 256) % 256,
      bits % 256,
    ];
    if (length === 2) {
      if (throwOnExtraBits && bytes[1] !== 0) return null;
      return [bytes[0]];
    }
    if (length === 3) {
      if (throwOnExtraBits && bytes[2] !== 0) return null;
      return [bytes[0], bytes[1]];
    }
    return bytes;
  }
  // FromBase64.
  function fromBase64(text, alphabet, lastChunkHandling, maxLength) {
    if (maxLength === 0) return { bytes: [], error: false, read: 0 };
    let read = 0;
    const bytes = [];
    let chunk = "";
    let index = 0;
    const length = text.length;
    const failed = () => ({ bytes, error: true, read });
    while (true) {
      index = skipAsciiWhitespace(text, index);
      if (index === length) {
        if (chunk.length > 0) {
          if (lastChunkHandling === "stop-before-partial") {
            return { bytes, error: false, read };
          }
          if (lastChunkHandling === "loose") {
            if (chunk.length === 1) return failed();
            bytes.push(...decodeChunk(chunk, false));
          } else {
            return failed();
          }
        }
        return { bytes, error: false, read: length };
      }
      let char = text[index];
      index += 1;
      if (char === "=") {
        if (chunk.length < 2) return failed();
        index = skipAsciiWhitespace(text, index);
        if (chunk.length === 2) {
          if (index === length) {
            if (lastChunkHandling === "stop-before-partial") {
              return { bytes, error: false, read };
            }
            return failed();
          }
          if (text[index] === "=") {
            index = skipAsciiWhitespace(text, index + 1);
          }
        }
        if (index < length) return failed();
        const decoded = decodeChunk(chunk, lastChunkHandling === "strict");
        if (decoded == null) return failed();
        bytes.push(...decoded);
        return { bytes, error: false, read: length };
      }
      if (alphabet === "base64url") {
        if (char === "+" || char === "/") return failed();
        if (char === "-") char = "+";
        else if (char === "_") char = "/";
      }
      if (!standard.includes(char)) return failed();
      const remaining = maxLength - bytes.length;
      if (
        (remaining === 1 && chunk.length === 2) ||
        (remaining === 2 && chunk.length === 3)
      ) {
        return { bytes, error: false, read };
      }
      chunk += char;
      if (chunk.length === 4) {
        bytes.push(...decodeChunk(chunk, false));
        chunk = "";
        read = index;
        if (bytes.length === maxLength) {
          return { bytes, error: false, read };
        }
      }
    }
  }
  // FromHex.
  function fromHex(text, maxLength) {
    const length = text.length;
    const bytes = [];
    let read = 0;
    if (length % 2 !== 0) return { bytes, error: true, read: 0 };
    while (read < length && bytes.length < maxLength) {
      const hexits = text.slice(read, read + 2);
      if (!/^[0-9A-Fa-f]{2}$/u.test(hexits)) {
        return { bytes, error: true, read };
      }
      read += 2;
      bytes.push(Number.parseInt(hexits, 16));
    }
    return { bytes, error: false, read };
  }
  function encode(view, length, alphabet, omit) {
    const digits =
      alphabet === "base64url"
        ? standard.replace("+", "-").replace("/", "_")
        : standard;
    let text = "";
    for (let index = 0; index < length; index += 3) {
      const count = Math.min(3, length - index);
      let bits = 0;
      for (let offset = 0; offset < 3; offset += 1) {
        bits = bits * 256 + (offset < count ? view[index + offset] : 0);
      }
      for (let digit = 0; digit < 4; digit += 1) {
        if (digit <= count) {
          text += digits[Math.floor(bits / 2 ** (18 - 6 * digit)) % 64];
        } else if (!omit) {
          text += "=";
        }
      }
    }
    return text;
  }
  function create(bytes) {
    const result = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) {
      result[index] = bytes[index];
    }
    return result;
  }
  function requireString(value) {
    if (typeof value !== "string") fail("type");
    return value;
  }
  function setResult(view, decoded) {
    for (let index = 0; index < decoded.bytes.length; index += 1) {
      view[index] = decoded.bytes[index];
    }
    if (decoded.error) fail("syntax");
    return { read: decoded.read, written: decoded.bytes.length };
  }
  const statics = {
    fromBase64(value) {
      // Reading arguments keeps the length at 1.
      const options = arguments[1];
      const text = requireString(value);
      const opts = getOptionsObject(options);
      const alphabet = alphabetOf(opts);
      const handling = lastChunkHandlingOf(opts);
      const decoded = fromBase64(text, alphabet, handling, 2 ** 53 - 1);
      if (decoded.error) fail("syntax");
      return create(decoded.bytes);
    },
    fromHex(value) {
      const decoded = fromHex(requireString(value), 2 ** 53 - 1);
      if (decoded.error) fail("syntax");
      return create(decoded.bytes);
    },
  };
  const methods = {
    toBase64() {
      // Reading arguments keeps the length at 0.
      const options = arguments[0];
      const view = validateUint8Array(this);
      const opts = getOptionsObject(options);
      const alphabet = alphabetOf(opts);
      const omit = Boolean(opts.omitPadding);
      return encode(view, boundedLength(view), alphabet, omit);
    },
    setFromBase64(value) {
      // Reading arguments keeps the length at 1.
      const options = arguments[1];
      const view = validateUint8Array(this);
      const text = requireString(value);
      const opts = getOptionsObject(options);
      const alphabet = alphabetOf(opts);
      const handling = lastChunkHandlingOf(opts);
      const length = boundedLength(view);
      return setResult(view, fromBase64(text, alphabet, handling, length));
    },
    toHex() {
      const view = validateUint8Array(this);
      const length = boundedLength(view);
      let text = "";
      for (let index = 0; index < length; index += 1) {
        text += view[index].toString(16).padStart(2, "0");
      }
      return text;
    },
    setFromHex(value) {
      const view = validateUint8Array(this);
      const text = requireString(value);
      return setResult(view, fromHex(text, boundedLength(view)));
    },
  };
  for (const [target, source] of [
    [Uint8Array, statics],
    [Uint8Array.prototype, methods],
  ]) {
    for (const [key, value] of Object.entries(source)) {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        value,
        writable: true,
      });
    }
  }
})();
`;
