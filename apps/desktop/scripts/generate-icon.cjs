// Electron-builder cannot use an SVG as the Windows/macOS app icon.
// Render build/icon.svg to a 1024x1024 PNG; electron-builder converts it
// to .ico (Windows) and .icns (macOS) automatically.
const path = require('path');
const sharp = require('sharp');

const build = path.join(__dirname, '..', 'build');

sharp(path.join(build, 'icon.svg'))
  .resize(1024, 1024, { fit: 'fill' })
  .png()
  .toFile(path.join(build, 'icon.png'))
  .then(() => console.log('Generated desktop build/icon.png (1024x1024).'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
