// Adapted from the Are We Fast Yet? SOM benchmarks.
// https://github.com/smarr/are-we-fast-yet
//
// Copyright (c) 2015-2016 Stefan Marr <git@stefan-marr.de>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// eslint-disable-next-line no-unused-vars -- Preparation appends its caller.
function benchmark() {
  let count = 0;
  const values = Array.from({ length: 6 }, () => 0);
  function swap(i, j) {
    const temporary = values[i];
    values[i] = values[j];
    values[j] = temporary;
  }
  function permute(n) {
    count += 1;
    if (n !== 0) {
      const n1 = n - 1;
      permute(n1);
      for (let i = n1; i >= 0; i -= 1) {
        swap(n1, i);
        permute(n1);
        swap(n1, i);
      }
    }
  }
  permute(6);
  return count;
}
