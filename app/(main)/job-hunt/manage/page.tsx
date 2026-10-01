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
  Save
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { preferenceSnapshot, samePreferences } from "@/lib/preferences-confirmation";

import { ResumeModal } from "@/components/ResumeModal";
import { PdfPreviewModal, PdfPreviewDocument } from "@/components/PdfPreviewModal";
import { RESUME_TEMPLATES, ResumeTemplate } from "@/data/resume-templates";
import { toast } from "sonner";
import { sampleResumeMarkdown } from "@/data/sample-resume";
import { FlagUS } from "@/components/LocationDropdown";
import { useResumeStore } from "@/store/useResumeStore";
import { useCreditStore } from "@/store/useCreditStore";
import { getPreferenceTagOptions } from "@/app/actions/recommendations";
import { getUserJobPreferences, confirmUserJobPreferences, saveResumeDetails } from "@/app/actions/preferences";
import { ManageJobHuntFormSkeleton } from "@/components/ManageJobHuntSkeleton";
import { useR2Storage } from "@/lib/hooks/useR2Storage";
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

/**
 * Reusable hook to handle outside clicks/touches for dropdowns and popups.
 */
function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  handler: () => void,
  active: boolean = true
) {
  useEffect(() => {
    if (!active) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [ref, handler, active]);
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

  useEffect(() => {
    if (value) {
      const parts = value.split("-");
      if (parts[0]) {
        const y = parseInt(parts[0], 10);
        if (!isNaN(y)) setViewingYear(y);
      }
    }
  }, [value]);

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

export default function ManageJobHuntPage() {
  // Resume
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [autofill, setAutofill] = useState(true);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [generatedMarkdown, setGeneratedMarkdown] = useState(sampleResumeMarkdown);
  const resumeStore = useResumeStore();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(RESUME_TEMPLATES[0].id);

  useEffect(() => {
    if (resumeStore.selectedTemplateId) {
      setSelectedTemplateId(resumeStore.selectedTemplateId);
    }
  }, [resumeStore.selectedTemplateId]);
  const [previewTemplate, setPreviewTemplate] = useState<ResumeTemplate | PdfPreviewDocument | null>(null);
  const [templateUrls, setTemplateUrls] = useState<TemplateAssetUrls>({});
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
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
  });

  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeFileKey, setResumeFileKey] = useState<string | null>(null);
  const [isViewingResume, setIsViewingResume] = useState(false);

  const { uploadFile, getFileUrl, isUploading: isR2Uploading, progress: uploadProgress } = useR2Storage();

  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [confirmation, setConfirmation] = useState<{ isConfirmed: boolean; confirmedAt: string | null; baseline: Record<string, unknown> }>({ isConfirmed: false, confirmedAt: null, baseline: {} });
  const currentPreferences = {
    country, cities: cities.slice(0, 3), seniority,
    jobTypes: jobTypes.length ? jobTypes : ["Full-time"],
    experienceYears: Math.min(60, Math.max(0, parseInt(experience || "0", 10) || 0)),
    salaryMin: salaryFrom ? Math.max(0, parseInt(salaryFrom, 10)) : null,
    salaryMax: salaryTo ? Math.max(0, parseInt(salaryTo, 10)) : null,
    currency: "USD", domains: Array.from(new Set(domains)), skills: Array.from(new Set(skills)),
    selectedTemplateId, includeSummarySections, autofillFromResume: autofill,
    resumeUploaded: Boolean(selectedFile || resumeUploaded),
    resumeFileName: selectedFile ? selectedFile.name : resumeFileName || null,
    resumeFileKey: resumeFileKey || null,
  };
  const isDirty = !confirmation.isConfirmed || !samePreferences(currentPreferences, confirmation.baseline);


  const formRef = useRef<HTMLFormElement>(null);

  // Load existing preferences and tag options from DB on mount
  useEffect(() => {
    let isMounted = true;
    async function loadPreferences() {
      try {
        const [res, , tplRes, activeResumeRes] = await Promise.all([
          getUserJobPreferences(),
          fetchTagOptions(),
          getAllTemplatePresignedUrls(),
          getUserActiveResume(),
        ]);
        if (isMounted && tplRes?.success && tplRes.data) {
          setTemplateUrls(tplRes.data);
        }
        if (isMounted) {
          setIsLoadingTemplates(false);
        }
        if (isMounted && activeResumeRes?.success && activeResumeRes?.data?.fileKey) {
          setResumeFileKey(activeResumeRes.data.fileKey);
          setResumeFileName(activeResumeRes.data.fileName || "Uploaded_Resume.pdf");
          setResumeUploaded(true);
        }
        if (isMounted && res.success && res.data) {
          const d = res.data;
          const p = (d.preferences || {}) as Record<string, any>;
          setConfirmation({ isConfirmed: p.isConfirmed === true, confirmedAt: p.confirmedAt ?? null,
            baseline: p.lastConfirmedPreferences ?? preferenceSnapshot(p) });
          const r = (d.resumeDetails || {}) as Record<string, any>;

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
            resumeStore.setSelectedTemplateId(p.selectedTemplateId);
          }
          if (p.includeSummarySections != null) setIncludeSummarySections(p.includeSummarySections);
          if (p.autofillFromResume != null) setAutofill(p.autofillFromResume);
          if (p.resumeUploaded != null) setResumeUploaded(Boolean(p.resumeUploaded));
          if (p.resumeFileName) setResumeFileName(p.resumeFileName);
          if (p.resumeFileKey) setResumeFileKey(p.resumeFileKey);

          if (r.personalDetails || r.header || r.form) {
            const personal = r.personalDetails || r.form || r.header;
            setPersonalDetails({
              fullName: personal.fullName || personal.name || "",
              email: personal.email || "",
              phoneNumber: personal.phoneNumber || personal.phone || "",
              location: personal.location || p.cities?.[0] || "",
            });
          }
          if (Array.isArray(r.educationHistory) && r.educationHistory.length > 0) {
            setEducations(r.educationHistory);
          } else if (Array.isArray(r.form?.educations)) {
            setEducations(r.form.educations);
          } else if (typeof r.education === 'string' && r.education) {
            setEducations([{ id: '1', college: r.education, degree: '', field: '', startDate: '', endDate: '', grade: '', maxGrade: '', gradeType: 'CGPA' }]);
          }
          if (Array.isArray(r.experienceHistory) && r.experienceHistory.length > 0) {
            setExperiences(r.experienceHistory);
          } else if (Array.isArray(r.form?.experiences)) {
            setExperiences(r.form.experiences);
          } else if (Array.isArray(r.experience)) {
            setExperiences(r.experience.map((entry: { company?: string; title?: string; bullets?: string[] }, index: number) => ({ id: String(index + 1), company: entry.company || '', role: entry.title || '', startDate: '', endDate: '', jobDescription: (entry.bullets || []).join('\n'), skills: [], domains: [], responsibilities: '' })));
          }
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

  // Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleResumeFileUpload = async (file: File) => {
    setSelectedFile(file);
    setResumeUploaded(true);
    setResumeFileName(file.name);

    toast.loading("Uploading resume to Cloudflare R2...", { id: "resume-upload-toast" });
    const res = await uploadFile({
      file,
      category: "resume",
    });

    if (res.success && res.objectKey) {
      setResumeFileKey(res.objectKey);

      // Invariant: strictly ONE resume per account in Cloudflare R2.
      // commitResumeUpload prunes previous versions from R2 and upserts the DB record.
      const commitRes = await commitResumeUpload({
        objectKey: res.objectKey,
        fileName: file.name,
        fileSize: file.size,
      });

      if (commitRes.success) {
        try {
          const response = await fetch("/api/job-hunt/profile", { method: "POST",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectKey: res.objectKey, fileName: file.name }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Resume extraction failed");
          const details = data.resume_details || {};
          const preferences = data.preferences || {};
          setConfirmation({ isConfirmed: false, confirmedAt: preferences.confirmedAt ?? null,
            baseline: preferences.lastConfirmedPreferences ?? confirmation.baseline });
          if (autofill) {
            if (details.personalDetails) setPersonalDetails(details.personalDetails);
            setEducations(details.educationHistory || []);
            setExperiences(details.experienceHistory || []);
            if (Array.isArray(preferences.skills)) setSkills(preferences.skills);
            if (Array.isArray(preferences.domains)) setDomains(preferences.domains);
            if (Array.isArray(preferences.cities)) setCities(preferences.cities);
            if (preferences.country) setCountry(preferences.country);
            if (preferences.seniority) setSeniority(preferences.seniority);
            if (preferences.experienceYears != null) setExperience(String(preferences.experienceYears));
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Resume details extraction failed", { id: "resume-upload-toast" });
          return;
        }
        toast.success("Resume updated & previous version pruned from cloud!", { id: "resume-upload-toast" });
      } else {
        toast.error(commitRes.error || "File uploaded, but database save failed. Retry upload.", { id: "resume-upload-toast" });
      }
    } else {
      toast.error(res.error || "Failed to upload resume to Cloudflare R2.", { id: "resume-upload-toast" });
    }
  };

  const handleDeleteResume = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (resumeFileKey) {
      toast.loading("Removing resume from Cloudflare R2 & database...", { id: "resume-delete-toast" });
      try {
        const res = await deleteUserResume();
        if (res.success) {
          setSelectedFile(null);
          setResumeUploaded(false);
          setResumeFileName(null);
          setResumeFileKey(null);
          toast.success("Resume removed from Cloudflare R2 & database.", { id: "resume-delete-toast" });
        } else {
          toast.error(res.error || "Failed to remove resume.", { id: "resume-delete-toast" });
        }
      } catch {
        toast.error("Failed to remove resume.", { id: "resume-delete-toast" });
      }
    } else {
      setSelectedFile(null);
      setResumeUploaded(false);
      setResumeFileName(null);
      setResumeFileKey(null);
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleResumeFileUpload(file);
    }
  };

  const handleGenerateResume = () => {
    setShowDetailsForm(true);
    toast.info("Please fill in your details to generate a customized resume.");
  };

  const generateAndShowResume = async () => {
    // 1. Deduct Credit
    const { deductCredit } = useCreditStore.getState();
    const res = await deductCredit("generate_resume");
    
    if (!res.success) {
      toast.error(res.error || "Failed to deduct credit. Insufficient balance.");
      return;
    }

    const candidateName = personalDetails.fullName?.trim() || "Alex Rivera";
    const candidateEmail = personalDetails.email?.trim() || "alex.rivera@email.com";
    const candidatePhone = personalDetails.phoneNumber?.trim() || "(555) 123-4567";
    const candidateLocation = personalDetails.location?.trim() || cities[0] || "San Francisco, CA";

    const primaryRole = domains[0] || "Frontend Engineer";
    const currentSkills = skills.length > 0 ? skills.join(", ") : "React, TypeScript, Next.js, Node.js";

    // Build Education Section dynamically
    const validEducations = educations.filter(e => e.college?.trim() || e.degree?.trim());
    const educationSection = validEducations.length > 0
      ? validEducations.map(e => {
          const title = e.college ? `**${e.college}**` : "**University**";
          const degreeInfo = e.degree ? `*${e.degree}${e.field ? ` in ${e.field}` : ""}*` : "";
          const dateRange = (e.startDate || e.endDate) ? ` (${e.startDate || "Start"} – ${e.endDate || "Present"})` : "";
          const gradeInfo = e.grade ? ` • ${e.gradeType || "Grade"}: ${e.grade}${e.maxGrade ? `/${e.maxGrade}` : ""}` : "";
          return `${title}  \n${degreeInfo}${dateRange}${gradeInfo}`.trim();
        }).join("\n\n")
      : `**University of Texas at Austin**  \n*Bachelor of Science in Computer Science*`;

    // Build Experience Section dynamically
    const validExperiences = experiences.filter(e => e.company?.trim() || e.role?.trim());
    const experienceSection = validExperiences.length > 0
      ? validExperiences.map(e => {
          const roleTitle = `### ${e.role || primaryRole}`;
          const compLine = `**${e.company || "Company"}** | *${candidateLocation}* | *${e.startDate || "2021"} – ${e.endDate || "Present"}*`;
          const desc = e.jobDescription?.trim() ? `${e.jobDescription}\n` : "";
          let resp = "";
          if (e.responsibilities?.trim()) {
            resp = e.responsibilities.split("\n").filter(Boolean).map(line => line.trim().startsWith("-") ? line.trim() : `- ${line.trim()}`).join("\n");
          } else {
            resp = `- Spearheaded modernization of web applications, improving core performance and reliability metrics.\n- Designed and implemented clean modular components, establishing unified architectural patterns.`;
          }
          return `${roleTitle}\n${compLine}\n${desc}${resp}`.trim();
        }).join("\n\n")
      : `### Senior ${primaryRole}\n**TechFlow Innovations** | *${candidateLocation}* | *2021 – Present*\n- Spearheaded the modernization of web application architecture, improving performance and SEO metrics.\n- Designed and implemented clean modular components, establishing unified patterns across key features.`;

    const customResume = `# ${candidateName}
**${primaryRole}**  
${candidateLocation} • ${candidatePhone} • ${candidateEmail} • [LinkedIn](#) • [GitHub](#)

---

## Professional Summary
Detail-oriented and innovative ${primaryRole} with ${experience || "3"}+ years of experience building highly scalable applications. Proficient in ${currentSkills} and modern web architectures. Demonstrated history of improving system performance and leading cross-functional teams to deliver production-grade software on time.

---

## Experience

${experienceSection}

---

## Education

${educationSection}

---

## Skills & Technologies
- **Core Stack:** ${currentSkills}
`;

    const safeFileName = `${candidateName.replace(/[^a-zA-Z0-9_-]/g, "_")}_Resume.pdf`;
    const generatedFile = new File([customResume], safeFileName, { type: "application/pdf" });
    setSelectedFile(generatedFile);
    setResumeUploaded(true);
    setResumeFileName(safeFileName);
    setGeneratedMarkdown(customResume);
    setIsResumeModalOpen(true);

    toast.success("Resume generated successfully!", {
      description: "Credit deducted. Previewing tailored resume for your profile.",
    });

    // Asynchronously snapshot resume details in the database independently
    saveResumeDetails({
      personalDetails,
      educationHistory: educations,
      experienceHistory: experiences,
    }).catch(err => console.error("Background resume details save failed:", err));
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

    setIsSaving(true);
    try {
      // 1. Sync local resume store
      resumeStore.setSelectedTemplateId(selectedTemplateId);
      resumeStore.saveResume(undefined, selectedTemplateId);

      // 2. Validate salary bounds
      const parsedSalaryMin = salaryFrom ? Math.max(0, parseInt(salaryFrom, 10)) : null;
      const parsedSalaryMax = salaryTo ? Math.max(0, parseInt(salaryTo, 10)) : null;

      if (parsedSalaryMin !== null && parsedSalaryMax !== null && parsedSalaryMin > parsedSalaryMax) {
        toast.error("Salary Range Error", {
          description: "Minimum salary cannot exceed maximum salary.",
        });
        setIsSaving(false);
        return;
      }

      // 3. Persist Preferences to PostgreSQL via Server Action
      const payload = currentPreferences;

      const res = await confirmUserJobPreferences(payload);

      if (res.success && res.data) {
        const confirmed = res.data.preferences || {};
        setConfirmation({ isConfirmed: confirmed.isConfirmed === true, confirmedAt: confirmed.confirmedAt ?? null,
          baseline: confirmed.lastConfirmedPreferences ?? preferenceSnapshot(payload) });
        if (selectedFile) {
          setResumeFileName(selectedFile.name);
        }
        const chosenTemplate = RESUME_TEMPLATES.find((t) => t.id === selectedTemplateId);
        toast.success("Preferences confirmed!", {
          description: chosenTemplate 
            ? `Saved to database. Active template: "${chosenTemplate.name}".`
            : "Your preferences have been persisted to the database.",
        });
      } else {
        toast.error(res.error || "Failed to save preferences.");
      }
    } catch (err: any) {
      console.error("Save preferences failed:", err);
      toast.error("An unexpected error occurred while saving preferences.");
    } finally {
      setIsSaving(false);
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
        <div className="flex items-center gap-3">
          {!hasLoadedPreferences ? (
            <div className="h-[38px] w-40 rounded-sm bg-[#DDE2E7] dark:bg-[#2C3246] animate-skeleton-pulse" />
          ) : (
            <>
              {showDetailsForm && (
                <button 
                  type="button"
                  onClick={() => setShowDetailsForm(false)}
                  className="inline-flex items-center justify-center gap-1.5 p-[0.38rem_1rem] rounded-sm font-heading text-[0.85rem] font-semibold text-text-muted hover:text-black dark:hover:text-white transition-colors cursor-pointer border-[1.5px] border-transparent"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                  Cancel
                </button>
              )}
              <button 
                onClick={() => formRef.current?.requestSubmit()}
                type="button"
                disabled={isSaving || (!showDetailsForm && (!hasLoadedPreferences || !isDirty || isR2Uploading))}
                className={
                  showDetailsForm 
                    ? "inline-flex items-center justify-center gap-2 p-[0.38rem_1rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black disabled:opacity-60 disabled:cursor-not-allowed"
                    : "inline-flex items-center justify-center gap-2 p-[0.38rem_1rem] rounded-sm border-[1.5px] border-transparent bg-brand-dark text-white font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:opacity-90 active:scale-[0.98] dark:bg-[#F3F4F6] dark:text-[#111827] dark:hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                }
              >
                {showDetailsForm ? (
                  <>
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Generate</span>
                  </>
                ) : isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 shrink-0" />
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
        <>
        {!showDetailsForm && hasLoadedPreferences && (
          <p role="status" className={isDirty ? "text-amber-600 text-sm font-semibold" : "text-green-600 text-sm font-semibold"}>
            {isDirty ? "Unconfirmed changes" : "Preferences confirmed"}
          </p>
        )}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        
        {/* SECTION 1: Resume */}
        {!showDetailsForm && (
          <section className="bg-bg-card border border-border-subtle rounded-lg p-5 md:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-black dark:text-brand-lime" />
              Resume
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-muted hidden sm:inline">
                Don&apos;t have a resume?
              </span>
              <button
                type="button"
                onClick={handleGenerateResume}
                className="inline-flex items-center justify-center gap-[0.35rem] p-[0.38rem_0.85rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
              >
                <Sparkles className="w-[13px] h-[13px]" />
                <span>Generate Resume</span>
              </button>
            </div>
          </div>
          
          <div 
            className={`relative flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed rounded-md transition-colors mb-4
              ${dragActive ? "border-brand-lime bg-brand-lime/10" : "border-border-input hover:border-text-subtle"}
              ${(selectedFile || resumeUploaded) ? "bg-bg-input border-solid" : ""}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  const file = e.target.files[0];
                  handleResumeFileUpload(file);
                }
              }}
              accept=".pdf,.doc,.docx"
            />
            
            {(selectedFile || resumeUploaded) ? (
              <div className="flex items-center justify-between w-full px-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-lime/20 text-brand-lime dark:bg-white/20 dark:text-[#F3F4F6] flex items-center justify-center shrink-0">
                    {isR2Uploading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-brand-dark dark:text-brand-lime" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">
                      {selectedFile ? selectedFile.name : (resumeFileName || "Uploaded_Resume.pdf")}
                    </p>
                    <p className="text-xs text-text-muted">
                      {isR2Uploading ? `Uploading directly to R2... ${uploadProgress}%` : "Click or drag to replace"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(resumeFileKey || selectedFile) && (
                    <button
                      type="button"
                      onClick={handlePreviewStoredResume}
                      disabled={isViewingResume}
                      className="relative z-20 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-zinc-800 shadow-sm border border-border-subtle hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors pointer-events-auto cursor-pointer"
                    >
                      {isViewingResume ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>Preview File</span>
                    </button>
                  )}

                  {(resumeFileKey || selectedFile) && (
                    <button
                      type="button"
                      onClick={handleDeleteResume}
                      title="Delete resume from cloud"
                      className="relative z-20 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/40 transition-colors pointer-events-auto cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-full bg-bg-input flex items-center justify-center">
                  <UploadCloud className="w-5 h-5 text-text-muted" />
                </div>
                <div>
                  <p className="font-bold text-sm">Click to upload or drag and drop</p>
                  <p className="text-xs text-text-muted mt-0.5">PDF, DOCX up to 10MB</p>
                </div>
              </div>
            )}
          </div>

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
                  onChange={(e) => setAutofill(e.target.checked)}
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
                    placeholder="John Doe" 
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
                          <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-brand-lime text-[#111827] pl-1.5 pr-3 py-1.5 rounded-full text-[0.65rem] font-bold shadow-md uppercase tracking-wide">
                            <div className="bg-[#111827] text-brand-lime rounded-full p-0.5">
                              <Check className="w-3 h-3" strokeWidth={3} />
                            </div>
                            Selected
                          </div>
                        )}
                        
                        {urls?.thumbnailUrl ? (
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
                        
                        {/* Preview button on bottom right */}
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
                          className="absolute bottom-3 right-3 z-10 w-9 h-9 rounded-full bg-black/80 text-white backdrop-blur-sm shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-black hover:scale-105 cursor-pointer"
                        >
                          <Eye className="w-[1.1rem] h-[1.1rem]" />
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
        <div className="pt-2 flex justify-end gap-3">
          {showDetailsForm && (
            <button 
              type="button"
              onClick={() => setShowDetailsForm(false)}
              className="inline-flex items-center justify-center gap-1.5 p-[0.38rem_1rem] rounded-sm font-heading text-[0.85rem] font-semibold text-text-muted hover:text-black dark:hover:text-white transition-colors cursor-pointer border-[1.5px] border-transparent"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              Cancel
            </button>
          )}
          <button 
            type="submit"
            disabled={isSaving || (!showDetailsForm && (!hasLoadedPreferences || !isDirty || isR2Uploading))}
            className={
              showDetailsForm 
                ? "inline-flex items-center justify-center gap-2 p-[0.38rem_1.25rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black disabled:opacity-60 disabled:cursor-not-allowed"
                : "inline-flex items-center justify-center gap-2 p-[0.38rem_1.25rem] rounded-sm border-[1.5px] border-transparent bg-brand-dark text-white font-heading text-[0.85rem] font-semibold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap cursor-pointer hover:opacity-90 active:scale-[0.98] dark:bg-[#F3F4F6] dark:text-[#111827] dark:hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            }
          >
            {showDetailsForm ? (
              <>
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Generate</span>
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>Confirm Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
        </>
      )}


      <ResumeModal 
        isOpen={isResumeModalOpen}
        initialMode="view"
        initialMarkdown={generatedMarkdown}
        templateId={selectedTemplateId}
        onClose={() => setIsResumeModalOpen(false)}
      />

      <PdfPreviewModal
        isOpen={Boolean(previewTemplate)}
        template={previewTemplate}
        onClose={handleClosePdfPreview}
      />
    </div>
  );
}
