/**
 * AI-powered lead scoring using Mistral API.
 * Scores leads against the user's ICP using structured prompting.
 */
import { getSecret } from "@/lib/secrets.server";

interface LeadToScore {
  full_name: string;
  title: string;
  company: string;
  linkedin_url: string;
  location?: string;
  email?: string | null;
  phone?: string | null;
}

interface ICP {
  industry: string;
  job_titles: string[];
  company_size: string[];
  geography: string[];
  keywords: string[];
  product_desc: string | null;
}

export interface ScoredLead extends LeadToScore {
  score: number;
  score_reason: string;
}

/**
 * Score a batch of leads against the ICP using Mistral AI.
 * Returns leads sorted by score (highest first).
 */
export async function scoreLeads(leads: LeadToScore[], icp: ICP): Promise<ScoredLead[]> {
  const apiKey = await getSecret("MISTRAL_API_KEY");

  const prompt = buildScoringPrompt(leads, icp);

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: `You are a lead scoring engine for a B2B SaaS. You score leads 0-100 based on how well they match the Ideal Customer Profile (ICP). Be strict — only high-quality matches should score above 70.

Scoring guidelines:
- 80-100: Near-perfect ICP match (exact title, industry, geography, company size)
- 60-79: Strong match (most ICP criteria met, minor gaps)
- 40-59: Partial match (some criteria met, notable gaps)
- 20-39: Weak match (few criteria met)
- 0-19: Poor match (almost no criteria alignment)

For each lead, consider:
1. Job title alignment with target titles
2. Industry/company alignment
3. Geography match
4. Keywords/signals from their profile
5. Whether they'd be a buyer for the described product

Return ONLY valid JSON. No markdown, no backticks.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Mistral scoring failed:", res.status, text);
    // Fallback to rule-based scoring
    return fallbackScore(leads, icp);
  }

  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content;

  try {
    const parsed = JSON.parse(content);
    const scored: ScoredLead[] = (parsed.leads || parsed.results || []).map((s: any, i: number) => ({
      ...leads[i],
      full_name: leads[i]?.full_name || s.name || "Unknown",
      score: Math.min(100, Math.max(0, s.score || 0)),
      score_reason: s.reason || s.score_reason || "",
    }));

    return scored.sort((a, b) => b.score - a.score);
  } catch (e) {
    console.error("Failed to parse Mistral response:", content);
    return fallbackScore(leads, icp);
  }
}

function buildScoringPrompt(leads: LeadToScore[], icp: ICP): string {
  const icpDesc = `
ICP:
- Industry: ${icp.industry}
- Target job titles: ${icp.job_titles.join(", ")}
- Company size: ${icp.company_size.join(", ")}
- Geography: ${icp.geography.join(", ")}
- Keywords: ${icp.keywords.join(", ")}
- Product: ${icp.product_desc || "Not specified"}
`;

  const leadsDesc = leads
    .map(
      (l, i) =>
        `Lead ${i + 1}: ${l.full_name} | ${l.title} | ${l.company} | ${l.linkedin_url}${l.location ? ` | ${l.location}` : ""}`
    )
    .join("\n");

  return `${icpDesc}

Score these ${leads.length} leads against the ICP above. Return JSON:
{"leads": [{"score": <0-100>, "reason": "<one sentence explaining the score>"}]}

The leads array MUST have exactly ${leads.length} entries, one per lead in order.

${leadsDesc}`;
}

/**
 * Fallback rule-based scoring when Mistral is unavailable.
 */
function fallbackScore(leads: LeadToScore[], icp: ICP): ScoredLead[] {
  return leads
    .map((lead) => {
      let score = 15; // Base score for having a LinkedIn profile
      const reasons: string[] = [];

      // Title match
      const titleLower = lead.title.toLowerCase();
      if (icp.job_titles.some((t) => titleLower.includes(t.toLowerCase()))) {
        score += 20;
        reasons.push("title matches ICP");
      }

      // Industry/keyword match
      const combined = `${lead.title} ${lead.company}`.toLowerCase();
      if (combined.includes(icp.industry.toLowerCase())) {
        score += 15;
        reasons.push("industry match");
      }

      // Keyword match
      const kwMatches = icp.keywords.filter((k) => combined.includes(k.toLowerCase()));
      if (kwMatches.length > 0) {
        score += Math.min(20, kwMatches.length * 10);
        reasons.push(`keywords: ${kwMatches.join(", ")}`);
      }

      // Geography
      if (lead.location && icp.geography.some((g) => lead.location!.toLowerCase().includes(g.toLowerCase()))) {
        score += 10;
        reasons.push("geography match");
      }

      // Email/phone bonus
      if (lead.email) { score += 10; reasons.push("has email"); }
      if (lead.phone) { score += 5; reasons.push("has phone"); }

      return {
        ...lead,
        score: Math.min(100, score),
        score_reason: reasons.join(", ") || "Basic profile match",
      };
    })
    .sort((a, b) => b.score - a.score);
}
