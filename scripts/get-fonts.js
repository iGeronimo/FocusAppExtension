// Fetch Roboto Mono (400,700) woff2 from Google Fonts CSS and save into fonts/
// Usage: node scripts/get-fonts.js

const fs = require('fs');
const path = require('path');
const https = require('https');

function fetchUrl(url, headers={}){
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // handle redirect
        return resolve(fetchUrl(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main(){
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap';
  const cssBuf = await fetchUrl(cssUrl, { 'User-Agent': 'Mozilla/5.0' });
  const css = cssBuf.toString('utf8');
  // Parse @font-face blocks
  const blocks = css.split('@font-face').slice(1).map(b => '@font-face' + b);
  const outDir = path.join(__dirname, '..', 'fonts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  for (const block of blocks){
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const urlMatch = block.match(/url\(([^)]+\.woff2)\)/);
    if (!weightMatch || !urlMatch) continue;
    const weight = weightMatch[1];
    let url = urlMatch[1].replace(/"|'/g, '');
    // Some CSS provides relative protocol
    if (url.startsWith('//')) url = 'https:' + url;
    const buf = await fetchUrl(url, { 'User-Agent': 'Mozilla/5.0' });
    const outPath = path.join(outDir, `roboto-mono-${weight}.woff2`);
    fs.writeFileSync(outPath, buf);
    console.log('Saved', outPath);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
