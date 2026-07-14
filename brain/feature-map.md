# Feature Map (feature-map.md)

This document maps user-facing product features directly to codebase files and system dependencies.

---

## 1. Authentication & Sign-in / Sign-up
- **Description**: Handles student onboarding, secure session retention, and Google OAuth SSO.
- **Frontend Files**:
  - [AuthContext.tsx](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/client/lib/context/AuthContext.tsx) (Session state context provider)
  - [signin/page.tsx](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/client/app/auth/signin/page.tsx) (Sign-in form)
  - [signup/page.tsx](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/client/app/auth/signup/page.tsx) (Sign-up form)
- **Backend Files**:
  - `server/src/routes/auth.ts` (Routing logic)
  - `server/src/controllers/auth.ts` (User controller logic)
- **Dependencies**: Mongoose `User` model, JSONWebToken, PassportJS.

---

## 2. Note Upload
- **Description**: Allows students/uploaders to submit note files (PDF) along with catalog descriptors.
- **Frontend Files**:
  - `client/app/upload/page.tsx` (Upload UI)
  - [api.ts:notesAPI.uploadPDF](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/client/lib/api.ts#L103) (Multipart file request dispatch)
- **Backend Files**:
  - `server/src/routes/notes.ts` (Upload routing)
  - `server/src/controllers/notes.ts` (Cloudinary file upload handlers)
- **Dependencies**: Multer middleware, Cloudinary SDK, Mongoose `Note` model.

---

## 3. Note Catalog & Search
- **Description**: Categorized viewing and text search queries for shared items.
- **Frontend Files**:
  - `client/app/browse/page.tsx` (Grid display and advanced search filters)
- **Backend Files**:
  - `server/src/controllers/notes.ts` (Search filtering backend query logic)
- **Dependencies**: Mongoose indexes on note titles/branches/subjects.

---

## 4. Leaderboard & Reputation
- **Description**: Gamified ranking of contributors based on notes download/vote statistics.
- **Frontend Files**:
  - `client/app/leaderboard/page.tsx` (Scoreboard view)
- **Backend Files**:
  - `server/src/routes/leaderboard.ts` (Leaderboard routing)
  - `server/src/controllers/leaderboard.ts` (Sort users by reputation field)
- **Dependencies**: `User` database collections.

---

## 5. Administrative Control Panel
- **Description**: Enables admin moderation of uploads, users, and flag report resolutions.
- **Frontend Files**:
  - `client/app/admin/page.tsx` (Dashboard UI view)
- **Backend Files**:
  - `server/src/routes/admin.ts` (Admin controller routes)
- **Dependencies**: Admin role authorization checks in backend controllers.
