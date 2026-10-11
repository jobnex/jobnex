"use client";

import { 
  UploadCloud, 
  MapPin, 
  Check, 
  X, 
  Search,
  Plus,
  Minus,
  Briefcase,
  Award,
  Clock,
  FileText,
  Star,
  Layers,
  Sparkles,
  User,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck,
  Loader2,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";

import { ResumeModal } from "@/components/ResumeModal";
import { PdfPreviewModal, PdfPreviewDocument } from "@/components/PdfPreviewModal";
import { RESUME_TEMPLATES, ResumeTemplate } from "@/data/resume-templates";
import { toast } from "sonner";
import { sampleResumeMarkdown } from "@/data/sample-resume";
import { FlagUS } from "@/components/LocationDropdown";
import { useResumeStore } from "@/store/useResumeStore";
import { buildBaseResume } from "@/lib/base-resume";
import { getPreferenceTagOptions } from "@/app/actions/recommendations";
import { getUserJobPreferences, saveUserJobPreferences, saveResumeDetails } from "@/app/actions/preferences";
import type { JobPreferencesData, ResumeDetailsData } from "@/lib/db/schema/preferences";
import { ManageJobHuntFormSkeleton } from "@/components/ManageJobHuntSkeleton";
import { useR2Storage } from "@/lib/hooks/useR2Storage";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import {
  getAllTemplatePresignedUrls,
  TemplateAssetUrls,
  commitResumeUpload,
  deleteUserResume,
  getUserActiveResume,
} from "@/app/actions/storage";


const COUNTRIES = [
  { code: 'us', abbr: 'USA', name: 'United States', flag: FlagUS },
];

// Top US corporate and industry hubs across tech, finance, healthcare, Fortune 500, and aerospace
const TOP_US_CITIES = [
  'New York, NY',
  'San Francisco, CA',
  'Seattle, WA',
  'San Jose, CA',
  'Austin, TX',
  'Boston, MA',
  'Chicago, IL',
  'Los Angeles, CA',
  'Atlanta, GA',
  'Dallas, TX',
  'Washington, DC',
  'Houston, TX',
  'Denver, CO',
  'San Diego, CA',
  'Miami, FL',
  'Philadelphia, PA',
  'Minneapolis, MN',
  'Charlotte, NC',
  'Phoenix, AZ',
  'Raleigh, NC',
  'Salt Lake City, UT',
  'Nashville, TN',
  'Pittsburgh, PA',
  'Detroit, MI',
  'Tampa, FL',
  'Indianapolis, IN',
  'Columbus, OH',
  'Portland, OR',
  'Baltimore, MD',
  'St. Louis, MO',
  'Kansas City, MO',
  'Cincinnati, OH',
  'Cleveland, OH',
  'Orlando, FL',
  'Richmond, VA',
];

// Curated high-relevance domains across diverse areas of expertise (4 rows max)
const CURATED_DOMAINS = [
  "Frontend Engineer",
  "Fullstack Engineer",
  "Backend Engineer",
  "Software Architect",
  "DevOps Engineer",
  "Cloud Architect",
  "Site Reliability Engineer",
  "Data Scientist",
  "Data Engineer",
  "Data Analyst",
  "Machine Learning Engineer",
  "AI Researcher",
  "Product Manager",
  "Technical Project Manager",
  "UI/UX Designer",
  "Product Designer",
  "Mobile Developer",
  "iOS Developer",
  "Android Developer",
  "Security Engineer",
  "QA Engineer",
  "Engineering Manager",
];

// Curated high-relevance skills across diverse areas of expertise (4 rows max)
const CURATED_SKILLS = [
  "TypeScript",
  "Python",
  "React",
  "Node.js",
  "Next.js",
  "SQL",
  "PostgreSQL",
  "AWS",
  "Docker",
  "Kubernetes",
  "Go",
  "Java",
  "C++",
  "Rust",
  "GraphQL",
  "REST APIs",
  "MongoDB",
  "Redis",
  "Tailwind CSS",
  "Django",
  "Spring Boot",
  "Git",
  "Linux",
  "PyTorch",
  "Figma",
  "CI/CD",
];

const PILL_BASE_CLASSES = "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[0.875rem] transition-all duration-200 ease-out cursor-pointer select-none border-[1.5px]";
const PILL_SELECTED_CLASSES = "rounded-[10px] bg-black text-white border-black font-semibold shadow-xs dark:bg-white dark:text-black dark:border-white hover:opacity-100";
const PILL_UNSELECTED_CLASSES = "rounded-[20px] hover:rounded-[10px] bg-white text-gray-700 border-transparent hover:opacity-80 font-medium dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042]";

const getPillClasses = (isSelected: boolean, extraClasses: string = "") => {
  return `${PILL_BASE_CLASSES} ${isSelected ? PILL_SELECTED_CLASSES : PILL_UNSELECTED_CLASSES} ${extraClasses}`.trim();
};

const PEER_PILL_UNSELECTED_CLASSES = "rounded-[20px] hover:rounded-[10px] bg-bg-input text-gray-700 border-transparent hover:opacity-80 font-medium dark:text-gray-300";

const PEER_PILL_CLASSES = `${PILL_BASE_CLASSES} w-full ${PEER_PILL_UNSELECTED_CLASSES} peer-checked:rounded-[10px] peer-checked:bg-black peer-checked:text-white peer-checked:border-black peer-checked:font-semibold peer-checked:shadow-xs dark:peer-checked:bg-white dark:peer-checked:text-black dark:peer-checked:border-white peer-checked:hover:opacity-100`;

const INPUT_BASE_CLASSES = "text-[0.875rem] font-medium text-gray-700 dark:text-gray-300 bg-bg-input border-[1.5px] border-transparent rounded-[10px] focus:outline-none focus:border-black dark:focus:border-white transition-all duration-200 ease-out";

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


interface EducationEntry {
  id: string;
  college: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  grade: string;
  maxGrade: string;
  gradeType: string;
}

interface ExperienceEntry {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  jobDescription: string;
  skills: string[];
  domains: string[];
  responsibilities: string;
}

// Global cache for tag options to avoid redundant client fetches
let cachedTagOptions: { domains: string[]; skills: string[] } | null = null;
let tagOptionsFetchPromise: Promise<{ domains: string[]; skills: string[] }> | null = null;

async function fetchTagOptions(): Promise<{ domains: string[]; skills: string[] }> {
  if (cachedTagOptions) return cachedTagOptions;
  if (tagOptionsFetchPromise) return tagOptionsFetchPromise;

  tagOptionsFetchPromise = getPreferenceTagOptions()
    .then((data) => {
      if (data && (data.domains.length > 0 || data.skills.length > 0)) {
        const uniqueDomains = Array.from(new Set([...CURATED_DOMAINS, ...data.domains]));
        const uniqueSkills = Array.from(new Set([...CURATED_SKILLS, ...data.skills]));
        cachedTagOptions = { domains: uniqueDomains, skills: uniqueSkills };
        return cachedTagOptions;
      }
      return { domains: CURATED_DOMAINS, skills: CURATED_SKILLS };
    })
    .catch((err) => {
      console.error("Failed to load tag options from DB:", err);
      tagOptionsFetchPromise = null;
      return { domains: CURATED_DOMAINS, skills: CURATED_SKILLS };
    })
    .finally(() => {
      tagOptionsFetchPromise = null;
    });

  return tagOptionsFetchPromise;
}

function useTagOptions() {
  const [options, setOptions] = useState<{ domains: string[]; skills: string[] }>(() => {
    return cachedTagOptions || {
      domains: CURATED_DOMAINS,
      skills: CURATED_SKILLS,
    };
  });

  useEffect(() => {
    let isCurrent = true;
    fetchTagOptions().then((res) => {
      if (isCurrent && res) {
        setOptions(res);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return options;
}


interface TagSelectorProps {
  entityName: "domain" | "skill";
  placeholder: string;
  selectedItems: string[];
  onChange: (items: string[]) => void;
  allDbOptions: string[];
  curatedOptions: string[];
}

/**
 * Production-grade tag & chip selector component.
 * Features:
 * - Standalone search bar with instant dropdown on focus/click
 * - Case-insensitive Set-based filtering & deduplication
 * - Canonical casing preservation from database & curated options
 * - Isolated chip container preserving selected chips first with remove icons
 * - Complete dark mode & light mode styling identical to reference design
 */
function TagSelector({
  entityName,
  placeholder,
  selectedItems,
  onChange,
  allDbOptions,
  curatedOptions,
}: TagSelectorProps) {
  const [input, setInput] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsDropdownOpen(false), isDropdownOpen);

  const selectedSet = useMemo(
    () => new Set(selectedItems.map((item) => item.toLowerCase())),
    [selectedItems]
  );

  // Search matching tags from database (or unselected default list)
  const searchMatches = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) {
      return allDbOptions
        .filter((item) => !selectedSet.has(item.toLowerCase()))
        .slice(0, 20);
    }
    return allDbOptions
      .filter((item) => item.toLowerCase().includes(q) && !selectedSet.has(item.toLowerCase()))
      .slice(0, 20);
  }, [input, allDbOptions, selectedSet]);

  const handleAdd = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || selectedSet.has(trimmed.toLowerCase())) return;

    // Preserve canonical casing from DB or curated options if available
    const canonical =
      allDbOptions.find((o) => o.toLowerCase() === trimmed.toLowerCase()) ||
      curatedOptions.find((o) => o.toLowerCase() === trimmed.toLowerCase()) ||
      trimmed;

    onChange([...selectedItems, canonical]);
  };

  const handleRemove = (itemToRemove: string) => {
    onChange(selectedItems.filter((item) => item !== itemToRemove));
  };

  return (
    <div className="flex-1 flex flex-col gap-2.5 min-h-0">
      {/* Search Bar */}
      <div className="relative" ref={containerRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setIsDropdownOpen(true);
          }}
          onClick={() => setIsDropdownOpen(true)}
          onFocus={() => setIsDropdownOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              const match = searchMatches[0];
              handleAdd(match || input.trim());
              setInput("");
              setIsDropdownOpen(false);
              inputRef.current?.focus();
            } else if (e.key === "Escape") {
              setIsDropdownOpen(false);
            }
          }}
          className={`w-full pl-9 pr-3 py-2.5 ${INPUT_BASE_CLASSES}`}
        />

        {/* Dropdown list from DB when searchbar is selected */}
        {isDropdownOpen && (
          <div 
            role="listbox"
            className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-card dark:bg-bg-input border border-border-subtle dark:border-gray-700 rounded-md shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)] max-h-[220px] overflow-y-auto"
          >
            {searchMatches.map((item) => (
              <div
                key={item}
                role="option"
                aria-selected="false"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                className="px-3.5 py-2.5 hover:bg-bg-tag dark:hover:bg-[#202330] cursor-pointer text-sm font-semibold flex items-center justify-between transition-colors text-text-primary dark:text-gray-200"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAdd(item);
                  setInput("");
                  setIsDropdownOpen(false);
                  inputRef.current?.focus();
                }}
              >
                <span>{item}</span>
              </div>
            ))}

            {input.trim() &&
              !allDbOptions.some((m) => m.toLowerCase() === input.trim().toLowerCase()) &&
              !selectedSet.has(input.trim().toLowerCase()) && (
                <div
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  className="px-3.5 py-2.5 hover:bg-bg-tag dark:hover:bg-[#202330] cursor-pointer text-sm font-semibold text-brand-lime flex items-center gap-2 border-t border-border-subtle dark:border-gray-700 transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAdd(input.trim());
                    setInput("");
                    setIsDropdownOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add &quot;{input.trim()}&quot;
                </div>
              )}

            {searchMatches.length === 0 && input.trim() && (
              <div className="px-3.5 py-3 text-xs text-text-muted dark:text-gray-400 text-center font-medium">
                No matching {entityName === "domain" ? "domains" : "skills"} found in DB. Press Enter to add.
              </div>
            )}

            {searchMatches.length === 0 && !input.trim() && (
              <div className="px-3.5 py-3 text-xs text-text-muted dark:text-gray-400 text-center font-medium">
                All suggested {entityName === "domain" ? "domains" : "skills"} added
              </div>
            )}
          </div>
        )}
      </div>

      {/* Container around options matching dark & light theme images */}
      <div className="min-h-[120px] p-3 bg-bg-input border-[1.5px] border-transparent rounded-[10px] flex flex-wrap gap-2 content-start max-h-[165px] overflow-y-auto">
        {/* Selected options first with X */}
        {selectedItems.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              handleRemove(item);
              setIsDropdownOpen(false);
            }}
            className={getPillClasses(true)}
          >
            {item}
            <X className="w-3.5 h-3.5 ml-0.5 opacity-80" strokeWidth={2.5} />
          </button>
        ))}

        {/* Unselected curated options without icon */}
        {curatedOptions
          .filter((item) => !selectedSet.has(item.toLowerCase()))
          .map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                handleAdd(item);
                setIsDropdownOpen(false);
              }}
              className={getPillClasses(false)}
            >
              {item}
            </button>
          ))}
      </div>
    </div>
  );
}

