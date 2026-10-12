# Pastors LMS – Agent Guidelines

A learning management system for pastors and church leaders in East Africa.

## Stack
- Node.js + Express 4, EJS views, express-session, bcrypt
- Supabase (`config/supabase.js`) for auth/data; `.env` holds secrets (never print or commit it)
- Deployed on Vercel (`vercel.json`)
- Scripts: `npm run dev` (watch mode), `npm start`, `npm run seed`

## Layout
- `server.js` – app entry, middleware, route mounting
- `routes/` – Express routers (e.g. `courses.js` dashboard, course detail, topic toggle)
- `middleware/` – auth (`requireAuth`)
- `views/` and `views/partials/` – EJS templates (header/footer are partials)
- `public/css/` (`global.css` plus per-page files such as `course.css`, `login.css`), `public/js/app.js`, `public/images/`
- `data/courses.json` – course/module/task progress (read and written by `routes/courses.js`)
- `data/course-content.js` – rich lesson content keyed by course id, then module id
- `migrations/`, `supabase/` – database schema
- `scripts/` – maintenance scripts

## Conventions
- Put shared styles in `global.css`; page-specific styles go in that page's CSS file. Don't add inline styles.
- Keep routes thin; reuse helpers such as `getLMSData` and `enrichCourseStats`.
- Protect authenticated routes with `requireAuth`.
- Give interactive elements unique, descriptive IDs.
- Images must be WebP. Run `node scripts/convert-images-to-webp.js` after adding jpg/png files (see the `optimize-images` skill).
- Keep the tone of lesson content pastoral and doctrinally sound (Reformed, Scripture-centered).

## Logo / branding
- One primary full-color logo. Use a white variant on dark backgrounds (footer, login hero, banners) and a dark or monochrome variant for print and certificates.
- Choose the variant by background, never by page or preference.

## Safety
- Don't commit `.env` or `cookies.txt`.
- Don't hand-edit `package-lock.json`.
