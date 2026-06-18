/**
 * Lead generation pipeline.
 * Split into two phases:
 *   12 AM → generateLeadsForUser (search → score → store with delivered_at=null)
 *    8 AM → sendEmailsForUser   (fetch pending → send email → mark delivered)
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProfile, type LinkedInProfile } from "@/lib/linkedin-mcp.server";
import { scoreLeads, type ScoredLead } from "@/lib/scorer.server";
import { sendLeadBatchEmail } from "@/lib/email.functions";
import { getSecret } from "@/lib/secrets.server";

const LEADS_PER_BATCH = 15;
const THRESHOLDS = [50, 40, 30, 0];
const MAX_SEARCH_ROUNDS = 3;

// ---- Phase 1: Generate & Store Leads (12 AM) ----

export interface GenerateResult {
  userId: string;
  leadsGenerated: number;
  error?: string;
}

export async function generateLeadsForUser(userId: string): Promise<GenerateResult> {
  console.log(`[Generate] Starting for user ${userId}`);

  try {
    const icp = await fetchIcp(userId);
    if (!icp) return { userId, leadsGenerated: 0, error: "No ICP found" };

    const status = await fetchUserStatus(userId);
    if (status !== "active" && status !== "trial") {
      return { userId, leadsGenerated: 0, error: "User not active or trial" };
    }

    const leads = await agenticSearch(icp);
    if (leads.length === 0) {
      return { userId, leadsGenerated: 0, error: "No leads found from any source" };
    }

    const deduped = await dedup(userId, leads);
    if (deduped.length === 0) {
      return { userId, leadsGenerated: 0, error: "All leads already delivered" };
    }

    const enriched = await enrichLeads(deduped.slice(0, 30));

    const scored = await scoreLeads(enriched, {
      industry: icp.industry || "",
      job_titles: icp.job_titles || [],
      company_size: icp.company_size || [],
      geography: icp.geography || [],
      keywords: icp.keywords || [],
      product_desc: icp.product_desc,
    });

    const batch = selectBatch(scored);
    if (batch.length === 0) {
      return { userId, leadsGenerated: 0, error: "No leads passed scoring" };
    }

    await storeLeads(userId, batch);
    console.log(`[Generate] Done for ${userId}: ${batch.length} leads stored`);
    return { userId, leadsGenerated: batch.length };
  } catch (e) {
    console.error(`[Generate] Fatal error for ${userId}:`, e);
    return { userId, leadsGenerated: 0, error: String(e) };
  }
}

export async function generateLeadsForAllUsers(): Promise<GenerateResult[]> {
  const users = await fetchActiveUsers();
  const results: GenerateResult[] = [];
  for (const user of users) {
    const result = await generateLeadsForUser(user.id);
    results.push(result);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return results;
}

// ---- Phase 2: Send Emails (8 AM) ----

export interface SendResult {
  userId: string;
  leadsSent: number;
  emailSent: boolean;
  error?: string;
}

export async function sendEmailsForUser(userId: string): Promise<SendResult> {
  console.log(`[SendEmail] Starting for user ${userId}`);

  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, status")
      .eq("id", userId)
      .single();

    if (profile?.status !== "active" && profile?.status !== "trial") {
      return { userId, leadsSent: 0, emailSent: false, error: "User not active or trial" };
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const userEmail = authUser?.user?.email;
    if (!userEmail) {
      return { userId, leadsSent: 0, emailSent: false, error: "No email found" };
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: pending, error: fetchErr } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .eq("batch_date", today)
      .is("delivered_at", null);

    if (fetchErr || !pending || pending.length === 0) {
      return { userId, leadsSent: 0, emailSent: false, error: "No pending leads for today" };
    }

    let emailSent = false;
    try {
      await sendLeadBatchEmail({
        to: userEmail,
        userName: profile?.name || "there",
        leads: pending.map((l) => ({
          full_name: l.full_name,
          title: l.title || "",
          company: l.company || "",
          linkedin_url: l.linkedin_url,
          email: l.email || null,
          phone: l.phone || null,
          score: l.score,
          score_reason: l.score_reason,
        })),
        batchDate: new Date().toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
        }),
      });

      await supabaseAdmin.from("email_messages").insert({
        user_id: userId,
        message_type: "daily_batch",
        status: "sent",
      });

      await supabaseAdmin
        .from("leads")
        .update({ delivered_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("batch_date", today)
        .is("delivered_at", null);

      emailSent = true;
    } catch (e) {
      console.error("[SendEmail] Email send failed:", e);
      await supabaseAdmin.from("email_messages").insert({
        user_id: userId,
        message_type: "daily_batch",
        status: "failed",
      });
    }

    console.log(`[SendEmail] Done for ${userId}: ${pending.length} leads, email: ${emailSent}`);
    return { userId, leadsSent: pending.length, emailSent };
  } catch (e) {
    console.error(`[SendEmail] Fatal error for ${userId}:`, e);
    return { userId, leadsSent: 0, emailSent: false, error: String(e) };
  }
}

export async function sendEmailsForAllUsers(): Promise<SendResult[]> {
  const users = await fetchActiveUsers();
  const results: SendResult[] = [];
  for (const user of users) {
    const result = await sendEmailsForUser(user.id);
    results.push(result);
    await new Promise((r) => setTimeout(r, 500));
  }
  return results;
}

// ---- Combined (manual trigger - does both) ----

export interface PipelineResult {
  userId: string;
  leadsGenerated: number;
  emailSent: boolean;
  error?: string;
}

export async function runPipelineForUser(userId: string): Promise<PipelineResult> {
  const gen = await generateLeadsForUser(userId);
  if (gen.error || gen.leadsGenerated === 0) {
    return { userId, leadsGenerated: gen.leadsGenerated, emailSent: false, error: gen.error };
  }
  const send = await sendEmailsForUser(userId);
  return { userId, leadsGenerated: gen.leadsGenerated, emailSent: send.emailSent, error: send.error };
}

export async function runPipelineForAllUsers(): Promise<PipelineResult[]> {
  const users = await fetchActiveUsers();
  const results: PipelineResult[] = [];
  for (const user of users) {
    const result = await runPipelineForUser(user.id);
    results.push(result);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return results;
}

// ---- Internal (shared helpers) ----

async function fetchIcp(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_icp")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}

async function fetchUserStatus(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .single();
  return data?.status || null;
}

async function fetchActiveUsers() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("status", ["active", "trial"]);
  if (error || !data) return [];
  return data;
}

async function storeLeads(userId: string, batch: ScoredLead[]) {
  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabaseAdmin.from("leads").insert(
    batch.map((l) => ({
      user_id: userId,
      full_name: l.full_name,
      title: l.title || null,
      company: l.company || null,
      linkedin_url: l.linkedin_url,
      email: l.email || null,
      phone: l.phone || null,
      score: l.score,
      score_reason: l.score_reason,
      source: "google_search",
      batch_date: today,
      delivered_at: null,
    }))
  );
  if (error) console.error("[Store] Lead insert error:", error);
}

function selectBatch(scored: ScoredLead[]): ScoredLead[] {
  for (const threshold of THRESHOLDS) {
    const qualified = scored.filter((l) => l.score >= threshold);
    if (qualified.length >= LEADS_PER_BATCH || threshold === 0) {
      return qualified.slice(0, LEADS_PER_BATCH);
    }
  }
  return [];
}

async function agenticSearch(icp: any): Promise<LinkedInProfile[]> {
  const allFound: LinkedInProfile[] = [];
  const seenUrls = new Set<string>();
  let learnedTerms: string[] = [];
  const geo = icp.geography?.[0] || "";

  for (let round = 0; round < MAX_SEARCH_ROUNDS; round++) {
    if (allFound.length >= 40) break;
    console.log(`[Search] Round ${round + 1}/${MAX_SEARCH_ROUNDS}`);
    const queries = buildAgenticQueries(icp, round, learnedTerms);

    for (const q of queries) {
      if (allFound.length >= 40) break;

      // Fire all three engines in parallel for each query
      const engineResults = await Promise.allSettled([
        searchSerper(q),
        searchTavily(q),
        searchExa(q),
      ]);

      for (const result of engineResults) {
        if (result.status !== "fulfilled") continue;
        for (const lead of result.value) {
          const norm = normalizeUrl(lead.linkedin_url);
          if (seenUrls.has(norm) || !lead.full_name) continue;
          seenUrls.add(norm);
          allFound.push(lead);
        }
      }

      const total = allFound.length;
      if (total > 0) {
        console.log(`[Search] Round ${round + 1}: "${q.slice(0, 50)}" → ${total} unique`);
      }
    }

    if (allFound.length > 0) {
      const companies = [...new Set(allFound.map((l) => l.company).filter(Boolean))];
      const titles = [...new Set(allFound.map((l) => l.title).filter(Boolean))];
      learnedTerms = [...companies.slice(0, 5), ...titles.slice(0, 5)];
    }
    if (allFound.length >= 40) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return allFound;
}

async function searchSerper(q: string): Promise<LinkedInProfile[]> {
  const leads: LinkedInProfile[] = [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": await getSecret("SERPER_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, num: 20 }),
    });
    if (!res.ok) return leads;
    const data = await res.json() as any;
    for (const item of data.organic || []) {
      const m = extractLinkedInUrl(item.link);
      if (!m) continue;
      const lead = parseLeadFromSearch(item.title || "", item.snippet || "", m);
      if (lead.full_name) leads.push(lead);
    }
  } catch { /* silent */ }
  return leads;
}

