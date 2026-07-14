# Central Project Summary (memory.md)

This file contains the current high-level state of the **NoteMitra** application, cataloging what the project does, key features, and active initiatives.

---

## 1. What the Project Does
NoteMitra is a repository and sharing hub for academic notes, lecture slides, syllabus papers, and study material. It allows:
- **Students**: Upload, view, search, download, upvote, and discuss note resources.
- **Teachers / Uploaders**: Build academic profiles and reputation through community-validated uploads.
- **Administrators**: Moderation capabilities, user suspensions, report resolutions, and overall analytics.

---

## 2. Key Features
- **Categorized Browsing**: Filter notes by Branch, Semester, Subject, Module, and Custom Tags.
- **Cloud Note Delivery**: High-speed downloads backed by Cloudinary and GridFS.
- **Interactive Discussion Boards**: Per-note comments, real-time updates via WebSockets.
- **Leaderboard / Reputation**: Gamification to incentivize high-quality note contributions.
- **Robust Admin Control Panel**: Live user management, note moderation, and platform statistics.

---

## 3. Current State & Active Work
- **Dev Servers Status**: 
  - Backend Express server is running locally on port 5000 using Node.js.
  - Frontend client dev server is running on port 3000 using Next.js.
- **Recent Patches**:
  - Fixed Next.js build cache problems and service worker cache issues.
  - Updated `next.config.js` to disable `standalone` configuration for local development.
- **Active / Ongoing Development**:
  - Setting up the persistent project memory system (Project Brain).
