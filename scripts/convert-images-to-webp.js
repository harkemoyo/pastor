#!/usr/bin/env node
/**
 * Converts every raster image in public/images (jpg, jpeg, png) to WebP,
 * deletes the originals, and rewrites references in the source code.
 *
 * - Metadata (EXIF, ICC, GPS, AI-generation info) is stripped: sharp drops it
 *   by default and we never call withMetadata().
 * - SVG and ICO files are left alone (favicons/vectors don't benefit).
 *
 * Usage:
 *   npm install sharp
 *   node scripts/convert-images-to-webp.js --dry-run   # preview only
 *   node scripts/convert-images-to-webp.js             # do it
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const DRY_RUN = process.argv.includes('--dry-run');
const QUALITY = 82;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png']);
const CODE_EXTS = new Set(['.ejs', '.html', '.css', '.js', '.json']);
const CODE_DIRS = ['views', 'public/css', 'public/js', 'routes', 'data', 'middleware'];
const CODE_FILES = ['server.js'];

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('Missing dependency. Run: npm install sharp');
  process.exit(1);
}

function walk(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p, filter);
    return filter(p) ? [p] : [];
  });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function main() {
  const images = walk(IMAGES_DIR, (p) => IMAGE_EXTS.has(path.extname(p).toLowerCase()));
  const renames = []; // { from: 'name.png', to: 'name.webp' } (basenames)
  let before = 0;
  let after = 0;

  for (const file of images) {
    const out = file.replace(/\.[^.]+$/, '.webp');
    const inSize = fs.statSync(file).size;
    before += inSize;

    if (DRY_RUN) {
      console.log(`[dry-run] ${path.relative(ROOT, file)} -> ${path.basename(out)}`);
    } else {
      // rotate() applies EXIF orientation before metadata is discarded
      await sharp(file).rotate().webp({ quality: QUALITY }).toFile(out);
      after += fs.statSync(out).size;
      fs.unlinkSync(file);
      console.log(`converted ${path.relative(ROOT, file)} (${(inSize / 1024).toFixed(0)}KB)`);
    }
    renames.push({ from: path.basename(file), to: path.basename(out) });
  }

  // Update references. Longest names first; the lookahead prevents
  // "logo.jpg" from matching inside "logo.jpg.jpeg".
  renames.sort((a, b) => b.from.length - a.from.length);
  const codeFiles = [
    ...CODE_DIRS.flatMap((d) => walk(path.join(ROOT, d), (p) => CODE_EXTS.has(path.extname(p)))),
    ...CODE_FILES.map((f) => path.join(ROOT, f)).filter(fs.existsSync),
  ];

  for (const file of codeFiles) {
    let text = fs.readFileSync(file, 'utf8');
    const original = text;
    for (const { from, to } of renames) {
      const variants = new Set([from, encodeURIComponent(from), encodeURI(from)]);
      for (const v of variants) {
        const toV = v === from ? to : v === encodeURIComponent(from) ? encodeURIComponent(to) : encodeURI(to);
        text = text.replace(new RegExp(escapeRe(v) + '(?![\\w.])', 'g'), toV);
      }
    }
    if (text !== original) {
      console.log(`${DRY_RUN ? '[dry-run] would update' : 'updated'} references in ${path.relative(ROOT, file)}`);
      if (!DRY_RUN) fs.writeFileSync(file, text);
    }
  }

  if (!DRY_RUN) {
    console.log(`\nDone. ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
