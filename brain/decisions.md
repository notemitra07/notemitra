# Engineering Decisions (decisions.md)

This log tracks architectural and design choices made throughout the lifecycle of the NoteMitra platform.

---

## Decision 1: Use MongoDB as the Core Database Layer
- **Date**: Pre-initialization
- **Rationale**: Highly flexible document model suited for dynamic metadata of study notes (variable tags, multi-uploader fields, different categories like syllabus papers, class notes, and modules).
- **Alternatives Considered**: PostgreSQL, Firebase Firestore.

---

## Decision 2: Backend Execution Environment via `server-enhanced.js`
- **Date**: June 2026
- **Rationale**: Node.js execution needs a robust wrapping layer to control cors, compression, socket.io configurations, and database connection retries properly. Rather than executing index.ts with ts-node in production, compiled/transpiled `server-enhanced.js` provides faster launch times and lower memory foot-print.
- **Alternatives Considered**: Live production running with `ts-node src/index.ts`.

---

## Decision 3: Next.js Client Standalone Output Settings Disabled in Dev
- **Date**: July 2026
- **Rationale**: Next.js Standalone configuration (`output: 'standalone'`) is designed strictly for production build/deployment. Under development mode, this option causes file-watching mismatches and hot-reload errors. It has been excluded from the local `next.config.js`.
- **Alternatives Considered**: Managing dev with custom build scripts.

---

## Decision 4: Super Admin Dashboard & College Domain Restrictions
- **Date**: July 2026
- **Rationale**: Students (`@mictech.edu.in`) and Faculty (`@mictech.ac.in`) logins need strictly separated roles and dashboard access. A pre-seeded Super Admin account controls user promotion/demotion and login creations. Grouping students by branch and faculty by department on the client-side allows clean administrative supervision.
- **Alternatives Considered**: Adding role selector screens or complex multi-level permissions middleware.

---

## Decision 5: Unified Backend PDF Inline Viewer Proxy
- **Date**: July 2026
- **Rationale**: Direct embedding of raw Cloudinary PDF URLs inside client `iframe`s causes blank screens because Cloudinary serves raw resource types with `Content-Disposition: attachment` by default. Introducing `/api/notes/:id/view` on the backend acts as a proxy, fetching the PDF and returning it with `Content-Disposition: inline` so the browser's built-in PDF viewer can render it. This also shields the client from mixed content and CORS issues across both Cloudinary and GridFS storages.
- **Alternatives Considered**: Google Docs Viewer (incompatible with local development/development IP ranges).