async function searchTavily(q: string): Promise<LinkedInProfile[]> {
  const leads: LinkedInProfile[] = [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: await getSecret("TAVILY_API_KEY"),
        query: q,
        search_depth: "basic",
        max_results: 20,
        include_domains: ["linkedin.com"],
      }),
    });
    if (!res.ok) return leads;
    const data = await res.json() as any;
    for (const item of data.results || []) {
      const m = extractLinkedInUrl(item.url);
      if (!m) continue;
      const lead = parseLeadFromSearch(item.title || "", item.content || "", m);
      if (lead.full_name) leads.push(lead);
    }
  } catch { /* silent */ }
  return leads;
}

async function searchExa(q: string): Promise<LinkedInProfile[]> {
  const leads: LinkedInProfile[] = [];
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": await getSecret("EXA_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: q,
        numResults: 20,
        type: "keyword",
        includeDomains: ["linkedin.com"],
      }),
    });
    if (!res.ok) return leads;
    const data = await res.json() as any;
    for (const item of data.results || []) {
      const m = extractLinkedInUrl(item.url);
      if (!m) continue;
      const lead = parseLeadFromSearch(item.title || "", item.text || item.snippet || "", m);
      if (lead.full_name) leads.push(lead);
    }
  } catch { /* silent */ }
  return leads;
}

