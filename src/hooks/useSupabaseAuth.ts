import { useState, useEffect, useCallback, useRef } from "react";
import type { User, Session } from "@supabase/supabase-js";
import {
  initSupabaseClient,
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  subscribeToChanges,
  fetchAllUserData,
  pushUsersBatch,
  deleteUserData,
  deleteAllUserData,
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

  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullUnsubscribeRef = useRef<(() => void) | null>(null);
  const dataVersionRef = useRef(0);
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);
  const authUserRef = useRef<User | null>(null);

  const mgr = getVIPManager();

  // ---- Pull from cloud ----

  const doPull = useCallback(async (client: ReturnType<typeof initSupabaseClient>, ownerId: string) => {
    if (!client) return;
    console.log("[useSupabaseAuth] doPull starting for ownerId:", ownerId);
    const rows = await fetchAllUserData(client, ownerId);
    console.log("[useSupabaseAuth] fetchAllUserData done, rows:", rows.length);
    await mgr.replaceAllFromCloud(rows);
    console.log("[useSupabaseAuth] replaceAllFromCloud done");
    bumpDataVersion();
  }, [bumpDataVersion]);

  const pullFromCloud = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) { console.warn("[pullFromCloud] no client"); return; }
    if (!authUserRef.current) { console.warn("[pullFromCloud] not logged in"); return; }
    try {
      await doPull(client, authUserRef.current.id);
    } catch (e) {
      console.error("[pullFromCloud] error:", e);
    }
  }, [doPull]);

  // ---- Push changed users to cloud ----

  const doPush = useCallback(async (client: ReturnType<typeof initSupabaseClient>, ownerId: string) => {
    if (!client) return;
    const changedIds = mgr.getChangedUserIdsAndClear();
    if (changedIds.length === 0) return;

    console.log("[useSupabaseAuth] doPush, changedIds:", changedIds.length);

    // 检查是否全删标志
    if (changedIds.length > 10 && Object.keys(mgr.state.users).length === 0) {
      // 可能触发了 deleteAllUsers，直接用全删
      await deleteAllUserData(client, ownerId);
      return;
    }

    const toUpsert: import("@/types").User[] = [];
    const toDelete: string[] = [];

    for (const id of changedIds) {
      const user = mgr.getUser(id);
      if (user && !user.purged) {
        toUpsert.push(user);
      } else {
        toDelete.push(id);
      }
    }

    if (toUpsert.length > 0) {
      await pushUsersBatch(client, ownerId, toUpsert);
    }
    for (const id of toDelete) {
      await deleteUserData(client, ownerId, id);
    }
  }, []);

  // ---- Schedule push (debounced) ----

  const schedulePush = useCallback((client: ReturnType<typeof initSupabaseClient>, ownerId: string) => {
    if (!client) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      doPush(client, ownerId);
    }, 1000);
  }, [doPush]);

  // ---- Realtime subscription ----

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

  // ---- Core initialization effect ----

  useEffect(() => {
    let mounted = true;
    console.log("[useSupabaseAuth] init effect running");

    const client = initSupabaseClient();
    if (!client) {
      console.log("[useSupabaseAuth] no config, offline mode");
      setAuth({ isConfigured: false, isLoggedIn: false, user: null, session: null, loading: false, error: null });
      return;
    }

    // 先注册 onAuthStateChange，再调 getSession
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[useSupabaseAuth] onAuthStateChange:", event, !!session?.user);
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          if (!mounted) return;
          try {
            console.log("[useSupabaseAuth] init + pull for userId:", session.user.id);
            await mgr.init(session.user.id);
            const rows = await fetchAllUserData(client, session.user.id);
            await mgr.replaceAllFromCloud(rows);
            setupRealtime(client, session.user.id);
            bumpDataVersion();
          } catch (e) {
            console.error("[useSupabaseAuth] init failed:", e);
            if (mounted) setAuth(s => ({ ...s, loading: false, error: String(e) }));
          }
          if (mounted) {
            setAuth(s => ({ ...s, isLoggedIn: true, user: session.user, session, error: null, loading: false }));
            authUserRef.current = session.user;
          }
        } else if (event === "SIGNED_OUT") {
          if (mounted) {
            if (pullUnsubscribeRef.current) { pullUnsubscribeRef.current(); pullUnsubscribeRef.current = null; }
            if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }
            setAuth(s => ({ ...s, isLoggedIn: false, user: null, session: null }));
            authUserRef.current = null;
          }
        }
      }
    );

    // 检查现有 session
    client.auth.getSession().then(({ data }) => {
      // session 已由 onAuthStateChange INITIAL_SESSION 处理
      if (!data.session) {
        if (mounted) {
          setAuth(s => ({ ...s, loading: false }));
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (pullUnsubscribeRef.current) { pullUnsubscribeRef.current(); pullUnsubscribeRef.current = null; }
    };
  }, [setupRealtime, bumpDataVersion]);

  // ---- Window focus → pull ----

  useEffect(() => {
    if (!auth.isLoggedIn || !auth.user) return;
    const client = getSupabaseClient();
    if (!client) return;

    const onFocus = () => doPull(client, auth.user!.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [auth.isLoggedIn, auth.user, doPull]);

  // ---- DataVersion change → push ----

  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prevState) => {
      if (state.dataVersion !== prevState.dataVersion) {
        dataVersionRef.current = state.dataVersion;
        const currentUser = authUserRef.current;
        if (currentUser) {
          const client = getSupabaseClient();
          if (client) schedulePush(client, currentUser.id);
        }
      }
    });
    return unsub;
  }, [schedulePush]);

  // ---- Auth actions ----

  const signIn = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient() || initSupabaseClient();
    if (!client) {
      console.error("[useSupabaseAuth] signIn: cannot init client");
      return { error: "未能初始化 Supabase" };
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data?.user) {
      setAuth(s => ({ ...s, isLoggedIn: true, user: data.user!, session: data.session, error: null }));
      authUserRef.current = data.user;
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
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data?.user && data.session) {
      setAuth(s => ({ ...s, isLoggedIn: true, user: data.user!, session: data.session, error: null }));
      authUserRef.current = data.user;
      bumpDataVersion();
    }
    return { error: null };
  }, [bumpDataVersion]);

  const signOut = useCallback(async () => {
    console.log("[useSupabaseAuth] signOut called");
    try {
      const client = getSupabaseClient();
      const currentUser = authUserRef.current;
      if (client && currentUser) {
        // 先推送剩余变更
        await doPush(client, currentUser.id);
        await client.auth.signOut();
      }

      if (pullUnsubscribeRef.current) { pullUnsubscribeRef.current(); pullUnsubscribeRef.current = null; }
      if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; }

      setAuth(s => ({ ...s, isLoggedIn: false, user: null, session: null }));
      authUserRef.current = null;

      // 切换到离线数据库
      const m = getVIPManager();
      await m.init("local_offline");
      bumpDataVersion();
    } catch (e) {
      console.error("[useSupabaseAuth] signOut error:", e);
    }
  }, [doPush, bumpDataVersion]);

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
    signIn,
    signUp,
    signOut,
    configureAndSave,
    clearConfig,
    pullFromCloud,
  };
}