"use server";

import { db } from "@/lib/db";
import { preferenceTags, preferenceTagRelationships } from "@/lib/db/schema";
import { inArray, notInArray, eq, desc, sql, and, aliasedTable } from "drizzle-orm";

export async function getSkillRecommendations(selectedSkillNames: string[]): Promise<string[]> {
  if (!selectedSkillNames || selectedSkillNames.length === 0) {
    return [
      "React", "TypeScript", "Node.js", "Python", 
      "Next.js", "AWS", "Docker", "Tailwind CSS"
    ];
  }

  try {
    const relatedTags = aliasedTable(preferenceTags, "related_tags");

    const recommendations = await db
      .select({
        name: relatedTags.name,
        totalWeight: sql<number>`sum(${preferenceTagRelationships.weight})`,
      })
      .from(preferenceTagRelationships)
      .innerJoin(preferenceTags, eq(preferenceTags.id, preferenceTagRelationships.tagId))
      .innerJoin(relatedTags, eq(relatedTags.id, preferenceTagRelationships.relatedTagId))
      .where(and(
        inArray(preferenceTags.name, selectedSkillNames),
        eq(preferenceTags.type, "skill"),
        notInArray(relatedTags.name, selectedSkillNames)
      ))
      .groupBy(relatedTags.name)
      .orderBy(desc(sql<number>`sum(${preferenceTagRelationships.weight})`))
      .limit(10);

    return recommendations.map(r => r.name);
  } catch (error) {
    console.error("Error fetching skill recommendations:", error);
    return [];
  }
}

export async function getDomainRecommendations(selectedDomainNames: string[]): Promise<string[]> {
  if (!selectedDomainNames || selectedDomainNames.length === 0) {
    return [
      "Frontend Engineer", "Backend Engineer", "Fullstack Engineer",
      "DevOps Engineer", "Data Scientist", "Product Manager"
    ];
  }

  try {
    const relatedTags = aliasedTable(preferenceTags, "related_tags");

    const recommendations = await db
      .select({
        name: relatedTags.name,
        totalWeight: sql<number>`sum(${preferenceTagRelationships.weight})`,
      })
      .from(preferenceTagRelationships)
      .innerJoin(preferenceTags, eq(preferenceTags.id, preferenceTagRelationships.tagId))
      .innerJoin(relatedTags, eq(relatedTags.id, preferenceTagRelationships.relatedTagId))
      .where(and(
        inArray(preferenceTags.name, selectedDomainNames),
        eq(preferenceTags.type, "domain"),
        notInArray(relatedTags.name, selectedDomainNames)
      ))
      .groupBy(relatedTags.name)
      .orderBy(desc(sql<number>`sum(${preferenceTagRelationships.weight})`))
      .limit(5);

    return recommendations.map(r => r.name);
  } catch (error) {
    console.error("Error fetching domain recommendations:", error);
    return [];
  }
}

export async function getRecommendationGraph() {
  try {
    const allTags = await db.select().from(preferenceTags);
    const allRels = await db.select().from(preferenceTagRelationships);
    
    return {
      skills: allTags.filter(t => t.type === 'skill'),
      domains: allTags.filter(t => t.type === 'domain'),
      skillRelationships: allRels, // Filtered on client if needed, or structured differently
      domainRelationships: allRels
    };
  } catch (error) {
    console.error("Error fetching recommendation graph:", error);
    return { skills: [], domains: [], skillRelationships: [], domainRelationships: [] };
  }
}

let tagOptionsCache: {
  data: { domains: string[]; skills: string[] };
  expiresAt: number;
} | null = null;

const TAG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export async function getPreferenceTagOptions(): Promise<{ domains: string[]; skills: string[] }> {
  const now = Date.now();
  if (tagOptionsCache && tagOptionsCache.expiresAt > now) {
    return tagOptionsCache.data;
  }

  try {
    const allTags = await db
      .select({
        name: preferenceTags.name,
        type: preferenceTags.type,
      })
      .from(preferenceTags)
      .orderBy(preferenceTags.name);

    const domains: string[] = [];
    const skills: string[] = [];

    for (const t of allTags) {
      if (t.type === "domain") {
        domains.push(t.name);
      } else if (t.type === "skill") {
        skills.push(t.name);
      }
    }

    const result = { domains, skills };
    tagOptionsCache = {
      data: result,
      expiresAt: now + TAG_CACHE_TTL_MS,
    };

    return result;
  } catch (error) {
    console.error("Error fetching preference tag options from DB:", error);
    if (tagOptionsCache) {
      return tagOptionsCache.data;
    }
    return { domains: [], skills: [] };
  }
}

