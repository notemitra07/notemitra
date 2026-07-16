# Mistake Log (mistakes.md)

This log is used to capture critical bugs, integration issues, and troubleshooting steps to prevent them from recurring.

---

## Issue 1: Service Worker Cache Interception (Refused to Connect)
- **Problem**: Accessing `http://localhost:3000` returned `net::ERR_CONNECTION_REFUSED` even though the backend server was alive.
- **Cause**: A registered Service Worker from previous application iterations cached local host paths aggressively and intercepted requests.
- **Fix**: Clear registered Service Worker cache and local Storage directly via Developer Tools (Application -> Service Workers -> Unregister, or programmatically unregistering).
- **Status**: Resolved

---

## Issue 2: Next.js Standalone Build Environment Breakage in Dev Mode
- **Problem**: Next.js Dev Server failed to boot or re-build hot files correctly when running `npm run dev`.
- **Cause**: `output: 'standalone'` was active in the config file, creating conflicts with development package imports and middleware routes.
- **Fix**: Remove `output: 'standalone'` from [next.config.js](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/client/next.config.js) when running local dev instances.
- **Status**: Resolved

---

## Issue 3: Stale Compilation Cache causing Hydration and Import Failures
- **Problem**: Strange runtime React hook exceptions (`Cannot read properties of undefined (reading 'role')`) on client rendering.
- **Cause**: Next.js compiler cache inside `.next/` directory became out-of-sync with changes made to types and API responses.
- **Fix**: Run `Remove-Item -Recurse -Force .next` inside the `client` directory to force clean re-compilation.
- **Status**: Resolved

---

## Issue 4: Cloudinary Raw PDFs White Screen in Iframe Preview
- **Problem**: PDF previews show a blank/white screen when using Cloudinary raw storage URLs.
- **Cause**: Cloudinary serves files uploaded with `resource_type: "raw"` with a `Content-Disposition: attachment` header, forcing the browser to download the file instead of displaying it inline within an iframe.
- **Fix**: Implemented a backend proxy `/api/notes/:id/view` that streams the PDF with `Content-Disposition: inline` and updated the preview client page to load through this endpoint.
- **Status**: Resolved

---

## Issue 5: Statistics Mismatch between Browse and Note Details Page
- **Problem**: Browse note card displays different views/downloads from the details page for the same note.
- **Cause**: The `/api/notes` browse list endpoint set a `Cache-Control: public, max-age=30` header, caching stale statistics inside the browser cache for up to 30 seconds after a download occurred.
- **Fix**: Changed the `/api/notes` cache header to `no-cache, no-store, must-revalidate` to ensure statistics update dynamically upon page transition.
- **Status**: Resolved

