"use server";

import { db } from "@/lib/db";
import { countries, jobs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

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
      .leftJoin(jobs, eq(jobs.countryId, countries.id))
      .where(eq(countries.code, 'US')) // Based on original route logic
      .groupBy(countries.id, countries.name, countries.code)
      .orderBy(countries.name);

    return { success: true, data: results };
  } catch (error: any) {
    console.error("Failed to fetch locations:", error);
    return { success: false, error: error.message || "Failed to fetch locations" };
  }
}
