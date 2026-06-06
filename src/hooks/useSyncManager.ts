import { useCallback, useRef, useEffect } from "react";
import {
  getSupabaseClient,
  fetchAllUserData,
  pushUsersBatch,
  deleteUserData,
  deleteAllUserData,
  subscribeToChanges,
} from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { getVIPManager } from "@/hooks/useVIPManager";
import { useAppStore } from "@/store/useAppStore";

export function useSyncManager() {
  const { isLoggedIn, user } = useAuth();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);
  const mgr = getVIPManager();

  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeUnsubRef = useRef<(() => void) | null>(null);

  // ---- Pull from cloud ----

  const doPull = useCallback(async () => {
    const client = getSupabaseClient();
    const currentUser = user;
    if (!client || !currentUser) return;
    if (import.meta.env.DEV) console.log("[useSyncManager] doPull starting");
    const rows = await fetchAllUserData(client, currentUser.id);
    if (import.meta.env.DEV) console.log("[useSyncManager] fetchAllUserData done, rows:", rows.length);
    await mgr.replaceAllFromCloud(rows);
    bumpDataVersion();
  }, [user, bumpDataVersion, mgr]);

  // ---- Push changed users to cloud ----

  const doPush = useCallback(async () => {
    const client = getSupabaseClient();
    const currentUser = user;
    if (!client || !currentUser) return;

    const changedIds = mgr.getChangedUserIdsAndClear();
    if (changedIds.length === 0) return;

    if (import.meta.env.DEV) console.log("[useSyncManager] doPush, changedIds:", changedIds.length);

    // Detect deleteAll scenario
    if (changedIds.length > 10 && Object.keys(mgr.state.users).length === 0) {
      await deleteAllUserData(client, currentUser.id);
      return;
    }

    const toUpsert: import("@/types").User[] = [];
    const toDelete: string[] = [];

    for (const id of changedIds) {
      const u = mgr.getUser(id);
      if (u && !u.purged) {
        toUpsert.push(u);
      } else {
        toDelete.push(id);
      }
    }

    if (toUpsert.length > 0) {
      await pushUsersBatch(client, currentUser.id, toUpsert);
    }
    for (const id of toDelete) {
      await deleteUserData(client, currentUser.id, id);
    }
  }, [user, mgr]);

  // ---- Schedule push (debounced) ----

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      doPush();
    }, 1000);
  }, [doPush]);

  // ---- Push before sign-out ----

  const pushBeforeSignOut = useCallback(async () => {
    // Flush any pending push immediately
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    await doPush();
  }, [doPush]);

  // ---- Realtime subscription ----

  const setupRealtime = useCallback(() => {
    const client = getSupabaseClient();
    const currentUser = user;
    if (!client || !currentUser) return;

    if (realtimeUnsubRef.current) {
      realtimeUnsubRef.current();
      realtimeUnsubRef.current = null;
    }
    realtimeUnsubRef.current = subscribeToChanges(client, currentUser.id, async () => {
      await doPull();
    });
  }, [user, doPull]);

  // ---- Window focus → pull ----

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    const onFocus = () => doPull();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isLoggedIn, user, doPull]);

  // ---- dataVersion change → schedule push ----

  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prevState) => {
      if (state.dataVersion !== prevState.dataVersion) {
        if (isLoggedIn && user) {
          schedulePush();
        }
      }
    });
    return unsub;
  }, [isLoggedIn, user, schedulePush]);

  // ---- Cleanup on unmount ----

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      if (realtimeUnsubRef.current) {
        realtimeUnsubRef.current();
        realtimeUnsubRef.current = null;
      }
    };
  }, []);

  return { doPull, pushBeforeSignOut, setupRealtime, pullFromCloud: doPull };
}
