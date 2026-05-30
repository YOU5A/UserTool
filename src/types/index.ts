export interface HistoryRecord {
  id: string;
  type: "add" | "subtract";
  amount: number;
  description: string;
  date: string;
}

export interface User {
  id: string;
  phone: string;
  tail: string;
  amount: number;
  created: string;
  pinned: boolean;
  deleted: boolean;
  purged: boolean;
  history: HistoryRecord[];
  __ts?: number;
  _deletedAt?: string;
}

export interface SyncState {
  lastOpTs: number;
  lastUpdatedAt: string | null;
}

export interface OutboxOp {
  key: string;
  type: "upsert" | "delete";
  user_id: string;
  ts: number;
  payload?: User;
}

export interface VipMetaRow {
  owner_id: string;
  key: string;
  value: unknown;
}

export interface CloudSyncSettings {
  autoPullEnabled: boolean;
  autoPullIntervalSec: number;
  pullOnFocus: boolean;
  realtimeEnabled: boolean;
}

export interface ExportPayload {
  schemaVersion: number;
  app: string;
  exportedAt: string;
  data: {
    users: Record<string, User>;
    recentViewed: string[];
    trash: User[];
    logs: LogEntry[];
  };
  settings: {
    usersPerPage: number;
    currency: string;
    theme: string;
  };
}

export interface LogEntry {
  type: string;
  message: string;
  timestamp: number;
  userId?: string;
}

export interface StatsData {
  totalUsers: number;
  totalAmount: number;
  activeUsers: number;
  consumptionTrend: { date: string; amount: number; balance: number }[];
  todayRecharge: number;
  todayConsumption: number;
  weekRecharge: number;
}

export interface ImportResult {
  usersImported: number;
  errors: string[];
}
