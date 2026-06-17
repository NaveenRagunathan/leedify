import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cache = new Map<string, { value: string; fetchedAt: number }>();
const TTL = 5 * 60 * 1000; // 5 minutes

export async function getSecret(key: string): Promise<string> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    return cached.value;
  }

  const { data, error } = await supabaseAdmin
    .from("app_secrets")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) {
    throw new Error(`Secret "${key}" not found in app_secrets`);
  }

  if (!data.value) {
    throw new Error(`Secret "${key}" is empty — set it in the app_secrets table`);
  }

  cache.set(key, { value: data.value, fetchedAt: Date.now() });
  return data.value;
}

export async function getSecrets<K extends string>(keys: K[]): Promise<Record<K, string>> {
  const results = {} as Record<K, string>;
  await Promise.all(keys.map(async (k) => { results[k] = await getSecret(k); }));
  return results;
}
