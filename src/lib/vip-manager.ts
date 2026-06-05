import type { User, HistoryRecord, SyncState, OutboxOp, LogEntry, CloudSyncSettings, ExportPayload, StatsData, ImportResult } from "@/types";
import { getDb, closeDb, type VipDatabase } from "./db";
import { generateId, getConversionRate, getBaseCurrency, setBaseCurrency, normalizeCardNo, isValidCardNo } from "./utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAllUserData,
  upsertUserData,
  deleteUserData,
} from "./supabase";


export interface VIPManagerState {
  users: Record<string, User>;
  recentViewed: string[];
  trash: User[];
  logs: LogEntry[];
  syncState: SyncState;
}


export interface VIPManagerInstance {
  state: VIPManagerState;
  db: VipDatabase | null;
  init(userId: string): Promise<void>;
  loadData(): Promise<void>;
  flushNow(): Promise<void>;
  syncPushToCloud(client: SupabaseClient, ownerId: string): Promise<void>;
  syncPullFromCloud(client: SupabaseClient, ownerId: string): Promise<void>;
  getOutboxCount(): number;
  addNewUser(phone: string, initialAmount: number, remark?: string, cardNo?: string): string | null;
  addOldUser(tail: string, initialAmount: number, remark?: string, cardNo?: string): string | null;
  deleteUser(userId: string): boolean;
  purgeTrashItem(userId: string): boolean;
  clearTrash(): boolean;
  restoreFromTrash(userId: string): boolean;
  addAmount(userId: string, amount: number, description?: string): boolean;
  subtractAmount(userId: string, amount: number, description?: string): boolean;
  togglePin(userId: string): boolean;
  editHistory(userId: string, historyId: string, newData: { type: string; amount: number; description: string }): boolean;
  deleteHistory(userId: string, historyId: string): boolean;
  updateUserInfo(userId: string, data: { remark?: string; cardNo?: string }): boolean;
  getUser(userId: string): User | undefined;
  getAllUsers(): User[];
  getTrashUsers(): User[];
  searchUsers(query: string): User[];
  filterUsers(filter: string): User[];
  addRecentView(userId: string): void;
  getRecentUsers(): User[];
  getHistory(userId: string, historyId: string): HistoryRecord | undefined;
  getOutboxOps(): OutboxOp[];
  clearOutboxKeys(keys: string[]): Promise<void>;
  getSyncState(): SyncState;
  getStatsData(startDate: string, endDate: string): StatsData;
  buildExportPayload(): ExportPayload;
  applyImport(payload: ExportPayload, mode: "overwrite" | "merge"): ImportResult;
  convertCurrencyData(from: string, to: string): void;
  deleteAllUsers(): Promise<number>;
}

let beforeunloadRegistered = false;