function DomainsSelector({
  selectedDomains,
  onChange,
}: {
  selectedDomains: string[];
  onChange: (domains: string[]) => void;
}) {
  const { domains } = useTagOptions();
  return (
    <TagSelector
      entityName="domain"
      placeholder="Search or add domain..."
      selectedItems={selectedDomains}
      onChange={onChange}
      allDbOptions={domains}
      curatedOptions={CURATED_DOMAINS}
    />
  );
}

function SkillsSelector({
  selectedSkills,
  onChange,
}: {
  selectedSkills: string[];
  onChange: (skills: string[]) => void;
}) {
  const { skills } = useTagOptions();
  return (
    <TagSelector
      entityName="skill"
      placeholder="Search or add skill..."
      selectedItems={selectedSkills}
      onChange={onChange}
      allDbOptions={skills}
      curatedOptions={CURATED_SKILLS}
    />
  );
}


const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function MonthYearPicker({
  value,
  onChange,
  placeholder = "Select date"
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value (format: YYYY-MM)
  const currentYear = value ? parseInt(value.split("-")[0], 10) : new Date().getFullYear();
  const currentMonth = value ? parseInt(value.split("-")[1], 10) : 0; // 1-indexed

  const [viewingYear, setViewingYear] = useState(currentYear || new Date().getFullYear());
  const [prevValue, setPrevValue] = useState(value);

  // Sync viewing year when value prop changes
  if (prevValue !== value) {
    setPrevValue(value);
    if (value) {
      const parts = value.split("-");
      if (parts[0]) {
        const y = parseInt(parts[0], 10);
        if (!isNaN(y)) setViewingYear(y);
      }
    }
  }

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);


  const formatDisplay = (val: string) => {
    if (!val) return "";
    const parts = val.split("-");
    if (parts.length < 2) return val;
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    if (m >= 1 && m <= 12) {
      return `${MONTH_NAMES[m - 1]} ${y}`;
    }
    return val;
  };

  const handleSelectMonth = (monthIndex: number) => {
    const monthStr = String(monthIndex + 1).padStart(2, "0");
    onChange(`${viewingYear}-${monthStr}`);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2.5 flex items-center justify-between text-left cursor-pointer select-none ${INPUT_BASE_CLASSES} ${
          isOpen ? "border-black dark:border-white" : ""
        }`}
      >
        <span className={value ? "text-text-primary font-medium" : "text-text-muted"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-text-muted shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full sm:w-[280px] bg-bg-card border border-[#D1D5DB] dark:border-[#31364A] rounded-xl shadow-lg p-3 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={() => setViewingYear(y => y - 1)}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              aria-label="Previous year"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-heading font-semibold text-sm text-text-primary">
              {viewingYear}
            </span>
            <button
              type="button"
              onClick={() => setViewingYear(y => y + 1)}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              aria-label="Next year"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((month, idx) => {
              const isSelected = Boolean(value && currentYear === viewingYear && currentMonth === idx + 1);
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  className={`py-2 px-2 text-xs text-center transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs rounded-[8px]"
                      : "text-text-primary hover:bg-black/5 dark:hover:bg-white/10 rounded-[8px] font-medium"
                  }`}
                >
                  {month}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 pt-2 border-t border-border-subtle flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewingYear(now.getFullYear());
                handleSelectMonth(now.getMonth());
              }}
              className="font-bold text-brand-dark dark:text-brand-lime hover:underline cursor-pointer"
            >
              This Month
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="text-text-muted hover:text-brand-red cursor-pointer font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface PreferencesStateValues extends Record<string, unknown> {
  country: string;
  cities: string[];
  seniority: string;
  jobTypes: string[];
  experienceYears: number;
  salaryMin: number | null;
  salaryMax: number | null;
  domains: string[];
  skills: string[];
  selectedTemplateId: string;
  includeSummarySections: boolean;
  autofillFromResume: boolean;
  resumeUploaded: boolean;
  resumeFileName: string | null;
  resumeFileKey: string | null;
}

export function serializePreferencesState(state: Partial<PreferencesStateValues>): string {
  const normalized = {
    country: (state.country || "us").trim().toLowerCase(),
    cities: Array.isArray(state.cities) ? [...state.cities].map(s => s.trim().toLowerCase()).sort() : [],
    seniority: (state.seniority || "Mid-level").trim(),
    jobTypes: Array.isArray(state.jobTypes) ? [...state.jobTypes].map(s => s.trim().toLowerCase()).sort() : ["full-time"],
    experienceYears: state.experienceYears != null ? Number(state.experienceYears) : 3,
    salaryMin: state.salaryMin != null ? Number(state.salaryMin) : null,
    salaryMax: state.salaryMax != null ? Number(state.salaryMax) : null,
    domains: Array.isArray(state.domains) ? [...state.domains].map(s => s.trim().toLowerCase()).sort() : [],
    skills: Array.isArray(state.skills) ? [...state.skills].map(s => s.trim().toLowerCase()).sort() : [],
    selectedTemplateId: (state.selectedTemplateId || "mit-capd").trim(),
    includeSummarySections: Boolean(state.includeSummarySections),
    autofillFromResume: Boolean(state.autofillFromResume),
    resumeUploaded: Boolean(state.resumeUploaded),
    resumeFileName: state.resumeFileName ? state.resumeFileName.trim() : null,
    resumeFileKey: state.resumeFileKey ? state.resumeFileKey.trim() : null,
  };
  return JSON.stringify(normalized);
}

type SaveStatus = "unconfirmed" | "saved";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  className?: string;
}

function SaveStatusIndicator({ status, className = "" }: SaveStatusIndicatorProps) {
  return (
    <div
      key={status}
      className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full select-none border-0 transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] animate-pill-switch ${
        status === "unconfirmed"
          ? "bg-amber-500/[0.09] dark:bg-amber-500/[0.14] text-amber-800 dark:text-amber-300"
          : "bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] text-emerald-800 dark:text-emerald-300"
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      {status === "unconfirmed" ? (
        <>
          <div className="w-[18px] h-[18px] rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
            <svg 
              className="w-3 h-3 text-white" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.8" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              aria-hidden="true"
            >
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <span className="text-xs font-semibold">Unconfirmed changes</span>
        </>
      ) : (
        <>
          <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <Check className="w-3 h-3 text-white stroke-[3]" strokeWidth={3} />
          </div>
          <span className="text-xs font-semibold">Changes saved</span>
        </>
      )}
    </div>
  );
}

export default function ManageJobHuntPage() {
  // Resume
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [autofill, setAutofill] = useState(true);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [generatedMarkdown, setGeneratedMarkdown] = useState(sampleResumeMarkdown);
  const resumeStore = useResumeStore();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    resumeStore.selectedTemplateId || RESUME_TEMPLATES[0].id
  );
  const [prevStoreTemplateId, setPrevStoreTemplateId] = useState(resumeStore.selectedTemplateId);

  // Sync selected template from store during render
  if (prevStoreTemplateId !== resumeStore.selectedTemplateId) {
    setPrevStoreTemplateId(resumeStore.selectedTemplateId);
    if (resumeStore.selectedTemplateId) {
      setSelectedTemplateId(resumeStore.selectedTemplateId);
    }
  }
  const [previewTemplate, setPreviewTemplate] = useState<ResumeTemplate | PdfPreviewDocument | null>(null);
  const [templateUrls, setTemplateUrls] = useState<TemplateAssetUrls>({});
  const [includeSummarySections, setIncludeSummarySections] = useState(true);

  const [educations, setEducations] = useState<EducationEntry[]>([{
    id: "1", college: "", degree: "", field: "", startDate: "", endDate: "", grade: "", maxGrade: "", gradeType: "CGPA"
  }]);
  const [experiences, setExperiences] = useState<ExperienceEntry[]>([{
    id: "1", company: "", role: "", startDate: "", endDate: "", jobDescription: "", skills: [], domains: [], responsibilities: ""
  }]);
  
  const [expandedEduIds, setExpandedEduIds] = useState<string[]>(["1"]);
  const [expandedExpIds, setExpandedExpIds] = useState<string[]>(["1"]);
  
  const addEducation = () => {
    const newId = Math.random().toString(36).slice(2, 11);
    setEducations([...educations, { id: newId, college: "", degree: "", field: "", startDate: "", endDate: "", grade: "", maxGrade: "", gradeType: "CGPA" }]);
    setExpandedEduIds([...expandedEduIds, newId]);
  };
  const removeEducation = (id: string) => {
    if (educations.length <= 1) return;
    setEducations(educations.filter(e => e.id !== id));
  };
  
  const addExperience = () => {
    const newId = Math.random().toString(36).slice(2, 11);
    setExperiences([...experiences, { id: newId, company: "", role: "", startDate: "", endDate: "", jobDescription: "", skills: [], domains: [], responsibilities: "" }]);
    setExpandedExpIds([...expandedExpIds, newId]);
  };
  const removeExperience = (id: string) => {
    if (experiences.length <= 1) return;
    setExperiences(experiences.filter(e => e.id !== id));
  };

  // Location
  const [country, setCountry] = useState(COUNTRIES[0].code);
  const [cities, setCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  const filteredCities = useMemo(() => {
    const trimmedInput = cityInput.trim().toLowerCase();
    const selectedCitySet = new Set(cities.map(selected => selected.toLowerCase()));
    return TOP_US_CITIES.filter(c => 
      (!trimmedInput || c.toLowerCase().includes(trimmedInput)) && 
      !selectedCitySet.has(c.toLowerCase())
    );
  }, [cityInput, cities]);

  // Role & Seniority
  const [seniority, setSeniority] = useState<string>("Mid-level");
  const [jobTypes, setJobTypes] = useState<string[]>(["Full-time"]);

  // Experience & Salary
  const [experience, setExperience] = useState<string>("3");
  const [salaryFrom, setSalaryFrom] = useState<string>("");
  const [salaryTo, setSalaryTo] = useState<string>("");

  // Domains & Skills
  const [domains, setDomains] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);


  // Personal details for resume sub-form
  const [personalDetails, setPersonalDetails] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    location: "",
    linkedin: "", github: "", website: "",
  });

  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [isCreatingBase, setIsCreatingBase] = useState(false);
  const [isReplacingResume, setIsReplacingResume] = useState(false);
  const [isDeletingResume, setIsDeletingResume] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeFileKey, setResumeFileKey] = useState<string | null>(null);
  const [resumeFileSize, setResumeFileSize] = useState<number | null>(null);
  const [isViewingResume, setIsViewingResume] = useState(false);

  const { uploadFile, getFileUrl, isUploading: isR2Uploading, progress: uploadProgress } = useR2Storage();

  const [isConfirming, setIsConfirming] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<string | null>(null);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resumeDetailsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const lastConfirmedPreferencesRef = useRef<Record<string, unknown> | null>(null);
  const isInitialMountRef = useRef(false);
  const lastSavedResumeDetailsRef = useRef<string | null>(null);
  const cloudRunExtractionCacheRef = useRef<{ preferences?: JobPreferencesData; resume_details?: ResumeDetailsData } | null>(null);

  // Load existing preferences and tag options from DB on mount
  useEffect(() => {
    let isMounted = true;
    async function loadPreferences() {
      try {
        if (typeof window !== "undefined") {
          try {
            const cached = sessionStorage.getItem("cached_resume_extraction");
            if (cached) {
              cloudRunExtractionCacheRef.current = JSON.parse(cached);
            }
          } catch {
            // Ignore
          }
        }

        const [res, , tplRes, activeResumeRes] = await Promise.all([
          getUserJobPreferences(),
          fetchTagOptions(),
          getAllTemplatePresignedUrls(),
          getUserActiveResume(),
        ]);
        if (isMounted && tplRes?.success && tplRes.data) {
          setTemplateUrls(tplRes.data);
        }
        if (isMounted && activeResumeRes?.success && activeResumeRes?.data?.fileKey) {
          setResumeFileKey(activeResumeRes.data.fileKey);
          setResumeFileName(activeResumeRes.data.fileName || "Uploaded_Resume.pdf");
          setResumeUploaded(true);
          if (activeResumeRes.data.fileSize) {
            setResumeFileSize(activeResumeRes.data.fileSize);
          }
        }
        if (isMounted && res.success && res.data) {
          const d = res.data;
          const p = (d.preferences || {}) as JobPreferencesData;
          const r = (d.resumeDetails || {}) as ResumeDetailsData;

          const activeKey = activeResumeRes?.data?.fileKey || p.resumeFileKey || null;
          const activeName = activeResumeRes?.data?.fileName || p.resumeFileName || null;
          const activeUploaded = activeKey ? true : Boolean(p.resumeUploaded);

          if (p.country) setCountry(p.country);
          if (Array.isArray(p.cities)) setCities(p.cities);
          if (p.seniority) setSeniority(p.seniority);
          if (Array.isArray(p.jobTypes) && p.jobTypes.length > 0) setJobTypes(p.jobTypes);
          if (p.experienceYears != null) setExperience(String(p.experienceYears));
          if (p.salaryMin != null) setSalaryFrom(String(p.salaryMin));
          if (p.salaryMax != null) setSalaryTo(String(p.salaryMax));
          if (Array.isArray(p.domains)) setDomains(p.domains);
          if (Array.isArray(p.skills)) setSkills(p.skills);
          if (p.selectedTemplateId) {
            setSelectedTemplateId(p.selectedTemplateId);
            useResumeStore.getState().setSelectedTemplateId(p.selectedTemplateId);
          }
          if (p.includeSummarySections != null) setIncludeSummarySections(p.includeSummarySections);
          if (p.autofillFromResume != null) setAutofill(p.autofillFromResume);
          if (activeUploaded != null) setResumeUploaded(activeUploaded);
          if (activeName) setResumeFileName(activeName);
          if (activeKey) setResumeFileKey(activeKey);

          const loadedValues: PreferencesStateValues = {
            country: p.country || "us",
            cities: Array.isArray(p.cities) ? p.cities : [],
            seniority: p.seniority || "Mid-level",
            jobTypes: Array.isArray(p.jobTypes) && p.jobTypes.length > 0 ? p.jobTypes : ["Full-time"],
            experienceYears: p.experienceYears != null ? Number(p.experienceYears) : 3,
            salaryMin: p.salaryMin != null ? Number(p.salaryMin) : null,
            salaryMax: p.salaryMax != null ? Number(p.salaryMax) : null,
            domains: Array.isArray(p.domains) ? p.domains : [],
            skills: Array.isArray(p.skills) ? p.skills : [],
            selectedTemplateId: p.selectedTemplateId || "mit-capd",
            includeSummarySections: p.includeSummarySections != null ? Boolean(p.includeSummarySections) : true,
            autofillFromResume: p.autofillFromResume != null ? Boolean(p.autofillFromResume) : true,
            resumeUploaded: activeUploaded,
            resumeFileName: activeName,
            resumeFileKey: activeKey,
          };

          const currentSer = serializePreferencesState(loadedValues);
          lastSavedSnapshotRef.current = currentSer;

          if (p.lastConfirmedPreferences && typeof p.lastConfirmedPreferences === "object") {
            const baselineSer = serializePreferencesState(p.lastConfirmedPreferences);
            setConfirmedSnapshot(baselineSer);
            lastConfirmedPreferencesRef.current = p.lastConfirmedPreferences;
          } else {
            setConfirmedSnapshot(currentSer);
            lastConfirmedPreferencesRef.current = loadedValues;
          }

          if (r.personalDetails) {
            setPersonalDetails({
              ...r.personalDetails,
              linkedin: typeof r.personalDetails.linkedin === "string" ? r.personalDetails.linkedin : "",
              github: typeof r.personalDetails.github === "string" ? r.personalDetails.github : "",
              website: typeof r.personalDetails.website === "string" ? r.personalDetails.website : "",
              fullName: r.personalDetails.fullName || "",
              email: r.personalDetails.email || "",
              phoneNumber: r.personalDetails.phoneNumber || "",
              location: r.personalDetails.location || "",
            });
          }
          if (Array.isArray(r.educationHistory) && r.educationHistory.length > 0) {
            setEducations(r.educationHistory);
          }
          if (Array.isArray(r.experienceHistory) && r.experienceHistory.length > 0) {
            setExperiences(r.experienceHistory);
          }

          lastSavedResumeDetailsRef.current = JSON.stringify({
            personalDetails: r.personalDetails || null,
            educationHistory: r.educationHistory || [],
            experienceHistory: r.experienceHistory || [],
          });
        } else if (isMounted) {
          const defaultValues: PreferencesStateValues = {
            country: "us",
            cities: [],
            seniority: "Mid-level",
            jobTypes: ["Full-time"],
            experienceYears: 3,
            salaryMin: null,
            salaryMax: null,
            domains: [],
            skills: [],
            selectedTemplateId: "mit-capd",
            includeSummarySections: true,
            autofillFromResume: true,
            resumeUploaded: false,
            resumeFileName: null,
            resumeFileKey: null,
          };
          const defSer = serializePreferencesState(defaultValues);
          lastSavedSnapshotRef.current = defSer;
          setConfirmedSnapshot(defSer);
          lastConfirmedPreferencesRef.current = defaultValues;
        }
      } catch (err) {
        console.error("Error loading user preferences:", err);
      } finally {
        if (isMounted) {
          setHasLoadedPreferences(true);
        }
      }
    }

    loadPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleJobType = (type: string) => {
    if (jobTypes.includes(type)) {
      if (jobTypes.length > 1) {
        setJobTypes(jobTypes.filter(t => t !== type));
      } else {
        toast.info("At least one job type must be selected.");
      }
    } else {
      setJobTypes([...jobTypes, type]);
    }
  };

  const currentValues = useMemo<PreferencesStateValues>(() => {
    const parsedSalaryMin = salaryFrom ? Math.max(0, parseInt(salaryFrom, 10)) : null;
    const parsedSalaryMax = salaryTo ? Math.max(0, parseInt(salaryTo, 10)) : null;
    return {
      country,
      cities: cities.slice(0, 3),
      seniority,
      jobTypes: jobTypes.length > 0 ? jobTypes : ["Full-time"],
      experienceYears: Math.min(60, Math.max(0, parseInt(experience || "0", 10) || 0)),
      salaryMin: parsedSalaryMin !== null && !isNaN(parsedSalaryMin) ? parsedSalaryMin : null,
      salaryMax: parsedSalaryMax !== null && !isNaN(parsedSalaryMax) ? parsedSalaryMax : null,
      domains,
      skills,
      selectedTemplateId,
      includeSummarySections,
      autofillFromResume: autofill,
      resumeUploaded: Boolean(selectedFile || resumeUploaded),
      resumeFileName: selectedFile ? selectedFile.name : (resumeFileName || null),
      resumeFileKey: resumeFileKey || null,
    };
  }, [
    country,
    cities,
    seniority,
    jobTypes,
    experience,
    salaryFrom,
    salaryTo,
    domains,
    skills,
    selectedTemplateId,
    includeSummarySections,
    autofill,
    selectedFile,
    resumeUploaded,
    resumeFileName,
    resumeFileKey,
  ]);

  const currentSerialized = useMemo(() => serializePreferencesState(currentValues), [currentValues]);

  const isDirty = useMemo(() => {
    if (!hasLoadedPreferences || !confirmedSnapshot) return false;
    return currentSerialized !== confirmedSnapshot;
  }, [hasLoadedPreferences, confirmedSnapshot, currentSerialized]);

  const saveStatus: SaveStatus = isDirty ? "unconfirmed" : "saved";

  const isSalaryInvalid = useMemo(() => {
    return (
      currentValues.salaryMin !== null &&
      currentValues.salaryMax !== null &&
      currentValues.salaryMin > currentValues.salaryMax
    );
  }, [currentValues.salaryMin, currentValues.salaryMax]);

  // Debounced background auto-save for preferences changes to PostgreSQL
  useEffect(() => {
    if (!hasLoadedPreferences) return;

    if (!isInitialMountRef.current) {
      isInitialMountRef.current = true;
      return;
    }

    // If current values match what is already stored in PostgreSQL, do nothing
    if (currentSerialized === lastSavedSnapshotRef.current) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      return;
    }

    // If salary is temporarily invalid while typing (min > max), pause auto-save until valid
    if (isSalaryInvalid) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const payload = {
          country: currentValues.country,
          cities: currentValues.cities,
          seniority: currentValues.seniority,
          jobTypes: currentValues.jobTypes,
          experienceYears: currentValues.experienceYears,
          salaryMin: currentValues.salaryMin,
          salaryMax: currentValues.salaryMax,
          currency: "USD",
          domains: Array.from(new Set(currentValues.domains)),
          skills: Array.from(new Set(currentValues.skills)),
          selectedTemplateId: currentValues.selectedTemplateId,
          includeSummarySections: currentValues.includeSummarySections,
          autofillFromResume: currentValues.autofillFromResume,
          resumeUploaded: currentValues.resumeUploaded,
          resumeFileName: currentValues.resumeFileName,
          resumeFileKey: currentValues.resumeFileKey,
          isConfirmed: false,
          lastConfirmedPreferences: lastConfirmedPreferencesRef.current,
        };

        const res = await saveUserJobPreferences(payload);
        if (res.success) {
          lastSavedSnapshotRef.current = currentSerialized;
        }
      } catch (err) {
        console.error("Background auto-save preferences failed:", err);
      }
    }, 700);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [currentSerialized, currentValues, hasLoadedPreferences, isSalaryInvalid]);

  // Debounced auto-save for resume sub-form details (education, experience, personal info)
  useEffect(() => {
    if (!hasLoadedPreferences || !showDetailsForm) return;

    const resumeData = {
      personalDetails: personalDetails.fullName || personalDetails.email || personalDetails.phoneNumber || personalDetails.location ? personalDetails : null,
      educationHistory: educations,
      experienceHistory: experiences,
    };
    const serializedResume = JSON.stringify(resumeData);

    if (serializedResume === lastSavedResumeDetailsRef.current) return;

    if (resumeDetailsTimerRef.current) {
      clearTimeout(resumeDetailsTimerRef.current);
    }

    resumeDetailsTimerRef.current = setTimeout(async () => {
      try {
        const res = await saveResumeDetails(resumeData);
        if (res.success) {
          lastSavedResumeDetailsRef.current = serializedResume;
        }
      } catch (err) {
        console.error("Auto-save resume details failed:", err);
      }
    }, 1200);

    return () => {
      if (resumeDetailsTimerRef.current) {
        clearTimeout(resumeDetailsTimerRef.current);
      }
    };
  }, [hasLoadedPreferences, showDetailsForm, personalDetails, educations, experiences]);

  // Handlers
  const hasResume = Boolean(selectedFile || resumeUploaded);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasResume) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleResumeFileUpload = async (file: File) => {
    if (isReplacingResume || isR2Uploading || isCreatingBase || isDeletingResume) return;
    if (file.size > 10 * 1024 * 1024 || !/\.(pdf|docx|doc)$/i.test(file.name)) {
      toast.error("Upload a PDF or Word document up to 10MB.");
      return;
    }
    if (hasResume) {
      toast.info("A resume is already uploaded. Please remove it first to upload a new file.");
      return;
    }

    if (isR2Uploading) {
      toast.info("Upload is already in progress. Please wait.");
      return;
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 10MB limit. Please upload a smaller file.");
      return;
    }

    const allowedExtensions = [".pdf", ".doc", ".docx"];
    const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      toast.error("Invalid file format. Please upload a PDF, DOC, or DOCX file.");
      return;
    }


    setIsReplacingResume(true);
    try {
    toast.loading("Uploading resume to Cloudflare R2...", { id: "resume-upload-toast" });
    const res = await uploadFile({
      file,
      category: "resume",
    });

    if (res.success && res.objectKey) {

      // Invariant: strictly ONE resume per account in Cloudflare R2.
      // commitResumeUpload prunes previous versions from R2 and upserts the DB record.
      const commitRes = await commitResumeUpload({
        objectKey: res.objectKey,
        fileName: file.name,
        fileSize: file.size,
      });

      if (commitRes.success) {
        setSelectedFile(file); setResumeUploaded(true); setResumeFileName(file.name); setResumeFileKey(res.objectKey);
        setIsExtracting(true);
        toast.loading("Resume saved! Extracting details and skills with AI...", { id: "resume-upload-toast" });

        try {
          const profileRes = await fetch("/api/job-hunt/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objectKey: res.objectKey,
              fileName: file.name,
            }),
          });

          const profileData = await profileRes.json();
          if (profileRes.ok && profileData.success) {
            const extPref = profileData.preferences;
            const extDetails = profileData.resume_details;

            // 1. Always cache the raw Cloud Run extraction in memory and sessionStorage
            cloudRunExtractionCacheRef.current = {
              preferences: extPref,
              resume_details: extDetails,
            };
            if (typeof window !== "undefined") {
              try {
                sessionStorage.setItem(
                  "cached_resume_extraction",
                  JSON.stringify({ preferences: extPref, resume_details: extDetails })
                );
              } catch {
                // Ignore storage error
              }
            }

            // 2. If 'Autofill from resume' is ON, auto-fill form immediately
            if (autofill) {
              if (extPref) {
                if (Array.isArray(extPref.skills) && extPref.skills.length > 0) {
                  setSkills(extPref.skills);
                }
                if (Array.isArray(extPref.domains) && extPref.domains.length > 0) {
                  setDomains(extPref.domains);
                }
                if (extPref.seniority) {
                  setSeniority(extPref.seniority);
                }
                if (Array.isArray(extPref.cities) && extPref.cities.length > 0) {
                  setCities(extPref.cities.slice(0, 3));
                }
                if (extPref.country) {
                  setCountry(extPref.country.toLowerCase());
                }
                if (Array.isArray(extPref.jobTypes) && extPref.jobTypes.length > 0) {
                  setJobTypes(extPref.jobTypes);
                }
                if (extPref.experienceYears != null) {
                  setExperience(String(extPref.experienceYears));
                }
                if (extPref.selectedTemplateId) {
                  setSelectedTemplateId(extPref.selectedTemplateId);
                  useResumeStore.getState().setSelectedTemplateId(extPref.selectedTemplateId);
                }
              }

              if (extDetails) {
                if (extDetails.personalDetails) {
                  setPersonalDetails({
              ...extDetails.personalDetails,
              linkedin: typeof extDetails.personalDetails.linkedin === "string" ? extDetails.personalDetails.linkedin : "",
              github: typeof extDetails.personalDetails.github === "string" ? extDetails.personalDetails.github : "",
              website: typeof extDetails.personalDetails.website === "string" ? extDetails.personalDetails.website : "",
              fullName: extDetails.personalDetails.fullName || "",
                    email: extDetails.personalDetails.email || "",
                    phoneNumber: extDetails.personalDetails.phoneNumber || "",
                    location: extDetails.personalDetails.location || "",
                  });
                }
                if (Array.isArray(extDetails.educationHistory) && extDetails.educationHistory.length > 0) {
                  setEducations(extDetails.educationHistory);
                }
                if (Array.isArray(extDetails.experienceHistory) && extDetails.experienceHistory.length > 0) {
                  setExperiences(extDetails.experienceHistory);
                }
              }

              toast.success("Resume processed & details auto-filled! Please review and confirm your changes.", {
                id: "resume-upload-toast",
                duration: 5000,
              });
            } else {
              // Autofill is OFF: Do NOT touch screen fields!
              toast.success("Resume uploaded! 'Autofill from resume' is OFF, so your form was not modified. Turn on the toggle anytime to apply extracted details.", {
                id: "resume-upload-toast",
                duration: 6000,
              });
            }
          } else {
            console.warn("Profile extraction returned non-ok:", profileData);
            toast.success("Resume uploaded! (Auto-fill was unavailable, enter details manually)", {
              id: "resume-upload-toast",
              duration: 4000,
            });
          }
        } catch (extractErr) {
          console.error("Error calling profile extraction:", extractErr);
          toast.success("Resume uploaded! (Auto-fill was unavailable, enter details manually)", {
            id: "resume-upload-toast",
            duration: 4000,
          });
        } finally {
          setIsExtracting(false);
        }
      } else {
        toast.error(commitRes.error || "Failed to commit resume record to database.", { id: "resume-upload-toast" });
      }
    } else {
      toast.error(res.error || "Failed to upload resume to Cloudflare R2.", { id: "resume-upload-toast" });
    }
    } finally { setIsReplacingResume(false); }
  };

  const handleDeleteResume = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReplacingResume || isDeletingResume || isCreatingBase || isR2Uploading) return;
    if (resumeFileKey) {
      setIsDeletingResume(true);
      toast.loading("Removing resume from Cloudflare R2 & database...", { id: "resume-delete-toast" });
      try {
        const res = await deleteUserResume();
        if (res.success) {
          setSelectedFile(null);
          setResumeUploaded(false);
          setResumeFileName(null);
          setResumeFileKey(null);
          setResumeFileSize(null);
          cloudRunExtractionCacheRef.current = null;
          if (typeof window !== "undefined") {
            try {
              sessionStorage.removeItem("cached_resume_extraction");
            } catch {
              // Ignore
            }
          }
          toast.success("Resume removed from Cloudflare R2 & database.", { id: "resume-delete-toast" });
        } else {
          toast.error(res.error || "Failed to remove resume.", { id: "resume-delete-toast" });
        }
      } catch {
        toast.error("Failed to remove resume.", { id: "resume-delete-toast" });
      } finally { setIsDeletingResume(false); }
    } else {
      setSelectedFile(null);
      setResumeUploaded(false);
      setResumeFileName(null);
      setResumeFileKey(null);
      setResumeFileSize(null);
    }
  };

  const handlePreviewStoredResume = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const fileName = selectedFile ? selectedFile.name : (resumeFileName || "");
    const lowerName = fileName.toLowerCase();

    // Check if uploaded file is non-PDF (e.g. .docx or .doc)
    if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
      toast.info("Document Preview", {
        description: "In-browser preview is available for PDF files. Your Word document is safely uploaded.",
      });
      return;
    }

    // Case 1: Freshly selected local PDF (instant preview via Object URL)
    if (selectedFile && (selectedFile.type === "application/pdf" || lowerName.endsWith(".pdf"))) {
      const blobUrl = URL.createObjectURL(selectedFile);
      setPreviewTemplate({
        id: "uploaded-resume",
        name: selectedFile.name.replace(/\.[^/.]+$/, "") || "Uploaded Resume",
        category: "Uploaded Resume",
        fileName: selectedFile.name,
        filePath: blobUrl,
      });
      return;
    }

    // Case 2: Resume stored in Cloudflare R2
    if (!resumeFileKey) {
      toast.info("Please upload a resume first to preview it.");
      return;
    }

    setIsViewingResume(true);
    const displayName = resumeFileName?.replace(/\.[^/.]+$/, "") || "Uploaded Resume";
    const displayFileName = resumeFileName || "Resume.pdf";

    // Open modal immediately with streaming loader for instant visual feedback
    setPreviewTemplate({
      id: "uploaded-resume",
      name: displayName,
      category: "Uploaded Resume",
      fileName: displayFileName,
      filePath: "",
    });

    try {
      const url = await getFileUrl(resumeFileKey);
      if (url) {
        setPreviewTemplate((prev) => 
          prev ? { ...prev, filePath: url } : null
        );
      } else {
        setPreviewTemplate(null);
        toast.error("Unable to generate preview link for this resume.");
      }
    } catch (err) {
      console.error("Failed to load resume preview:", err);
      setPreviewTemplate(null);
      toast.error("Error retrieving preview link.");
    } finally {
      setIsViewingResume(false);
    }
  };

  const handleClosePdfPreview = () => {
    if (previewTemplate?.filePath?.startsWith("blob:")) {
      URL.revokeObjectURL(previewTemplate.filePath);
    }
    setPreviewTemplate(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (hasResume) {
      toast.info("A resume is already uploaded. Please remove it first to upload a new file.");
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleResumeFileUpload(file);
    }
  };

  const handleGenerateResume = () => {
    setShowDetailsForm(true);
    toast.info("Please fill in your details to generate a customized resume.");
  };

  const saveBasePdf = async (markdown: string, templateId: string) => {
    const response = await fetch("/api/resume/base", {
      method: "POST", signal: AbortSignal.timeout(110_000), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown, templateId }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Could not create a PDF. Your current resume is retained.");
    }
    const blob = await response.blob();
    if ((await blob.slice(0, 5).text()) !== "%PDF-") throw new Error("The PDF service returned an invalid file. Retry.");
    const name = `${(personalDetails.fullName || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "Resume"}_Resume.pdf`;
    const file = new File([blob], name, { type: "application/pdf" });
    const uploaded = await uploadFile({ file, category: "resume" });
    if (!uploaded.success || !uploaded.objectKey) throw new Error(uploaded.error || "PDF upload failed.");
    const saved = await commitResumeUpload({ objectKey: uploaded.objectKey, fileName: name, fileSize: file.size });
    if (!saved.success) throw new Error(saved.error || "PDF could not be saved. Your current resume is retained.");
    setSelectedFile(file); setResumeFileKey(uploaded.objectKey); setResumeFileName(name); setResumeUploaded(true);
    setGeneratedMarkdown(markdown);
    window.dispatchEvent(new Event("resume-requests-changed"));
  };

  const generateAndShowResume = async () => {
    if (isCreatingBase || isReplacingResume || isR2Uploading || isDeletingResume) return;
    setIsCreatingBase(true);
    toast.loading("Creating your PDF from the details you supplied...", { id: "base-create" });
    try {
      const details = { personalDetails, educationHistory: educations, experienceHistory: experiences };
      const markdown = buildBaseResume(details, skills);
      await saveBasePdf(markdown, selectedTemplateId);
      setShowDetailsForm(false);
      setIsResumeModalOpen(true);
      const detailsSaved = await saveResumeDetails(details);
      if (!detailsSaved.success) toast.warning("PDF saved. Form details could not be saved; retry saving those details.");
      toast.success("Resume PDF saved. No credits used.", { id: "base-create" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create and save the resume.", { id: "base-create" });
    } finally { setIsCreatingBase(false); }
  };

  const handleAddCity = (city: string) => {
    const trimmed = city.trim();
    if (cities.length < 3 && trimmed && !cities.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      const canonical = TOP_US_CITIES.find(c => c.toLowerCase() === trimmed.toLowerCase()) || trimmed;
      setCities(prev => [...prev, canonical]);
      setCityInput("");
      setIsCityDropdownOpen(false);
    }
  };

  const removeCity = (cityToRemove: string) => {
    setCities(prev => prev.filter(c => c !== cityToRemove));
  };

  const handleToggleAutofill = (enabled: boolean) => {
    setAutofill(enabled);
    if (enabled) {
      let extraction = cloudRunExtractionCacheRef.current;
      if (!extraction && typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem("cached_resume_extraction");
          if (stored) {
            extraction = JSON.parse(stored);
            cloudRunExtractionCacheRef.current = extraction;
          }
        } catch {
          // Ignore
        }
      }

      if (extraction) {
        const { preferences: extPref, resume_details: extDetails } = extraction;
        if (extPref) {
          if (Array.isArray(extPref.skills) && extPref.skills.length > 0) setSkills(extPref.skills);
          if (Array.isArray(extPref.domains) && extPref.domains.length > 0) setDomains(extPref.domains);
          if (extPref.seniority) setSeniority(extPref.seniority);
          if (Array.isArray(extPref.cities) && extPref.cities.length > 0) setCities(extPref.cities.slice(0, 3));
          if (extPref.country) setCountry(extPref.country.toLowerCase());
          if (Array.isArray(extPref.jobTypes) && extPref.jobTypes.length > 0) setJobTypes(extPref.jobTypes);
          if (extPref.experienceYears != null) setExperience(String(extPref.experienceYears));
          if (extPref.selectedTemplateId) {
            setSelectedTemplateId(extPref.selectedTemplateId);
            useResumeStore.getState().setSelectedTemplateId(extPref.selectedTemplateId);
          }
        }
        if (extDetails) {
          if (extDetails.personalDetails) {
            setPersonalDetails({
              ...extDetails.personalDetails,
              linkedin: typeof extDetails.personalDetails.linkedin === "string" ? extDetails.personalDetails.linkedin : "",
              github: typeof extDetails.personalDetails.github === "string" ? extDetails.personalDetails.github : "",
              website: typeof extDetails.personalDetails.website === "string" ? extDetails.personalDetails.website : "",
              fullName: extDetails.personalDetails.fullName || "",
              email: extDetails.personalDetails.email || "",
              phoneNumber: extDetails.personalDetails.phoneNumber || "",
              location: extDetails.personalDetails.location || "",
            });
          }
          if (Array.isArray(extDetails.educationHistory) && extDetails.educationHistory.length > 0) {
            setEducations(extDetails.educationHistory);
          }
          if (Array.isArray(extDetails.experienceHistory) && extDetails.experienceHistory.length > 0) {
            setExperiences(extDetails.experienceHistory);
          }
        }
        toast.success("Applied extracted resume details to the form!");
      }
    }
  };

  useClickOutside(cityDropdownRef, () => setIsCityDropdownOpen(false), isCityDropdownOpen);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showDetailsForm) {
      generateAndShowResume();
      return;
    }

    if (!hasLoadedPreferences) {
      toast.info("Please wait a moment while your saved preferences load.");
      return;
    }

    // Untouched since last confirm
    if (!isDirty) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    setIsConfirming(true);
    try {
      // 1. Sync local resume store
      resumeStore.setSelectedTemplateId(selectedTemplateId);
      resumeStore.saveResume(undefined, selectedTemplateId);

      // 2. Validate salary bounds
      const parsedSalaryMin = currentValues.salaryMin;
      const parsedSalaryMax = currentValues.salaryMax;

      if (parsedSalaryMin !== null && parsedSalaryMax !== null && parsedSalaryMin > parsedSalaryMax) {
        toast.error("Salary Range Error", {
          description: "Minimum salary cannot exceed maximum salary.",
        });
        setIsConfirming(false);
        return;
      }

      // 3. Confirm & Persist Preferences to PostgreSQL via Server Action
      const nowIso = new Date().toISOString();
      const payload = {
        country: currentValues.country,
        cities: currentValues.cities,
        seniority: currentValues.seniority,
        jobTypes: currentValues.jobTypes,
        experienceYears: currentValues.experienceYears,
        salaryMin: parsedSalaryMin,
        salaryMax: parsedSalaryMax,
        currency: "USD",
        domains: Array.from(new Set(currentValues.domains)),
        skills: Array.from(new Set(currentValues.skills)),
        selectedTemplateId: currentValues.selectedTemplateId,
        includeSummarySections: currentValues.includeSummarySections,
        autofillFromResume: currentValues.autofillFromResume,
        resumeUploaded: currentValues.resumeUploaded,
        resumeFileName: currentValues.resumeFileName,
        resumeFileKey: currentValues.resumeFileKey,
        isConfirmed: true,
        confirmedAt: nowIso,
        lastConfirmedPreferences: currentValues,
      };

      const res = await saveUserJobPreferences(payload);

      if (res.success) {
        if (selectedFile) {
          setResumeFileName(selectedFile.name);
        }
        cloudRunExtractionCacheRef.current = null;
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem("cached_resume_extraction");
          } catch {
            // Ignore
          }
        }
        lastSavedSnapshotRef.current = currentSerialized;
        lastConfirmedPreferencesRef.current = currentValues;
        setConfirmedSnapshot(currentSerialized);

        const chosenTemplate = RESUME_TEMPLATES.find((t) => t.id === selectedTemplateId);
        toast.success("Changes confirmed successfully!", {
          description: chosenTemplate 
            ? `Your job hunt preferences are finalised. Active template: "${chosenTemplate.name}".`
            : "Your job hunt preferences are finalised and locked in.",
        });
      } else {
        toast.error(res.error || "Failed to confirm preferences.");
      }
    } catch (err: unknown) {
      console.error("Confirm preferences failed:", err);
      toast.error("An unexpected error occurred while confirming preferences.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="w-full max-w-5xl pb-16 mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header with Top Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            {showDetailsForm ? "Resume Details" : "Manage Job Hunt"}
          </h1>
          <p className="text-text-muted text-base">
            {showDetailsForm 
              ? "Fill in your details to generate a customized professional resume." 
              : "Fine-tune your preferences to get better curated job matches."}
          </p>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto flex-wrap">
          {!hasLoadedPreferences ? (
            <div className="h-[42px] w-44 rounded-md bg-[#DDE2E7] dark:bg-[#2C3246] animate-skeleton-pulse" />
          ) : (
            <>
              {!showDetailsForm && (
                <div className="flex items-center select-none">
                  <SaveStatusIndicator status={saveStatus} />
                </div>
              )}
              {showDetailsForm && (
                <button 
                  type="button"
                  onClick={() => setShowDetailsForm(false)}
                  className="inline-flex items-center justify-center gap-1.5 h-[42px] px-4 rounded-md font-heading text-sm font-semibold text-text-muted hover:text-black dark:hover:text-white transition-colors cursor-pointer border-[1.5px] border-transparent hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98]"
                >
                  <X className="w-4 h-4" strokeWidth={2.5} />
                  <span>Cancel</span>
                </button>
              )}
              <button 
                onClick={() => formRef.current?.requestSubmit()}
                type="button"
                disabled={showDetailsForm ? false : (!isDirty || isConfirming)}
                className={
                  showDetailsForm 
                    ? "inline-flex items-center justify-center gap-2 h-[42px] px-5 sm:px-6 rounded-md border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black disabled:opacity-60 disabled:cursor-not-allowed shadow-xs"
                    : !isDirty || isConfirming
                    ? "inline-flex items-center justify-center gap-2 h-[42px] px-5 sm:px-6 rounded-md border-[1.5px] border-border-subtle dark:border-transparent bg-[#F3F4F6] text-[#9CA3AF] font-heading text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-not-allowed dark:bg-[#1E212D] dark:text-[#6B7280] opacity-60"
                    : "inline-flex items-center justify-center gap-2 h-[42px] px-5 sm:px-6 rounded-md border-[1.5px] border-transparent bg-brand-dark text-white font-heading text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:opacity-90 active:scale-[0.98] dark:bg-[#F3F4F6] dark:text-[#111827] dark:hover:opacity-90 shadow-xs"
                }
              >
                {showDetailsForm ? (
                  <>
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>{isCreatingBase ? "Creating PDF..." : "Create PDF (free)"}</span>
                  </>
                ) : isConfirming ? (
                  <>
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                    <span>Confirm Changes</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {!hasLoadedPreferences ? (
        <ManageJobHuntFormSkeleton />
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        
        {/* SECTION 1: Resume */}
        {!showDetailsForm && (
          <section className="bg-bg-card border border-border-subtle rounded-lg p-5 md:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-black dark:text-brand-lime" />
              Resume
            </h2>
            <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap w-full sm:w-auto">
              <span className="text-xs sm:text-sm font-medium sm:font-semibold text-text-muted">
                Don&apos;t have a resume?
              </span>
              <button
                type="button"
                onClick={handleGenerateResume}
                className="inline-flex items-center justify-center gap-[0.35rem] p-[0.38rem_0.85rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
              >
                <Sparkles className="w-[13px] h-[13px]" />
                <span>Create Resume (free)</span>
              </button>
            </div>
          </div>
          
          {hasResume ? (
            <div 
              className="flex items-center justify-between w-full p-3 sm:px-4 sm:py-3.5 rounded-md bg-bg-input transition-colors mb-4 border border-border-subtle/50"
            >
              <div className="flex items-center gap-3 min-w-0 pr-3">
                <div className="w-10 h-10 rounded-full bg-black/10 text-black dark:bg-white/20 dark:text-[#F3F4F6] flex items-center justify-center shrink-0">
                  {isR2Uploading || isExtracting ? (
                    <Loader2 className="w-5 h-5 animate-spin text-black dark:text-[#F3F4F6]" />
                  ) : (
                    <Check className="w-5 h-5 stroke-[2.5] shrink-0" strokeWidth={2.5} />
                  )}
                </div>
                <div className="text-left min-w-0">
                  <p className="font-bold text-sm truncate text-text-primary">
                    {selectedFile ? selectedFile.name : (resumeFileName || "Uploaded_Resume.pdf")}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {isR2Uploading 
                      ? `Uploading directly to R2... ${uploadProgress}%` 
                      : isExtracting
                        ? "Extracting skills & profile details via AI..."
                        : resumeFileSize 
                          ? `${formatFileSize(resumeFileSize)} • Uploaded resume` 
                          : "Uploaded resume • Ready for applications"}
                  </p>
                </div>
              </div>

              {/* Action buttons inside container: pushed cleanly to the right with symmetrical container padding */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePreviewStoredResume}
                  disabled={isViewingResume || isR2Uploading || isExtracting}
                  className="h-10 px-4 rounded-full font-heading text-xs sm:text-[13px] font-semibold bg-white dark:bg-[#202330] text-text-primary border-0 shadow-xs hover:bg-zinc-100 dark:hover:bg-[#2B3042] transition-all duration-200 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap inline-flex items-center justify-center gap-2"
                  title="Preview resume document"
                  aria-label="Preview resume"
                >
                  {isViewingResume ? (
                    <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                  ) : (
                    <Eye className="w-4 h-4 text-text-muted dark:text-gray-300" strokeWidth={2} />
                  )}
                  <span>Preview</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeleteResume}
                  disabled={isReplacingResume || isDeletingResume || isCreatingBase || isR2Uploading || isExtracting}
                  title="Delete resume from cloud"
                  aria-label="Delete resume"
                  className="w-10 h-10 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 bg-red-100/80 dark:bg-red-950/40 hover:bg-red-200/90 dark:hover:bg-red-900/60 border-0 shadow-xs transition-all duration-200 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : (
            <div 
              className={`relative flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed rounded-md transition-colors mb-4
                ${dragActive ? "border-brand-lime bg-brand-lime/10" : "border-border-input hover:border-text-subtle"}
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${(selectedFile || resumeUploaded) ? "pointer-events-none" : ""}`}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    handleResumeFileUpload(file);
                    e.target.value = "";
                  }
                }}
                accept=".pdf,.doc,.docx"
                title="Click or drag to upload resume"
              />
              <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-bg-input flex items-center justify-center">
                  <UploadCloud className="w-5 h-5 text-text-muted" />
                </div>
                <div>
                  <p className="font-bold text-sm text-text-primary">Click to upload or drag and drop</p>
                  <p className="text-xs text-text-muted mt-0.5">PDF, DOCX up to 10MB</p>
                </div>
              </div>
            </div>
          )}

          {(selectedFile || resumeUploaded) && <label className="relative mb-4 inline-flex cursor-pointer items-center gap-2 rounded border border-border-input px-3 py-2 text-sm font-semibold">
            <UploadCloud className="h-4 w-4" /> {isReplacingResume ? "Replacing resume..." : "Replace resume"}
            <input type="file" accept=".pdf,.docx,.doc" aria-label="Replace resume"
              disabled={isReplacingResume || isDeletingResume || isCreatingBase}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleResumeFileUpload(file); event.target.value = ""; }} />
          </label>}

          <div className="flex items-center justify-end">
            <label className="flex items-center gap-3 cursor-pointer group select-none">
              <span className="text-sm font-semibold text-text-muted group-hover:text-text-primary transition-colors">
                Autofill from resume
              </span>
              <div className="relative inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="sr-only"
                  checked={autofill}
                  onChange={(e) => handleToggleAutofill(e.target.checked)}
                />
                <div 
                  className={`w-[48px] h-[25px] rounded-full p-[2.5px] transition-colors duration-700 ease-[cubic-bezier(0.2,1,0.3,1)] ${
                    autofill 
                      ? "bg-brand-dark dark:bg-[#F3F4F6]" 
                      : "bg-[#D1D5DB] dark:bg-[#383D4E]"
                  }`}
                >
                  <div 
                    className={`w-[25px] h-[20px] rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all duration-700 ease-[cubic-bezier(0.2,1,0.3,1)] ${
                      autofill 
                        ? "translate-x-[18px] bg-white dark:bg-[#111827] dark:shadow-none" 
                        : "translate-x-0 bg-white"
                    }`} 
                  />
                </div>
              </div>
            </label>
          </div>
        </section>
        )}

        {/* SECTION 1.5: Details Form (Conditional) */}
        {showDetailsForm && (
          <section className="bg-bg-card border border-border-subtle rounded-lg shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="p-5 md:p-6 border-b border-border-subtle">
              <h2 className="text-base font-bold flex items-center gap-2">
                <FileText className="w-4 h-4 text-black dark:text-brand-lime" />
                Resume Details
              </h2>
            </div>

            <p className="px-5 pt-4 text-sm text-text-muted">Create a PDF using only the details below. No AI claims or credits are added.</p>
            {/* Personal Details */}
            <div className="p-5 md:p-6 border-b border-border-subtle space-y-6">
              <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4" /> Personal Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <label className="block text-sm font-bold">Full Name</label>
                  <input 
                    type="text" 
                    placeholder="Your full name"
                    required
                    aria-label="Full name" 
                    value={personalDetails.fullName}
                    onChange={(e) => setPersonalDetails(prev => ({ ...prev, fullName: e.target.value }))}
                    className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="block text-sm font-bold">Email</label>
                  <input 
                    type="email" 
                    placeholder="john@example.com" 
                    value={personalDetails.email}
                    onChange={(e) => setPersonalDetails(prev => ({ ...prev, email: e.target.value }))}
                    className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="block text-sm font-bold">Phone Number</label>
                  <input 
                    type="tel" 
                    placeholder="+1 (555) 000-0000" 
                    value={personalDetails.phoneNumber}
                    onChange={(e) => setPersonalDetails(prev => ({ ...prev, phoneNumber: e.target.value }))}
                    className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="block text-sm font-bold">Location</label>
                  <input 
                    type="text" 
                    placeholder="San Francisco, CA" 
                    value={personalDetails.location}
                    onChange={(e) => setPersonalDetails(prev => ({ ...prev, location: e.target.value }))}
                    className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                  />
                </div>
                {(["linkedin", "github", "website"] as const).map(key => (
                  <label key={key} className="space-y-2.5">
                    <span className="block text-sm font-bold">{key === "linkedin" ? "LinkedIn URL" : key === "github" ? "GitHub URL" : "Website / portfolio URL"}</span>
                    <input type="url" value={personalDetails[key]} placeholder="https://..."
                      onChange={event => setPersonalDetails(previous => ({ ...previous, [key]: event.target.value }))}
                      className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} />
                  </label>
                ))}
              </div>
            </div>            {/* Education */}
            <div className="p-5 md:p-6 border-b border-border-subtle space-y-6">
              <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <GraduationCap className="w-4 h-4" /> Education
              </h3>
              
              <div className="space-y-4">
                {educations.map((edu, index) => {
                  const isExpanded = expandedEduIds.includes(edu.id) || educations.length === 1;
                  const canCollapse = educations.length > 1;
                  
                  return (
                    <div key={edu.id} className="border border-[#D1D5DB] dark:border-[#31364A] rounded-lg overflow-hidden bg-bg-card shadow-2xs">
                      {canCollapse && (
                        <div 
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-transparent"
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedEduIds(expandedEduIds.filter(id => id !== edu.id));
                            } else {
                              setExpandedEduIds([...expandedEduIds, edu.id]);
                            }
                          }}
                          style={{ borderBottomColor: isExpanded ? 'var(--color-border-subtle)' : 'transparent' }}
                        >
                          <div className="font-bold text-sm">
                            {edu.college || edu.degree ? `${edu.degree} at ${edu.college}` : `Education Entry ${index + 1}`}
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); removeEducation(edu.id); }} 
                              className="text-brand-red hover:opacity-80 text-xs font-bold flex items-center gap-1.5 p-1 transition-opacity cursor-pointer shrink-0"
                              title="Remove education"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                            <span className="text-text-muted flex items-center">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2.5 md:col-span-2">
                            <label className="block text-sm font-bold">College / University</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Stanford University" 
                              className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                              value={edu.college}
                              onChange={e => setEducations(educations.map(x => x.id === edu.id ? { ...x, college: e.target.value } : x))}
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Degree</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Bachelor of Science" 
                              className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                              value={edu.degree}
                              onChange={e => setEducations(educations.map(x => x.id === edu.id ? { ...x, degree: e.target.value } : x))}
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Field of Study</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Computer Science" 
                              className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                              value={edu.field}
                              onChange={e => setEducations(educations.map(x => x.id === edu.id ? { ...x, field: e.target.value } : x))}
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Start Date</label>
                            <MonthYearPicker 
                              value={edu.startDate}
                              onChange={val => setEducations(educations.map(x => x.id === edu.id ? { ...x, startDate: val } : x))}
                              placeholder="Select start date"
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">End Date</label>
                            <MonthYearPicker 
                              value={edu.endDate}
                              onChange={val => setEducations(educations.map(x => x.id === edu.id ? { ...x, endDate: val } : x))}
                              placeholder="Select end date"
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Grade Details</label>
                            <div className="grid grid-cols-3 gap-2">
                              <input 
                                type="number" 
                                placeholder="Grade" 
                                className={`w-full px-3 py-2.5 ${INPUT_BASE_CLASSES}`} 
                                value={edu.grade}
                                onChange={e => setEducations(educations.map(x => x.id === edu.id ? { ...x, grade: e.target.value } : x))}
                              />
                              <span className="flex items-center justify-center text-text-muted font-bold text-sm">out of</span>
                              <input 
                                type="number" 
                                placeholder="Max" 
                                className={`w-full px-3 py-2.5 ${INPUT_BASE_CLASSES}`} 
                                value={edu.maxGrade}
                                onChange={e => setEducations(educations.map(x => x.id === edu.id ? { ...x, maxGrade: e.target.value } : x))}
                              />
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Grade Type</label>
                            <div className="relative">
                              <select 
                                className={`w-full px-4 py-2.5 appearance-none ${INPUT_BASE_CLASSES}`}
                                value={edu.gradeType}
                                onChange={e => setEducations(educations.map(x => x.id === edu.id ? { ...x, gradeType: e.target.value } : x))}
                              >
                                <option>CGPA</option>
                                <option>Percentage</option>
                                <option>Letter Grade</option>
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-1">
                <button 
                  type="button" 
                  onClick={addEducation}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-md border border-border-input hover:border-brand-dark dark:hover:border-white text-brand-dark dark:text-white bg-bg-card hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer active:scale-[0.99]"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Education
                </button>
              </div>
            </div>

            {/* Experience */}
            <div className="p-5 md:p-6 space-y-6">
              <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Experience
              </h3>

              <div className="space-y-4">
                {experiences.map((exp, index) => {
                  const isExpanded = expandedExpIds.includes(exp.id) || experiences.length === 1;
                  const canCollapse = experiences.length > 1;

                  return (
                    <div key={exp.id} className="border border-[#D1D5DB] dark:border-[#31364A] rounded-lg overflow-hidden bg-bg-card shadow-2xs">
                      {canCollapse && (
                        <div 
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-transparent"
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedExpIds(expandedExpIds.filter(id => id !== exp.id));
                            } else {
                              setExpandedExpIds([...expandedExpIds, exp.id]);
                            }
                          }}
                          style={{ borderBottomColor: isExpanded ? 'var(--color-border-subtle)' : 'transparent' }}
                        >
                          <div className="font-bold text-sm">
                            {exp.role || exp.company ? `${exp.role} at ${exp.company}` : `Experience Entry ${index + 1}`}
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); removeExperience(exp.id); }} 
                              className="text-brand-red hover:opacity-80 text-xs font-bold flex items-center gap-1.5 p-1 transition-opacity cursor-pointer shrink-0"
                              title="Remove experience"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                            <span className="text-text-muted flex items-center">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Company</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Google" 
                              className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                              value={exp.company}
                              onChange={e => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, company: e.target.value } : x))}
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Role</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Software Engineer" 
                              className={`w-full px-4 py-2.5 ${INPUT_BASE_CLASSES}`} 
                              value={exp.role}
                              onChange={e => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, role: e.target.value } : x))}
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">Start Date</label>
                            <MonthYearPicker 
                              value={exp.startDate}
                              onChange={val => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, startDate: val } : x))}
                              placeholder="Select start date"
                            />
                          </div>
                          <div className="space-y-2.5">
                            <label className="block text-sm font-bold">End Date</label>
                            <MonthYearPicker 
                              value={exp.endDate}
                              onChange={val => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, endDate: val } : x))}
                              placeholder="Select end date"
                            />
                          </div>
                          
                          <div className="space-y-2.5 md:col-span-2">
                            <label className="block text-sm font-bold">Job Description</label>
                            <textarea 
                              rows={2} 
                              placeholder="Brief description of the job..."
                              className={`w-full px-4 py-2.5 resize-none ${INPUT_BASE_CLASSES}`} 
                              value={exp.jobDescription}
                              onChange={e => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, jobDescription: e.target.value } : x))}
                            />
                          </div>

                          <div className="flex flex-col h-full gap-2.5">
                            <label className="block text-sm font-bold shrink-0">Domains</label>
                            <DomainsSelector 
                              selectedDomains={exp.domains} 
                              onChange={(newDomains) => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, domains: newDomains } : x))}
                            />
                          </div>

                          <div className="flex flex-col h-full gap-2.5">
                            <label className="block text-sm font-bold shrink-0">Skills</label>
                            <SkillsSelector 
                              selectedSkills={exp.skills} 
                              onChange={(newSkills) => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, skills: newSkills } : x))}
                            />
                          </div>

                          <div className="space-y-2.5 md:col-span-2">
                            <label className="block text-sm font-bold">Responsibilities & Achievements</label>
                            <textarea 
                              rows={4} 
                              placeholder="Describe your responsibilities, achievements, and impact..."
                              className={`w-full px-4 py-2.5 resize-none ${INPUT_BASE_CLASSES}`} 
                              value={exp.responsibilities}
                              onChange={e => setExperiences(experiences.map(x => x.id === exp.id ? { ...x, responsibilities: e.target.value } : x))}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-1">
                <button 
                  type="button" 
                  onClick={addExperience}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-md border border-border-input hover:border-brand-dark dark:hover:border-white text-brand-dark dark:text-white bg-bg-card hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer active:scale-[0.99]"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Experience
                </button>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 2: Unified Preferences */}
        {!showDetailsForm && (
          <section className="bg-bg-card border border-border-subtle rounded-lg shadow-sm">
          <div className="p-5 md:p-6 border-b border-border-subtle">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-black dark:text-brand-lime" />
              Job Preferences
            </h2>
          </div>

          {/* Location Group */}
          <div className="p-5 md:p-6 border-b border-border-subtle grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <label className="text-sm font-bold flex gap-1">Country <span className="text-brand-red">*</span></label>
              <div className="flex">
                <div className="inline-flex items-center gap-2.5 px-4 py-2.5 text-[0.875rem] font-semibold rounded-[10px] bg-black text-white border-[1.5px] border-black shadow-xs dark:bg-white dark:text-black dark:border-white select-none">
                  <FlagUS className="w-5 h-3.5" />
                  <span>United States (USA)</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 relative">
              <label className="text-sm font-bold flex justify-between">
                <span>Cities (Max 3)</span>
                <span className="text-text-muted text-xs">{cities.length}/3</span>
              </label>
              
              <div ref={cityDropdownRef} className="relative">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  <input 
                    type="text" 
                    value={cityInput}
                    onChange={(e) => { 
                      setCityInput(e.target.value); 
                      if (cities.length < 3) setIsCityDropdownOpen(true); 
                    }}
                    onClick={() => { if (cities.length < 3) setIsCityDropdownOpen(true); }}
                    onFocus={() => { if (cities.length < 3) setIsCityDropdownOpen(true); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && cityInput.trim()) {
                        e.preventDefault();
                        const match = filteredCities.find(c => c.toLowerCase() === cityInput.trim().toLowerCase() || c.toLowerCase().startsWith(cityInput.trim().toLowerCase()));
                        handleAddCity(match || cityInput.trim());
                      } else if (e.key === "Escape") {
                        setIsCityDropdownOpen(false);
                      }
                    }}
                    placeholder={cities.length >= 3 ? "Max cities reached (3/3)" : "Search or choose US cities (e.g. New York, San Francisco)..."}
                    disabled={cities.length >= 3}
                    className={`w-full pl-9 pr-3 py-2.5 ${INPUT_BASE_CLASSES}`}
                  />
                </div>

                {isCityDropdownOpen && cities.length < 3 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-card dark:bg-bg-input border border-border-subtle dark:border-gray-700 rounded-md shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)] max-h-[220px] overflow-y-auto">
                    {filteredCities.map(c => (
                      <div 
                        key={c}
                        className="px-3.5 py-2.5 hover:bg-bg-input dark:hover:bg-[#202330] cursor-pointer text-sm font-semibold flex items-center justify-between transition-colors text-text-primary dark:text-gray-200"
                        onClick={() => handleAddCity(c)}
                      >
                        <span>{c}</span>
                      </div>
                    ))}
                    {cityInput.trim() && 
                      !TOP_US_CITIES.some(c => c.toLowerCase() === cityInput.trim().toLowerCase()) && 
                      !cities.some(c => c.toLowerCase() === cityInput.trim().toLowerCase()) && (
                      <div 
                        className="px-3.5 py-2.5 hover:bg-bg-input dark:hover:bg-[#202330] cursor-pointer text-sm font-semibold text-brand-lime flex items-center gap-2 border-t border-border-subtle dark:border-gray-700 transition-colors"
                        onClick={() => handleAddCity(cityInput.trim())}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add &quot;{cityInput.trim()}&quot;
                      </div>
                    )}
                    {filteredCities.length === 0 && !cityInput.trim() && (
                      <div className="px-3.5 py-3 text-xs text-text-muted dark:text-gray-400 text-center font-medium">
                        All suggested US cities added
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Pre-allocated fixed height for city tags to avoid layout shifts */}
              <div className="min-h-[30px] flex flex-wrap gap-2">
                {cities.map((city) => (
                  <span key={city} className={getPillClasses(true)}>
                    {city}
                    <button type="button" onClick={() => removeCity(city)} className="p-0.5 hover:opacity-75 transition-opacity cursor-pointer">
                      <X className="w-3.5 h-3.5 ml-0.5 opacity-80" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Role Details Group */}
          <div className="p-5 md:p-6 border-b border-border-subtle grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <legend className="text-sm font-bold flex gap-1">Seniority Level <span className="text-brand-red">*</span></legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Intern", icon: Star },
                  { label: "Entry-level", icon: Layers },
                  { label: "Mid-level", icon: Award },
                  { label: "Senior", icon: Award }
                ].map((level) => {
                  const Icon = level.icon;
                  const isChecked = seniority === level.label;
                  return (
                    <label key={level.label} className="relative flex cursor-pointer select-none group">
                      <input 
                        type="radio" 
                        name="seniority" 
                        value={level.label} 
                        checked={isChecked}
                        onChange={() => setSeniority(level.label)}
                        className="peer absolute opacity-0 w-0 h-0" 
                      />
                      <div className={PEER_PILL_CLASSES}>
                        <Icon className="w-3.5 h-3.5" />
                        {level.label}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <legend className="text-sm font-bold flex gap-1">Job Type <span className="text-brand-red">*</span></legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Full-time", icon: Briefcase },
                  { label: "Part-time", icon: Clock },
                  { label: "Contract", icon: FileText },
                  { label: "Freelance", icon: Layers }
                ].map((type) => {
                  const Icon = type.icon;
                  const isChecked = jobTypes.includes(type.label);
                  return (
                    <label key={type.label} className="relative flex cursor-pointer select-none group">
                      <input 
                        type="checkbox" 
                        name="jobType" 
                        value={type.label} 
                        checked={isChecked}
                        onChange={() => toggleJobType(type.label)}
                        className="peer absolute opacity-0 w-0 h-0" 
                      />
                      <div className={PEER_PILL_CLASSES}>
                        <Icon className="w-3.5 h-3.5" />
                        {type.label}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Experience & Salary Group */}
          <div className="p-5 md:p-6 border-b border-border-subtle grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <label className="text-sm font-bold flex gap-1">Experience (Years) <span className="text-brand-red">*</span></label>
              <div className="flex items-center bg-bg-input border-[1.5px] border-transparent rounded-[10px] w-fit overflow-hidden focus-within:border-black dark:focus-within:border-white transition-all duration-200 ease-out text-gray-700 dark:text-gray-300">
                <button 
                  type="button" 
                  onClick={() => setExperience(String(Math.max(0, parseInt(experience || "0") - 1)))}
                  className="px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors active:bg-black/10 dark:active:bg-white/10 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input 
                  type="number"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-12 text-center font-bold text-[0.875rem] bg-transparent outline-none p-0 hide-arrows text-gray-700 dark:text-gray-300"
                />
                <button 
                  type="button" 
                  onClick={() => setExperience(String(parseInt(experience || "0") + 1))}
                  className="px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors active:bg-black/10 dark:active:bg-white/10 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <style jsx>{`
                .hide-arrows::-webkit-outer-spin-button,
                .hide-arrows::-webkit-inner-spin-button {
                  -webkit-appearance: none;
                  margin: 0;
                }
                .hide-arrows {
                  -moz-appearance: textfield;
                }
              `}</style>
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-bold flex justify-between items-end">
                <span>Salary Range</span>
                <span className="text-text-muted font-normal text-xs">(Optional)</span>
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-bold text-sm">$</span>
                  <input 
                    type="number"
                    placeholder="Min"
                    value={salaryFrom}
                    onChange={(e) => setSalaryFrom(e.target.value)}
                    className={`w-full pl-6 pr-3 py-2.5 hide-arrows ${INPUT_BASE_CLASSES}`}
                  />
                </div>
                <span className="font-bold text-text-muted text-sm">to</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-bold text-sm">$</span>
                  <input 
                    type="number"
                    placeholder="Max"
                    value={salaryTo}
                    onChange={(e) => setSalaryTo(e.target.value)}
                    className={`w-full pl-6 pr-3 py-2.5 hide-arrows ${INPUT_BASE_CLASSES}`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Domains & Skills Group */}
          <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Domains */}
            <div className="space-y-2.5">
              <label className="text-sm font-bold flex gap-1">Domains <span className="text-brand-red">*</span></label>
              <DomainsSelector selectedDomains={domains} onChange={setDomains} />
            </div>

            {/* Skills */}
            <div className="space-y-2.5">
              <label className="text-sm font-bold flex gap-1">Skills <span className="text-brand-red">*</span></label>
              <SkillsSelector selectedSkills={skills} onChange={setSkills} />
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3: Resume Template Preferences */}
      {!showDetailsForm && (
          <section className="bg-bg-card border border-border-subtle rounded-lg shadow-sm">
            <div className="p-5 md:p-6 border-b border-border-subtle">
              <h2 className="text-base font-bold flex items-center gap-2 text-text-primary dark:text-white">
                <FileCheck className="w-4 h-4 text-black dark:text-brand-lime" />
                Resume Template
              </h2>
            </div>

            <div className="p-5 md:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <p className="text-[0.8rem] font-medium text-text-muted max-w-2xl leading-relaxed">
                  Select the template format for the resume that will be tailored to the job description.
                </p>
                <div className="flex items-center justify-end shrink-0">
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <span className="text-sm font-semibold text-text-muted group-hover:text-text-primary transition-colors">
                      Include summary section
                    </span>
                    <div className="relative inline-flex items-center">
                      <input 
                        type="checkbox" 
                        className="sr-only"
                        checked={includeSummarySections}
                        onChange={(e) => setIncludeSummarySections(e.target.checked)}
                      />
                      <div 
                        className={`w-[48px] h-[25px] rounded-full p-[2.5px] transition-colors duration-700 ease-[cubic-bezier(0.2,1,0.3,1)] ${
                          includeSummarySections 
                            ? "bg-brand-dark dark:bg-[#F3F4F6]" 
                            : "bg-[#D1D5DB] dark:bg-[#383D4E]"
                        }`}
                      >
                        <div 
                          className={`w-[25px] h-[20px] rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all duration-700 ease-[cubic-bezier(0.2,1,0.3,1)] ${
                            includeSummarySections 
                              ? "translate-x-[18px] bg-white dark:bg-[#111827] dark:shadow-none" 
                              : "translate-x-0 bg-white"
                          }`} 
                        />
                      </div>
                    </div>
                  </label>
                </div>
              </div>

            {/* 3 per row Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {RESUME_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplateId === tmpl.id;
                const urls = templateUrls[tmpl.id];
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => {
                      setSelectedTemplateId(tmpl.id);
                      resumeStore.setSelectedTemplateId(tmpl.id);
                    }}
                    className={`group relative flex flex-col rounded-2xl border-[2.5px] transition-all duration-200 cursor-pointer overflow-hidden ${
                      isSelected
                        ? "border-brand-dark shadow-sm dark:border-brand-lime"
                        : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
                    }`}
                  >
                    <div className="flex flex-col h-full">
                      {/* Top: Actual PDF Preview */}
                      <div className="relative h-[220px] w-full bg-white overflow-hidden group/preview">
                        {isSelected && (
                          <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-brand-lime text-[#111827] px-2.5 py-1 rounded-full text-[0.65rem] font-bold shadow-md uppercase tracking-wide">
                            <Check className="w-3.5 h-3.5 text-[#111827]" strokeWidth={3} />
                            Selected
                          </div>
                        )}
                        
                        {urls?.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img 
                            src={urls.thumbnailUrl}
                            alt={`${tmpl.name} preview`}
                            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-800/80 text-text-muted">
                            <Loader2 className="w-5 h-5 animate-spin text-brand-dark dark:text-brand-lime mb-1.5" />
                            <span className="text-[0.68rem] font-bold tracking-wider uppercase text-text-muted">Loading from R2...</span>
                          </div>
                        )}
                        
                        {/* Preview button on bottom right: expands smoothly into a pill with physical weight and smooth asymptotic deceleration */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (urls?.pdfUrl) {
                              setPreviewTemplate({
                                ...tmpl,
                                fileName: `${tmpl.name}.pdf`,
                                filePath: urls.pdfUrl,
                              });
                            } else {
                              toast.info("Loading template preview from Cloudflare R2...");
                            }
                          }}
                          className="group/btn absolute bottom-3 right-3 z-10 h-9 rounded-full bg-black/85 hover:bg-black text-white backdrop-blur-md border border-white/15 shadow-md flex items-center justify-center pl-2.5 pr-2.5 hover:pr-3.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-[padding,background-color,box-shadow,opacity] duration-550 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer hover:shadow-xl will-change-[padding]"
                          aria-label={`Preview ${tmpl.name}`}
                        >
                          <Eye className="w-4 h-4 shrink-0 text-white/90 group-hover/btn:text-white transition-colors duration-300" />
                          <span className="grid grid-cols-[1fr] sm:grid-cols-[0fr] sm:group-hover/btn:grid-cols-[1fr] transition-[grid-template-columns] duration-550 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-columns]">
                            <span className="overflow-hidden min-w-0">
                              <span className="pl-1.5 whitespace-nowrap text-[0.76rem] font-semibold tracking-wide select-none opacity-100 sm:opacity-0 sm:group-hover/btn:opacity-100 sm:translate-x-1 sm:group-hover/btn:translate-x-0 transition-[opacity,transform] duration-450 ease-[cubic-bezier(0.16,1,0.3,1)] delay-75 block text-white">
                                Preview
                              </span>
                            </span>
                          </span>
                        </button>
                      </div>

                      {/* Bottom: Details */}
                      <div className="p-4 flex flex-col flex-1 justify-between gap-3 bg-black/5 dark:bg-white/5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-heading font-semibold text-[0.95rem] text-text-primary dark:text-white leading-snug truncate">
                              {tmpl.name}
                            </h4>
                            <span className="text-[0.75rem] font-semibold text-text-muted dark:text-[#9CA3AF]">
                              {tmpl.category}
                            </span>
                          </div>
                          {tmpl.badge && (
                            <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded-xs uppercase tracking-wide bg-white text-text-primary dark:bg-[#2A2E3D] dark:text-[#E4E4E7] shrink-0">
                              {tmpl.badge}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-1.5">
                          {tmpl.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[0.7rem] font-semibold px-2 py-0.5 rounded-xs bg-white text-text-primary dark:bg-[#2A2E3D] dark:text-[#E4E4E7]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        )}

        {/* Bottom Save Action */}
        <div className="pt-4 flex flex-wrap items-center justify-end gap-3">
          {!showDetailsForm && (
            <div className="flex items-center select-none">
              <SaveStatusIndicator status={saveStatus} />
            </div>
          )}
          {showDetailsForm && (
            <button 
              type="button"
              onClick={() => setShowDetailsForm(false)}
              className="inline-flex items-center justify-center gap-1.5 h-[42px] px-4 rounded-md font-heading text-sm font-semibold text-text-muted hover:text-black dark:hover:text-white transition-colors cursor-pointer border-[1.5px] border-transparent hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98]"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
              <span>Cancel</span>
            </button>
          )}
          <button 
            type="submit"
            disabled={showDetailsForm ? false : (!isDirty || isConfirming)}
            className={
              showDetailsForm 
                ? "inline-flex items-center justify-center gap-2 h-[42px] px-5 sm:px-6 rounded-md border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black disabled:opacity-60 disabled:cursor-not-allowed shadow-xs"
                : !isDirty || isConfirming
                ? "inline-flex items-center justify-center gap-2 h-[42px] px-5 sm:px-6 rounded-md border-[1.5px] border-border-subtle dark:border-transparent bg-[#F3F4F6] text-[#9CA3AF] font-heading text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-not-allowed dark:bg-[#1E212D] dark:text-[#6B7280] opacity-60"
                : "inline-flex items-center justify-center gap-2 h-[42px] px-5 sm:px-6 rounded-md border-[1.5px] border-transparent bg-brand-dark text-white font-heading text-sm font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:opacity-90 active:scale-[0.98] dark:bg-[#F3F4F6] dark:text-[#111827] dark:hover:opacity-90 shadow-xs"
            }
          >
            {showDetailsForm ? (
              <>
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{isCreatingBase ? "Creating PDF..." : "Create PDF (free)"}</span>
              </>
            ) : isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                <span>Confirming...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                <span>Confirm Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
      )}


      <ResumeModal 
        isOpen={isResumeModalOpen}
        initialMode="view"
        initialMarkdown={generatedMarkdown}
        templateId={selectedTemplateId}
        onClose={() => setIsResumeModalOpen(false)}
              onSave={async (markdown, templateId) => {
          await saveBasePdf(markdown, templateId);
          setSelectedTemplateId(templateId);
        }}
/>

      <PdfPreviewModal
        isOpen={Boolean(previewTemplate)}
        template={previewTemplate}
        onClose={handleClosePdfPreview}
      />
    </div>
  );
}