function extractLinkedInUrl(url: string): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/(\w+\.)?linkedin\.com\/in\/[\w-]+\/?$/);
  if (!m || url.includes("/posts/")) return null;
  return m[0];
}

function parseLeadFromSearch(title: string, snippet: string, url: string): LinkedInProfile {
  const nameMatch = title.match(/^([^-–—|]+?)\s*[-–—|]/);
  const name = nameMatch ? nameMatch[1].trim() : title.replace(/ - LinkedIn$/, "").trim();
  const titleFromSnippet = snippet.split(" - ")[0] || snippet.split(" · ")[0] || "";
  const companyFromSnippet = snippet.match(/(?:at|@|·)\s*([A-Z][A-Za-z0-9 .&]+)/)?.[1] || "";
  return {
    full_name: name,
    title: titleFromSnippet,
    company: companyFromSnippet,
    linkedin_url: url,
    location: "",
    email: null,
    phone: null,
  };
}

function buildAgenticQueries(icp: any, round: number, learnedTerms: string[]): string[] {
  const titles = icp.job_titles || [];
  const keywords = icp.keywords || [];
  const industry = icp.industry || "";
  const geo = (icp.geography || [])[0] || "";
  const queries: string[] = [];

  if (round === 0) {
    for (const title of titles) {
      queries.push(`site:linkedin.com/in "${title}" ${industry} ${geo}`);
    }
    for (const title of titles.slice(0, 2)) {
      for (const kw of keywords.slice(0, 2)) {
        queries.push(`site:linkedin.com/in "${title}" ${kw} ${geo}`);
      }
    }
    if (keywords.length > 0) {
      queries.push(`site:linkedin.com/in ${industry} ${keywords.slice(0, 3).join(" ")} ${geo}`);
    }
  } else if (round === 1) {
    for (const term of learnedTerms.slice(0, 4)) {
      queries.push(`site:linkedin.com/in ${term} ${industry}`);
    }
    for (const title of titles.slice(0, 2)) {
      queries.push(`site:linkedin.com/in "${title}" ${geo}`);
    }
    for (const kw of keywords.slice(0, 3)) {
      queries.push(`site:linkedin.com/in ${kw} ${industry} ${geo}`);
    }
  } else {
    for (const title of titles) {
      queries.push(`linkedin.com/in ${title}`);
    }
    queries.push(`linkedin.com/in ${industry} ${geo}`);
    for (const kw of keywords.slice(0, 3)) {
      queries.push(`linkedin.com/in ${kw} ${geo}`);
    }
    if (geo) queries.push(`linkedin.com/in ${geo} ${industry}`);
  }

  return [...new Set(queries.filter(Boolean))];
}

function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

async function dedup(userId: string, leads: LinkedInProfile[]): Promise<LinkedInProfile[]> {
  if (leads.length === 0) return [];
  const urls = leads.map((l) => l.linkedin_url);
  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("linkedin_url")
    .eq("user_id", userId)
    .in("linkedin_url", urls);
  const existingSet = new Set((existing || []).map((e) => normalizeUrl(e.linkedin_url || "")));
  return leads.filter((l) => !existingSet.has(normalizeUrl(l.linkedin_url)));
}

async function enrichLeads(leads: LinkedInProfile[]): Promise<LinkedInProfile[]> {
  const enriched: LinkedInProfile[] = [];
  for (const lead of leads) {
    if (lead.title && lead.company) {
      enriched.push(lead);
      continue;
    }
    const profile = await getProfile(lead.linkedin_url);
    if (profile) {
      enriched.push({ ...lead, ...profile, full_name: profile.full_name || lead.full_name });
    } else {
      enriched.push(lead);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return enriched;
}
