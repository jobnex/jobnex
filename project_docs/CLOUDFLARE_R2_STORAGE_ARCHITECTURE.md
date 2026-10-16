# Strawberry Jobs: Cloudflare R2 Storage Architecture & Implementation Plan

> **Target Consumer:** Autonomous AI Coding Agents, LLMs, and Software Engineers
> **Context:** This document outlines the architectural blueprint and explicit implementation steps for integrating Cloudflare R2 object storage into the Strawberry Jobs Next.js application.
> **Primary Constraint:** **ZERO VERCEL BANDWIDTH FOR FILE TRANSFERS.** File bytes must *never* pass through the Next.js/Vercel server. All uploads and downloads must occur directly between the client browser and Cloudflare R2 using the Presigned URLs pattern.

---

## 1. Architectural Blueprint: The Presigned URL Pattern

We use the standard AWS SDK to interface with Cloudflare R2 (which is S3-compatible). The architecture enforces a strict separation between the **Control Plane** and the **Data Plane**.

### 1.1 Control Plane (Next.js / Vercel)
The Next.js backend acts exclusively as a secure key-master. It verifies user identity via Neon Auth and uses the AWS SDK to generate cryptographic, time-limited **Presigned URLs**. It only handles small JSON requests and responses.

### 1.2 Data Plane (Client Browser)
The React frontend handles the heavy lifting. It requests a Presigned URL from the Control Plane, and then uses native browser APIs (`fetch` or `XMLHttpRequest`) to push (`PUT`) or pull (`GET`) the raw file bytes directly to/from Cloudflare R2.

---

## 2. Infrastructure & Environment Requirements

### 2.1 Dependencies
* `@aws-sdk/client-s3`: For instantiating the S3 client configured for R2.
* `@aws-sdk/s3-request-presigner`: For generating the `getSignedUrl` tokens.

### 2.2 Environment Variables (`.env.local`)
The following variables must be provisioned and utilized:
```env
# Cloudflare R2 Configuration
R2_ACCOUNT_ID="your_cloudflare_account_id"
R2_ACCESS_KEY_ID="your_r2_access_key_id"
R2_SECRET_ACCESS_KEY="your_r2_secret_access_key"
R2_BUCKET_NAME="strawberry-jobs-assets"
```

### 2.3 Cloudflare R2 CORS Configuration
For direct-from-browser uploads/downloads to work, the R2 bucket MUST have a CORS policy applied. A one-off script should be created (e.g., `scripts/setup-r2-cors.ts`) to apply this:
```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://strawberryjobs.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 3. Database & File Path Conventions

Cloudflare R2 is oblivious to our database. Our Neon Postgres database acts as the source of truth for file ownership.

### 3.1 Object Key Naming Convention
Files must be partitioned logically by the Neon Auth `userId` to ensure strict isolation.
* Resumes: `resumes/{user_id}/{uuid}-{filename}.pdf`
* Avatars: `avatars/{user_id}/{uuid}-{filename}.jpg`

### 3.2 Database Schema Alignment
The `file_url` column in `resumes` (or profile avatars) should store the **exact R2 Object Key** (e.g., `resumes/user_123/123e4567-e89b-12d3-a456-426614174000-resume.pdf`), NOT the full HTTP URL. This enables the backend to easily generate Presigned GET URLs later.

---

## 4. Backend Implementation Requirements (Server Actions)

Create a dedicated module for storage actions: `app/actions/storage.ts`.

### 4.1 Generate Upload URL Action (`getPresignedUploadUrl`)
* **Input:** `fileName`, `fileType` (MIME type), `category` ("resume" | "avatar").
* **Auth Check:** Must execute `getCurrentUser()` from `lib/auth/server.ts`. Reject if null.
* **Logic:** 
  1. Construct the `Object Key` using the `userId`, category, a generated UUID, and sanitized filename.
  2. Instantiate `S3Client` pointing to `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
  3. Create a `PutObjectCommand`.
  4. Generate and return the signed URL (expires in ~5 mins) alongside the generated `objectKey`.

### 4.2 Generate Download URL Action (`getPresignedDownloadUrl`)
* **Input:** `objectKey` (e.g., `resumes/user_123/...`).
* **Auth Check & Ownership:** Must execute `getCurrentUser()`. Ensure the `userId` extracted from the `objectKey` matches the currently authenticated user to prevent unauthorized access.
* **Logic:**
  1. Create a `GetObjectCommand`.
  2. Generate and return the signed URL (expires in ~15 mins).

---

## 5. Frontend Implementation Requirements (Client React)

### 5.1 Reusable Custom Hook (`lib/hooks/useR2Storage.ts`)
Create a custom hook that abstracts the 3-step orchestration process for UI components.

```typescript
interface UploadOptions {
  file: File;
  category: "resume" | "avatar";
  onProgress?: (percent: number) => void;
}

// Hook Signature Blueprint
export function useR2Storage() {
  const uploadFile = async (options: UploadOptions): Promise<{ success: boolean, objectKey?: string, error?: string }> => {
    // 1. Request Presigned PUT URL from Next.js Server Action
    // 2. Use XMLHttpRequest (for progress tracking) or fetch to PUT file to R2
    // 3. Return the objectKey so the calling component can save it to the DB
  }
  
  const getFileUrl = async (objectKey: string): Promise<string | null> => {
    // 1. Request Presigned GET URL from Next.js Server Action
    // 2. Return URL for <a> or <iframe> tags
  }

  return { uploadFile, getFileUrl };
}
```

### 5.2 UI Integration
* Components like `ProfileForm.tsx` or Resume Uploaders should consume `useR2Storage`.
* **Workflow:**
  1. User selects a PDF.
  2. UI calls `uploadFile({ file, category: 'resume' })`.
  3. Wait for direct R2 upload to succeed.
  4. UI calls the existing DB server action (e.g., `updateProfile` or `createResume`) passing the returned `objectKey`.

---

## 6. Implementation Order for AI Agents

When instructed to execute this plan, AI agents should follow this exact sequence:

1. **Setup & Config:** Add AWS SDK dependencies to `package.json` and configure `S3Client` in a new utility file (`lib/storage/r2.ts`).
2. **Server Actions:** Implement `app/actions/storage.ts` with strict Auth and ownership validation.
3. **Client Hook:** Implement `lib/hooks/useR2Storage.ts`.
4. **Integration (Resumes):** Wire up the resume PDF upload in `ManageJobHunt` module to use the direct-upload flow and store the key in the database.
5. **Integration (Profiles):** Wire up avatar/profile picture uploads in `ProfileForm.tsx`.
6. **Infrastructure Script:** Write a short Next.js/Node script in `scripts/setup-r2-cors.ts` so the developer can easily execute it once to configure the R2 bucket.
