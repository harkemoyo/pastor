---
name: branding-logo
description: Use when placing, swapping, or adding a logo anywhere in the Pastors LMS (header, footer, login, landing, certificates, favicon, manifest icons).
---

# Logo and branding

Rule: **one primary full-color logo. Choose the variant by background, never by page or preference.**

## Variants in `public/images/`
Files include `ida-logo.webp` and the `IDA-Logo-*` set (Colored, Complete, Full, Black, B&W). Several are duplicates (names ending in `copy`).

| Background | Use |
|---|---|
| Light | Primary full-color logo |
| Dark (footer, login hero, banners) | White variant |
| Print, certificates | Dark or monochrome (Black or B&W) |

## Steps
1. Look at the background behind the logo in the CSS and pick the variant from the table.
2. Reference the `.webp` file. Include `alt` text ("Pastors LMS") and `width` and `height`.
3. If a needed variant is missing (for example a white version), tell the user. Do not recolor with CSS filters unless asked.
4. If images were added, run the `optimize-images` skill.
5. Check contrast on the real page at mobile width. The logo must be clearly visible.
6. Flag duplicate `copy` files for the user to confirm. Do not delete them without asking.
