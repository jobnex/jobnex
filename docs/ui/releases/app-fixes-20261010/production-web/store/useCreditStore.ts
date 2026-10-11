import { create } from "zustand";
import { getCredits, deductCredit as serverDeductCredit } from "@/app/actions/credits";

interface CreditState {
  balance: number | null;
  userId: string | null;
  setUser: (userId: string | null) => void;
  isLoading: boolean;
  fetchCredits: () => Promise<void>;
  deductCredit: (referenceId?: string) => Promise<{ success: boolean; error?: string }>;
}

export const useCreditStore = create<CreditState>((set, get) => ({
  balance: null,
  userId: null,
  setUser: userId => {
    if (get().userId !== userId) set({ userId, balance:null,isLoading:false });
  },
  isLoading: false,

  fetchCredits: async () => {
    const requestedUser = get().userId;
    if (!requestedUser) return;
    set({ isLoading: true });
    try {
      const res = await getCredits();
      if (!res.error && get().userId === requestedUser && res.userId === requestedUser) {
        set({ balance: res.balance });
      }
    } catch (error) {
      console.error("Failed to fetch credits:", error);
    } finally {
      if (get().userId === requestedUser) set({ isLoading: false });
    }
  },

  deductCredit: async (referenceId?: string) => {
    const currentUser = get().userId;
    const currentBalance = get().balance;
    
    // Preliminary check
    if (currentBalance !== null && currentBalance < 1) {
      return { success: false, error: "Insufficient credits" };
    }

    // Optimistic Update
    if (currentBalance !== null) {
      set({ balance: currentBalance - 1 });
    }

    try {
      const res = await serverDeductCredit(referenceId);
      if (get().userId !== currentUser) return { success: res.success, error: !res.success && 'error' in res ? String(res.error) : undefined };
      if (res.success && 'newBalance' in res && res.newBalance !== undefined) {
        // Sync with exact server value
        set({ balance: res.newBalance });
        return { success: true };
      }
      
      // Revert on server logic failure
      if (get().userId === currentUser && currentBalance !== null) set({ balance: currentBalance });
      return { success: false, error: 'error' in res ? String(res.error) : "Failed to deduct credit" };
    } catch (error) {
      // Revert on network/unexpected error
      if (get().userId === currentUser && currentBalance !== null) set({ balance: currentBalance });
      return { success: false, error: (error instanceof Error ? error.message : "Unexpected error") };
    }
  },
}));
