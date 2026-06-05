import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/types";
import type { CloudDataRow } from "./vip-manager";
import { cookieStorage } from "./auth-storage";

let supabaseClient: SupabaseClient | null = null;

const STORAGE_KEY_URL = "sb_project_url";
const STORAGE_KEY_ANON = "sb_anon_key";

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = localStorage.getItem(STORAGE_KEY_URL);
  const anonKey = localStorage.getItem(STORAGE_KEY_ANON);
  if (url && anonKey) return { url, anonKey };
  return null;
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_ANON, anonKey);
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON);
  supabaseClient = null;
}

export function initSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;
  supabaseClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storage: cookieStorage },
  });
  return supabaseClient;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseClient) {
    return initSupabaseClient();
  }
  return supabaseClient;
}

export function resetSupabaseClient(): void {
  supabaseClient = null;
}

// ─── Cloud Data Operations ───────────────────────────────────

/** 拉取当前 owner 的全量用户数据 */
export async function fetchAllUserData(
  client: SupabaseClient,
  ownerId: string
): Promise<CloudDataRow[]> {
  let firstPage = true;
  const all: CloudDataRow[] = [];
  let cursor: string | null = null;
  do {
    const query = client
      .from("user_data")
      .select("*")
      .eq("owner_id", ownerId)
      .order("user_id")
      .limit(1000);
    if (cursor) query.gt("user_id", cursor);
    const { data, error } = await query;
    if (error) {
      if (firstPage) {
        throw new Error("[fetchAllUserData] first page query failed: " + JSON.stringify(error));
      }
      console.warn("[fetchAllUserData] subsequent page error, stopping", error);
      break;
    }
    if (data && data.length > 0) {
      all.push(...(data as CloudDataRow[]));
      cursor = data[data.length - 1].user_id;
      firstPage = false;
    } else {
      firstPage = false;
      break;
    }
  } while (cursor);
  return all;
}

/** 批量写入用户到云端（分块 upsert，每批 500 条） */
export async function pushUsersBatch(
  client: SupabaseClient,
  ownerId: string,
  users: User[]
): Promise<boolean> {
  if (users.length === 0) return true;
  const now = new Date().toISOString();

  for (let i = 0; i < users.length; i += 500) {
    const batch = users.slice(i, i + 500).map(u => ({
      owner_id: ownerId,
      user_id: u.id,
      data: u,
      updated_at: now,
    }));

    const { error } = await client
      .from("user_data")
      .upsert(batch, { onConflict: "owner_id,user_id" });

    if (error) {
      console.warn("[pushUsersBatch] batch upsert error", error);
      return false;
    }
  }
  return true;
}

/** 条件推送单条：本地 __ts > 远端 updated_at 才写入 */
export async function upsertUserData(
  client: SupabaseClient,
  ownerId: string,
  userId: string,
  data: User,
  localTs: number
): Promise<{ pushed: boolean }> {
  const { data: rows, error: fetchErr } = await client
    .from("user_data")
    .select("updated_at")
    .eq("owner_id", ownerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    console.warn("[upsertUserData] fetch error", fetchErr);
    return { pushed: false };
  }

  if (rows) {
    const remoteTs = new Date(rows.updated_at).getTime();
    if (remoteTs >= localTs) {
      return { pushed: false };
    }
  }

  const { error } = await client
    .from("user_data")
    .upsert(
      {
        owner_id: ownerId,
        user_id: userId,
        data,
        updated_at: new Date(localTs).toISOString(),
      },
      { onConflict: "owner_id,user_id" }
    );

  if (error) {
    console.warn("[upsertUserData] upsert error", error);
    return { pushed: false };
  }
  return { pushed: true };
}

/** 删除 owner 的全部用户数据 */
export async function deleteAllUserData(
  client: SupabaseClient,
  ownerId: string
): Promise<boolean> {
  const { error } = await client
    .from("user_data")
    .delete()
    .eq("owner_id", ownerId);

  if (error) {
    console.warn("[deleteAllUserData]", error);
    return false;
  }
  return true;
}

/** 从云端删除用户 */
export async function deleteUserData(
  client: SupabaseClient,
  ownerId: string,
  userId: string
): Promise<boolean> {
  const { error } = await client
    .from("user_data")
    .delete()
    .eq("owner_id", ownerId)
    .eq("user_id", userId);

  if (error) {
    console.warn("[deleteUserData]", error);
    return false;
  }
  return true;
}

/** 订阅 user_data 表变更（Realtime），返回取消订阅函数 */
export function subscribeToChanges(
  client: SupabaseClient,
  ownerId: string,
  callback: () => void
): () => void {
  const channel = client
    .channel("user_data_changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_data",
        filter: `owner_id=eq.${ownerId}`,
      },
      () => {
        callback();
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}