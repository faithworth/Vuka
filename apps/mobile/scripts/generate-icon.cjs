// Generates the Vuka Music app icons from assets/icon-source.svg.
//   assets/icon.png          1024x1024, opaque (iOS + legacy Android icon)
//   assets/adaptive-icon.png 1024x1024, transparent, V kept inside the Android safe zone
// Runs on `npm install` (postinstall), so EAS and CI builds always have fresh icons.
const path = require('path');
const sharp = require('sharp');

const assets = path.join(__dirname, '..', 'assets');
const source = path.join(assets, 'icon-source.svg');

const V_PATH =
  'M16,15 C 11,37 25,59 46,82 C 48,85 52,85 54,82 C 75,59 89,37 84,15 L 71,15 C 77,34 66,53 50,71 C 34,53 23,34 29,15 Z';

// Foreground for Android adaptive icons: transparent background, logo scaled to ~60%
// so it is not clipped by circle / squircle masks.
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g transform="translate(50 50) scale(0.6) translate(-50 -50.5)">
    <path d="${V_PATH}" fill="#A0E87C"/>
    <circle cx="50" cy="86" r="3.6" fill="#E8C87C"/>
  </g>
</svg>`;

async function main() {
  await sharp(source)
    .resize(1024, 1024, { fit: 'fill' })
    .flatten({ background: '#0A0A0A' }) // App Store rejects icons with transparency
    .png()
    .toFile(path.join(assets, 'icon.png'));

  await sharp(Buffer.from(foregroundSvg))
    .resize(1024, 1024, { fit: 'fill' })
    .png()
    .toFile(path.join(assets, 'adaptive-icon.png'));

  console.log('Generated Vuka Music icon.png and adaptive-icon.png (1024x1024).');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
