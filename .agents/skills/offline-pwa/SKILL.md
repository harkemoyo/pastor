---
name: offline-pwa
description: Use when adding offline reading, a service worker, a web app manifest, or making the Pastors LMS installable as a mobile app (PWA or Capacitor).
---

# Offline reading and mobile app

Plan: make the site a **PWA first** (installable, offline lessons). Wrap it with Capacitor later for the app stores if needed. Do not rewrite the app natively.

## Stack facts
- Express serves `public/` statically and renders EJS on the server. Lessons come from `data/course-content.js` through `GET /courses/:id`.
- Pages require login (`requireAuth`), so cached pages must never be shown to a different user.
- The Vercel deployment has no persistent disk. Progress written to `data/courses.json` by the toggle route will not persist there; treat progress sync as a known gap.

## Steps
1. **Manifest:** add `public/manifest.webmanifest` (name, short_name, `start_url: "/"`, `display: "standalone"`, theme and background colors, 192px and 512px WebP or PNG icons made from the primary logo). Link it and set `<meta name="theme-color">` in `views/partials/header.ejs`.
2. **Service worker:** add `public/sw.js`, served from the root scope.
   - Precache the app shell: `global.css`, `app.js`, the logo, fonts, and an `/offline` page.
   - Lessons: network-first for `/courses/:id` pages, falling back to the cached copy. Save a copy each time a lesson is opened.
   - Static assets: cache-first with a versioned cache name (`pastors-lms-v1`). Delete old caches on `activate`.
   - Never cache `POST` requests, `/login`, `/logout`, `/register`, or `/admin/*`.
   - Clear caches on logout so a shared phone does not leak a previous user's lessons.
3. **Register** the worker from `public/js/app.js` or an inline-free script, guarded by `'serviceWorker' in navigator`.
4. **Offline UX (elderly-friendly):** show a plain banner such as "You are offline. You can still read lessons you opened before." Keep progress buttons visible. Queue progress toggles and sync when the connection returns, or say plainly that they will be saved later.
5. **"Download for offline" button** on a course page that fetches and caches all of its lesson pages, with a clear message when done and a size warning on mobile data.
6. **Test:** DevTools, Application tab, then Offline and Lighthouse PWA audit. Test on a real Android phone with airplane mode on. Confirm login and admin pages are not served from cache.
7. **App stores (later):** use Capacitor (`@capacitor/core`) pointing at the deployed URL or bundled `public/`. This needs app icons, a splash screen and store accounts.

## Checks before finishing
- Installable on Android Chrome ("Add to Home screen" appears).
- A lesson opened once is readable offline.
- Cached content is cleared on logout.
- Run the `elderly-friendly-review` skill on the new offline banner and button.
