import "./a.mjs";
console.log("b throws");
throw new RangeError("cycle member failed");
