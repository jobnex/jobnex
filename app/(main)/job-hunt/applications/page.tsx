"use client";

import { useState, useMemo } from "react";
import { useJobStore } from "@/store/useJobStore";
import { jobsData, getCuratedPartition } from "@/data/jobs";
import { sampleResumeMarkdown } from "@/data/sample-resume";
import { ResumeModal } from "@/components/ResumeModal";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useResumeStore } from "@/store/useResumeStore";
import { downloadMarkdownFile } from "@/lib/resumeApi";
import { 
  Download, Eye, Clock, Building, 
  Search, Filter, Plus, FileText, ChevronDown, 
  Check, PenSquare, FileBadge
} from "lucide-react";

// --- Subcomponents ---

const STAGES = ["Applied", "Interview", "Offer"];

function ProgressTracker({ currentStage, onUpdate }: { currentStage: number, onUpdate: (stage: number) => void }) {
  const [hoveredStage, setHoveredStage] = useState<number | null>(null);

  return (
    <div 
      className="flex items-center gap-1.5 sm:gap-2"
      onMouseLeave={() => setHoveredStage(null)}
    >
      {STAGES.map((stage, index) => {
        const isActive = index <= currentStage;
        const isHoveredPreview = hoveredStage !== null && index <= hoveredStage && !isActive;
        const isSquare = isActive || isHoveredPreview;
        const isLineActive = index < currentStage || (hoveredStage !== null && index < hoveredStage);
        const isTextHighlighted = isActive || hoveredStage === index;
        
        return (
          <div key={stage} className="flex items-center">
            <button
              onClick={() => onUpdate(index)}
              onMouseEnter={() => setHoveredStage(index)}
              className="flex items-center gap-1.5 sm:gap-2 group cursor-pointer focus:outline-none"
              aria-label={`Mark as ${stage}`}
            >
              <div 
                className={`w-5 h-5 shrink-0 flex items-center justify-center border-[1.5px] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  isSquare ? "rounded-[5px]" : "rounded-[10px]"
                } ${
                  isActive 
                    ? "bg-[#111827] border-[#111827] text-white dark:text-[#111827] dark:bg-[#ACEE5F] dark:border-[#ACEE5F]" 
                    : isHoveredPreview
                    ? "bg-transparent border-[#111827] dark:border-[#ACEE5F]"
                    : "bg-transparent border-border-input dark:border-[#4B5563]"
                }`}
              >
                {isActive && <Check className="w-3 h-3 text-white dark:text-[#111827] animate-in zoom-in-75 duration-150" strokeWidth={3.5} />}
              </div>
              <span 
                className={`font-heading text-[0.78rem] sm:text-[0.82rem] font-semibold transition-colors duration-200 ${
                  isTextHighlighted 
                    ? "text-text-primary dark:text-[#F3F4F6]" 
                    : "text-text-muted dark:text-[#9CA3AF]"
                }`}
              >
                {stage}
              </span>
            </button>
            {index < STAGES.length - 1 && (
              <div 
                className={`w-3 sm:w-6 h-[2px] mx-1 sm:mx-2 rounded-full transition-colors duration-200 ${
                  isLineActive ? "bg-[#111827] dark:bg-[#ACEE5F]" : "bg-border-input dark:bg-[#374151]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ResumeDropdownProps {
  onView: () => void;
  onEdit: () => void;
  onDownload: () => void;
}

function ResumeDropdown({ onView, onEdit, onDownload }: ResumeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className="relative z-10"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button 
        className="inline-flex items-center justify-center gap-[0.35rem] px-3.5 py-[0.45rem] rounded-sm border-[1.5px] border-transparent bg-brand-lime text-[#111827] font-heading font-semibold text-[0.85rem] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer hover:border-border-color hover:bg-white hover:text-[#111827] active:scale-[0.98] dark:hover:bg-white dark:hover:text-[#111827] dark:hover:border-black"
      >
        <FileText className="w-[14px] h-[14px]" strokeWidth={2.5} />
        <span>Resume</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full pt-1 z-50">
          <div className="w-[14rem] bg-bg-card border-[1.5px] border-border-color rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] py-2 animate-in fade-in zoom-in-95 duration-200 dark:border-[#2B3042] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
            <button 
              onClick={onView}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <Eye className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">View Resume</span>
            </button>
            <button 
              onClick={onDownload}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <Download className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">Download Resume</span>
            </button>
            <div className="h-[1px] bg-border-subtle my-2 dark:bg-[#2B3042]" />
            <button 
              onClick={onEdit}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-tag transition-colors cursor-pointer dark:hover:bg-[#1C1E24]"
            >
              <div className="w-7 h-7 rounded-md bg-[rgba(185,255,102,0.18)] dark:bg-[rgba(172,238,95,0.12)] flex items-center justify-center shrink-0">
                <PenSquare className="w-[14px] h-[14px] text-[#064E3B] dark:text-[#ACEE5F]" strokeWidth={2.5} />
              </div>
              <span className="text-[0.88rem] font-semibold text-text-primary dark:text-white">Edit Resume</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function ApplicationsPage() {
  const { openModal } = useJobStore();
  const resumeStore = useResumeStore();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  // Application tracker states: Map<jobId, stageIndex> (-1 means empty/not applied yet)
  const [trackerState, setTrackerState] = useState<Record<string, number>>({});
  
  // Resume Modal State
  const [resumeModalState, setResumeModalState] = useState<{isOpen: boolean, mode: "view" | "edit", markdown: string}>({
    isOpen: false,
    mode: "view",
    markdown: "",
  });

  const requestedJobs = useMemo(() => {
    let filteredJobs = jobsData;
    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase();
      filteredJobs = jobsData.filter(
        (job) => job.jobRoleTitle.toLowerCase().includes(q) || job.company.toLowerCase().includes(q)
      );
    }
    return getCuratedPartition(filteredJobs).requestedJobs;
  }, [debouncedSearchQuery]);

  const getMockDate = (index: number) => {
    const date = new Date();
    date.setDate(date.getDate() - (index * 2) - 1);
    date.setHours(10 + (index % 5), 30 + (index * 15) % 60, 0, 0);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + 
           " • " + 
           date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const handleUpdateStage = (jobId: string, stageIndex: number) => {
    setTrackerState(prev => {
      const current = prev[jobId] ?? -1;
      // If clicking a stage that is currently active, turn off this stage and all subsequent stages
      if (current >= stageIndex) {
        return { ...prev, [jobId]: stageIndex - 1 };
      }
      // Otherwise, activate up to this stage
      return { ...prev, [jobId]: stageIndex };
    });
  };

  const handleDownload = () => {
    downloadMarkdownFile(resumeStore.resumeMarkdown, `${resumeStore.activeTemplate.id}_resume.md`);
  };

  return (
    <>
      <div className="p-4 sm:p-8 flex flex-col gap-6 h-full w-full max-w-[1200px] mx-auto animate-in fade-in duration-500">
        
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="font-heading text-[1.45rem] font-semibold text-text-primary -mt-2">
              My Applications
            </h1>
            <p className="text-text-muted text-[0.95rem] mt-1">
              Track your pipeline and manage active submissions.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-subtle transition-colors group-focus-within:text-text-primary dark:text-[#A1A1AA]" />
              <input
                type="text"
                className="w-full pl-[2.75rem] pr-4 py-[0.7rem] bg-bg-input border border-border-input rounded-lg focus:border-text-primary focus:bg-white outline-none text-[0.95rem] font-medium text-text-primary placeholder:text-text-subtle transition-all duration-200 dark:bg-[#151720] dark:border-[#2B3042] dark:focus:border-[#ACEE5F] dark:focus:shadow-[0_0_0_1px_#ACEE5F,0_2px_8px_rgba(0,0,0,0.3)] dark:focus:bg-[#1A1C26] dark:text-white"
                placeholder="Search applications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 items-center w-full md:w-auto shrink-0">
               <button aria-label="Filter" className="p-[0.65rem] rounded-md border border-border-input bg-bg-card text-text-muted hover:text-text-primary transition-colors cursor-pointer dark:bg-[#151720] dark:border-[#2B3042]">
                 <Filter className="w-5 h-5" />
               </button>
               <button className="inline-flex items-center gap-2 px-4 py-[0.65rem] rounded-md font-bold text-[0.88rem] bg-brand-dark text-white shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md hover:bg-brand-lime hover:text-[#111827] cursor-pointer active:translate-y-[1px] dark:bg-brand-lime dark:text-[#111827] dark:hover:bg-white dark:hover:text-[#111827] whitespace-nowrap">
                 <Plus className="w-[16px] h-[16px]" strokeWidth={2.5} />
                 <span>Add Application</span>
               </button>
            </div>
          </div>
        </div>

        {requestedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-32 text-center bg-bg-card border border-border-subtle rounded-[10px] border-dashed">
            <div className="w-16 h-16 bg-bg-tag rounded-full flex items-center justify-center mb-5 text-text-subtle">
              <FileBadge className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">No Applications Found</h3>
            <p className="text-text-muted max-w-sm">
              {searchQuery ? "No applications match your search query." : "You haven't requested any applications yet. Explore the curated jobs tab."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-10">
            {requestedJobs.map((job, index) => {
              const currentStage = trackerState[job.id] ?? -1;
              
              return (
                <div 
                  key={job.id} 
                  className="relative hover:z-50 grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] items-center p-[1.25rem_1.5rem] bg-bg-card border-[1.5px] border-border-subtle rounded-[10px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#9CA3AF] dark:border-[#2B3042] dark:hover:border-[#6B7280] gap-4 xl:gap-6"
                >
                  
                  {/* Left Zone: Details */}
                  <div className="flex flex-col justify-center min-h-[5.1rem] min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 text-[0.74rem] font-bold text-text-subtle uppercase tracking-wider mb-[0.45rem] dark:text-[#9CA3AF]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">{getMockDate(index)}</span>
                    </div>

                    <div className="min-h-[2.85rem] flex flex-col justify-start">
                      <a 
                        href="#jobDetails"
                        onClick={(e) => { e.preventDefault(); openModal(job); }}
                        className="font-heading text-[1.2rem] font-semibold text-text-primary leading-[1.26] line-clamp-2 hover:underline transition-colors w-fit dark:text-white"
                      >
                        {job.jobRoleTitle}
                      </a>
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-[0.88rem] font-semibold text-text-muted mt-0.5">
                      <Building className="w-3.5 h-3.5 shrink-0 text-text-subtle dark:text-[#9CA3AF]" />
                      <span>{job.company}</span>
                    </div>
                  </div>

                  {/* Middle Zone: Tracker (Dead-center relative to card edges and Left/Right zones) */}
                  <div className="flex items-center justify-center py-2 xl:py-0 shrink-0 mx-auto">
                    <div className="bg-bg-input px-4 sm:px-5 py-[0.65rem] rounded-full border border-border-subtle dark:bg-[#222534] dark:border-[#2F3446] flex items-center justify-center shadow-none">
                      <ProgressTracker 
                        currentStage={currentStage} 
                        onUpdate={(stage) => handleUpdateStage(job.id, stage)} 
                      />
                    </div>
                  </div>

                  {/* Right Zone: Actions */}
                  <div className="flex items-center justify-start xl:justify-end gap-5 shrink-0 pt-3 xl:pt-0 border-t border-border-subtle xl:border-t-0">
                    <a 
                      href="#applyModal"
                      onClick={(e) => { e.preventDefault(); openModal(job); }}
                      className="inline-flex items-center gap-[0.35rem] font-heading text-[0.85rem] font-semibold text-text-primary cursor-pointer transition-all duration-150 hover:underline hover:underline-offset-4 group/link dark:text-white"
                    >
                      <span>Apply Now</span>
                      <svg 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="w-[13px] h-[13px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                      >
                        <line x1="7" y1="17" x2="17" y2="7"></line>
                        <polyline points="7 7 17 7 17 17"></polyline>
                      </svg>
                    </a>
                    
                    <ResumeDropdown 
                      onView={() => setResumeModalState({ isOpen: true, mode: "view", markdown: resumeStore.resumeMarkdown })}
                      onEdit={() => setResumeModalState({ isOpen: true, mode: "edit", markdown: resumeStore.resumeMarkdown })}
                      onDownload={handleDownload}
                    />
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <ResumeModal 
        isOpen={resumeModalState.isOpen}
        initialMode={resumeModalState.mode}
        initialMarkdown={resumeModalState.markdown || resumeStore.resumeMarkdown}
        templateId={resumeStore.selectedTemplateId}
        onClose={() => setResumeModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
