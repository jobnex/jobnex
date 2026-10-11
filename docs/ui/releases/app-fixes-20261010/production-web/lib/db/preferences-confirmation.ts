import { sql } from "drizzle-orm";
import { userJobPreferences } from "./schema";
import { preferenceSnapshot, type Preferences } from "../preferences-confirmation";

export function preferenceWrite(updates: Preferences, confirmedAt?: string) {
  const existing = userJobPreferences.preferences;
  const merged = sql`(${existing} || ${JSON.stringify(preferenceSnapshot(updates))}::jsonb)`;
  return sql`${merged} || jsonb_build_object(
    'isConfirmed', ${Boolean(confirmedAt)}::boolean,
    'confirmedAt', ${confirmedAt ? sql`${confirmedAt}::text` : sql`${existing}->'confirmedAt'`},
    'lastConfirmedPreferences', ${confirmedAt
      ? sql`${merged} - 'isConfirmed' - 'confirmedAt' - 'lastConfirmedPreferences'`
      : sql`COALESCE(NULLIF(${existing}->'lastConfirmedPreferences', 'null'::jsonb), ${existing} - 'isConfirmed' - 'confirmedAt' - 'lastConfirmedPreferences')`}
  )`;
}
