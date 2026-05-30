import { useState, useEffect, useCallback, useRef } from "react";
import type { User, Session } from "@supabase/supabase-js";
import {
  initSupabaseClient,
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  resetSupabaseClient,
  subscribeToChanges,
} from "@/lib/supabase";
import { getVIPManager } from "./useVIPManager";
import { useAppStore } from "@/store/useAppStore";

interface AuthState {
  isConfigured: boolean;
  isLoggedIn: boolean;
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export function useSupabaseAuth() {
  const [auth, setAuth] = useState<AuthState>({
    isConfigured: !!getSupabaseConfig(),
    isLoggedIn: false,
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  // Timers refs
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullUnsubscribeRef = useRef<(() => void) | null>(null);
  const dataVersionRef = useRef(0);
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

  const mgr = getVIPManager();

  // Sync helpers
  const doPull = useCallback(async (client: ReturnType<typeof initSupabaseClient>, ownerId: string) => {
    if (!client) return;
    await mgr.syncPullFromCloud(client, ownerId);
    await mgr.loadData();
    bumpDataVersion();
  }, [bumpDataVersion]);

  // 对外暴露的主动 Pull 方法，供刷新按钮等场景调用
  const pullFromCloud = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !auth.user) return;
    await doPull(client, auth.user.id);
  }, [auth.user, doPull]);

  const schedulePush = useCallback((client: ReturnType<typeof initSupabaseClient>, ownerId: string) => {
    if (!client) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      await mgr.syncPushToCloud(client, ownerId);
    }, 3000);
  }, []);

  // Subscribe to Realtime changes
  const setupRealtime = useCallback((client: ReturnType<typeof initSupabaseClient>, ownerId: string) => {
    if (!client) return;
    if (pullUnsubscribeRef.current) {
      pullUnsubscribeRef.current();
      pullUnsubscribeRef.current = null;
    }
    pullUnsubscribeRef.current = subscribeToChanges(client, ownerId, async () => {
      await doPull(client, ownerId);
    });
  }, [doPull]);

  const initAuth = useCallback(async () => {
    setAuth(s => ({ ...s, loading: true, error: null }));
    try {
      const client = initSupabaseClient();
      if (!client) {
        setAuth({ isConfigured: false, isLoggedIn: false, user: null, session: null, loading: false, error: null });
        return;
      }

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      if (data?.session?.user) {
        const m = getVIPManager();
        await m.init(data.session.user.id);
        // 新设备/页面刷新：从云端拉取一次最新数据
        await doPull(client, data.session.user.id);
        setupRealtime(client, data.session.user.id);
        setAuth({
          isConfigured: true,
          isLoggedIn: true,
          user: data.session.user,
          session: data.session,
          loading: false,
          error: null,
        });
      } else {
        setAuth({
          isConfigured: true,
          isLoggedIn: false,
          user: null,
          session: null,
          loading: false,
          error: null,
        });
      }
    } catch (e) {
      setAuth(s => ({ ...s, loading: false, error: String(e) }));
    }
  }, [doPull, setupRealtime]);

  // 主初始化 effect：initAuth + onAuthStateChange + 清理
  useEffect(() => {
    initAuth();

    const client = getSupabaseClient();
    if (client) {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session?.user) {
            setAuth({
              isConfigured: true,
              isLoggedIn: true,
              user: session.user,
              session,
              loading: false,
              error: null,
            });
            const m = getVIPManager();
            await m.init(session.user.id);
            await doPull(client, session.user.id);
            await m.loadData();
            setupRealtime(client, session.user.id);
            bumpDataVersion();
          } else if (event === "SIGNED_OUT") {
            setAuth((s) => ({
              ...s,
              isLoggedIn: false,
              user: null,
              session: null,
            }));
            if (pullUnsubscribeRef.current) {
              pullUnsubscribeRef.current();
              pullUnsubscribeRef.current = null;
            }
            if (pushTimerRef.current) {
              clearTimeout(pushTimerRef.current);
              pushTimerRef.current = null;
            }
          }
        }
      );

      return () => {
        subscription.unsubscribe();
        if (pullUnsubscribeRef.current) {
          pullUnsubscribeRef.current();
          pullUnsubscribeRef.current = null;
        }
      };
    }
  }, [initAuth]);

  // 独立的窗口聚焦 Pull effect（依赖 auth 状态以修复过期闭包）
  useEffect(() => {
    if (!auth.isLoggedIn || !auth.user) return;
    const client = getSupabaseClient();
    if (!client) return;

    const onFocus = () => doPull(client, auth.user!.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [auth.isLoggedIn, auth.user, doPull]);

  // Watch dataVersion for 3s idle push
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      if (state.dataVersion !== dataVersionRef.current) {
        dataVersionRef.current = state.dataVersion;
        if (auth.isLoggedIn && auth.user) {
          const client = getSupabaseClient();
          if (client) schedulePush(client, auth.user.id);
        }
      }
    });
    return () => { unsub(); };
  }, [auth.isLoggedIn, auth.user, schedulePush]);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient() || initSupabaseClient();
    if (!client) return { error: "未能初始化 Supabase" };
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data?.user) {
      setAuth(s => ({ ...s, isLoggedIn: true, user: data.user!, session: data.session, error: null }));
      const m = getVIPManager();
      await m.init(data.user!.id);
      await doPull(client, data.user!.id);
      await m.loadData();
      setupRealtime(client, data.user!.id);
      bumpDataVersion();
    }
    return { error: null };
  }, [doPull, setupRealtime, bumpDataVersion]);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient() || initSupabaseClient();
    if (!client) return { error: "未能初始化 Supabase" };
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data?.user) {
      setAuth(s => ({ ...s, isLoggedIn: true, user: data.user!, session: data.session, error: null }));
      const m = getVIPManager();
      await m.init(data.user!.id);
      await doPull(client, data.user!.id);
      await m.loadData();
      setupRealtime(client, data.user!.id);
      bumpDataVersion();
    }
    return { error: null };
  }, [doPull, setupRealtime, bumpDataVersion]);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (client && auth.user) {
      await mgr.syncPushToCloud(client, auth.user.id);
      await client.auth.signOut();
    }
    if (pullUnsubscribeRef.current) {
      pullUnsubscribeRef.current();
      pullUnsubscribeRef.current = null;
    }
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    resetSupabaseClient();
    setAuth(s => ({ ...s, isLoggedIn: false, user: null, session: null }));
    const m = getVIPManager();
    m.state.users = {};
    m.state.recentViewed = [];
    m.state.trash = [];
    m.state.logs = [];
  }, [auth.user]);

  const configureAndSave = useCallback((url: string, anonKey: string) => {
    saveSupabaseConfig(url, anonKey);
    setAuth(s => ({ ...s, isConfigured: true }));
    return true;
  }, []);

  const clearConfig = useCallback(() => {
    clearSupabaseConfig();
    setAuth(s => ({ ...s, isConfigured: false, isLoggedIn: false }));
  }, []);

  return {
    ...auth,
    initAuth,
    signIn,
    signUp,
    signOut,
    configureAndSave,
    clearConfig,
    pullFromCloud,
  };
}