export function createVIPManager(): VIPManagerInstance {
  const state: VIPManagerState = {
    users: {},
    recentViewed: [],
    trash: [],
    logs: [],
    syncState: { lastOpTs: 0, lastUpdatedAt: null },
  };

  let db: VipDatabase | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const dirtyUpserts = new Set<string>();
  const dirtyDeletes = new Set<string>();
  const outboxMap = new Map<string, OutboxOp>();
  const outboxDeletedKeys = new Set<string>();
  let suppressOps = false;
  let _justDeletedAll = false;


  function generateHistoryId(): string {
    return "h_" + generateId();
  }

  function addLog(entry: Omit<LogEntry, "timestamp">): void {
    state.logs.unshift({ ...entry, timestamp: Date.now() } as LogEntry);
  }

  function scheduleSave(): Promise<void> {
    return flushNow();
  }

  function onUserUpsert(userId: string): void {
    if (suppressOps) return;
    dirtyUpserts.add(userId);
    dirtyDeletes.delete(userId);
    const user = state.users[userId];
    if (user) {
      user.__ts = Date.now();
      const key = "upsert:" + userId;
      outboxMap.set(key, { key, type: "upsert", user_id: userId, ts: user.__ts, payload: user });
      outboxDeletedKeys.delete("delete:" + userId);
    }
    scheduleSave();
  }

  async function flushNow(): Promise<void> {
    if (!db) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }

    try {
      const upsertIds = Array.from(dirtyUpserts);
      const deleteIds = Array.from(dirtyDeletes);
      const outboxItems = Array.from(outboxMap.values());
      const outboxDelKeys = Array.from(outboxDeletedKeys);

      await db.transaction("rw", [db.users, db.meta, db.outbox], async () => {
        if (upsertIds.length) {
          const rows = upsertIds.map(id => state.users[id]).filter(Boolean) as User[];
          await db!.users.bulkPut(rows);
        }
        if (deleteIds.length) {
          await db!.users.bulkDelete(deleteIds);
        }

        await db!.meta.put({ key: "recentViewed", value: state.recentViewed });
        await db!.meta.put({ key: "trash", value: state.trash });
        await db!.meta.put({ key: "logs", value: state.logs });
        await db!.meta.put({ key: "sync_state", value: state.syncState });

        if (outboxDelKeys.length) {
          await db!.outbox.bulkDelete(outboxDelKeys);
        }
        if (outboxItems.length) {
          await db!.outbox.bulkPut(outboxItems);
        }
      });

      dirtyUpserts.clear();
      dirtyDeletes.clear();
      outboxDeletedKeys.clear();
    } catch (e) {
      console.warn("[flush]", e);
    }
  }

  async function migrateLegacyLocalStorage(): Promise<void> {
    if (!db) return;
    const migrated = await db.meta.get("legacy_migrated_v1");
    if (migrated) return;

    const legacyUsersRaw = localStorage.getItem("vipManagerUsers");
    const legacyRecentRaw = localStorage.getItem("recentViewed");
    const legacyTrashRaw = localStorage.getItem("vipManagerTrash");
    const legacyLogsRaw = localStorage.getItem("vipManagerLogs");

    if (!legacyUsersRaw && !legacyRecentRaw && !legacyTrashRaw && !legacyLogsRaw) {
      await db.meta.put({ key: "legacy_migrated_v1", value: true });
      return;
    }

    try {
      const legacyUsers = legacyUsersRaw ? JSON.parse(legacyUsersRaw) : {};
      const legacyRecent = legacyRecentRaw ? JSON.parse(legacyRecentRaw) : [];
      const legacyTrash = legacyTrashRaw ? JSON.parse(legacyTrashRaw) : [];
      const legacyLogs = legacyLogsRaw ? JSON.parse(legacyLogsRaw) : [];

      const userArr = Object.values(legacyUsers) as User[];
      if (userArr.length > 0) {
        for (const u of userArr) {
          if (!u.id) continue;
          state.users[u.id] = u;
          dirtyUpserts.add(u.id);
        }
      }
      if (legacyRecent.length) state.recentViewed = legacyRecent;
      if (legacyTrash.length) state.trash = legacyTrash;
      if (legacyLogs.length) state.logs = legacyLogs;

      await flushNow();
      await db.meta.put({ key: "legacy_migrated_v1", value: true });

      localStorage.removeItem("vipManagerUsers");
      localStorage.removeItem("recentViewed");
      localStorage.removeItem("vipManagerTrash");
      localStorage.removeItem("vipManagerLogs");
    } catch (e) {
      console.warn("[migrate]", e);
    }
  }


  async function init(userId: string): Promise<void> {
    if (!beforeunloadRegistered) {
      beforeunloadRegistered = true;
      window.addEventListener("beforeunload", () => {
        try {
          const allItems = Array.from(outboxMap.values());
          if (db && (dirtyUpserts.size > 0 || dirtyDeletes.size > 0 || allItems.length > 0)) {
            db.transaction("rw", [db.users, db.meta, db.outbox], () => {
              const upsertIds = Array.from(dirtyUpserts);
              const deleteIds = Array.from(dirtyDeletes);
              if (upsertIds.length) {
                const rows = upsertIds.map(id => state.users[id]).filter(Boolean) as User[];
                db!.users.bulkPut(rows);
              }
              if (deleteIds.length) db!.users.bulkDelete(deleteIds);
              db!.meta.put({ key: "recentViewed", value: state.recentViewed });
              db!.meta.put({ key: "trash", value: state.trash });
              db!.meta.put({ key: "logs", value: state.logs });
              if (allItems.length) db!.outbox.bulkPut(allItems);
            });
          }
        } catch { /* ignore */ }
      });
    }

    try { if (db) { db.close(); } } catch { /* ignore */ }
    db = null;
    db = getDb(userId);
    await db.open();
    try { await (navigator as Navigator & { storage?: { persist(): Promise<boolean> } }).storage?.persist?.(); } catch { /* ignore */ }
    await migrateLegacyLocalStorage();
    await loadData();
  }

  async function loadData(): Promise<void> {
    if (!db) return;
    const allUsers = await db.users.toArray();
    state.users = {};
    allUsers.forEach(u => {
      // 标准化数据：确保关键字段存在，防止旧数据导致渲染崩溃
      if (!u.history || !Array.isArray(u.history)) u.history = [];
      if (u.amount === undefined || u.amount === null) u.amount = 0;
      if (u.pinned === undefined || u.pinned === null) u.pinned = false;
      if (u.deleted === undefined || u.deleted === null) u.deleted = false;
      if (u.purged === undefined || u.purged === null) u.purged = false;
      if (u.cardNo === undefined || u.cardNo === null) u.cardNo = "";
      if (u.remark === undefined || u.remark === null) u.remark = "";
      state.users[u.id] = u;
    });

    state.recentViewed = ((await db.meta.get("recentViewed"))?.value as string[]) || [];
    state.trash = ((await db.meta.get("trash"))?.value as User[]) || [];
    state.logs = ((await db.meta.get("logs"))?.value as LogEntry[]) || [];
    state.syncState = ((await db.meta.get("sync_state"))?.value as SyncState) || { lastOpTs: 0, lastUpdatedAt: null };
    _justDeletedAll = !!((await db.meta.get("_justDeletedAll"))?.value);

    outboxMap.clear();
    try {
      const ops = await (db.outbox?.toArray?.() || []);
      (ops || []).forEach(op => { if (op?.key) outboxMap.set(op.key, op); });
    } catch { outboxMap.clear(); }

    dirtyUpserts.clear();
    dirtyDeletes.clear();
    outboxDeletedKeys.clear();
  }


  async function syncPushToCloud(client: SupabaseClient, ownerId: string): Promise<void> {
    if (!client || !ownerId) return;
    const ops = Array.from(outboxMap.values());
    if (ops.length === 0) {
      if (_justDeletedAll) {
        _justDeletedAll = false;
        if (db) await db.meta.put({ key: "_justDeletedAll", value: false });
      }
      return;
    }

    let changed = false;
    const pushedKeys: string[] = [];
    for (const op of ops) {
      if (op.type === "upsert" && op.payload) {
        const localTs = op.payload.__ts || op.ts;
        const { pushed } = await upsertUserData(client, ownerId, op.user_id, op.payload, localTs);
        if (pushed) {
          outboxMap.delete(op.key);
          pushedKeys.push(op.key);
          changed = true;
        }
      } else if (op.type === "delete") {
        const ok = await deleteUserData(client, ownerId, op.user_id);
        if (ok) {
          outboxMap.delete(op.key);
          pushedKeys.push(op.key);
          changed = true;
        }
      }
    }

    if (changed) {
      for (const key of pushedKeys) {
        outboxDeletedKeys.add(key);
      }
      await flushNow();
      if (outboxMap.size === 0 && _justDeletedAll) {
        _justDeletedAll = false;
        if (db) await db.meta.put({ key: "_justDeletedAll", value: false });
      }
    }

  }

  async function syncPullFromCloud(client: SupabaseClient, ownerId: string): Promise<void> {
    if (!client || !ownerId) return;
    if (_justDeletedAll) return;
    const rows = await fetchAllUserData(client, ownerId);

    let changed = false;
    const remoteUserIds = new Set<string>();

    for (const row of rows) {
      // Skip purged users ? do not resurrect already purged data from cloud
      if (row.data && row.data.purged) continue;
      remoteUserIds.add(row.user_id);
      const remoteUser = row.data;
      const remoteTs = new Date(row.updated_at).getTime();
      const localUser = state.users[row.user_id];

      if (!localUser) {
        state.users[row.user_id] = { ...remoteUser, __ts: remoteTs };
        dirtyUpserts.add(row.user_id);
        outboxMap.delete("upsert:" + row.user_id);
        outboxMap.delete("delete:" + row.user_id);
        changed = true;
      } else {
        const localTs = localUser.__ts || 0;
        if (remoteTs > localTs) {
          state.users[row.user_id] = { ...remoteUser, __ts: remoteTs };
          dirtyUpserts.add(row.user_id);
          outboxMap.delete("upsert:" + row.user_id);
          outboxMap.delete("delete:" + row.user_id);
          changed = true;
        } else {
          // Only update existing pending outbox, do not create new entries
          const upsertKey = "upsert:" + row.user_id;
          if (outboxMap.has(upsertKey)) {
            outboxMap.set(upsertKey, {
              key: upsertKey,
              type: "upsert",
              user_id: row.user_id,
              ts: localTs,
              payload: localUser,
            });
          }
        }
      }
    }

    // Clean up local users that no longer exist in cloud (deleted on another device)
    for (const localId of Object.keys(state.users)) {
      if (!remoteUserIds.has(localId)) {
        const upsertKey = "upsert:" + localId;
        const deleteKey = "delete:" + localId;
        // Only remove users without pending outbox operations
        if (!outboxMap.has(upsertKey) && !outboxMap.has(deleteKey)) {
          delete state.users[localId];
          dirtyUpserts.delete(localId);
          dirtyDeletes.add(localId);
          state.trash = state.trash.filter(u => u.id !== localId);
          state.recentViewed = state.recentViewed.filter(id => id !== localId);
          changed = true;
        }
      }
    }

    if (changed) {
      state.syncState.lastUpdatedAt = new Date().toISOString();
      await flushNow();
    }
  }

  function getOutboxCount(): number {
    return outboxMap.size;
  }


  function addNewUser(phone: string, initialAmount: number, remark?: string, cardNo?: string): string | null {
    const phoneRegex = /^\d{11}$/;
    if (!phoneRegex.test(phone)) return null;
    if (state.users[phone]) return null;
    const normalizedCardNo = cardNo ? normalizeCardNo(cardNo) : "";
    if (normalizedCardNo) { const dupCard = Object.values(state.users).find(u => u.cardNo === normalizedCardNo); if (dupCard) return null; }

    const newUser: User = {
      id: phone,
      phone,
      tail: phone.slice(-4),
      amount: initialAmount,
      created: new Date().toISOString(),
      pinned: false,
      deleted: false,
      purged: false,
      remark: remark || "",
      cardNo: normalizedCardNo,
      history: initialAmount > 0 ? [{
        id: generateHistoryId(),
        type: "add",
        amount: initialAmount,
        date: new Date().toISOString(),
        description: "初始充值",
      }] : [],
      __ts: Date.now(),
    };

    state.users[phone] = newUser;
    state.recentViewed = [phone, ...state.recentViewed.filter(id => id !== phone)].slice(0, 20);
    addLog({ type: "ADD_USER", message: "添加用户: " + phone });
    onUserUpsert(phone);
    return phone;
  }

  function addOldUser(tail: string, initialAmount: number, remark?: string, cardNo?: string): string | null {
    const tailRegex = /^\d{4}$/;
    if (!tailRegex.test(tail)) return null;

    const userId = "old-" + tail;
    const normalizedCardNo = cardNo ? normalizeCardNo(cardNo) : "";
    if (normalizedCardNo) { const dupCard = Object.values(state.users).find(u => u.cardNo === normalizedCardNo); if (dupCard) return null; }
    const existing = Object.values(state.users).find(u => u.tail === tail);
    if (existing) return null;

    const newUser: User = {
      id: userId,
      phone: "",
      tail,
      amount: initialAmount,
      created: new Date().toISOString(),
      pinned: false,
      deleted: false,
      purged: false,
      remark: remark || "",
      cardNo: normalizedCardNo,
      history: initialAmount > 0 ? [{
        id: generateHistoryId(),
        type: "add",
        amount: initialAmount,
        date: new Date().toISOString(),
        description: "????",
      }] : [],
      __ts: Date.now(),
    };

    state.users[userId] = newUser;
    state.recentViewed = [userId, ...state.recentViewed.filter(id => id !== userId)].slice(0, 20);
    addLog({ type: "ADD_USER", message: "?????: ??" + tail });
    onUserUpsert(userId);
    return userId;
  }

