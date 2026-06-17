/**
 * Lead generation pipeline.
 * Orchestrates: ICP → search → enrich → dedup → score → store → email.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProfile, type LinkedInProfile } from "@/lib/linkedin-mcp.server";
import { scoreLeads, type ScoredLead } from "@/lib/scorer.server";
import { sendLeadBatchEmail } from "@/lib/email.functions";
import { getSecret } from "@/lib/secrets.server";

const LEADS_PER_BATCH = 15;
const THRESHOLDS = [50, 40, 30, 0];
const MAX_SEARCH_ROUNDS = 3;

interface PipelineResult {
  userId: string;
  leadsGenerated: number;
  emailSent: boolean;
  error?: string;
}

/**
 * Run the full pipeline for a single user.
 * Uses multi-round agentic search: if first pass fails to find enough leads,
 * it learns from partial results and tries again with broader queries.
 */
export async function runPipelineForUser(userId: string): Promise<PipelineResult> {
  console.log(`[Pipeline] Starting for user ${userId}`);

  try {
    const { data: icp, error: icpErr } = await supabaseAdmin
      .from("user_icp")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (icpErr || !icp) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No ICP found" };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, status")
      .eq("id", userId)
      .single();

    if (profile?.status !== "active" && profile?.status !== "trial") {
      return { userId, leadsGenerated: 0, emailSent: false, error: "User not active or trial" };
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const userEmail = authUser?.user?.email;
    if (!userEmail) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No email found" };
    }

    // Multi-round agentic search
    let allFound: LinkedInProfile[] = [];
    const seenUrls = new Set<string>();
    let learnedTerms: string[] = [];
    const geo = icp.geography?.[0] || "";

    for (let round = 0; round < MAX_SEARCH_ROUNDS; round++) {
      if (allFound.length >= 40) break;
      console.log(`[Pipeline] Search round ${round + 1}/${MAX_SEARCH_ROUNDS}`);

      const roundQueries = buildAgenticQueries(icp, round, learnedTerms);

      // Serper search
      for (const q of roundQueries) {
        if (allFound.length >= 40) break;
        try {
          const res = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "X-API-KEY": await getSecret("SERPER_API_KEY"),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ q, num: 20 }),
          });
          if (!res.ok) continue;
          const data = await res.json() as any;
          for (const item of data.organic || []) {
            if (!item.link) continue;
            const urlMatch = item.link.match(/https?:\/\/(\w+\.)?linkedin\.com\/in\/[\w-]+\/?$/);
            if (!urlMatch || item.link.includes("/posts/")) continue;
            const norm = normalizeUrl(urlMatch[0]);
            if (seenUrls.has(norm)) continue;
            seenUrls.add(norm);
            const lead = parseLeadFromSearch(item.title || "", item.snippet || "", urlMatch[0]);
            if (lead.full_name) allFound.push(lead);
          }
          console.log(`[Serper] Round ${round + 1}: "${q.slice(0, 60)}" → ${allFound.length} unique`);
        } catch { continue; }
      }

      // Learn from found leads for next round
      if (allFound.length > 0) {
        const companies = [...new Set(allFound.map((l) => l.company).filter(Boolean))];
        const titles = [...new Set(allFound.map((l) => l.title).filter(Boolean))];
        learnedTerms = [...companies.slice(0, 5), ...titles.slice(0, 5)];
      }

      if (allFound.length >= 40) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (allFound.length === 0) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No leads found from any source" };
    }

    // Dedup against previously delivered leads
    const deduped = await dedup(userId, allFound);
    console.log(`[Pipeline] After dedup: ${deduped.length} leads`);

    if (deduped.length === 0) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "All leads already delivered" };
    }

    // Enrich
    const enriched = await enrichLeads(deduped.slice(0, 30));

    // Score
    const scored = await scoreLeads(enriched, {
      industry: icp.industry || "",
      job_titles: icp.job_titles || [],
      company_size: icp.company_size || [],
      geography: icp.geography || [],
      keywords: icp.keywords || [],
      product_desc: icp.product_desc,
    });

    // Multi-threshold progressive filtering
    let batch: ScoredLead[] = [];
    for (const threshold of THRESHOLDS) {
      const qualified = scored.filter((l) => l.score >= threshold);
      if (qualified.length >= LEADS_PER_BATCH || threshold === 0) {
        batch = qualified.slice(0, LEADS_PER_BATCH);
        console.log(`[Pipeline] ${batch.length} leads at threshold ${threshold}`);
        break;
      }
    }

    if (batch.length === 0) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No leads passed scoring" };
    }

    // Store in DB
    const today = new Date().toISOString().split("T")[0];
    const { error: insertErr } = await supabaseAdmin.from("leads").insert(
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
        delivered_at: new Date().toISOString(),
      }))
    );
    if (insertErr) console.error("[Pipeline] Lead insert error:", insertErr);

    // Send email
    let emailSent = false;
    try {
      await sendLeadBatchEmail({
        to: userEmail,
        userName: profile?.name || "there",
        leads: batch.map((l) => ({
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

      emailSent = true;
    } catch (e) {
      console.error("[Pipeline] Email send failed:", e);
      await supabaseAdmin.from("email_messages").insert({
        user_id: userId,
        message_type: "daily_batch",
        status: "failed",
      });
    }

    console.log(`[Pipeline] Done for ${userId}: ${batch.length} leads, email: ${emailSent}`);
    return { userId, leadsGenerated: batch.length, emailSent };
  } catch (e) {
    console.error(`[Pipeline] Fatal error for ${userId}:`, e);
    return { userId, leadsGenerated: 0, emailSent: false, error: String(e) };
  }
}

function parseLeadFromSearch(title: string, snippet: string, url: string): LinkedInProfile {
  // Remove " - LinkedIn" suffix and split on common delimiters
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

/**
 * Run pipeline for ALL active users. Called by the nightly cron.
 */
export async function runPipelineForAllUsers(): Promise<PipelineResult[]> {
  const { data: users, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("status", ["active", "trial"]);

  if (error || !users) {
    console.error("[Pipeline] Could not fetch active users:", error);
    return [];
  }

  console.log(`[Pipeline] Running for ${users.length} active users`);
  const results: PipelineResult[] = [];

  // Process users sequentially to avoid rate limits
  for (const user of users) {
    const result = await runPipelineForUser(user.id);
    results.push(result);
    // Small delay between users to be respectful to LinkedIn
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}

// --- Helpers ---

function normalizeUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "");
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
    // If we already have title/company, skip enrichment
    if (lead.title && lead.company) {
      enriched.push(lead);
      continue;
    }

    // Try to get full profile from LinkedIn MCP
    const profile = await getProfile(lead.linkedin_url);
    if (profile) {
      enriched.push({
        ...lead,
        full_name: profile.full_name || lead.full_name,
        title: profile.title || lead.title,
        company: profile.company || lead.company,
      });
    } else {
      enriched.push(lead);
    }

    // Rate limit: wait between profile fetches
    await new Promise((r) => setTimeout(r, 1500));
  }

  return enriched;
}
