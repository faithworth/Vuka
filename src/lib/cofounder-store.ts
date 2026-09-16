import { supabase } from "@/lib/mcp-shared";

export type JsonObject = Record<string, unknown>;

export async function getCofounderSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return data.value as T;
}

export async function setCofounderSetting(key: string, value: unknown) {
  const { error } = await supabase
    .from("platform_settings")
    .upsert(
      { key, value, updatedBy: "chatgpt-cofounder" },
      { onConflict: "key" }
    );
  if (error) throw new Error(error.message);
}

export async function appendCofounderSettingArray<T>(key: string, item: T, maxItems = 500): Promise<T[]> {
  const current = await getCofounderSetting<T[]>(key, []);
  const next = [item, ...current].slice(0, maxItems);
  await setCofounderSetting(key, next);
  return next;
}

export function isoNow() {
  return new Date().toISOString();
}
