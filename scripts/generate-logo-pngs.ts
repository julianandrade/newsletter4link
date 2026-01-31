import sharp from "sharp";
import { readFileSync } from "fs";
import { join } from "path";

const sizes = [48, 128, 512];
const svgPath = join(process.cwd(), "public/images/ai-radar-logo.svg");
const outputDir = join(process.cwd(), "public/images");

async function generateLogos() {
  const svgBuffer = readFileSync(svgPath);

  for (const size of sizes) {
    const outputPath = join(outputDir, `ai-radar-logo-${size}.png`);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated: ai-radar-logo-${size}.png`);
  }

  console.log("\nAll logo sizes generated successfully!");
}

generateLogos().catch(console.error);
