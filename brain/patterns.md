# Approved Design & Implementation Patterns (patterns.md)

This catalog stores coding styles, design patterns, and engineering workflows approved for the NoteMitra codebase.

---

## 1. Authentication & Session Pattern
- **Hook-based context state**: The React context `AuthContext` must be used via `useAuth()` hook in client pages/components.
- **Client Side Check Guard**: Always use `typeof window !== 'undefined'` when touching localStorage or setting authentication parameters to prevent SSR hydration errors in Next.js.
- **Interceptors**: Use custom interceptors in axios instance (`lib/api.ts`) to inject the Bearer token:
  ```ts
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
  ```

---

## 2. API Call Structure
- All external API communication must be defined in the central API layer file [api.ts](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/client/lib/api.ts).
- Group exports logically by service (e.g. `authAPI`, `notesAPI`, `leaderboardAPI`, `adminAPI`).
- Do not instantiate separate axios calls inside single pages or components.

---

## 3. Upload Progression Pattern
- Heavy file payloads (PDFs) require a progress handler function `onUploadProgress` passed from the UI component (e.g., `UploadForm`) directly to `notesAPI.uploadPDF`.
- Multer processes files into streams. If Cloudinary fails due to size, fall back to GridFS backend storage dynamically.

---
 
## 4. UI Component Design Pattern
- **Client Components**: Mark interactive UI pages/sub-components with `'use client';` directive.
- **Responsive design**: Tailor mobile layout with dynamic Flexbox grids (`grid grid-cols-2 md:grid-cols-3`). Use responsive size classes on icons (`w-8 h-8 md:w-12 md:h-12`).

---

## 5. OTP and Trusted Device Pattern
- **Device-trusted 2FA**: When logging in, include `deviceToken` from client `localStorage`.
- **OTP Generation & Verification**:
  - For unverified accounts or unrecognized device logins, generate a 6-digit random code, store it with a 10-minute expiry (`verificationCode`/`loginOtp`), and email it.
  - Return `{ requiresVerification: true }` or `{ otpRequired: true }` to prompt OTP interface.
  - Upon successful verification, generate a cryptographically secure `deviceToken`, append to user's `verifiedDevices` array, and store in client `localStorage` to bypass future OTP checks on that device.
