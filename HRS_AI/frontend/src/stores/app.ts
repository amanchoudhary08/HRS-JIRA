import { create } from 'zustand'

interface AppState {
  sidebarExpanded: boolean
  pendingApprovals: number
  toggleSidebar: () => void
  setPendingApprovals: (n: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarExpanded: true,
  pendingApprovals: 0,
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setPendingApprovals: (n) => set({ pendingApprovals: n }),
}))
