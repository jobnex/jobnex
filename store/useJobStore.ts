import { create } from "zustand";
import { Job } from "@/types";
import { toggleSavedJobAction } from "@/app/actions/jobs";

export interface JobState {
  // Shared
  location: string;
  setLocation: (location: string) => void;
  isFilterMenuOpen: boolean;
  setIsFilterMenuOpen: (isOpen: boolean) => void;
  toggleFilterMenu: () => void;
  isModalOpen: boolean;
  selectedJob: Job | null;
  openModal: (job: Job) => void;
  closeModal: () => void;
  isJdOpen: boolean;
  activeJdJob: Job | null;
  openJd: (job: Job) => void;
  closeJd: () => void;
  setActiveJdJob: (job: Job) => void;
  savedJobIds: string[];
  savedJobIdsMap: Record<string, boolean>;
  setSavedJobIds: (ids: string[]) => void;
  toggleSavedJob: (jobId: string) => Promise<void>;

  // Default Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchBy: string;
  setSearchBy: (searchBy: string) => void;
  categories: string[];
  toggleCategory: (category: string) => void;
  clearCategories: () => void;
  jobType: string;
  setJobType: (jobType: string) => void;
  seniority: string;
  setSeniority: (seniority: string) => void;
  minSalary: number;
  setMinSalary: (minSalary: number) => void;
  postedTime: string;
  setPostedTime: (postedTime: string) => void;
  visaSponsorship: string;
  setVisaSponsorship: (status: string) => void;
  workMode: string;
  setWorkMode: (mode: string) => void;
  page: number;
  setPage: (page: number) => void;
  resetFilters: () => void;

  // Saved Jobs Filters
  savedSearchQuery: string;
  setSavedSearchQuery: (query: string) => void;
  savedSearchBy: string;
  setSavedSearchBy: (searchBy: string) => void;
  savedCategories: string[];
  toggleSavedCategory: (category: string) => void;
  clearSavedCategories: () => void;
  savedJobType: string;
  setSavedJobType: (jobType: string) => void;
  savedSeniority: string;
  setSavedSeniority: (seniority: string) => void;
  savedMinSalary: number;
  setSavedMinSalary: (minSalary: number) => void;
  savedPostedTime: string;
  setSavedPostedTime: (postedTime: string) => void;
  savedVisaSponsorship: string;
  setSavedVisaSponsorship: (status: string) => void;
  savedWorkMode: string;
  setSavedWorkMode: (mode: string) => void;
  savedPage: number;
  setSavedPage: (page: number) => void;
  resetSavedFilters: () => void;
}

