import { create } from "zustand";
import type { User } from "@/types";

interface AppState {
  // UI State
  searchQuery: string;
  activeFilter: string;
  currentPage: number;
  usersPerPage: number;
  currentUserId: string | null;
  currentHistoryId: string | null;
  theme: "light" | "dark";
  currency: string;
  activeView: "users" | "pinned" | "stats" | "trash" | "logs" | "settings";

  // Modal State
  modals: {
    userDetail: boolean;
    addAmount: boolean;
    subtractAmount: boolean;
    addUser: boolean;
    deleteUser: boolean;
    settings: boolean;
    stats: boolean;
    trash: boolean;
    logs: boolean;
    editHistory: boolean;
    deleteHistory: boolean;
  };

  // Data version (incremented on any data change to trigger re-renders)
  dataVersion: number;
  bumpDataVersion: () => void;

  // Actions
  setSearchQuery: (q: string) => void;
  setActiveFilter: (f: string) => void;
  setCurrentPage: (p: number) => void;
  setUsersPerPage: (n: number) => void;
  setCurrentUserId: (id: string | null) => void;
  setCurrentHistoryId: (id: string | null) => void;
  setTheme: (t: "light" | "dark") => void;
  setCurrency: (c: string) => void;
  setActiveView: (v: AppState["activeView"]) => void;
  openModal: (name: keyof AppState["modals"]) => void;
  closeModal: (name: keyof AppState["modals"]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  searchQuery: "",
  activeFilter: "all",
  currentPage: 1,
  usersPerPage: parseInt(localStorage.getItem("usersPerPage") || "8"),
  currentUserId: null,
  currentHistoryId: null,
  theme: (localStorage.getItem("theme") as "light" | "dark") || "light",
  currency: localStorage.getItem("currency") || "CNY",
  activeView: "users",
  dataVersion: 0,

  modals: {
    userDetail: false,
    addAmount: false,
    subtractAmount: false,
    addUser: false,
    deleteUser: false,
    settings: false,
    stats: false,
    trash: false,
    logs: false,
    editHistory: false,
    deleteHistory: false,
  },

  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  setSearchQuery: (q) => set({ searchQuery: q, currentPage: 1 }),
  setActiveFilter: (f) => set({ activeFilter: f, currentPage: 1 }),
  setCurrentPage: (p) => set({ currentPage: p }),
  setUsersPerPage: (n) => { localStorage.setItem("usersPerPage", String(n)); set({ usersPerPage: n, currentPage: 1 }); },
  setCurrentUserId: (id) => set({ currentUserId: id }),
  setCurrentHistoryId: (id) => set({ currentHistoryId: id }),
  setTheme: (t) => {
    localStorage.setItem("theme", t);
    if (t === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    set({ theme: t });
  },
  setCurrency: (c) => { localStorage.setItem("currency", c); set((s) => ({ currency: c, dataVersion: s.dataVersion + 1 })); },
  setActiveView: (v) => set({ activeView: v }),
  openModal: (name) => set((s) => ({ modals: { ...s.modals, [name]: true } })),
  closeModal: (name) => set((s) => ({ modals: { ...s.modals, [name]: false } })),
}));