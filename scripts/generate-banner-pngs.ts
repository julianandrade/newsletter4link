import sharp from "sharp";
import { readFileSync } from "fs";
import { join } from "path";

const banners = [
  { name: "ai-radar-email-banner", width: 600, height: 200 },
  { name: "ai-radar-sharepoint-hero", width: 1920, height: 600 },
];

const baseDir = join(process.cwd(), "public/images");

async function generateBanners() {
  for (const banner of banners) {
    const svgPath = join(baseDir, `${banner.name}.svg`);
    const outputPath = join(baseDir, `${banner.name}.png`);

    const svgBuffer = readFileSync(svgPath);

    await sharp(svgBuffer)
      .resize(banner.width, banner.height)
      .png()
      .toFile(outputPath);

    console.log(`Generated: ${banner.name}.png (${banner.width}x${banner.height})`);
  }

  console.log("\nAll banners generated successfully!");
}

generateBanners().catch(console.error);
