const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const source = path.join(__dirname, 'icon-source.svg');
const output = path.join(__dirname, 'icon.png');

sharp(source)
  .resize(1024, 1024, { fit: 'fill' })
  .png()
  .toFile(output)
  .then(() => console.log('Generated Vuka Music 1024x1024 app icon.'))
  .catch(err => { console.error(err); process.exit(1); });
