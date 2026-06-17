/**
 * Lead search via Serper.dev (Google Search API).
 * Primary source for finding LinkedIn profiles matching any ICP.
 */
import { getSecret } from "@/lib/secrets.server";

export interface GoogleSearchLead {
  full_name: string;
  title: string;
  company: string;
  linkedin_url: string;
}

/**
 * Search Google via Serper for LinkedIn profiles matching the ICP.
 */
export async function searchGoogleForLeads(opts: {
  jobTitles: string[];
  industry: string;
  keywords: string[];
  geography: string[];
  limit?: number;
}): Promise<GoogleSearchLead[]> {
  const { jobTitles, industry, keywords, geography, limit = 30 } = opts;
  const apiKey = await getSecret("SERPER_API_KEY");

  // Build multiple targeted queries
  const queries = buildQueries(jobTitles, industry, keywords, geography);
  const leads: GoogleSearchLead[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    if (leads.length >= limit) break;

    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query,
          num: 20,
        }),
      });

      if (!res.ok) {
        console.error(`[Serper] Search failed: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as SerperResponse;
      const extracted = extractProfiles(data);

      for (const lead of extracted) {
        const norm = lead.linkedin_url.replace(/\/$/, "").toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          leads.push(lead);
        }
      }

      console.log(`[Serper] "${query}" → ${extracted.length} profiles (${leads.length} total unique)`);
    } catch (e) {
      console.error("[Serper] Error:", e);
    }
  }

  return leads.slice(0, limit);
}

interface SerperResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
}

function buildQueries(
  jobTitles: string[],
  industry: string,
  keywords: string[],
  geography: string[]
): string[] {
  const queries: string[] = [];
  const geo = geography.length > 0 ? geography[0] : "";

  // Primary: each title + industry + geo — find LinkedIn profiles
  for (const title of jobTitles.slice(0, 3)) {
    queries.push(
      `linkedin.com/in ${title} ${industry} ${geo}`.trim()
    );
  }

  // Secondary: title + keywords
  for (const title of jobTitles.slice(0, 2)) {
    for (const kw of keywords.slice(0, 2)) {
      queries.push(
        `linkedin.com/in ${title} ${kw} ${geo}`.trim()
      );
    }
  }

  // Tertiary: industry + keywords
  if (keywords.length > 0) {
    queries.push(
      `linkedin.com/in ${industry} ${keywords.join(" ")} ${geo}`.trim()
    );
  }

  return [...new Set(queries)];
}

function extractProfiles(data: SerperResponse): GoogleSearchLead[] {
  const profiles: GoogleSearchLead[] = [];

  for (const result of data.organic || []) {
    if (!result.link) continue;

    // Only LinkedIn profile URLs (not posts, company pages, etc.)
    const urlMatch = result.link.match(
      /https?:\/\/(\w+\.)?linkedin\.com\/in\/[\w-]+\/?$/
    );
    if (!urlMatch) continue;
    // Skip non-profile pages
    if (result.link.includes("/posts/") || result.link.includes("/pulse/")) continue;

    const linkedinUrl = urlMatch[0];
    const parsed = parseLinkedInResult(result.title || "", result.snippet || "");

    if (parsed.full_name) {
      profiles.push({
        ...parsed,
        linkedin_url: linkedinUrl,
      });
    }
  }

  return profiles;
}

/**
 * Parse Google search result title + snippet for LinkedIn profiles.
 * Typical format: "Name - Title - Company | LinkedIn"
 */
function parseLinkedInResult(
  title: string,
  snippet: string
): Omit<GoogleSearchLead, "linkedin_url"> {
  // Remove " | LinkedIn" or " - LinkedIn" suffix
  const cleanTitle = title
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, "")
    .trim();

  // Split by " - " or " – " or " — "
  const parts = cleanTitle.split(/\s*[-–—]\s*/);

  const full_name = parts[0]?.trim() || "";
  const titlePart = parts[1]?.trim() || "";
  const companyPart = parts[2]?.trim() || "";

  // Try to extract more from snippet if title is sparse
  let finalTitle = titlePart;
  let finalCompany = companyPart;

  if (!finalTitle && snippet) {
    // Snippet often has "Title at Company. ..."
    const atMatch = snippet.match(/^([^.]+?)\s+at\s+([^.]+)/i);
    if (atMatch) {
      finalTitle = atMatch[1].trim();
      finalCompany = atMatch[2].trim();
    }
  }

  // Handle "Title at Company" in the title part
  if (finalTitle && !finalCompany && finalTitle.includes(" at ")) {
    const atParts = finalTitle.split(" at ");
    finalTitle = atParts[0].trim();
    finalCompany = atParts[1].trim();
  }

  return {
    full_name,
    title: finalTitle,
    company: finalCompany,
  };
}
