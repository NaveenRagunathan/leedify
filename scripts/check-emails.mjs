import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter(Boolean).map(l => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
  })
);

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY.startsWith("<ROTATE")) {
  console.error("ERROR: Service role key not set. Rotate it in Supabase Dashboard first.");
  console.error("Go to: https://supabase.com/dashboard/project/xlqdxopheaarvlutxecm/settings/api");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Check email_messages
  const { data: emails, error } = await supabase
    .from("email_messages")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Query error:", error.message);
    return;
  }

  console.log("=== Recent Email Messages ===");
  if (!emails || emails.length === 0) {
    console.log("No email messages found");
  } else {
    for (const e of emails) {
      console.log(`  User: ${e.user_id.slice(0,8)}... | Type: ${e.message_type} | Status: ${e.status} | Sent: ${e.sent_at?.slice(0,19)}`);
    }
  }

  // Check Resend API key
  const { data: resendSecret } = await supabase
    .from("app_secrets")
    .select("value")
    .eq("key", "RESEND_API_KEY")
    .single();

  if (resendSecret) {
    console.log(`\n=== Resend API Key: ${resendSecret.value.slice(0,8)}...${resendSecret.value.slice(-4)}`);
    
    // Test Resend API
    const res = await fetch("https://api.resend.com/audiences", {
      headers: { Authorization: `Bearer ${resendSecret.value}` }
    });
    console.log(`Resend API status: ${res.status}`);
    const text = await res.text();
    console.log(`Response: ${text.slice(0, 300)}`);
  } else {
    console.log("\nNo RESEND_API_KEY found in app_secrets");
  }
}

main().catch(console.error);
