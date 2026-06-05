import Dexie, { type Table } from "dexie";
import type { User } from "@/types";

interface MetaRow {
  key: string;
  value: unknown;
}

export class VipDatabase extends Dexie {
  users!: Table<User, string>;
  meta!: Table<MetaRow, string>;

  constructor(userId: string) {
    super(`vip_manager_${userId}`);

    this.version(1).stores({
      users: "id, phone, tail, pinned, amount, created",
      meta: "key",
    });

    this.version(2).stores({
      users: "id, phone, tail, pinned, amount, created",
      meta: "key",
      outbox: "key, type, user_id, ts",
    });

    this.version(3).stores({
      users: "id, phone, tail, pinned, amount, created, remark, cardNo",
      meta: "key",
      outbox: "key, type, user_id, ts",
    });

    this.version(4).stores({
      users: "id, phone, tail, pinned, amount, created, remark, cardNo",
      meta: "key",
      outbox: null,
    }).upgrade(async tx => {
      await tx.table("outbox").clear();
    });
  }
}

let dbInstance: VipDatabase | null = null;

export function getDb(userId: string): VipDatabase {
  if (dbInstance && dbInstance.name === `vip_manager_${userId}`) {
    return dbInstance;
  }
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = new VipDatabase(userId);
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
    dbInstance = null;
  }
}