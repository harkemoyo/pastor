---
name: qa-check
description: Use before committing or deploying the Pastors LMS, or when asked to verify that every page, route and form works.
---

# QA check

Confirm that everything works before a commit or deploy. Run the app with `npm run dev` and test the real pages. Do not only read the code.

## Route map
- **Public:** `/` (landing, or dashboard when signed in), `/login`, `/register`, `/register-success`, `/logout`
- **Signed-in student:** `/` dashboard, `/courses/:id`, `POST /courses/:id/modules/:moduleId/toggle`
- **Onboarding:** `/onboarding`, `POST /onboarding/step/1..5`, `/onboarding/churches/search`, `/onboarding/complete`
- **Admin** (`requireAdmin`): `/admin`, `/admin/dashboard`, `/admin/students` (list, new, edit, approve, reject, status, reset-password, archive, courses), `/admin/courses` (list, new, edit, archive), `/admin/approvals`

## Steps
1. **Start clean:** `npm run dev` and confirm there are no startup errors or missing env vars. Never print `.env`.
2. **Static checks:** `node --check` on changed JS files. Look for broken `include` paths and undefined variables in EJS. Check that every image path under `public/images` exists.
3. **Public flow:** landing page, register, login, wrong password (clear error), logout.
4. **Student flow:** dashboard stats, open a course, open each topic type (doc, quiz, assignment), use the progress toggle at 0 and at max.
5. **Auth guards:** while signed out, `/courses/1` and `/admin` must redirect to login. A student must not reach `/admin/*`.
6. **Admin flow:** approve and reject, create and edit a student, create and edit a course, archive.
7. **Error pages:** an unknown URL shows the 404 page, and a bad course id does not crash.
8. **Responsive:** check at 360px and 1280px wide.
9. **Assets:** images are WebP (see `optimize-images`), no 404s in the network log, no console errors.
10. **Secrets:** `git status` must not list `.env` or `cookies.txt`.

## Report
List each area as pass or fail with the file and line for any failure. Fix the failures that are clearly bugs. Ask before changing behavior.
