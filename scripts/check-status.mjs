import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "../.env"), "utf-8")
    .split("\n").filter(Boolean).map(l => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
    })
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== Checking secrets ===");
  const { data: secrets } = await supabase.from("app_secrets").select("*");
  if (secrets) {
    for (const s of secrets) {
      console.log(`  ${s.key}: ${s.value.slice(0, 12)}...`);
    }
  }

  console.log("\n=== Checking email_messages ===");
  const { data: emails } = await supabase.from("email_messages").select("*").limit(10);
  if (emails && emails.length > 0) {
    for (const e of emails) {
      console.log(`  ${e.user_id.slice(0, 8)}... | type: ${e.message_type} | status: ${e.status} | sent: ${e.sent_at}`);
    }
  } else {
    console.log("  No email messages found");
  }

  console.log("\n=== Checking leads per user ===");
  const { data: profiles } = await supabase.from("profiles").select("id, name, status").in("status", ["trial", "active"]);
  if (profiles) {
    for (const p of profiles) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, full_name, score, delivered_at")
        .eq("user_id", p.id)
        .limit(3);
      const { data: emails } = await supabase
        .from("email_messages")
        .select("status, message_type")
        .eq("user_id", p.id);
      console.log(`\n  ${p.name || "?"} (${p.status})`);
      console.log(`  UserID: ${p.id.slice(0, 12)}...`);
      console.log(`  Leads: ${leads?.length || 0}`);
      if (leads && leads.length > 0) {
        for (const l of leads) {
          console.log(`    - ${l.full_name} (score: ${l.score}) delivered: ${l.delivered_at?.slice(0, 10) || "N/A"}`);
        }
      }
      console.log(`  Email attempts: ${emails?.length || 0}`);
      if (emails && emails.length > 0) {
        for (const e of emails) {
          console.log(`    - ${e.message_type}: ${e.status}`);
        }
      }
    }
  }
}

main().catch(console.error);