function deleteUser(userId: string): boolean {
    const user = state.users[userId];
    if (!user) return false;
    user.deleted = true;
    user._deletedAt = new Date().toISOString();
    state.trash.push(user);
    state.recentViewed = state.recentViewed.filter(id => id !== userId);
    addLog({ type: "DELETE_USER", message: "删除用户: " + (user.phone || "\u5c3e\u53f7" + user.tail) });
    onUserUpsert(userId);
    return true;
  }

  function purgeTrashItem(userId: string): boolean {
    const user = state.users[userId];
    if (!user) return false;
    user.deleted = true;
    user.purged = true;
    state.trash = state.trash.filter(u => u.id !== userId);
    addLog({ type: "PURGE_USER", message: "彻底删除用户: " + (user.phone || "\u5c3e\u53f7" + user.tail) });
    state.recentViewed = state.recentViewed.filter(id => id !== userId);
    dirtyUpserts.delete(userId);
    dirtyDeletes.add(userId);
    outboxMap.delete("upsert:" + userId);
    outboxMap.set("delete:" + userId, { key: "delete:" + userId, type: "delete", user_id: userId, ts: Date.now() });
    scheduleSave();
    return true;
  }

  function clearTrash(): boolean {
    const trashUsers = state.users ? Object.values(state.users).filter(u => u.deleted && !u.purged) : [];
    if (!trashUsers.length) return true;
    trashUsers.forEach(u => {
      u.purged = true;
      dirtyUpserts.delete(u.id);
      dirtyDeletes.add(u.id);
      outboxMap.delete("upsert:" + u.id);
      outboxMap.set("delete:" + u.id, { key: "delete:" + u.id, type: "delete", user_id: u.id, ts: Date.now() });
    });
    scheduleSave();
    state.trash = [];
    addLog({ type: "CLEAR_TRASH", message: "清空回收站(" + trashUsers.length + "\u6761)" });
    return true;
  }

  function restoreFromTrash(userId: string): boolean {
    const user = state.users[userId];
    if (!user) return false;
    user.deleted = false;
    user.purged = false;
    delete user._deletedAt;
    state.trash = state.trash.filter(u => u.id !== userId);
    addLog({ type: "RESTORE_USER", message: "从回收站恢复: " + (user.phone || "\u5c3e\u53f7" + user.tail) });
    onUserUpsert(userId);
    return true;
  }

  function addAmount(userId: string, amount: number, description = ""): boolean {
    const user = state.users[userId];
    if (!user) return false;
    user.amount += amount;
    user.history.unshift({
      id: generateHistoryId(),
      type: "add",
      amount,
      date: new Date().toISOString(),
      description,
    });
    addLog({ type: "ADD_AMOUNT", message: "充值 " + amount + ": " + (user.phone || "\u5c3e\u53f7" + user.tail) });
    onUserUpsert(userId);
    return true;
  }

  function subtractAmount(userId: string, amount: number, description = ""): boolean {
    const user = state.users[userId];
    if (!user || user.amount < amount) return false;
    user.amount -= amount;
    user.history.unshift({
      id: generateHistoryId(),
      type: "subtract",
      amount,
      date: new Date().toISOString(),
      description,
    });
    addLog({ type: "SUBTRACT_AMOUNT", message: "消费 " + amount + ": " + (user.phone || "\u5c3e\u53f7" + user.tail) });
    onUserUpsert(userId);
    return true;
  }

  function togglePin(userId: string): boolean {
    const user = state.users[userId];
    if (!user) return false;
    user.pinned = !user.pinned;
    onUserUpsert(userId);
    return user.pinned;
  }

  function editHistory(userId: string, historyId: string, newData: { type: string; amount: number; description: string }): boolean {
    const user = state.users[userId];
    if (!user) return false;
    const idx = user.history.findIndex(h => h.id === historyId);
    if (idx === -1) return false;
    const old = user.history[idx];
    const oldEffect = old.type === "add" ? -old.amount : old.amount;
    const newEffect = newData.type === "add" ? newData.amount : -newData.amount;
    user.amount = user.amount + oldEffect + newEffect;
    user.history[idx] = { ...old, type: newData.type as "add" | "subtract", amount: newData.amount, description: newData.description };
    addLog({ type: "EDIT_HISTORY", message: "编辑消费记录: " + (user.phone || "\u5c3e\u53f7" + user.tail) });
    onUserUpsert(userId);
    return true;
  }

  function deleteHistory(userId: string, historyId: string): boolean {
    const user = state.users[userId];
    if (!user) return false;
    const idx = user.history.findIndex(h => h.id === historyId);
    if (idx === -1) return false;
    const old = user.history[idx];
    const oldEffect = old.type === "add" ? -old.amount : old.amount;
    user.amount = user.amount + oldEffect;
    user.history.splice(idx, 1);
    addLog({ type: "DELETE_HISTORY", message: "删除消费记录: " + (user.phone || "\u5c3e\u53f7" + user.tail) });
    onUserUpsert(userId);
    return true;
  }

  function updateUserInfo(userId: string, data: { remark?: string; cardNo?: string }): boolean {
    const user = state.users[userId];
    if (!user || user.purged) return false;
    if (data.remark !== undefined) user.remark = data.remark;
    if (data.cardNo !== undefined) {
      const normalized = normalizeCardNo(data.cardNo);
      if (normalized && normalized !== user.cardNo) {
        const dup = Object.values(state.users).find(u => u.id !== userId && u.cardNo === normalized);
        if (dup) return false;
      }
      user.cardNo = normalized;
    }
    user.__ts = Date.now();
    onUserUpsert(userId);
    return true;
  }

  function getUser(userId: string): User | undefined {
    return state.users[userId];
  }

  function getAllUsers(): User[] {
    return Object.values(state.users).filter(u => !u.deleted && !u.purged);
  }

  function getTrashUsers(): User[] {
    return Object.values(state.users).filter(u => u.deleted && !u.purged);
  }

  function searchUsers(query: string): User[] {
    if (!query.trim()) return getAllUsers();
    const q = query.toLowerCase();
    return getAllUsers().filter(u =>
      (u.phone && u.phone.includes(q)) ||
      (u.tail && u.tail.includes(q)) ||
      (u.remark && u.remark.toLowerCase().includes(q)) ||
      (u.cardNo && u.cardNo.includes(q))
    );
  }

  function filterUsers(filter: string): User[] {
    const all = getAllUsers();
    switch (filter) {
      case "pinned": return all.filter(u => u.pinned);
      case "high": return all.filter(u => u.amount > 300);
      case "medium": return all.filter(u => u.amount >= 100 && u.amount <= 300);
      case "low": return all.filter(u => u.amount < 100);
      case "card": return all.filter(u => !!u.cardNo);
      default: return all;
    }
  }

  function addRecentView(userId: string): void {
    state.recentViewed = [userId, ...state.recentViewed.filter(id => id !== userId)].slice(0, 20);
    scheduleSave();
  }

  function getRecentUsers(): User[] {
    return state.recentViewed
      .map(id => state.users[id])
      .filter(u => u && !u.purged) as User[];
  }

  function getHistory(userId: string, historyId: string): HistoryRecord | undefined {
    return state.users[userId]?.history.find(h => h.id === historyId);
  }

  function getOutboxOps(): OutboxOp[] {
    return Array.from(outboxMap.values());
  }

  async function clearOutboxKeys(keys: string[]): Promise<void> {
    keys.forEach(k => outboxMap.delete(k));
    keys.forEach(k => outboxDeletedKeys.add(k));
    await flushNow();
  }

  function getSyncState(): SyncState {
    return state.syncState;
  }

  function getStatsData(startDate: string, endDate: string): StatsData {
    const allUsers = getAllUsers();
    const start = new Date(startDate);
    const end = new Date(endDate);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0, 0, 0, 0);

    const totalUsers = allUsers.length;
    const totalAmount = allUsers.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
    const activeUsers = allUsers.reduce((count, u) => {
      const hasActivity = u.history.some(h => {
        const d = new Date(h.date);
        return d >= start && d <= end;
      });
      return count + (hasActivity ? 1 : 0);
    }, 0);

    const dateMap = new Map<string, { consumption: number; netChange: number }>();
    const current = new Date(start);
    while (current <= end) {
      const key = current.toISOString().slice(0, 10);
      dateMap.set(key, { consumption: 0, netChange: 0 });
      current.setDate(current.getDate() + 1);
    }

    allUsers.forEach(user => {
      user.history.forEach(h => {
        const d = new Date(h.date);
        if (d >= start && d <= end) {
          const key = d.toISOString().slice(0, 10);
          const entry = dateMap.get(key);
          if (entry) {
            if (h.type === "subtract") entry.consumption += h.amount;
            entry.netChange += h.type === "add" ? h.amount : -h.amount;
          }
        }
      });
    });

    let runningBalance = totalAmount - allUsers.reduce((sum, user) => {
      let delta = 0;
      user.history.forEach(h => {
        const d = new Date(h.date);
        if (d > end) {
          delta += h.type === "add" ? h.amount : -h.amount;
        }
      });
      return sum + delta;
    }, 0);

    const trend: { date: string; amount: number; balance: number }[] = [];
    Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, data]) => {
      runningBalance += data.netChange;
      trend.push({ date, amount: data.consumption, balance: runningBalance });
    });

    const todayKey = new Date().toISOString().slice(0, 10);
    let todayRecharge = 0;
    let todayConsumption = 0;
    allUsers.forEach(user => {
      user.history.forEach(h => {
        const d = new Date(h.date);
        if (d.toISOString().slice(0, 10) === todayKey) {
          if (h.type === "add") todayRecharge += h.amount;
          else if (h.type === "subtract") todayConsumption += h.amount;
        }
      });
    });

    const weekRecharge = allUsers.reduce((sum, user) => {
      let w = 0;
      user.history.forEach(h => {
        const d = new Date(h.date);
        if (h.type === "add" && d >= weekStart && d <= end) w += h.amount;
      });
      return sum + w;
    }, 0);

    return {
      totalUsers: allUsers.length,
      totalAmount,
      todayRecharge,
      todayConsumption,
      weekRecharge,
      activeUsers,
      consumptionTrend: trend,
    };
  }




  function buildExportPayload(): ExportPayload {
    const allUsers = getAllUsers();
    const usersMap: Record<string, User> = {};
    for (const u of allUsers) {
      usersMap[u.id] = u;
    }
    return {
      schemaVersion: 2,
      app: "vip-manager",
      exportedAt: new Date().toISOString(),
      data: {
        users: usersMap,
        recentViewed: state.recentViewed,
        trash: state.trash,
        logs: state.logs,
      },
      settings: {
        usersPerPage: parseInt(localStorage.getItem("usersPerPage") || "12"),
        currency: localStorage.getItem("currency") || "CNY",
        theme: localStorage.getItem("theme") || "light",
      },
    };
  }

  function applyImport(payload: ExportPayload, mode: "overwrite" | "merge"): ImportResult {
    const result: ImportResult = { usersImported: 0, errors: [] };
    if (!payload?.data?.users) {
      result.errors.push("无效的导入文件");
      return result;
    }

    suppressOps = true;

    try {
      if (mode === "overwrite") {
        state.users = {};
        state.recentViewed = [];
        state.trash = [];
        dirtyUpserts.clear();
        dirtyDeletes.clear();
      }

      const incomingUsers = payload.data.users;
      const incomingIds = Object.keys(incomingUsers);
      for (const id of incomingIds) {
        const u = incomingUsers[id];
        if (!u || typeof u !== "object") continue;
        if (u.cardNo === undefined || u.cardNo === null) u.cardNo = "";
        if (u.remark === undefined || u.remark === null) u.remark = "";
        state.users[id] = { ...u, __ts: Date.now() };
        dirtyUpserts.add(id);
        result.usersImported++;
      }

      if (payload.data.recentViewed) {
        state.recentViewed = mode === "overwrite" ? payload.data.recentViewed : [...new Set([...state.recentViewed, ...payload.data.recentViewed])].slice(0, 20);
      }
      if (payload.data.trash) {
        state.trash = mode === "overwrite" ? payload.data.trash : [...state.trash, ...payload.data.trash];
      }
      if (payload.data.logs) {
        state.logs = mode === "overwrite" ? payload.data.logs : [...payload.data.logs, ...state.logs];
      }
      if (payload.settings) {
        if (payload.settings.usersPerPage) localStorage.setItem("usersPerPage", String(payload.settings.usersPerPage));
        if (payload.settings.currency) localStorage.setItem("currency", payload.settings.currency);
        if (payload.settings.theme) localStorage.setItem("theme", payload.settings.theme);
      }
      const importCurrency = payload.settings?.currency || "CNY";
      const localBaseCurrency = getBaseCurrency();
      if (importCurrency !== localBaseCurrency) {
        const convRate = getConversionRate(importCurrency, localBaseCurrency);
        if (convRate !== null) {
          const conv = (val: number): number => Math.round(val * convRate * 100) / 100;
          for (const id of Object.keys(state.users)) {
            const user = state.users[id];
            if (user) {
              user.amount = conv(user.amount);
              for (const h of user.history) {
                h.amount = conv(h.amount);
              }
            }
          }
        }
        localStorage.setItem("currency", localBaseCurrency);
      }

      addLog({ type: "IMPORT", message: "导入完成 (" + mode + "): " + result.usersImported + " 个用户" });
      scheduleSave();
    } catch (e) {
      result.errors.push(String(e));
    } finally {
      suppressOps = false;
    }

    return result;
  }


  function convertCurrencyData(from: string, to: string): void {
    const rate = getConversionRate(from, to);
    if (rate === null) return;

    const convert = (val: number): number => Math.round(val * rate * 100) / 100;

    for (const id of Object.keys(state.users)) {
      const user = state.users[id];
      if (user) {
        user.amount = convert(user.amount);
        for (const h of user.history) {
          h.amount = convert(h.amount);
        }
        dirtyUpserts.add(id);
        const key = "upsert:" + id;
        outboxMap.set(key, { key, type: "upsert", user_id: id, ts: Date.now(), payload: user });
      }
    }

    for (const user of state.trash) {
      user.amount = convert(user.amount);
      for (const h of user.history) {
        h.amount = convert(h.amount);
      }
    }

    addLog({ type: "CURRENCY_CONVERT", message: `货币转换 ${from} → ${to} (汇率: ${rate})` });
    scheduleSave();
  }

  async function deleteAllUsers(): Promise<number> {
    const userIds = Object.keys(state.users);
    const count = userIds.length;
    if (count === 0) return 0;
    if (!db) return 0;

    // 为每个用户创建 delete outbox 条目，以便 syncPushToCloud 逐条清理云端数据
    for (const userId of userIds) {
      dirtyUpserts.delete(userId);
      dirtyDeletes.add(userId);
      outboxMap.delete("upsert:" + userId);
      outboxMap.set("delete:" + userId, {
        key: "delete:" + userId,
        type: "delete",
        user_id: userId,
        ts: Date.now(),
      });
    }
    outboxDeletedKeys.clear();
    const outboxItems = Array.from(outboxMap.values());

    // 清空 IndexedDB 用户表，写入 delete outbox 条目
    try {
      await db.transaction("rw", [db.users, db.meta, db.outbox], async () => {
        await db!.users.clear();
        await db!.meta.put({ key: "recentViewed", value: [] });
        await db!.meta.put({ key: "trash", value: [] });
        await db!.meta.put({ key: "logs", value: state.logs });
        await db!.meta.put({ key: "sync_state", value: state.syncState });
        await db!.meta.put({ key: "_justDeletedAll", value: true });
        await db!.outbox.clear();
        if (outboxItems.length) {
          await db!.outbox.bulkPut(outboxItems);
        }
      });
    } catch (e) {
      console.error("[deleteAllUsers]", e);
      // 回滚 dirty 集合和 outbox 条目
      dirtyDeletes.clear();
      dirtyUpserts.clear();
      for (const userId of userIds) {
        outboxMap.delete("delete:" + userId);
      }
      return 0;
    }

    // 事务成功后清空内存状态
    state.users = {};
    state.trash = [];
    state.recentViewed = [];
    dirtyUpserts.clear();
    dirtyDeletes.clear();

    addLog({ type: "DELETE_ALL", message: `已删除全部 ${count} 个用户` });
    await db.meta.put({ key: "logs", value: state.logs });

    _justDeletedAll = true;

    return count;
  }
  return {
    state,
    get db() { return db; },
    init,
    loadData,
    flushNow,
    syncPushToCloud,
    syncPullFromCloud,
    getOutboxCount,
    addNewUser,
    addOldUser,
    deleteUser,
    purgeTrashItem,
    clearTrash,
    restoreFromTrash,
    addAmount,
    subtractAmount,
    togglePin,
    editHistory,
    deleteHistory,
    updateUserInfo,
    getUser,
    getAllUsers,
    getTrashUsers,
    searchUsers,
    filterUsers,
    addRecentView,
    getRecentUsers,
    getHistory,
    getOutboxOps,
    clearOutboxKeys,
    getSyncState,
    getStatsData,
    buildExportPayload,
    applyImport,
    deleteAllUsers,
    convertCurrencyData,
  };
}