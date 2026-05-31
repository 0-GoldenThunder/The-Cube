import fs from 'fs';
import path from 'path';

const srcDir = './ezgif-89f8b9f6dbc62c4d-png-split';
const destDir = './public/assets/frames';

// Clean out destination directory entirely to prevent leftover files
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

console.log('Copying and renaming all 240 frames from ezgif-frame-001.png to ezgif-frame-240.png...');
let destIndex = 1;
for (let i = 1; i <= 240; i++) {
  const srcFileName = `ezgif-frame-${String(i).padStart(3, '0')}.png`;
  const destFileName = `frame_${String(destIndex).padStart(4, '0')}.jpg`;
  
  const srcPath = path.join(srcDir, srcFileName);
  const destPath = path.join(destDir, destFileName);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    destIndex++;
  } else {
    console.warn(`Source frame not found: ${srcPath}`);
  }
}
console.log(`Asset pipeline completed! Total frames copied: ${destIndex - 1}`);
