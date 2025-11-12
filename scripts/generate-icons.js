// Node script to generate outlined PNG icons from the existing SVG logo.
// Usage: node scripts/generate-icons.js
// Requires: node >=14
// This script uses sharp; ensure it's installed (npm i sharp).

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sizes = [16, 32, 48, 128];
const svgSource = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n  <circle cx="64" cy="64" r="63" fill="white" stroke="black" stroke-width="2"/>\n  <circle cx="64" cy="64" r="42" fill="black"/>\n</svg>`;

async function run(){
  const outDir = path.join(__dirname, '..', 'icons');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  for(const size of sizes){
    const pngPath = path.join(outDir, `icon-${size}.png`);
    await sharp(Buffer.from(svgSource))
      .resize(size, size)
      .png()
      .toFile(pngPath);
    console.log('Generated', pngPath);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
