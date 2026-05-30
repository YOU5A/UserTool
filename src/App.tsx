import { useEffect, useCallback, lazy, Suspense, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { UserGrid } from "@/components/users/UserGrid";
import { UserDetail } from "@/components/users/UserDetail";
import { UserForm } from "@/components/users/UserForm";
import { AmountModal } from "@/components/modals/AmountModal";
import { EditHistoryModal, DeleteHistoryModal, DeleteUserModal } from "@/components/modals/EditDeleteModals";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { TrashModal } from "@/components/modals/TrashModal";
import { LogsModal } from "@/components/modals/LogsModal";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

const StatsModal = lazy(() => import("@/components/modals/StatsModal").then(m => ({ default: m.StatsModal })));

function StatsLazy() {
  return (
    <Suspense fallback={null}>
      <StatsModal />
    </Suspense>
  );
}

export default function App() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const auth = useSupabaseAuth();
  const initDone = useRef(false);

  // 核心初始化：等 auth 状态确认后再决定用哪个数据库
  useEffect(() => {
    if (auth.loading) return; // 等待 auth 初始化完成
    if (initDone.current) return; // 只初始化一次

    (async () => {
      try {
        if (auth.isLoggedIn && auth.user) {
          // 已登录：auth hook 已调用 init(userId)，只需刷新
          rerender();
        } else {
          // 未登录或未配置：使用离线数据库
          await mgr.init("local_offline");
          rerender();
        }
        initDone.current = true;
      } catch (e) {
        console.warn("Init failed:", e);
      }
    })();
  }, [auth.loading, auth.isLoggedIn]);

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
      await auth.pullFromCloud();
    }
    rerender();
  }, [auth.isLoggedIn, auth.pullFromCloud, rerender]);
  const handleAddUser = useCallback(() => store.openModal("addUser"), []);
  const handleSettings = useCallback(() => store.openModal("settings"), []);
  const handleUserClick = useCallback((userId: string) => {
    store.setCurrentUserId(userId);
    mgr.addRecentView(userId);
    store.openModal("userDetail");
    rerender();
  }, [mgr, rerender]);
  const handleClearRecent = useCallback(() => {
    mgr.state.recentViewed = [];
    rerender();
  }, [mgr, rerender]);
  const handleLogout = useCallback(async () => {
    await auth.signOut();
    // 登出后用离线数据库
    await mgr.init("local_offline");
    rerender();
  }, [auth, mgr, rerender]);

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
        isLoggedIn={auth.isLoggedIn}
        userEmail={auth.user?.email}
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
      <SettingsModal />
      <TrashModal />
      <LogsModal />
      <StatsLazy />
    </ErrorBoundary>
  );
}
