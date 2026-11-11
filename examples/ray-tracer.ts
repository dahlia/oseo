import process from "node:process";

const args = process.argv.slice(2);
const width = args.length > 0 ? Number(args[0]) : 32;
const height = args.length > 1 ? Number(args[1]) : 24;
if (
  args.length > 2 ||
  !Number.isInteger(width) ||
  !Number.isInteger(height) ||
  width < 1 ||
  width > 512 ||
  height < 1 ||
  height > 512
) {
  process.stderr.write("usage: ray-tracer.ts [width height] (1..512)\n");
  process.exit(2);
}

// A pinhole camera looks toward one sphere at (0, 0, -1), radius 0.5.
let image = "P3\n" + width + " " + height + "\n255\n";
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dx = ((2 * (x + 0.5)) / width - 1) * (width / height);
    const dy = 1 - (2 * (y + 0.5)) / height;
    const lengthSquared = dx * dx + dy * dy + 1;
    const discriminant = 1 - 0.75 * lengthSquared;
    let red = 0;
    let green = 0;
    let blue = 0;
    if (discriminant >= 0) {
      const t = (1 - Math.sqrt(discriminant)) / lengthSquared;
      red = (2 * t * dx + 1) / 2;
      green = (2 * t * dy + 1) / 2;
      blue = (2 * (1 - t) + 1) / 2;
    } else {
      const blend = (dy / Math.sqrt(lengthSquared) + 1) / 2;
      red = 1 - 0.5 * blend;
      green = 1 - 0.3 * blend;
      blue = 1;
    }
    image += Math.floor(255.999 * red) + " ";
    image += Math.floor(255.999 * green) + " ";
    image += Math.floor(255.999 * blue) + "\n";
  }
}
process.stdout.write(image);
