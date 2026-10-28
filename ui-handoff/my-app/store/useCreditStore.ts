import { create } from "zustand";
import { getCredits, deductCredit as serverDeductCredit } from "@/app/actions/credits";

interface CreditState {
  balance: number | null;
  isLoading: boolean;
  fetchCredits: () => Promise<void>;
  deductCredit: (referenceId?: string) => Promise<{ success: boolean; error?: string }>;
}

export const useCreditStore = create<CreditState>((set, get) => ({
  balance: null,
  isLoading: false,

  fetchCredits: async () => {
    set({ isLoading: true });
    try {
      const res = await getCredits();
      if (!res.error) {
        set({ balance: res.balance });
      }
    } catch (error) {
      console.error("Failed to fetch credits:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  deductCredit: async (referenceId?: string) => {
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
      if (res.success && 'newBalance' in res && res.newBalance !== undefined) {
        // Sync with exact server value
        set({ balance: res.newBalance });
        return { success: true };
      }
      
      // Revert on server logic failure
      if (currentBalance !== null) set({ balance: currentBalance });
      return { success: false, error: 'error' in res ? String(res.error) : "Failed to deduct credit" };
    } catch (error: unknown) {
      // Revert on network/unexpected error
      if (currentBalance !== null) set({ balance: currentBalance });
      const message = error instanceof Error ? error.message : "Failed to deduct credit";
      return { success: false, error: message };
    }
  },
}));
