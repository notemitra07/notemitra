# System Architecture (architecture.md)

This document provides a comprehensive overview of NoteMitra's technical architecture, component layers, and external dependencies.

---

## 1. Frontend Architecture
NoteMitra's frontend is constructed as a modern Next.js client application:
- **Routing**: Next.js App Router (`client/app/`).
- **Styling**: TailwindCSS configured via `tailwind.config.ts`.
- **Global State**: Managed with Zustand for lightweight client store handling.
- **Context API**: `AuthProvider` handles asynchronous login token resolution, session validation, and client-side session caching.
- **Client Components**: Located in `client/components/` and `client/components/ui/` (Radix components).
- **Communication Layer**: Axios instance (`client/lib/api.ts`) configured with custom timeout (120,000ms - 180,000ms) and request interception for token insertion.

---

## 2. Backend Architecture
The backend is an Express.js API server:
- **Production Server**: Running `server-enhanced.js` which configures all Express routes, controllers, MongoDB connections, and Socket.io endpoints.
- **Source Code**: Written in TypeScript under `server/src/`, including Controllers, Models, Routes, Middlewares, and Utilities.
- **Real-Time Integration**: Socket.io for WebSocket communication between backend services and active clients.

---

## 3. Database Layer
NoteMitra utilizes **MongoDB** via the **Mongoose** Object Data Modeling library:
- **Models**:
  - `User`: Roles, credentials, reputation points, verification status.
  - `Note`: Title, description, branch, semester, subject, module, tags, download statistics, ratings, file metadata (Cloudinary/GridFS details).
  - `Comment`: User discussions linked to note IDs.
  - `Report`: Moderation logs flag unsafe or incorrect materials.
- **GridFS Store**: Multer-gridfs-storage for storing PDFs as binary blocks inside the MongoDB database.

---

## 4. Middleware Services
- **Auth Middleware**: PassportJS configured for Google OAuth2.0 authentication and JSON Web Token verification middleware.
- **Security / Optimization**:
  - `helmet`: Enhances security headers.
  - `cors`: Handles cross-origin requests.
  - `compression`: Compresses responses for performance.
  - `express-rate-limit`: Prevents abuse of endpoints.

---

## 5. Third-Party Integrations
- **Cloudinary**: High-performance CDN and media host used to upload and stream student notes.
- **Google OAuth**: Passport-Google-OAuth20 handles student registration and single-sign-on (SSO).
- **Resend / Nodemailer**: Dispatches notification emails and password reset links.
