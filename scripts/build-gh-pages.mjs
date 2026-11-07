import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildVite } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const firebaseConfigPath = path.join(rootDir, 'firebase-applet-config.json');
const distDir = path.join(rootDir, 'dist');
const docsDir = path.join(rootDir, 'docs');

async function runCleanProductionBuild() {
  const hadOriginalConfig = fs.existsSync(firebaseConfigPath);
  const originalConfigContent = hadOriginalConfig
    ? fs.readFileSync(firebaseConfigPath, 'utf-8')
    : null;

  try {
    // 1. Strip test Firebase keys before building production bundle (Gatekeep 2)
    fs.writeFileSync(firebaseConfigPath, '{}\n', 'utf-8');

    // 2. Run Vite production build into dist/
    await buildVite({
      root: rootDir,
      logLevel: 'info',
    });

    // 3. Add GitHub Pages SPA fallback (404.html) and .nojekyll
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      fs.copyFileSync(indexHtmlPath, path.join(distDir, '404.html'));
    }
    fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf-8');

    // 4. Mirror clean production build into docs/ so native AI Studio GitHub commits include ready-to-serve GitHub Pages files
    if (fs.existsSync(docsDir)) {
      fs.rmSync(docsDir, { recursive: true, force: true });
    }
    fs.cpSync(distDir, docsDir, { recursive: true });
    console.log(
      'Clean production bundle prepared in dist/ and docs/ (Gatekeep 2 verified).'
    );
  } finally {
    // 5. Always restore original firebase-applet-config.json for AI Studio Preview
    if (hadOriginalConfig && originalConfigContent !== null) {
      fs.writeFileSync(firebaseConfigPath, originalConfigContent, 'utf-8');
    }
  }
}

runCleanProductionBuild().catch((err) => {
  console.error('Production build failed:', err);
  process.exit(1);
});
