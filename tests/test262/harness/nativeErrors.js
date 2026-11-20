/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

/* Oseo source license
 * Copyright (C) 2026 Jordan Harband. All rights reserved.
 * The Test262 portions retain the BSD license in LICENSE.
 */

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