export const useJobStore = create<JobState>((set) => ({
  // Shared
  location: "United States",
  setLocation: (location) => {
    if (typeof document !== "undefined") {
      const d = new Date();
      d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1000);
      document.cookie = `user-location=${encodeURIComponent(location)};path=/;expires=${d.toUTCString()}`;
    }
    set({ location, page: 1, savedPage: 1 });
  },
  isFilterMenuOpen: false,
  setIsFilterMenuOpen: (isFilterMenuOpen) => set({ isFilterMenuOpen }),
  toggleFilterMenu: () => set((state) => ({ isFilterMenuOpen: !state.isFilterMenuOpen })),
  isModalOpen: false,
  selectedJob: null,
  openModal: (job) => set({ isModalOpen: true, selectedJob: job }),
  closeModal: () => set({ isModalOpen: false, selectedJob: null }),
  isJdOpen: false,
  activeJdJob: null,
  openJd: (job) => set({ isJdOpen: true, activeJdJob: job }),
  closeJd: () => set({ isJdOpen: false, activeJdJob: null }),
  setActiveJdJob: (job) => set({ activeJdJob: job, isJdOpen: true }),
  savedJobIds: [],
  savedJobIdsMap: {},
  setSavedJobIds: (ids: string[]) => {
    const map: Record<string, boolean> = {};
    ids.forEach((id) => { map[id] = true; });
    set({ savedJobIds: ids, savedJobIdsMap: map });
  },
  toggleSavedJob: async (jobId: string) => {
    set((state) => {
      const isSaved = !!state.savedJobIdsMap[jobId];
      const newIds = isSaved
        ? state.savedJobIds.filter((id) => id !== jobId)
        : [...state.savedJobIds, jobId];
      const newMap = { ...state.savedJobIdsMap };
      if (isSaved) {
        delete newMap[jobId];
      } else {
        newMap[jobId] = true;
      }
      return { savedJobIds: newIds, savedJobIdsMap: newMap };
    });
    
    const state = useJobStore.getState();
    const isNowSaved = !!state.savedJobIdsMap[jobId];
    try {
      const res = await toggleSavedJobAction(jobId, isNowSaved);
      if (!res.success) throw new Error(res.error);
    } catch (error) {
      console.error("Failed to toggle save status:", error);
      // Revert on failure
      set((state) => {
        const revertedIds = isNowSaved
          ? state.savedJobIds.filter((id) => id !== jobId)
          : [...state.savedJobIds, jobId];
        const revertedMap = { ...state.savedJobIdsMap };
        if (isNowSaved) {
          delete revertedMap[jobId];
        } else {
          revertedMap[jobId] = true;
        }
        return { savedJobIds: revertedIds, savedJobIdsMap: revertedMap };
      });
    }
  },

  // Default Filters
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query, page: 1 }),
  searchBy: "all",
  setSearchBy: (searchBy) => set({ searchBy, page: 1 }),
  categories: [],
  toggleCategory: (category) =>
    set((state) => {
      if (category === "all") return { categories: [], page: 1 };
      const exists = state.categories.includes(category);
      return {
        categories: exists ? state.categories.filter((c) => c !== category) : [...state.categories, category],
        page: 1,
      };
    }),
  clearCategories: () => set({ categories: [], page: 1 }),
  jobType: "",
  setJobType: (jobType) => set((state) => ({ jobType: state.jobType === jobType || jobType === "all" ? "" : jobType, page: 1 })),
  seniority: "",
  setSeniority: (seniority) => set((state) => ({ seniority: state.seniority === seniority || seniority === "all" ? "" : seniority, page: 1 })),
  minSalary: 0,
  setMinSalary: (minSalary) => set((state) => ({ minSalary: state.minSalary === minSalary ? 0 : minSalary, page: 1 })),
  postedTime: "",
  setPostedTime: (postedTime) => set((state) => ({ postedTime: state.postedTime === postedTime || postedTime === "all" ? "" : postedTime, page: 1 })),
  visaSponsorship: "",
  setVisaSponsorship: (visaSponsorship) => set((state) => ({ visaSponsorship: state.visaSponsorship === visaSponsorship || visaSponsorship === "all" ? "" : visaSponsorship, page: 1 })),
  workMode: "",
  setWorkMode: (workMode) => set((state) => ({ workMode: state.workMode === workMode || workMode === "all" ? "" : workMode, page: 1 })),
  page: 1,
  setPage: (page) => set({ page }),
  resetFilters: () => set({ searchQuery: "", searchBy: "all", categories: [], jobType: "", seniority: "", minSalary: 0, postedTime: "", visaSponsorship: "", workMode: "", page: 1 }),

  // Saved Jobs Filters
  savedSearchQuery: "",
  setSavedSearchQuery: (query) => set({ savedSearchQuery: query, savedPage: 1 }),
  savedSearchBy: "all",
  setSavedSearchBy: (searchBy) => set({ savedSearchBy: searchBy, savedPage: 1 }),
  savedCategories: [],
  toggleSavedCategory: (category) =>
    set((state) => {
      if (category === "all") return { savedCategories: [], savedPage: 1 };
      const exists = state.savedCategories.includes(category);
      return {
        savedCategories: exists ? state.savedCategories.filter((c) => c !== category) : [...state.savedCategories, category],
        savedPage: 1,
      };
    }),
  clearSavedCategories: () => set({ savedCategories: [], savedPage: 1 }),
  savedJobType: "",
  setSavedJobType: (jobType) => set((state) => ({ savedJobType: state.savedJobType === jobType || jobType === "all" ? "" : jobType, savedPage: 1 })),
  savedSeniority: "",
  setSavedSeniority: (seniority) => set((state) => ({ savedSeniority: state.savedSeniority === seniority || seniority === "all" ? "" : seniority, savedPage: 1 })),
  savedMinSalary: 0,
  setSavedMinSalary: (minSalary) => set((state) => ({ savedMinSalary: state.savedMinSalary === minSalary ? 0 : minSalary, savedPage: 1 })),
  savedPostedTime: "",
  setSavedPostedTime: (postedTime) => set((state) => ({ savedPostedTime: state.savedPostedTime === postedTime || postedTime === "all" ? "" : postedTime, savedPage: 1 })),
  savedVisaSponsorship: "",
  setSavedVisaSponsorship: (visaSponsorship) => set((state) => ({ savedVisaSponsorship: state.savedVisaSponsorship === visaSponsorship || visaSponsorship === "all" ? "" : visaSponsorship, savedPage: 1 })),
  savedWorkMode: "",
  setSavedWorkMode: (workMode) => set((state) => ({ savedWorkMode: state.savedWorkMode === workMode || workMode === "all" ? "" : workMode, savedPage: 1 })),
  savedPage: 1,
  setSavedPage: (page) => set({ savedPage: page }),
  resetSavedFilters: () => set({ savedSearchQuery: "", savedCategories: [], savedJobType: "", savedSeniority: "", savedMinSalary: 0, savedPostedTime: "", savedVisaSponsorship: "", savedWorkMode: "", savedPage: 1 }),
}));

