// Build electron TypeScript files to dist-electron/
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
console.log('🔨 Building Electron main process...');

try {
  execSync('npx tsc -p tsconfig.electron.json', {
    cwd: root,
    stdio: 'inherit',
  });

  // Copy non-TS assets to dist-electron/
  const electronDir = path.join(root, 'electron');
  const distDir = path.join(root, 'dist-electron');
  const assetFiles = fs.readdirSync(electronDir).filter(f => f.endsWith('.html') || f.endsWith('.json'));
  for (const file of assetFiles) {
    fs.copyFileSync(path.join(electronDir, file), path.join(distDir, file));
  }
  if (assetFiles.length > 0) {
    console.log(`📄 Copied ${assetFiles.length} Electron asset file(s) to dist-electron/`);
  }

  console.log('✅ Electron build complete → dist-electron/');
} catch (e) {
  console.error('❌ Electron build failed');
  process.exit(1);
}
