const sharp = require("sharp");

// Create gradient image for headers (135deg gradient from #1e3a8a to #3b82f6)
async function createGradient() {
  const width = 1000;
  const height = 85;

  // Create SVG with gradient
  const svgGradient = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)"/>
    </svg>
  `;

  // Convert to PNG
  await sharp(Buffer.from(svgGradient))
    .png()
    .toFile("/sessions/gracious-brave-mayer/header_gradient.png");

  console.log("Gradient header created!");

  // Also create gradient for title slide (larger, full background style)
  const titleWidth = 1000;
  const titleHeight = 563; // 16:9 ratio

  const svgTitleGradient = `
    <svg width="${titleWidth}" height="${titleHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#titleGrad)"/>
    </svg>
  `;

  await sharp(Buffer.from(svgTitleGradient))
    .png()
    .toFile("/sessions/gracious-brave-mayer/title_gradient.png");

  console.log("Title gradient created!");
}

createGradient().catch(console.error);
