# Project Glossary (glossary.md)

This glossary defines standard academic terms, features, and technical concepts utilized across the NoteMitra codebase.

---

## Academic Domain Terms
- **Branch**: The engineering/academic stream of study (e.g. CSE, ECE, ME, CE).
- **Semester**: The current academic term, typically numbered 1 through 8.
- **Module**: The individual chapter or sub-section of a study syllabus (typically Modules 1-5).
- **Note**: A PDF document representing study resources uploaded by users.

## Reputation & Moderation Terms
- **Reputation**: Gamified points awarded to active uploaders. Points increase when notes are upvoted and decrease if downvoted or flagged.
- **Uploader Role**: Users who publish material; roles include student, teacher, or admin.
- **Report**: Flag raised against a note due to poor quality, copyright issue, or wrong classification.

## Technical Terms
- **GridFS**: MongoDB storage engine protocol that splits files larger than 16MB into binary chunks (stores metadata in `fs.files` and chunks in `fs.chunks`).
- **Cloudinary**: External CDN cloud media service used for caching, uploading, and globally delivering PDF attachments.
- **Standalone mode**: A Next.js build-time configuration that compiles only the production dependencies into a separate folder, excluded in development to prevent Hot Module Replacement (HMR) problems.
