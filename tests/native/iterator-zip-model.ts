/*
 * An independent model of Iterator.zip and Iterator.zipKeyed, written
 * from the joint iteration proposal text that ADR 0032 admits. Neither
 * pinned reference host implements the two functions, so the reference
 * runs prepend this source, which installs the model in place of
 * whatever the host has. The iterator-zip fixtures run it on Node.js and
 * Deno, except one Deno-only probe, and the property suite on Node.js.
 *
 * The model's result is a %IteratorHelperPrototype% object: it maps an
 * internal iterator through the identity function with
 * Iterator.prototype.map. The helper then supplies the [[GeneratorState]]
 * rules: a throw or a done result completes it without a close, `return`
 * before the first step completes it and then closes, and `return` at a
 * yield closes while it is executing. The internal iterator's `next` is
 * one run of the IteratorZip closure and its `return` is the closure's
 * IteratorCloseAll of a return completion, which is what both
 * %IteratorHelperPrototype%.return paths perform.
 */
export const iteratorZipModel: string = String.raw`
(() => {
  const DONE = {};
  const isObject = (value) =>
    (typeof value === "object" && value !== null) ||
    typeof value === "function";
  const map = Iterator.prototype.map;
  const identity = (value) => value;
  const throwCompletion = (value) => ({ type: "throw", value });
  const returnCompletion = { type: "return" };

  function getIteratorDirect(iterator) {
    return { iterator, next: iterator.next };
  }

  // GetIterator(value, sync).
  function getIterator(value) {
    const method = value[Symbol.iterator];
    if (method === undefined || method === null) {
      throw new TypeError("not iterable");
    }
    if (typeof method !== "function") {
      throw new TypeError("Symbol.iterator is not callable");
    }
    const iterator = Reflect.apply(method, value, []);
    if (!isObject(iterator)) throw new TypeError("iterator is not an object");
    return getIteratorDirect(iterator);
  }

  // GetIteratorFlattenable(value, reject-primitives).
  function getIteratorFlattenable(value) {
    if (!isObject(value)) throw new TypeError("iterable is not an object");
    const method = value[Symbol.iterator];
    let iterator = value;
    if (method !== undefined && method !== null) {
      if (typeof method !== "function") {
        throw new TypeError("Symbol.iterator is not callable");
      }
      iterator = Reflect.apply(method, value, []);
    }
    if (!isObject(iterator)) throw new TypeError("iterator is not an object");
    return getIteratorDirect(iterator);
  }

  function stepResult(record) {
    const result = Reflect.apply(record.next, record.iterator, []);
    if (!isObject(result)) throw new TypeError("result is not an object");
    return result;
  }

  // IteratorStepValue.
  function stepValue(record) {
    const result = stepResult(record);
    return result.done ? DONE : result.value;
  }

  // IteratorStep: true when done; the value is never read.
  function step(record) {
    return Boolean(stepResult(record).done);
  }

  // IteratorClose(record, completion), returning the new completion.
  function close(record, completion) {
    let inner;
    try {
      const method = record.iterator.return;
      if (method === undefined || method === null) return completion;
      if (typeof method !== "function") {
        throw new TypeError("return is not callable");
      }
      const value = Reflect.apply(method, record.iterator, []);
      inner = { type: "normal", value };
    } catch (error) {
      inner = throwCompletion(error);
    }
    if (completion.type === "throw") return completion;
    if (inner.type === "throw") return inner;
    if (!isObject(inner.value)) {
      return throwCompletion(new TypeError("return result is not an object"));
    }
    return completion;
  }

  // IteratorCloseAll(records, completion), last record first.
  function closeAll(records, completion) {
    let current = completion;
    for (let index = records.length - 1; index >= 0; index -= 1) {
      current = close(records[index], current);
    }
    if (current.type === "throw") throw current.value;
  }

  function readOptions(options) {
    if (options !== undefined && !isObject(options)) {
      throw new TypeError("options is not an object");
    }
    let mode = options === undefined ? undefined : options.mode;
    if (mode === undefined) mode = "shortest";
    if (mode !== "shortest" && mode !== "longest" && mode !== "strict") {
      throw new TypeError("invalid mode");
    }
    let padding;
    if (mode === "longest") {
      padding = options === undefined ? undefined : options.padding;
      if (padding !== undefined && !isObject(padding)) {
        throw new TypeError("padding is not an object");
      }
    }
    return { mode, padding };
  }

  // IteratorZip(iters, mode, padding, finishResults).
  function iteratorZip(iters, mode, padding, finishResults) {
    const count = iters.length;
    const openIters = iters.slice();
    const remove = (record) => {
      openIters.splice(openIters.indexOf(record), 1);
    };
    const underlying = {
      next() {
        if (count === 0) return { done: true };
        const results = [];
        for (let index = 0; index < count; index += 1) {
          const record = iters[index];
          let result;
          if (record === null) {
            result = padding[index];
          } else {
            try {
              result = stepValue(record);
            } catch (error) {
              remove(record);
              closeAll(openIters, throwCompletion(error));
            }
            if (result === DONE) {
              remove(record);
              if (mode === "shortest") {
                closeAll(openIters, returnCompletion);
                return { done: true };
              }
              if (mode === "strict") {
                if (index !== 0) {
                  closeAll(
                    openIters,
                    throwCompletion(new TypeError("unequal lengths")),
                  );
                }
                for (let other = 1; other < count; other += 1) {
                  let done;
                  try {
                    done = step(iters[other]);
                  } catch (error) {
                    remove(iters[other]);
                    closeAll(openIters, throwCompletion(error));
                  }
                  if (!done) {
                    closeAll(
                      openIters,
                      throwCompletion(new TypeError("unequal lengths")),
                    );
                  }
                  remove(iters[other]);
                }
                return { done: true };
              }
              if (openIters.length === 0) return { done: true };
              iters[index] = null;
              result = padding[index];
            }
          }
          results.push(result);
        }
        return { done: false, value: finishResults(results) };
      },
      return() {
        closeAll(openIters, returnCompletion);
        return {};
      },
    };
    return Reflect.apply(map, underlying, [identity]);
  }

  const methods = {
    zip(iterables) {
      const options = arguments[1];
      if (!isObject(iterables)) throw new TypeError("iterables");
      const { mode, padding: paddingOption } = readOptions(options);
      const iters = [];
      const input = getIterator(iterables);
      while (true) {
        let next;
        try {
          next = stepValue(input);
        } catch (error) {
          closeAll(iters, throwCompletion(error));
        }
        if (next === DONE) break;
        let record;
        try {
          record = getIteratorFlattenable(next);
        } catch (error) {
          closeAll([input, ...iters], throwCompletion(error));
        }
        iters.push(record);
      }
      const padding = [];
      if (mode === "longest") {
        if (paddingOption === undefined) {
          for (const _ of iters) padding.push(undefined);
        } else {
          let paddingIter;
          try {
            paddingIter = getIterator(paddingOption);
          } catch (error) {
            closeAll(iters, throwCompletion(error));
          }
          let usingIterator = true;
          for (let index = 0; index < iters.length; index += 1) {
            if (usingIterator) {
              let next;
              try {
                next = stepValue(paddingIter);
              } catch (error) {
                closeAll(iters, throwCompletion(error));
              }
              if (next === DONE) usingIterator = false;
              else padding.push(next);
            }
            if (!usingIterator) padding.push(undefined);
          }
          if (usingIterator) {
            const completion = close(paddingIter, { type: "normal" });
            if (completion.type === "throw") closeAll(iters, completion);
          }
        }
      }
      return iteratorZip(iters, mode, padding, (results) => results.slice());
    },
    zipKeyed(iterables) {
      const options = arguments[1];
      if (!isObject(iterables)) throw new TypeError("iterables");
      const { mode, padding: paddingOption } = readOptions(options);
      const iters = [];
      const keys = [];
      for (const key of Reflect.ownKeys(iterables)) {
        let descriptor;
        try {
          descriptor = Reflect.getOwnPropertyDescriptor(iterables, key);
        } catch (error) {
          closeAll(iters, throwCompletion(error));
        }
        if (descriptor === undefined || !descriptor.enumerable) continue;
        let value;
        try {
          value = iterables[key];
        } catch (error) {
          closeAll(iters, throwCompletion(error));
        }
        if (value === undefined) continue;
        let record;
        try {
          record = getIteratorFlattenable(value);
        } catch (error) {
          closeAll(iters, throwCompletion(error));
        }
        keys.push(key);
        iters.push(record);
      }
      const padding = [];
      if (mode === "longest") {
        for (const key of keys) {
          if (paddingOption === undefined) {
            padding.push(undefined);
            continue;
          }
          try {
            padding.push(paddingOption[key]);
          } catch (error) {
            closeAll(iters, throwCompletion(error));
          }
        }
      }
      return iteratorZip(iters, mode, padding, (results) => {
        const object = Object.create(null);
        for (let index = 0; index < keys.length; index += 1) {
          Reflect.defineProperty(object, keys[index], {
            configurable: true,
            enumerable: true,
            value: results[index],
            writable: true,
          });
        }
        return object;
      });
    },
  };
  for (const name of ["zip", "zipKeyed"]) {
    Object.defineProperty(Iterator, name, {
      configurable: true,
      enumerable: false,
      value: methods[name],
      writable: true,
    });
  }
})();
`;
