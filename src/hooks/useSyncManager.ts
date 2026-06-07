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
  const deferredPullRef = useRef(false);
  const pushInProgressRef = useRef(false);
  const realtimeUnsubRef = useRef<(() => void) | null>(null);

  // ---- Pull from cloud ----

  const doPull = useCallback(async () => {
    const client = getSupabaseClient();
    const currentUser = user;
    if (!client || !currentUser) return;

    // Guard: skip pull if a push is in progress or there are pending changes
    if (pushInProgressRef.current || mgr.hasPendingChanges()) {
      deferredPullRef.current = true;
      if (import.meta.env.DEV) console.log("[useSyncManager] doPull deferred: push in progress or pending changes");
      return;
    }

    deferredPullRef.current = false;
    if (import.meta.env.DEV) console.log("[useSyncManager] doPull starting");
    const rows = await fetchAllUserData(client, currentUser.id);
    if (import.meta.env.DEV) console.log("[useSyncManager] fetchAllUserData done, rows:", rows.length);
    await mgr.replaceAllFromCloud(rows);
    bumpDataVersion();
  }, [user, bumpDataVersion, mgr]);

  // ---- Push changed users to cloud ----

  const doPush = useCallback(async () => {
    // Prevent concurrent pushes
    if (pushInProgressRef.current) return;

    const client = getSupabaseClient();
    const currentUser = user;
    if (!client || !currentUser) return;

    // Snapshot without clearing: keep changedUserIds until push succeeds
    const changedIds = mgr.getChangedUserIdsSnapshot();
    if (changedIds.length === 0) return;

    pushInProgressRef.current = true;

    if (import.meta.env.DEV) console.log("[useSyncManager] doPush, changedIds:", changedIds.length);

    try {
      // Detect deleteAll scenario
      if (changedIds.length > 10 && Object.keys(mgr.state.users).length === 0) {
        await deleteAllUserData(client, currentUser.id);
        mgr.clearChangedUserIds();
        pushInProgressRef.current = false;
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

      let pushOk = true;
      if (toUpsert.length > 0) {
        pushOk = await pushUsersBatch(client, currentUser.id, toUpsert);
      }
      if (pushOk) {
        for (const id of toDelete) {
          await deleteUserData(client, currentUser.id, id);
        }
      }

      if (!pushOk) {
        // Push failed: keep changedUserIds for retry, schedule retry
        if (import.meta.env.DEV) console.warn("[useSyncManager] doPush: upsert failed, will retry");
        pushInProgressRef.current = false;
        pushTimerRef.current = setTimeout(() => doPush(), 1000);
        return;
      }

      // Only clear on success
      mgr.clearChangedUserIds();
      pushInProgressRef.current = false;

      // After successful push, run deferred pull if one was requested
      if (deferredPullRef.current) {
        deferredPullRef.current = false;
        if (import.meta.env.DEV) console.log("[useSyncManager] running deferred pull after push");
        setTimeout(() => doPull(), 500);
      }
    } catch (e) {
      // Network or unexpected error: keep changedUserIds, schedule retry
      if (import.meta.env.DEV) console.error("[useSyncManager] doPush error:", e);
      pushInProgressRef.current = false;
      pushTimerRef.current = setTimeout(() => doPush(), 1000);
    }
  }, [user, mgr, doPull]);

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
    // Wait for any running push to finish, then do a final push
    while (pushInProgressRef.current) {
      await new Promise(r => setTimeout(r, 100));
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

  // ---- requestImmediatePush -> push now without debounce ----

  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prevState) => {
      if (state._requestImmediatePush !== prevState._requestImmediatePush) {
        if (isLoggedIn && user) {
          if (pushTimerRef.current) {
            clearTimeout(pushTimerRef.current);
            pushTimerRef.current = null;
          }
          // If a push is already running, changedUserIds will keep the new IDs
          // and they will be picked up by the next push cycle
          if (!pushInProgressRef.current) {
            doPush();
          }
        }
      }
    });
    return unsub;
  }, [isLoggedIn, user, doPush]);

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
