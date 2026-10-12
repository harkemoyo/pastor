---
name: optimize-images
description: Use when images are added to public/images, or when asked to optimize or convert images to WebP in the Pastors LMS.
---

# Image optimization

`scripts/convert-images-to-webp.js` converts every jpg, jpeg and png in `public/images` to WebP (quality 82). It strips metadata, deletes the originals, and rewrites references in `views`, `public/css`, `public/js`, `routes`, `data`, `middleware` and `server.js`. SVG and ICO files are left alone.

## Steps
1. Make sure the new images are in `public/images/`.
2. Preview: `node scripts/convert-images-to-webp.js --dry-run`
3. Review the list. Check that nothing is converted that should not be.
4. Run it: `node scripts/convert-images-to-webp.js`
5. Check that references were updated (`grep` for the old extensions) and that pages still load images.
6. Commit the converted files and the changed references together.

If `sharp` is missing, run `npm install`. It is already in `package.json`.