export function useAppFilters(variant: "default" | "saved" = "default") {
  const store = useJobStore();
  if (variant === "saved") {
    return {
      searchQuery: store.savedSearchQuery,
      setSearchQuery: store.setSavedSearchQuery,
      searchBy: store.savedSearchBy,
      setSearchBy: store.setSavedSearchBy,
      categories: store.savedCategories,
      toggleCategory: store.toggleSavedCategory,
      clearCategories: store.clearSavedCategories,
      jobType: store.savedJobType,
      setJobType: store.setSavedJobType,
      seniority: store.savedSeniority,
      setSeniority: store.setSavedSeniority,
      minSalary: store.savedMinSalary,
      setMinSalary: store.setSavedMinSalary,
      postedTime: store.savedPostedTime,
      setPostedTime: store.setSavedPostedTime,
      visaSponsorship: store.savedVisaSponsorship,
      setVisaSponsorship: store.setSavedVisaSponsorship,
      workMode: store.savedWorkMode,
      setWorkMode: store.setSavedWorkMode,
      page: store.savedPage,
      setPage: store.setSavedPage,
      resetFilters: store.resetSavedFilters,
      location: store.location,
      setLocation: store.setLocation
    };
  }
  return {
    searchQuery: store.searchQuery,
    setSearchQuery: store.setSearchQuery,
    searchBy: store.searchBy,
    setSearchBy: store.setSearchBy,
    categories: store.categories,
    toggleCategory: store.toggleCategory,
    clearCategories: store.clearCategories,
    jobType: store.jobType,
    setJobType: store.setJobType,
    seniority: store.seniority,
    setSeniority: store.setSeniority,
    minSalary: store.minSalary,
    setMinSalary: store.setMinSalary,
    postedTime: store.postedTime,
    setPostedTime: store.setPostedTime,
    visaSponsorship: store.visaSponsorship,
    setVisaSponsorship: store.setVisaSponsorship,
    workMode: store.workMode,
    setWorkMode: store.setWorkMode,
    page: store.page,
    setPage: store.setPage,
    resetFilters: store.resetFilters,
    location: store.location,
    setLocation: store.setLocation
  };
}
