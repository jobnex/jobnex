const fs = require('fs');

const storePath = 'store/useJobStore.ts';
let content = fs.readFileSync(storePath, 'utf8');

// 1. Add saved* properties to JobState
content = content.replace(
  '  resetFilters: () => void;',
  `  resetFilters: () => void;

  savedSearchQuery: string;
  setSavedSearchQuery: (query: string) => void;
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
  resetSavedFilters: () => void;`
);

// 2. Add saved* implementations to store
content = content.replace(
  '  resetFilters: () =>',
  `  savedSearchQuery: "",
  setSavedSearchQuery: (query) => set({ savedSearchQuery: query, savedPage: 1 }),
  
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
  setSavedJobType: (jobType) =>
    set((state) => ({
      savedJobType: state.savedJobType === jobType || jobType === "all" ? "" : jobType,
      savedPage: 1,
    })),

  savedSeniority: "",
  setSavedSeniority: (seniority) =>
    set((state) => ({
      savedSeniority: state.savedSeniority === seniority || seniority === "all" ? "" : seniority,
      savedPage: 1,
    })),

  savedMinSalary: 0,
  setSavedMinSalary: (minSalary) =>
    set((state) => ({
      savedMinSalary: state.savedMinSalary === minSalary ? 0 : minSalary,
      savedPage: 1,
    })),

  savedPostedTime: "",
  setSavedPostedTime: (postedTime) =>
    set((state) => ({
      savedPostedTime: state.savedPostedTime === postedTime || postedTime === "all" ? "" : postedTime,
      savedPage: 1,
    })),

  savedVisaSponsorship: "",
  setSavedVisaSponsorship: (visaSponsorship) =>
    set((state) => ({
      savedVisaSponsorship: state.savedVisaSponsorship === visaSponsorship || visaSponsorship === "all" ? "" : visaSponsorship,
      savedPage: 1,
    })),

  savedWorkMode: "",
  setSavedWorkMode: (workMode) =>
    set((state) => ({
      savedWorkMode: state.savedWorkMode === workMode || workMode === "all" ? "" : workMode,
      savedPage: 1,
    })),
    
  savedPage: 1,
  setSavedPage: (page) => set({ savedPage: page }),

  resetSavedFilters: () =>
    set({
      savedSearchQuery: "",
      savedCategories: [],
      savedJobType: "",
      savedSeniority: "",
      savedMinSalary: 0,
      savedPostedTime: "",
      savedVisaSponsorship: "",
      savedWorkMode: "",
      savedPage: 1,
    }),

  resetFilters: () =>`
);

// 3. Add useAppFilters hook
content += `

export function useAppFilters(variant: "default" | "saved" = "default") {
  const store = useJobStore();
  if (variant === "saved") {
    return {
      searchQuery: store.savedSearchQuery,
      setSearchQuery: store.setSavedSearchQuery,
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
`;

fs.writeFileSync(storePath, content);
