import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import {
  initSupabaseClient,
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  resetSupabaseClient,
} from "@/lib/supabase";

// ---- Types ----

interface AuthState {
  isConfigured: boolean;
  isLoggedIn: boolean;
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  configureAndSave: (url: string, anonKey: string) => boolean;
  clearConfig: () => void;
}

// ---- Context ----

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ---- Provider ----

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    isConfigured: !!getSupabaseConfig(),
    isLoggedIn: false,
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  // ---- Init: auto-detect session on mount ----

  useEffect(() => {
    let mounted = true;

    const client = initSupabaseClient();
    if (!client) {
      if (mounted) {
        setAuth({ isConfigured: false, isLoggedIn: false, user: null, session: null, loading: false, error: null });
      }
      return;
    }

    const { data: { subscription } } = client.auth.onAuthStateChange(
      async (event, session) => {
        if (import.meta.env.DEV) console.log("[AuthContext] onAuthStateChange:", event);

        if (!mounted) return;

        if (event === "SIGNED_OUT") {
          setAuth(s => ({ ...s, isLoggedIn: false, user: null, session: null, loading: false, error: null }));
          return;
        }

        if (session?.user) {
          setAuth(s => ({
            ...s,
            isLoggedIn: true,
            user: session.user,
            session,
            loading: false,
            error: null,
          }));
        } else {
          setAuth(s => ({ ...s, loading: false }));
        }
      }
    );

    // Safety timeout: if no event fires within 3s, mark loading done
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setAuth(s => (s.loading ? { ...s, loading: false } : s));
      }
    }, 3000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  // ---- Auth actions ----

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const client = getSupabaseClient() || initSupabaseClient();
      if (!client) return { error: "未初始化 Supabase" };
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      // onAuthStateChange will update state, no need to set manually
      return { error: null };
    } catch (e) {
      if (import.meta.env.DEV) console.error("[AuthContext] signIn error:", e);
      return { error: e instanceof Error ? e.message : "登录请求失败，请检查网络连接" };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const client = getSupabaseClient() || initSupabaseClient();
      if (!client) return { error: "未初始化 Supabase" };
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) return { error: error.message };
      // onAuthStateChange will update state
      return { error: null };
    } catch (e) {
      if (import.meta.env.DEV) console.error("[AuthContext] signUp error:", e);
      return { error: e instanceof Error ? e.message : "注册请求失败，请检查网络连接" };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (import.meta.env.DEV) console.log("[AuthContext] signOut called");
    try {
      const client = getSupabaseClient();
      if (client) await client.auth.signOut();
      // onAuthStateChange SIGNED_OUT will update state
    } catch (e) {
      if (import.meta.env.DEV) console.error("[AuthContext] signOut error:", e);
    }
  }, []);

  const configureAndSave = useCallback((url: string, anonKey: string) => {
    saveSupabaseConfig(url, anonKey);
    resetSupabaseClient();
    setAuth(s => ({ ...s, isConfigured: true }));
    return true;
  }, []);

  const clearConfig = useCallback(() => {
    clearSupabaseConfig();
    setAuth(s => ({ ...s, isConfigured: false, isLoggedIn: false }));
  }, []);

  const value: AuthContextValue = {
    ...auth,
    signIn,
    signUp,
    signOut,
    configureAndSave,
    clearConfig,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
