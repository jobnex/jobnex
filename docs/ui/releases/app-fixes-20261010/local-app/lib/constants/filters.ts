import { FilterOption } from "@/types";

export const DOMAIN_OPTIONS: FilterOption[] = [
  { id: "engineering", label: "Engineering" },
  { id: "design", label: "Design" },
  { id: "marketing", label: "Marketing" },
  { id: "product", label: "Product & Sales" },
  { id: "developer", label: "Developer" },
  { id: "ai-ml", label: "AI/ML" },
  { id: "analyst", label: "Analyst" },
  { id: "uxui", label: "UX/UI" },
  { id: "finance", label: "Finance" },
  { id: "operations", label: "Operations" },
];

export const JOB_TYPE_OPTIONS: FilterOption[] = [
  { id: "Full-time", label: "Full-time" },
  { id: "Internship", label: "Internship" },
  { id: "Contract", label: "Contract" },
  { id: "Part-time", label: "Part-time" },
];

export const SENIORITY_OPTIONS: FilterOption[] = [
  { id: "fresher", label: "Fresher" },
  { id: "entry-level", label: "Entry-level" },
  { id: "mid", label: "Mid-Level" },
  { id: "senior", label: "Senior" },
  { id: "lead", label: "Lead / Staff" },
];

export const POSTED_TIME_OPTIONS: FilterOption[] = [
  { id: "1h", label: "Past 1 hr" },
  { id: "2h", label: "Past 2 hrs" },
  { id: "12h", label: "Past 12 hrs" },
  { id: "24h", label: "Past 24 hrs" },
  { id: "2d", label: "Past 2 days" },
  { id: "7d", label: "Past 7 days" },
  { id: "14d", label: "Past 2 weeks" },
];

export const VISA_OPTIONS: FilterOption[] = [
  { id: "sponsored", label: "Visa Sponsored" },
];

export const WORK_MODE_OPTIONS: FilterOption[] = [
  { id: "on-site", label: "On-site" },
  { id: "hybrid", label: "Hybrid" },
  { id: "remote", label: "Remote" },
];

