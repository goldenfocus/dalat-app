import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SVG matching the design from app/opengraph-image.tsx
const svg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="50%" style="stop-color:#16213e"/>
      <stop offset="100%" style="stop-color:#0f3460"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:rgba(74,222,128,0.1)"/>
      <stop offset="70%" style="stop-color:transparent"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Glow effect -->
  <ellipse cx="600" cy="315" rx="300" ry="300" fill="url(#glow)"/>

  <!-- Pine trees at bottom (decorative) -->
  <g opacity="0.15">
    <polygon points="200,630 240,500 280,630" fill="#4ade80"/>
    <polygon points="320,630 360,450 400,630" fill="#4ade80"/>
    <polygon points="440,630 480,510 520,630" fill="#4ade80"/>
    <polygon points="560,630 600,430 640,630" fill="#4ade80"/>
    <polygon points="680,630 720,490 760,630" fill="#4ade80"/>
    <polygon points="800,630 840,440 880,630" fill="#4ade80"/>
    <polygon points="920,630 960,520 1000,630" fill="#4ade80"/>
  </g>

  <!-- Main text: ĐàLạt.app -->
  <text x="600" y="260"
        font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="72"
        font-weight="700"
        fill="white"
        text-anchor="middle"
        letter-spacing="-2">ĐàLạt.app</text>

  <!-- Tagline: Events · People · Moments · Love -->
  <text x="600" y="330"
        font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="32"
        fill="#94a3b8"
        text-anchor="middle">
    <tspan>Events</tspan>
    <tspan fill="#4ade80"> · </tspan>
    <tspan>People</tspan>
    <tspan fill="#4ade80"> · </tspan>
    <tspan>Moments</tspan>
    <tspan fill="#4ade80"> · </tspan>
    <tspan>Love</tspan>
  </text>

  <!-- Description -->
  <text x="600" y="400"
        font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="24"
        fill="#64748b"
        text-anchor="middle">Discover and organize events in Đà Lạt</text>
</svg>
`;

async function generateOgImage() {
  const outputPath = path.join(__dirname, "..", "public", "og-image.png");

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);

  console.log(`Generated OG image at: ${outputPath}`);
}

generateOgImage().catch(console.error);
