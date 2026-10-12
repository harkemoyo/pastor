---
name: elderly-friendly-review
description: Use when building or changing any page, form, or style in the Pastors LMS, or when asked to check that the app is simple and easy for elderly users.
---

# Elderly-friendly review

Many users are elderly pastors, often on basic phones with slow connections. Simple beats clever. Review every UI change against this checklist and fix failures instead of only reporting them.

## Checklist
1. **Text size:** body text is at least 18px (1.125rem). Buttons and labels are at least 16px. Nothing important is below 14px. Use `rem`, not `px`, so browser zoom works.
2. **Contrast:** text meets WCAG AA (4.5:1). Never use light grey on white. Never use color alone to show status; add a word or icon.
3. **Touch targets:** buttons and links are at least 48x48px, with space between them to avoid mis-taps.
4. **One task per screen:** one main action per page, with a clear label such as "Continue" or "Start lesson". No hover-only menus, no icon-only buttons without a text label.
5. **Plain language:** short sentences. Say "Sign in", not "Authenticate". Avoid jargon and abbreviations.
6. **Forms:** visible labels above fields (not placeholder-only), the correct `type` and `autocomplete`, a "show password" option, and errors that say what to do ("Enter your phone number").
7. **Navigation:** at most 5 top-level items, always visible, with a clear way back. The current page is clearly marked.
8. **Motion:** no auto-playing carousels, flashing, or fast animations. Respect `prefers-reduced-motion`.
9. **Feedback:** after each action (save, progress, sign in), show a clear message. Avoid timeouts that vanish quickly.
10. **Slow networks:** keep pages light. Images are WebP, use `width` and `height`, and `loading="lazy"` below the fold.
11. **Accessibility basics:** one `<h1>` per page, labelled inputs, `alt` text on images, visible focus outline, keyboard operable. Follow the unique-ID rule in `AGENTS.md`.

## How to run it
1. Identify the changed views in `views/` and styles in `public/css/`.
2. Go through the checklist, item by item, and note each failure with the file and line.
3. Fix failures. Put shared fixes in `global.css`, with no inline styles.
4. Re-check at a 360px-wide viewport and at 200% zoom.
5. Report what was fixed and anything that needs a design decision.
