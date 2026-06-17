/**
 * Lead generation pipeline.
 * Orchestrates: ICP → search → enrich → dedup → score → store → email.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { searchPeople, getProfile, type LinkedInProfile } from "@/lib/linkedin-mcp.server";
import { searchGoogleForLeads } from "@/lib/google-search.server";
import { scoreLeads, type ScoredLead } from "@/lib/scorer.server";
import { sendLeadBatchEmail } from "@/lib/email.functions";

const LEADS_PER_BATCH = 15;
const MIN_SCORE = 50;
const RELAXED_MIN_SCORE = 40;

interface PipelineResult {
  userId: string;
  leadsGenerated: number;
  emailSent: boolean;
  error?: string;
}

/**
 * Run the full pipeline for a single user.
 */
export async function runPipelineForUser(userId: string): Promise<PipelineResult> {
  console.log(`[Pipeline] Starting for user ${userId}`);

  try {
    // 1. Fetch ICP
    const { data: icp, error: icpErr } = await supabaseAdmin
      .from("user_icp")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (icpErr || !icp) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No ICP found" };
    }

    // 2. Fetch user profile for email
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, status")
      .eq("id", userId)
      .single();

    if (profile?.status !== "active") {
      return { userId, leadsGenerated: 0, emailSent: false, error: "User not active" };
    }

    // Get user email from auth
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const userEmail = authUser?.user?.email;
    if (!userEmail) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No email found" };
    }

    // 3. Build search queries from ICP
    const queries = buildSearchQueries(icp);

    // 4. S1: Serper (Google Search API) — primary source, works for any ICP/geography
    let rawLeads: LinkedInProfile[] = [];
    const seenUrls = new Set<string>();

    const serperLeads = await searchGoogleForLeads({
      jobTitles: icp.job_titles || [],
      industry: icp.industry || "",
      keywords: icp.keywords || [],
      geography: icp.geography || [],
      limit: 40,
    });

    for (const gl of serperLeads) {
      const norm = normalizeUrl(gl.linkedin_url);
      if (!seenUrls.has(norm)) {
        seenUrls.add(norm);
        rawLeads.push(gl);
      }
    }
    console.log(`[Pipeline] Serper returned ${rawLeads.length} leads`);

    // 5. S2: LinkedIn MCP — supplement if Serper didn't return enough
    if (rawLeads.length < 25) {
      for (const query of queries.slice(0, 3)) {
        if (rawLeads.length >= 40) break;
        console.log(`[Pipeline] LinkedIn search: "${query}"`);
        const results = await searchPeople({ keywords: query, location: icp.geography?.[0] });
        for (const r of results) {
          const norm = normalizeUrl(r.linkedin_url);
          if (!seenUrls.has(norm)) {
            seenUrls.add(norm);
            rawLeads.push(r);
          }
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      console.log(`[Pipeline] After LinkedIn MCP: ${rawLeads.length} total leads`);
    }

    if (rawLeads.length === 0) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No leads found from any source" };
    }

    // 6. Dedup against previously delivered leads
    const dedupedLeads = await dedup(userId, rawLeads);
    console.log(`[Pipeline] After dedup: ${dedupedLeads.length} leads`);

    if (dedupedLeads.length === 0) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "All leads already delivered" };
    }

    // 7. Enrich top leads with profile details (if we got them from search)
    const enriched = await enrichLeads(dedupedLeads.slice(0, 25));

    // 8. Score with Mistral AI
    const scored = await scoreLeads(enriched, {
      industry: icp.industry || "",
      job_titles: icp.job_titles || [],
      company_size: icp.company_size || [],
      geography: icp.geography || [],
      keywords: icp.keywords || [],
      product_desc: icp.product_desc,
    });

    // 9. Filter by score threshold
    let qualified = scored.filter((l) => l.score >= MIN_SCORE);
    if (qualified.length < LEADS_PER_BATCH) {
      qualified = scored.filter((l) => l.score >= RELAXED_MIN_SCORE);
    }

    const batch = qualified.slice(0, LEADS_PER_BATCH);
    console.log(`[Pipeline] ${batch.length} leads passed scoring`);

    if (batch.length === 0) {
      return { userId, leadsGenerated: 0, emailSent: false, error: "No leads passed score threshold" };
    }

    // 10. Store leads in DB
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
        source: "linkedin_mcp",
        batch_date: today,
        delivered_at: new Date().toISOString(),
      }))
    );
    if (insertErr) console.error("[Pipeline] Lead insert error:", insertErr);

    // 11. Send email
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
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      });

      // Log email
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

/**
 * Run pipeline for ALL active users. Called by the nightly cron.
 */
export async function runPipelineForAllUsers(): Promise<PipelineResult[]> {
  const { data: users, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("status", "active");

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

function buildSearchQueries(icp: any): string[] {
  const queries: string[] = [];
  const titles = icp.job_titles || [];
  const keywords = icp.keywords || [];
  const industry = icp.industry || "";
  const geo = (icp.geography || [])[0] || "";

  // Primary: each title + industry (location handled by MCP param)
  for (const title of titles.slice(0, 3)) {
    queries.push(`${title} ${industry}`.trim());
  }

  // Secondary: title + keywords
  for (const title of titles.slice(0, 2)) {
    for (const kw of keywords.slice(0, 2)) {
      queries.push(`${title} ${kw}`.trim());
    }
  }

  // Tertiary: industry + keywords
  if (keywords.length > 0) {
    queries.push(`${industry} ${keywords.join(" ")}`.trim());
  }

  // Geo-specific if set
  if (geo) {
    queries.push(`${titles[0] || industry} ${geo}`.trim());
  }

  // Deduplicate
  return [...new Set(queries.filter(Boolean))];
}

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
