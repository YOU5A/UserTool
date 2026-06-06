import { useEffect, useCallback, lazy, Suspense, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { UserGrid } from "@/components/users/UserGrid";
import { UserDetail } from "@/components/users/UserDetail";
import { UserForm } from "@/components/users/UserForm";
import { AmountModal } from "@/components/modals/AmountModal";
import { EditHistoryModal, DeleteHistoryModal, DeleteUserModal } from "@/components/modals/EditDeleteModals";
import { TrashModal } from "@/components/modals/TrashModal";
import { LogsModal } from "@/components/modals/LogsModal";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { useAuth } from "@/context/AuthContext";
import { useSyncManager } from "@/hooks/useSyncManager";

const StatsModal = lazy(() => import("@/components/modals/StatsModal").then(m => ({ default: m.StatsModal })));
const SettingsModal = lazy(() => import("@/components/modals/SettingsModal").then(m => ({ default: m.SettingsModal })));

function StatsLazy() {
  return (
    <Suspense fallback={null}>
      <StatsModal />
    </Suspense>
  );
}

function SettingsLazy() {
  return (
    <Suspense fallback={null}>
      <SettingsModal />
    </Suspense>
  );
}

export default function App() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const auth = useAuth();
  const { doPull, pushBeforeSignOut, setupRealtime, pullFromCloud } = useSyncManager();

  // Track which userId was initialized to avoid re-init on re-render
  const initUserId = useRef<string | null>(null);

  // Wait for auth to resolve, then init the appropriate DB
  useEffect(() => {
    if (auth.loading) return;
    const targetId = auth.isLoggedIn ? auth.user?.id ?? "local_offline" : "local_offline";
    if (initUserId.current === targetId) return;

    (async () => {
      try {
        initUserId.current = targetId;
        await mgr.init(targetId);
        if (auth.isLoggedIn && auth.user) {
          await doPull();
          setupRealtime();
        }
        rerender();
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[App] init failed:", e);
      }
    })();
  }, [auth.loading, auth.isLoggedIn, auth.user]);

  // Apply theme on mount
  useEffect(() => {
    if (store.theme === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  // Route activeView changes to actions
  useEffect(() => {
    switch (store.activeView) {
      case "users":
        store.setActiveFilter("all");
        break;
      case "card":
        store.setActiveFilter("card");
        break;
      case "pinned":
        store.setActiveFilter("pinned");
        break;
      case "stats":
        store.openModal("stats");
        break;
      case "trash":
        store.openModal("trash");
        break;
      case "logs":
        store.openModal("logs");
        break;
      case "settings":
        store.openModal("settings");
        break;
    }
  }, [store.activeView]);

  const handleRefresh = useCallback(async () => {
    if (auth.isLoggedIn) {
      try {
        await pullFromCloud();
      } catch (e) {
        if (import.meta.env.DEV) console.error("[App] pullFromCloud failed:", e);
      }
    }
    rerender();
  }, [auth.isLoggedIn, pullFromCloud, rerender]);

  const handleAddUser = useCallback(() => store.openModal("addUser"), []);
  const handleSettings = useCallback(() => store.openModal("settings"), []);
  const handleUserClick = useCallback((userId: string) => {
    store.setCurrentUserId(userId);
    mgr.addRecentView(userId);
    store.setActiveView("users");
    store.openModal("userDetail");
    rerender();
  }, [mgr, rerender]);
  const handleClearRecent = useCallback(() => {
    mgr.state.recentViewed = [];
    rerender();
  }, [mgr, rerender]);

  const handleLogout = useCallback(async () => {
    // Push remaining changes before sign-out
    await pushBeforeSignOut();
    // Sign out (onAuthStateChange will fire SIGNED_OUT)
    await auth.signOut();
    // Switch to offline DB
    initUserId.current = "local_offline";
    await mgr.init("local_offline");
    rerender();
  }, [auth, pushBeforeSignOut, mgr, rerender]);

  return (
    <ErrorBoundary>
      <MainLayout
        searchQuery={store.searchQuery}
        onSearchChange={store.setSearchQuery}
        onAddUser={handleAddUser}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
        onUserClick={handleUserClick}
        onClearRecent={handleClearRecent}
        onLogout={handleLogout}
      >
        <UserGrid />
      </MainLayout>

      <UserDetail />
      <UserForm />
      <AmountModal type="add" />
      <AmountModal type="subtract" />
      <EditHistoryModal />
      <DeleteHistoryModal />
      <DeleteUserModal />
      <SettingsLazy />
      <TrashModal />
      <LogsModal />
      <StatsLazy />
    </ErrorBoundary>
  );
}
