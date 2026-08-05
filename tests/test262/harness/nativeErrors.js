/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The reviewed cause case needs the seven constructors whose first argument
// is a message. Later error families in the upstream helper are not executed.
var nativeErrors = [
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
];
