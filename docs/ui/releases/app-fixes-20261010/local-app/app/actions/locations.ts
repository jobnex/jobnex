"use server";

import { db } from "@/lib/db";
import { countries, jobs } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function getLocations() {
  try {
    const results = await db
      .select({
        id: countries.id,
        country: countries.name,
        code: countries.code,
        roleCount: sql<number>`count(${jobs.id})`.mapWith(Number),
      })
      .from(countries)
      .leftJoin(jobs, and(eq(jobs.countryId, countries.id), eq(jobs.status, "published")))
      .where(eq(countries.code, "US"))
      .groupBy(countries.id, countries.name, countries.code)
      .orderBy(countries.name);

    return { success: true, data: results };
  } catch (error: unknown) {
    console.error("Failed to fetch locations:", error);
    return { success: true, data: [{ id: "us", country: "United States", code: "US", roleCount: 0 }] };
  }
}
