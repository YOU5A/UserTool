import type { User, HistoryRecord, SyncState, LogEntry, CloudSyncSettings, ExportPayload, StatsData, ImportResult } from "@/types";
import { getDb, type VipDatabase } from "./db";
import { generateId, getConversionRate, getBaseCurrency, setBaseCurrency, normalizeCardNo, isValidCardNo } from "./utils";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---- 云端数据行类型（供 replaceAllFromCloud 使用） ----
export interface CloudDataRow {
  owner_id: string;
  user_id: string;
  data: User;
  updated_at: string;
}

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
  replaceAllFromCloud(cloudRows: CloudDataRow[]): Promise<void>;
  getChangedUserIdsAndClear(): string[];
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
  getSyncState(): SyncState;
  getStatsData(startDate: string, endDate: string): StatsData;
  buildExportPayload(): ExportPayload;
  applyImport(payload: ExportPayload, mode: "overwrite" | "merge"): ImportResult;
  convertCurrencyData(from: string, to: string): void;
  deleteAllUsers(): Promise<number>;
}

export function createVIPManager(): VIPManagerInstance {
  const state: VIPManagerState = {
    users: {},
    recentViewed: [],
    trash: [],
    logs: [],
    syncState: { lastUpdatedAt: null },
  };

  let db: VipDatabase | null = null;
  const changedUserIds = new Set<string>();

  // ---- Helpers ----

  function generateHistoryId(): string {
    return "h_" + generateId();
  }

  function addLog(entry: Omit<LogEntry, "timestamp">): void {
    state.logs.unshift({ ...entry, timestamp: Date.now() } as LogEntry);
  }

  function markChanged(userId: string): void {
    changedUserIds.add(userId);
  }

  async function saveUserToDb(userId: string): Promise<void> {
    if (!db) return;
    try {
      const user = state.users[userId];
      if (user && !user.purged) {
        await db.users.put(user);
      } else {
        await db.users.delete(userId);
      }
    } catch (e) {
      console.warn("[saveUserToDb]", e);
    }
  }

  async function saveMetaToDb(): Promise<void> {
    if (!db) return;
    try {
      await db.meta.bulkPut([
        { key: "recentViewed", value: state.recentViewed },
        { key: "trash", value: state.trash },
        { key: "logs", value: state.logs },
        { key: "sync_state", value: state.syncState },
      ]);
    } catch (e) {
      console.warn("[saveMetaToDb]", e);
    }
  }

  // ---- LocalStorage 迁移 ----

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
        }
        await db.users.bulkPut(userArr.filter(u => !!u.id));
      }
      if (legacyRecent.length) state.recentViewed = legacyRecent;
      if (legacyTrash.length) state.trash = legacyTrash;
      if (legacyLogs.length) state.logs = legacyLogs;

      await saveMetaToDb();
      await db.meta.put({ key: "legacy_migrated_v1", value: true });

      localStorage.removeItem("vipManagerUsers");
      localStorage.removeItem("recentViewed");
      localStorage.removeItem("vipManagerTrash");
      localStorage.removeItem("vipManagerLogs");
    } catch (e) {
      console.warn("[migrate]", e);
    }
  }

  // ---- Init / Load / Replace ----

  async function init(userId: string): Promise<void> {
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
    state.syncState = ((await db.meta.get("sync_state"))?.value as SyncState) || { lastUpdatedAt: null };
    changedUserIds.clear();
  }

  async function replaceAllFromCloud(cloudRows: CloudDataRow[]): Promise<void> {
    if (!db) return;
    const newUsers: Record<string, User> = {};
    const newTrash: User[] = [];

    for (const row of cloudRows) {
      if (!row.data || row.data.purged) continue;
      const user: User = { ...row.data, __ts: new Date(row.updated_at).getTime() };
      newUsers[user.id] = user;
      if (user.deleted) {
        newTrash.push(user);
      }
    }

    state.users = newUsers;
    state.trash = newTrash;
    state.recentViewed = state.recentViewed.filter(id => newUsers[id] && !newUsers[id].deleted);
    state.syncState.lastUpdatedAt = new Date().toISOString();

    try {
      await db.transaction("rw", [db.users, db.meta], async () => {
        await db!.users.clear();
        const userArr = Object.values(newUsers);
        if (userArr.length) await db!.users.bulkPut(userArr);
        await db!.meta.bulkPut([
          { key: "recentViewed", value: state.recentViewed },
          { key: "trash", value: state.trash },
          { key: "sync_state", value: state.syncState },
        ]);
      });
    } catch (e) {
      console.error("[replaceAllFromCloud]", e);
    }
  }

  function getChangedUserIdsAndClear(): string[] {
    const ids = Array.from(changedUserIds);
    changedUserIds.clear();
    return ids;
  }

  // ---- CRUD ----

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
    saveUserToDb(phone);
    markChanged(phone);
    addLog({ type: "CREATE", message: `创建用户: ${phone}`, userId: phone });
    saveMetaToDb();
    return phone;
  }

  function addOldUser(tail: string, initialAmount: number, remark?: string, cardNo?: string): string | null {
    const tailRegex = /^\d{4}$/;
    if (!tailRegex.test(tail)) return null;
    const id = "old-" + tail;
    if (state.users[id] && !state.users[id].deleted) return null;
    const normalizedCardNo = cardNo ? normalizeCardNo(cardNo) : "";
    if (normalizedCardNo) { const dupCard = Object.values(state.users).find(u => u.cardNo === normalizedCardNo && !u.deleted); if (dupCard) return null; }

    const newUser: User = {
      id,
      phone: tail,
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
        description: "初始充值",
      }] : [],
      __ts: Date.now(),
    };

    state.users[id] = newUser;
    saveUserToDb(id);
    markChanged(id);
    addLog({ type: "CREATE", message: `创建旧用户: ${tail}`, userId: id });
    saveMetaToDb();
    return id;
  }

  function addAmount(userId: string, amount: number, description?: string): boolean {
    const user = state.users[userId];
    if (!user || user.deleted) return false;
    user.amount += amount;
    user.__ts = Date.now();
    user.history.push({
      id: generateHistoryId(),
      type: "add",
      amount,
      date: new Date().toISOString(),
      description: description || "",
    });
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "RECHARGE", message: `充值: ${userId} +${amount}`, userId });
    saveMetaToDb();
    return true;
  }

  function subtractAmount(userId: string, amount: number, description?: string): boolean {
    const user = state.users[userId];
    if (!user || user.deleted) return false;
    if (user.amount < amount) return false;
    user.amount -= amount;
    user.__ts = Date.now();
    user.history.push({
      id: generateHistoryId(),
      type: "subtract",
      amount,
      date: new Date().toISOString(),
      description: description || "",
    });
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "CONSUME", message: `消费: ${userId} -${amount}`, userId });
    saveMetaToDb();
    return true;
  }

  function togglePin(userId: string): boolean {
    const user = state.users[userId];
    if (!user || user.deleted) return false;
    user.pinned = !user.pinned;
    user.__ts = Date.now();
    saveUserToDb(userId);
    markChanged(userId);
    return true;
  }

  function updateUserInfo(userId: string, data: { remark?: string; cardNo?: string }): boolean {
    const user = state.users[userId];
    if (!user || user.deleted) return false;
    if (data.remark !== undefined) user.remark = data.remark;
    if (data.cardNo !== undefined) {
      const normalized = normalizeCardNo(data.cardNo);
      if (normalized && normalized !== "0000") {
        if (!isValidCardNo(normalized)) return false;
        user.cardNo = normalized;
      } else if (data.cardNo === "") {
        user.cardNo = "";
      }
    }
    user.__ts = Date.now();
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "UPDATE_INFO", message: `更新信息: ${userId}`, userId });
    saveMetaToDb();
    return true;
  }

  function deleteUser(userId: string): boolean {
    const user = state.users[userId];
    if (!user || user.deleted) return false;
    user.deleted = true;
    user._deletedAt = new Date().toISOString();
    user.__ts = Date.now();
    state.trash.push(user);
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "DELETE", message: `删除用户: ${userId}`, userId });
    saveMetaToDb();
    return true;
  }

  function purgeTrashItem(userId: string): boolean {
    const user = state.users[userId];
    if (!user || !user.deleted || user.purged) return false;
    user.purged = true;
    user.__ts = Date.now();
    // 从 trash 和 recentViewed 移除
    state.trash = state.trash.filter(u => u.id !== userId);
    state.recentViewed = state.recentViewed.filter(id => id !== userId);
    // 从 state.users 删除（purged 用户不需要在本地保留）
    delete state.users[userId];
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "PURGE", message: `彻底删除: ${userId}`, userId });
    saveMetaToDb();
    return true;
  }

  function restoreFromTrash(userId: string): boolean {
    const user = state.users[userId];
    if (!user || !user.deleted || user.purged) return false;
    user.deleted = false;
    user._deletedAt = undefined;
    user.__ts = Date.now();
    state.trash = state.trash.filter(u => u.id !== userId);
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "RESTORE", message: `恢复用户: ${userId}`, userId });
    saveMetaToDb();
    return true;
  }

  function clearTrash(): boolean {
    if (state.trash.length === 0) return false;
    for (const u of state.trash) {
      u.purged = true;
      u.__ts = Date.now();
      delete state.users[u.id];
      saveUserToDb(u.id);
      markChanged(u.id);
    }
    state.trash = [];
    addLog({ type: "CLEAR_TRASH", message: "清空回收站" });
    saveMetaToDb();
    return true;
  }

  function editHistory(userId: string, historyId: string, newData: { type: string; amount: number; description: string }): boolean {
    const user = state.users[userId];
    if (!user || user.deleted) return false;
    const record = user.history.find(h => h.id === historyId);
    if (!record) return false;

    const oldType = record.type;
    const oldAmount = record.amount;

    // 回退旧的金额影响
    if (oldType === "add") user.amount -= oldAmount;
    else user.amount += oldAmount;

    // 应用新的金额
    record.type = newData.type as "add" | "subtract";
    record.amount = newData.amount;
    record.description = newData.description;
    if (newData.type === "add") user.amount += newData.amount;
    else user.amount -= newData.amount;

    user.__ts = Date.now();
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "EDIT_HISTORY", message: `编辑历史: ${userId}`, userId });
    saveMetaToDb();
    return true;
  }

  function deleteHistory(userId: string, historyId: string): boolean {
    const user = state.users[userId];
    if (!user || user.deleted) return false;
    const idx = user.history.findIndex(h => h.id === historyId);
    if (idx === -1) return false;

    const record = user.history[idx];
    if (record.type === "add") user.amount -= record.amount;
    else user.amount += record.amount;

    user.history.splice(idx, 1);
    user.__ts = Date.now();
    saveUserToDb(userId);
    markChanged(userId);
    addLog({ type: "DELETE_HISTORY", message: `删除历史: ${userId}`, userId });
    saveMetaToDb();
    return true;
  }

  // ---- Query ----

  function getUser(userId: string): User | undefined {
    return state.users[userId];
  }

  function getAllUsers(): User[] {
    return Object.values(state.users).filter(u => !u.deleted && !u.purged);
  }

  function getTrashUsers(): User[] {
    return state.trash.filter(u => !u.purged);
  }

  function searchUsers(query: string): User[] {
    const q = query.toLowerCase().trim();
    if (!q) return getAllUsers();
    return Object.values(state.users).filter(u => {
      if (u.deleted || u.purged) return false;
      return (
        (u.phone && u.phone.includes(q)) ||
        (u.tail && u.tail.includes(q)) ||
        (u.remark && u.remark.toLowerCase().includes(q)) ||
        (u.cardNo && u.cardNo.includes(q))
      );
    });
  }

  function filterUsers(filter: string): User[] {
    const base = getAllUsers();
    switch (filter) {
      case "card": return base.filter(u => u.cardNo && u.cardNo !== "0000");
      case "pinned": return base.filter(u => u.pinned);
      default: return base;
    }
  }

  function addRecentView(userId: string): void {
    const idx = state.recentViewed.indexOf(userId);
    if (idx >= 0) state.recentViewed.splice(idx, 1);
    state.recentViewed.unshift(userId);
    if (state.recentViewed.length > 20) state.recentViewed = state.recentViewed.slice(0, 20);
    saveMetaToDb();
  }

  function getRecentUsers(): User[] {
    return state.recentViewed
      .map(id => state.users[id])
      .filter((u): u is User => !!u && !u.deleted && !u.purged);
  }

  function getHistory(userId: string, historyId: string): HistoryRecord | undefined {
    const user = state.users[userId];
    if (!user) return undefined;
    return user.history.find(h => h.id === historyId);
  }

  function getSyncState(): SyncState {
    return state.syncState;
  }

  // ---- Stats ----

  function getStatsData(startDate: string, endDate: string): StatsData {
    const allUsers = getAllUsers();
    const totalUsers = allUsers.length;
    let totalAmount = 0;
    let activeUsers = 0;
    const today = new Date().toISOString().slice(0, 10);
    let todayRecharge = 0;
    let todayConsumption = 0;
    let weekRecharge = 0;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const consumptionMap = new Map<string, number>();

    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const user of allUsers) {
      totalAmount += user.amount;
      let hasActivity = false;
      for (const h of user.history) {
        const hDate = new Date(h.date);
        if (hDate >= start && hDate <= end) {
          hasActivity = true;
          if (h.type === "subtract") {
            const dayKey = h.date.slice(0, 10);
            consumptionMap.set(dayKey, (consumptionMap.get(dayKey) || 0) + h.amount);
          }
        }
        if (h.type === "add") {
          const dayKey = h.date.slice(0, 10);
          if (dayKey === today) todayRecharge += h.amount;
          if (h.date >= weekAgo) weekRecharge += h.amount;
        }
        if (h.type === "subtract" && h.date.slice(0, 10) === today) {
          todayConsumption += h.amount;
        }
      }
      if (hasActivity) activeUsers++;
    }

    const consumptionTrend = Array.from(consumptionMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount, balance: 0 }));

    return {
      totalUsers,
      totalAmount,
      activeUsers,
      consumptionTrend,
      todayRecharge,
      todayConsumption,
      weekRecharge,
    };
  }

  // ---- Import / Export ----

  function buildExportPayload(): ExportPayload {
    return {
      schemaVersion: 2,
      app: "UserTool",
      exportedAt: new Date().toISOString(),
      data: {
        users: state.users,
        recentViewed: state.recentViewed,
        trash: state.trash,
        logs: state.logs,
      },
      settings: {
        usersPerPage: parseInt(localStorage.getItem("usersPerPage") || "8"),
        theme: localStorage.getItem("theme") || "light",
        currency: getBaseCurrency(),
      },
    };
  }

  function applyImport(payload: ExportPayload, mode: "overwrite" | "merge"): ImportResult {
    const result: ImportResult = { usersImported: 0, errors: [] };
    try {
      if (mode === "overwrite") {
        state.users = {};
        state.recentViewed = [];
        state.trash = [];
      }

      const importedUsers = payload.data?.users;
      if (!importedUsers) return result;

      for (const id of Object.keys(importedUsers)) {
        const u = importedUsers[id];
        if (!u || !u.id) continue;
        if (u.purged) continue;
        if (!u.history || !Array.isArray(u.history)) u.history = [];
        if (u.amount === undefined || u.amount === null) u.amount = 0;
        u.__ts = Date.now();
        state.users[u.id] = u;
        if (u.deleted) {
          state.trash.push(u);
        }
        saveUserToDb(u.id);
        markChanged(u.id);
        result.usersImported++;
      }

      if (payload.data.recentViewed) {
        if (mode === "overwrite") state.recentViewed = payload.data.recentViewed;
        else state.recentViewed = [...new Set([...state.recentViewed, ...payload.data.recentViewed])].slice(0, 20);
      }

      if (mode === "overwrite" && payload.data.logs) {
        state.logs = payload.data.logs;
      }

      if (payload.settings) {
        if (payload.settings.usersPerPage) localStorage.setItem("usersPerPage", String(payload.settings.usersPerPage));
        if (payload.settings.theme) localStorage.setItem("theme", payload.settings.theme);
        if (payload.settings.currency) localStorage.setItem("currency", payload.settings.currency);
      }

      // 货币转换
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
              for (const h of user.history) h.amount = conv(h.amount);
            }
          }
        }
        localStorage.setItem("currency", localBaseCurrency);
      }

      addLog({ type: "IMPORT", message: `导入完成 (${mode}): ${result.usersImported} 个用户` });
      saveMetaToDb();
    } catch (e) {
      result.errors.push(String(e));
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
        for (const h of user.history) h.amount = convert(h.amount);
        user.__ts = Date.now();
        saveUserToDb(id);
        markChanged(id);
      }
    }

    for (const user of state.trash) {
      user.amount = convert(user.amount);
      for (const h of user.history) h.amount = convert(h.amount);
    }

    addLog({ type: "CURRENCY_CONVERT", message: `货币转换 ${from} → ${to} (汇率: ${rate})` });
    saveMetaToDb();
  }

  async function deleteAllUsers(): Promise<number> {
    const userIds = Object.keys(state.users);
    const count = userIds.length;
    if (count === 0) return 0;
    if (!db) return 0;

    // 标记所有用户为已变更（推送端会将其识别为需删除到云端）
    for (const userId of userIds) {
      markChanged(userId);
    }

    try {
      await db.transaction("rw", [db.users, db.meta], async () => {
        await db!.users.clear();
        await db!.meta.bulkPut([
          { key: "recentViewed", value: [] },
          { key: "trash", value: [] },
          { key: "logs", value: state.logs },
          { key: "sync_state", value: state.syncState },
          { key: "_justDeletedAll", value: true },
        ]);
      });
    } catch (e) {
      console.error("[deleteAllUsers]", e);
      changedUserIds.clear();
      return 0;
    }

    state.users = {};
    state.trash = [];
    state.recentViewed = [];

    addLog({ type: "DELETE_ALL", message: `已删除全部 ${count} 个用户` });
    await db.meta.put({ key: "logs", value: state.logs });

    return count;
  }

  return {
    state,
    get db() { return db; },
    init,
    loadData,
    replaceAllFromCloud,
    getChangedUserIdsAndClear,
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
    getSyncState,
    getStatsData,
    buildExportPayload,
    applyImport,
    deleteAllUsers,
    convertCurrencyData,
  };
}