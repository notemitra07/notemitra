# NoteMitra - Product Requirements Document (PRD) & API Spec

This document describes the features, system architecture, user roles, core interaction flows, and API specifications for **NoteMitra**, a student notes-sharing platform.

---

## 1. Product Overview
NoteMitra is a student notes-sharing platform designed for sharing and discovering academic notes, syllabus papers, and study guides.
* **Frontend:** Next.js 14 App Router (React, TypeScript, TailwindCSS, Zustand).
* **Backend:** Node.js Express server running via `server-enhanced.js` (Port 5000).
* **Database:** MongoDB via Mongoose (with In-Memory fallback for local development).
* **Storage:** Cloudinary CDN for PDF uploads with a fallback to MongoDB GridFS.

---

## 2. Core User Roles
Logins are automatically routed by email domain mappings:
1. **Student (`*@mictech.edu.in` or standard registration):**
   * Can browse, search, download, upvote, and preview notes.
   * Can chat with individual note PDFs using the built-in AI Assistant.
2. **Faculty (`*@mictech.ac.in`):**
   * Access to the Admin/Faculty Panel.
   * Can upload PDF notes and view download/view statistics for their uploads.
3. **Super Admin (`superadmin@notemitra.com`):**
   * Full database control.
   * Can manage user roles, delete accounts, suspend users, and handle reports.

---

## 3. Core Feature Flows & Requirements

### 3.1. User Registration & Domain Authorization
* **Rule:** Registration is open.
* **Routing Rule:** During login, emails ending in `@mictech.edu.in` are flagged as Students. Emails ending in `@mictech.ac.in` are flagged as Faculty.
* **Super Admin:** Pre-seeded account:
  * **Email:** `superadmin@notemitra.com`
  * **Password:** `SuperAdmin@NoteMitra2026`

### 3.2. Note Document Management
* **Upload Constraint:** Accepts **PDF documents only** (max 100MB).
* **Search & Filter:** Filters notes by Subject, Semester, Module, and Branch.

### 3.3. Document Views & Downloads Tracking (Critical Flow)
* **Goal:** Count every actual user action on document files. Note page loading itself does *not* increment views.
* **PDF Preview Action:**
  * Triggered when a user clicks "Preview PDF".
  * Loads the PDF in an iframe at `/notes/:id/preview`.
  * Increments the note's `views` count by `1` every single time.
* **PDF Download Action:**
  * Triggered when a user clicks "Download PDF" (either on the note page or preview page).
  * Increments **both** the note's `downloads` count by `1` and `views` count by `1` every single time.
  * Increments the note uploader's `totalDownloads` rating on the user profile.

### 3.4. AI PDF Chatbot Assistant
* When previewing a PDF, students can open the **AI Chat** panel to ask questions regarding the PDF contents.

---

## 4. Backend API Endpoints (Base URL: `http://localhost:5000/api`)

### 4.1. Authentication
* `POST /auth/signup` - Register a user.
* `POST /auth/login` - Login.
* `GET /auth/me` - Get current user profile (requires Bearer Token).

### 4.2. Note Document Details
* `GET /notes` - Query list of notes with filters (`subject`, `semester`, `module`, `branch`, `search`).
* `GET /notes/:id` - Fetch single note details (returns upvotes, downloads, views, comments, likes). *Note: Does not increment views.*

### 4.3. PDF Document Operations
* `GET /notes/:id/download` - Resolves the download URL (returns S3, Cloudinary, or GridFS link). *Note: Does not increment counts.*
* `POST /notes/:id/download` - Tracks download execution. Increments `downloads` by `1` and `views` by `1` every time.
* `POST /notes/:id/preview` - Tracks preview view execution. Increments `views` by `1` every time.

### 4.4. Moderation & Interactions
* `POST /notes/:id/vote` - Upvote or downvote note.
* `POST /notes/:id/save` - Save note to collection.
* `POST /notes/:id/report` - Report a note for review.
