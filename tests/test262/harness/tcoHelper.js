/* eslint-disable no-unused-vars -- Harness globals are used after assembly. */

// The upstream tail call depth, unchanged in value. The repository
// formatter owns every JavaScript file here, so the frontmatter is
// omitted; the reviewed definition list still matches upstream. The
// depth stays at 100,000 so a case proves that a tail call releases its
// caller's frame rather than that a short chain fits the call limit.
// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
var $MAX_ITERATIONS = 100000;
