/**
 * Canonical Job Types & Interfaces
 */

export type JobType = "Full-time" | "Part-time" | "Intern" | "Contract";

export type SeniorityLevel = "entry" | "mid" | "senior" | "lead" | "all";

export interface Job {
  id: string;
  requestStatus?: string;
  isRequested?: boolean;
  matchDetails?: { role: string; matchedSkills: string[]; missingSkills: string[] };
  jobRoleTitle: string;
  company: string;
  type: JobType;
  location: string;
  countryId?: string;
  salary: string;
  jobDescription: string;
  categories: string[];
  postedAt?: string;
  experienceLevel?: string;
  isRemote?: boolean;
  isHybrid?: boolean;
  visaSponsorship?: boolean;
  externalApplyUrl?: string;
  experienceRequired?: number;
  jobSource?: string;
  workModel?: string;
  descriptionPlain?: string;
  descriptionRaw?: string;
  descriptionBlocks?: Array<{ type: string; title?: string; items?: string[]; text?: string }>;
  companyOverview?: string;
  companyWebsite?: string;
  companyIndustry?: string;
  companySize?: string;
  companyLogo?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  skills?: string[];
}

export interface JobFilterParams {
  keyword?: string;
  location?: string;
  categories?: string[];
  type?: string;
  seniority?: string;
  minSalary?: number;
  postedTime?: string;
  visaSponsorship?: string;
  page?: number;
  limit?: number;
}

export interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface FilterOption {
  id: string;
  label: string;
}

export interface LocationOption {
  id: string;
  country: string;
  code: string;
  roleCount: number;
}

