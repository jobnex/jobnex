# Backend Guide: Updating User Job Preferences (Confirmation Contract)

This document defines how backend services, background workers, AI pipelines, and external microservices must update candidate preferences in PostgreSQL so that all changes remain **unconfirmed** until explicitly confirmed by the user on the frontend.

---

## 1. Database Model & Schema

- **Table**: `user_job_preferences`
- **Target Column**: `preferences` (`JSONB`)

### Fields Inside the `preferences` JSONB Object

| Key | Type | Description |
| :--- | :--- | :--- |
| `country` | `string` | Target country code (e.g. `"us"`) |
| `cities` | `string[]` | Array of target city names (max 3) |
| `seniority` | `string` | Seniority level (e.g. `"Senior"`, `"Mid-level"`) |
| `jobTypes` | `string[]` | Array of job types (e.g. `["Full-time", "Remote"]`) |
| `experienceYears` | `number` | Integer years of experience |
| `salaryMin` | `number \| null` | Minimum salary target |
| `salaryMax` | `number \| null` | Maximum salary target |
| `domains` | `string[]` | Selected domain tags |
| `skills` | `string[]` | Selected skill tags |
| `selectedTemplateId` | `string` | Resume template ID |
| `includeSummarySections`| `boolean` | Summary toggle |
| `autofillFromResume` | `boolean` | Autofill toggle |
| `resumeUploaded` | `boolean` | Resume status flag |
| `resumeFileName` | `string \| null` | Display name of uploaded resume |
| `resumeFileKey` | `string \| null` | Storage object key |
| **`isConfirmed`** | `boolean` | **Must be `false` when updated by backend** |
| **`confirmedAt`** | `string \| null` | **Preserve existing timestamp (do not update)** |
| **`lastConfirmedPreferences`** | `object \| null` | **Preserve existing baseline (DO NOT overwrite)** |

---

## 2. Core Confirmation Contract

When an automated backend process (AI resume extraction, enrichment service, CRM webhook) modifies a user's preferences:

1. **`isConfirmed` MUST be set to `false`.**
2. **`lastConfirmedPreferences` MUST remain untouched.** (Keep whatever snapshot is already stored in the DB, or initialize it to the pre-update values if null).
3. **`confirmedAt` MUST remain untouched.**

### Resulting Frontend Behavior:
1. When the user loads or refreshes `/job-hunt/manage`, the form rehydrates with the **new backend-generated values**.
2. The frontend compares the form values against `lastConfirmedPreferences`.
3. Because they differ, the frontend marks the form as unconfirmed:
   - `isDirty` resolves to `true`.
   - The status badge displays **"Unconfirmed changes"** (amber indicator).
   - The **"Confirm Changes"** button is **active and enabled**.
4. Once the user reviews and clicks **"Confirm Changes"**, the frontend stamps `isConfirmed: true` and updates `lastConfirmedPreferences` to match.

---

## 3. Implementation Code Examples

### Option A: Raw PostgreSQL Query (Recommended for External Services)

Use PostgreSQL's JSONB concatenation operator (`||`) to safely update target fields while explicitly preserving `lastConfirmedPreferences` and setting `isConfirmed = false`:

```sql
UPDATE user_job_preferences
SET 
  preferences = preferences 
    || jsonb_build_object(
      -- The new or modified fields from your service:
      'skills', '["Python", "TypeScript", "PostgreSQL", "AWS"]'::jsonb,
      'domains', '["Backend Engineer", "Data Engineer"]'::jsonb,
      'seniority', '"Senior"'::jsonb,

      -- Confirmation contract enforcement:
      'isConfirmed', false,
      -- Ensure lastConfirmedPreferences is preserved from existing state:
      'lastConfirmedPreferences', COALESCE(
        preferences->'lastConfirmedPreferences',
        preferences - 'lastConfirmedPreferences' - 'isConfirmed' - 'confirmedAt'
      )
    ),
  updated_at = NOW()
WHERE user_id = 'target_user_id';
```

---

### Option B: Drizzle ORM (Node.js / TypeScript Services)

```typescript
import { db } from "@/lib/db";
import { userJobPreferences } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function updatePreferencesFromBackend(
  userId: string,
  newAttributes: {
    skills?: string[];
    domains?: string[];
    seniority?: string;
    experienceYears?: number;
  }
) {
  // 1. Fetch current record to preserve baseline
  const [record] = await db
    .select({ preferences: userJobPreferences.preferences })
    .from(userJobPreferences)
    .where(eq(userJobPreferences.userId, userId))
    .limit(1);

  const existingPref = (record?.preferences || {}) as Record<string, any>;

  // 2. Preserve existing baseline snapshot, or establish baseline from prior values if first time
  const baseline = existingPref.lastConfirmedPreferences || { ...existingPref };
  delete baseline.lastConfirmedPreferences;
  delete baseline.isConfirmed;
  delete baseline.confirmedAt;

  // 3. Construct updated payload adhering to the confirmation contract
  const updatedPreferences = {
    ...existingPref,
    ...newAttributes,
    isConfirmed: false,
    confirmedAt: existingPref.confirmedAt || null,
    lastConfirmedPreferences: baseline,
  };

  await db
    .update(userJobPreferences)
    .set({
      preferences: updatedPreferences,
      updatedAt: new Date(),
    })
    .where(eq(userJobPreferences.userId, userId));
}
```

---

## 4. Anti-Patterns to Avoid

- ❌ **Do NOT overwrite `preferences` entirely with a new object** without carrying over `lastConfirmedPreferences`. Doing so erases the baseline comparison and locks the button.
- ❌ **Do NOT set `isConfirmed: true` in background services.** Only explicit user clicks on the frontend "Confirm Changes" button should set `isConfirmed: true`.
- ❌ **Do NOT set `lastConfirmedPreferences` to the newly updated values.** If `lastConfirmedPreferences` equals the new values, the frontend considers the form untouched and keeps the button disabled.
