---
name: course-content
description: Use when adding or editing a course, module, topic, lesson, quiz or assignment in the Pastors LMS.
---

# Editing course content

Course data lives in two places that must stay in sync.

## 1. Course structure – `data/courses.json`
- `courses[]` entries have `id`, `code`, `title`, `status` (`current` or `past`) and `modules[]`.
- Each module has `id`, `total_topics` and `completed_topics`.
- Progress percentages are computed by `enrichCourseStats` in `routes/courses.js`.
- `tasks[]` link to a course through `course_id`.

## 2. Lesson content – `data/course-content.js`
- `courseContent[courseId][moduleId].topics` is an array of topics.
- Topic shape: `{ id: '<module>-<n>', type: 'doc' | 'quiz' | 'assignment' | ..., title, subtitle, bannerTitle, contentHtml }`. Quizzes and assignments may also have `dueDate`.
- `contentHtml` is a template literal of HTML. Escape `&` as `&amp;`. Reuse existing classes such as `theology-highlight-box`, `assignment-header-meta`, `due-badge` and `points-badge`.
- Modules with no hand-written entry get generated topics from `getCourseModulesWithTopics`. Write explicit topics only to override the defaults.

## Steps
1. Read the neighbouring course or module in both files and copy its style.
2. Add or edit the module in `courses.json`. Set `total_topics` to the real topic count, which is 5 for generated modules.
3. Add or edit the topics in `course-content.js`. Topic ids must be unique.
4. Check `routes/courses.js` (`/courses/:id`) for any change needed. It usually needs none.
5. Run `npm run dev` and open `/courses/<id>`. Confirm the topics render and the progress toggle works.
6. Run the `optimize-images` skill if you added images.
