import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "../.env"), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
    })
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = "Njmsd0503$";

const configs = [
  {
    email: "naveenrmnj0503@gmail.com",
    name: "Naveen RM",
    icp: {
      industry: "Financial services / Wealth management",
      job_titles: ["Financial Advisor", "Wealth Manager", "Financial Consultant", "Investment Advisor"],
      company_size: ["1-10", "10-50"],
      geography: ["United States"],
      keywords: ["financial planning", "wealth management", "investment advisory", "retirement planning", "CFP"],
      product_desc: "I provide individual financial consulting services to high-net-worth individuals in the US market",
    },
  },
  {
    email: "naveenrm59@gmail.com",
    name: "Naveen RM",
    icp: {
      industry: "SaaS / Technology",
      job_titles: ["Founder", "CEO", "Co-Founder"],
      company_size: ["1-10", "10-50"],
      geography: ["United States", "United Kingdom"],
      keywords: ["SaaS", "micro-SaaS", "bootstrapped", "business acquisition", "exit", "ARR", "MRR"],
      product_desc: "I acquire small profitable SaaS businesses. Looking for founders running $10k+ MRR businesses",
    },
  },
  {
    email: "naveenjeeva2105@gmail.com",
    name: "Naveen Jeeva",
    icp: {
      industry: "Professional coaching / LinkedIn services",
      job_titles: ["LinkedIn Coach", "Personal Branding Consultant", "LinkedIn Strategist", "Career Coach"],
      company_size: ["1-10"],
      geography: ["United Kingdom", "United States"],
      keywords: ["LinkedIn coaching", "personal branding", "LinkedIn optimization", "career coaching"],
      product_desc: "I offer LinkedIn coaching and personal branding services to professionals and executives",
    },
  },
  {
    email: "naveenjeevanaveen@gmail.com",
    name: "Naveen Jeeva",
    icp: {
      industry: "Content marketing / Ghostwriting",
      job_titles: ["Founder", "CEO", "Managing Partner", "Agency Owner"],
      company_size: ["1-10", "10-50"],
      geography: ["United States", "United Kingdom", "Canada", "Australia"],
      keywords: ["ghostwriting", "LinkedIn ghostwriting", "content agency", "personal branding", "thought leadership"],
      product_desc: "I run a LinkedIn ghostwriting and personal branding agency. Looking for founders and executives who need LinkedIn content help",
    },
  },
  {
    email: "naveenrmnj0503+test5@gmail.com",
    name: "Naveen Test",
    icp: {
      industry: "B2B SaaS / Enterprise software",
      job_titles: ["VP of Sales", "Head of Growth", "Chief Revenue Officer", "Sales Director"],
      company_size: ["50-200", "200-500", "500+"],
      geography: ["United States"],
      keywords: ["sales automation", "lead generation", "B2B sales", "enterprise sales", "revenue operations"],
      product_desc: "I sell B2B SaaS products to mid-market and enterprise companies in the US market",
    },
  },
];

async function main() {
  console.log("=== Setting up test users ===\n");

  for (const cfg of configs) {
    console.log(`--- ${cfg.email} ---`);

    let userId;

    const { data, error } = await supabase.auth.admin.createUser({
      email: cfg.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: cfg.name },
    });

    if (error && error.message?.includes("already exists")) {
      // User already exists — look them up via listUsers
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === cfg.email);
      if (!existing) { console.error(`  Exists but cannot find: ${cfg.email}`); continue; }
      userId = existing.id;
      console.log(`  Already exists: ${userId}`);
    } else if (error) {
      console.error(`  Create failed: ${error.message}`);
      continue;
    } else {
      userId = data.user.id;
      console.log(`  Created: ${userId}`);
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Set ICP
    const { error: icpErr } = await supabase.from("user_icp").upsert({
      user_id: userId,
      industry: cfg.icp.industry,
      job_titles: cfg.icp.job_titles,
      company_size: cfg.icp.company_size,
      geography: cfg.icp.geography,
      keywords: cfg.icp.keywords,
      product_desc: cfg.icp.product_desc,
    });
    if (icpErr) { console.error(`  ICP error: ${icpErr.message}`); continue; }
    console.log(`  ICP set ✓`);

    // Activate trial
    const { error: trialErr } = await supabase
      .from("profiles")
      .update({
        status: "trial",
        subscription_start: new Date().toISOString(),
        subscription_end: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .eq("id", userId);
    if (trialErr) { console.error(`  Trial error: ${trialErr.message}`); continue; }
    console.log(`  Trial activated ✓`);
  }

  // Print summary
  console.log("\n=== Summary ===");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, status")
    .in("status", ["trial", "active"]);
  
  if (profiles) {
    console.log(`Total trial/active users: ${profiles.length}`);
    for (const p of profiles) {
      const { data: icp } = await supabase
        .from("user_icp")
        .select("industry, job_titles")
        .eq("user_id", p.id)
        .single();
      console.log(`  ${p.id.slice(0, 8)}... | ${p.status} | ${icp?.industry?.slice(0, 40) || "N/A"}`);
    }
  }

  // Check CRON_SECRET
  const { data: secret } = await supabase
    .from("app_secrets")
    .select("value")
    .eq("key", "CRON_SECRET")
    .single();

  if (secret) {
    console.log(`\nCRON_SECRET found: ${secret.value.slice(0, 8)}...`);
    console.log("\nTo trigger pipeline for all users, run in a new terminal:");
    console.log(`curl -X POST https://leadify-rdy9.onrender.com/api/public/trigger-leads \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"secret": "${secret.value}", "userId": "ALL"}'`);
  } else {
    console.log("\nNo CRON_SECRET set. Need to trigger pipeline manually.");
  }
}

main().catch(console.error);
