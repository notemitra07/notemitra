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
