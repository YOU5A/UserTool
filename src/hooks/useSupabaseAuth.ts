import { useState, useEffect, useCallback, useRef } from "react";
import type { User, Session } from "@supabase/supabase-js";
import {
  initSupabaseClient,
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
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
    console.log("[useSupabaseAuth] doPull starting for ownerId:", ownerId);
    await mgr.syncPullFromCloud(client, ownerId);
    console.log("[useSupabaseAuth] syncPullFromCloud done, loading data");
    await mgr.loadData();
    console.log("[useSupabaseAuth] loadData done, bumping version");
    bumpDataVersion();
  }, [bumpDataVersion]);

  // 对外暴露的主动 Pull 方法，供刷新按钮等场景调用
  const pullFromCloud = useCallback(async () => {
    const client = getSupabaseClient();
    console.log("[useSupabaseAuth] pullFromCloud called, client:", !!client, "user:", !!auth.user);
    if (!client) {
      console.warn("[useSupabaseAuth] pullFromCloud: no client available");
      return;
    }
    if (!auth.user) {
      console.warn("[useSupabaseAuth] pullFromCloud: no user, not logged in");
      return;
    }
    try {
      await doPull(client, auth.user.id);
      console.log("[useSupabaseAuth] pullFromCloud completed");
    } catch (e) {
      console.error("[useSupabaseAuth] pullFromCloud error:", e);
      throw e;
    }
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

  // 核心：恢复登录态的回调（供 onAuthStateChange 和 initAuth 共用）
  const restoreSession = useCallback(async (
    client: ReturnType<typeof initSupabaseClient>,
    session: Session,
  ) => {
    const userId = session.user.id;
    console.log("[useSupabaseAuth] restoreSession: userId=", userId);
    const m = getVIPManager();
    await m.init(userId);
    await doPull(client, userId);
    await m.loadData();
    setupRealtime(client, userId);
    bumpDataVersion();
  }, [doPull, setupRealtime, bumpDataVersion]);

  // 主初始化 effect：先注册监听器，再检查 session
  useEffect(() => {
    let mounted = true;
    console.log("[useSupabaseAuth] init effect running");

    const client = initSupabaseClient();
    if (!client) {
      console.log("[useSupabaseAuth] no config, offline mode");
      setAuth({ isConfigured: false, isLoggedIn: false, user: null, session: null, loading: false, error: null });
      return;
    }

    // ★ 关键修复：先注册 onAuthStateChange，再调用 getSession
    // 这样 INITIAL_SESSION 事件才能被捕获
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[useSupabaseAuth] onAuthStateChange:", event, !!session?.user);
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          if (!mounted) return;
          setAuth({
            isConfigured: true,
            isLoggedIn: true,
            user: session.user,
            session,
            loading: false,
            error: null,
          });
          await restoreSession(client, session);
        } else if (event === "TOKEN_REFRESHED") {
          if (!mounted) return;
          console.log("[useSupabaseAuth] token refreshed");
          setAuth(s => ({
            ...s,
            session,
          }));
        } else if (event === "SIGNED_OUT") {
          if (!mounted) return;
          console.log("[useSupabaseAuth] onAuthStateChange: SIGNED_OUT");
          setAuth((s) => ({
            ...s,
            isLoggedIn: false,
            user: null,
            session: null,
            loading: false,
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

    // 然后调用 getSession —— 此时 listener 已就位，INITIAL_SESSION 会被捕获
    (async () => {
      try {
        console.log("[useSupabaseAuth] calling getSession...");
        const { data, error } = await client.auth.getSession();
        console.log("[useSupabaseAuth] getSession result:", !!data?.session?.user, error ? "error:" + error.message : "");
        
        if (!mounted) return;
        
        if (error) {
          console.error("[useSupabaseAuth] getSession error:", error.message);
          setAuth(s => ({ ...s, loading: false, error: error.message }));
          return;
        }

        if (data?.session?.user) {
          // Session 已存在 —— onAuthStateChange(INITIAL_SESSION) 已处理
          // 但如果 listener 没触发，手动恢复（双重保险）
          console.log("[useSupabaseAuth] session found via getSession, listener should handle INITIAL_SESSION");
          // 设置 loading 为 false（listener 可能已触发，这里确保 loading 一定解除）
          setAuth(s => {
            if (s.loading) {
              return { ...s, loading: false };
            }
            return s;
          });
        } else {
          // 没有 session
          console.log("[useSupabaseAuth] no session found, offline mode");
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
        if (!mounted) return;
        console.error("[useSupabaseAuth] initAuth error:", e);
        setAuth(s => ({ ...s, loading: false, error: String(e) }));
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (pullUnsubscribeRef.current) {
        pullUnsubscribeRef.current();
        pullUnsubscribeRef.current = null;
      }
    };
  }, [restoreSession]);

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
    if (!client) {
      console.error("[useSupabaseAuth] signIn: cannot init client");
      return { error: "未能初始化 Supabase" };
    }
    console.log("[useSupabaseAuth] signIn: attempting login for", email);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[useSupabaseAuth] signIn error:", error.message);
      return { error: error.message };
    }
    if (data?.user) {
      console.log("[useSupabaseAuth] signIn success, user:", data.user.id);
      // onAuthStateChange(SIGNED_IN) 会自动处理后续的 restoreSession
      // 这里只做最小状态更新，避免双重初始化
      setAuth(s => ({ ...s, isLoggedIn: true, user: data.user!, session: data.session, error: null }));
      bumpDataVersion();
    }
    return { error: null };
  }, [bumpDataVersion]);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient() || initSupabaseClient();
    if (!client) {
      console.error("[useSupabaseAuth] signUp: cannot init client");
      return { error: "未能初始化 Supabase" };
    }
    console.log("[useSupabaseAuth] signUp: attempting registration for", email);
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) {
      console.error("[useSupabaseAuth] signUp error:", error.message);
      return { error: error.message };
    }
    if (data?.user) {
      console.log("[useSupabaseAuth] signUp success, user:", data.user.id);
      if (data.session) {
        // 部分 Supabase 实例注册后自动登录
        setAuth(s => ({ ...s, isLoggedIn: true, user: data.user!, session: data.session, error: null }));
        bumpDataVersion();
      }
    }
    return { error: null };
  }, [bumpDataVersion]);

  const authUserRef = useRef(auth.user);
  authUserRef.current = auth.user;

  const signOut = useCallback(async () => {
    console.log("[useSupabaseAuth] signOut called");
    try {
      const client = getSupabaseClient();
      const currentUser = authUserRef.current;
      if (client && currentUser) {
        console.log("[useSupabaseAuth] pushing to cloud before signOut");
        await mgr.syncPushToCloud(client, currentUser.id);
        await client.auth.signOut();
        console.log("[useSupabaseAuth] signOut complete");
      }

      if (pullUnsubscribeRef.current) {
        pullUnsubscribeRef.current();
        pullUnsubscribeRef.current = null;
      }
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      setAuth(s => ({ ...s, isLoggedIn: false, user: null, session: null }));
      const m = getVIPManager();
      m.state.users = {};
      m.state.recentViewed = [];
      m.state.trash = [];
      m.state.logs = [];
    } catch (e) {
      console.error("[useSupabaseAuth] signOut error:", e);
    }
  }, []);

  const configureAndSave = useCallback((url: string, anonKey: string) => {
    console.log("[useSupabaseAuth] configureAndSave called");
    saveSupabaseConfig(url, anonKey);
    setAuth(s => ({ ...s, isConfigured: true }));
    return true;
  }, []);

  const clearConfig = useCallback(() => {
    console.log("[useSupabaseAuth] clearConfig called");
    clearSupabaseConfig();
    setAuth(s => ({ ...s, isConfigured: false, isLoggedIn: false }));
  }, []);

  return {
    ...auth,
    initAuth: undefined!, // 已由 useEffect 自动处理
    signIn,
    signUp,
    signOut,
    configureAndSave,
    clearConfig,
    pullFromCloud,
  };
}

