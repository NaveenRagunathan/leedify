/**
 * LinkedIn MCP HTTP client.
 * Talks to the linkedin-mcp-server running in streamable-http mode.
 */

const MCP_BASE = process.env.LINKEDIN_MCP_URL || "http://127.0.0.1:3100/mcp";

let sessionId: string | null = null;
let initialized = false;

async function mcpRequest(method: string, params: Record<string, unknown> = {}, id = 1) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(MCP_BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  // Capture session id from response headers
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  const text = await res.text();
  // SSE format: lines starting with "data: "
  const dataLines = text.split("\n").filter((l) => l.startsWith("data: "));
  if (dataLines.length === 0) throw new Error(`MCP: no data in response for ${method}`);

  const last = JSON.parse(dataLines[dataLines.length - 1].slice(6));
  if (last.error) throw new Error(`MCP ${method}: ${last.error.message}`);
  return last.result;
}

async function ensureInitialized() {
  if (initialized) return;
  await mcpRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "leadify", version: "1.0" },
  });
  // Send initialized notification (no id for notifications)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  await fetch(MCP_BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  initialized = true;
}

async function callTool(toolName: string, args: Record<string, unknown>) {
  await ensureInitialized();
  const result = await mcpRequest("tools/call", { name: toolName, arguments: args }, Date.now());
  return result;
}

export interface LinkedInProfile {
  full_name: string;
  title: string;
  company: string;
  linkedin_url: string;
  location?: string;
}

/**
 * Search LinkedIn for people matching the ICP.
 */
export async function searchPeople(opts: {
  keywords: string;
  location?: string;
}): Promise<LinkedInProfile[]> {
  try {
    const result = await callTool("search_people", {
      keywords: opts.keywords,
      ...(opts.location ? { location: opts.location } : {}),
    });

    // Try structured content first (has references with URLs and names)
    const structured = result?.structuredContent;
    if (structured?.references?.search_results) {
      return parseStructuredResults(structured);
    }

    // Fallback: parse text content
    const content = result?.content;
    if (!content || !Array.isArray(content)) return [];

    // Check if content contains JSON with structuredContent
    for (const c of content) {
      if (c.type === "text") {
        try {
          const parsed = JSON.parse(c.text);
          if (parsed?.references?.search_results) {
            return parseStructuredResults(parsed);
          }
        } catch {
          // Not JSON, try text parsing
        }
      }
    }

    const text = content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return parseSearchResults(text);
  } catch (e) {
    console.error("LinkedIn search_people failed:", e);
    return [];
  }
}

/**
 * Get detailed profile info from a LinkedIn URL.
 */
export async function getProfile(profileUrl: string): Promise<LinkedInProfile | null> {
  try {
    const result = await callTool("get_person_profile", {
      profile_url: profileUrl,
      sections: ["experience", "contact_info"],
    });

    const content = result?.content;
    if (!content || !Array.isArray(content)) return null;

    const text = content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return parseProfileText(text, profileUrl);
  } catch (e) {
    console.error("LinkedIn get_person_profile failed:", e);
    return null;
  }
}

function parseStructuredResults(data: any): LinkedInProfile[] {
  const profiles: LinkedInProfile[] = [];
  const refs: any[] = data.references?.search_results || [];
  const searchText: string = data.sections?.search_results || "";

  // Split the search text into per-person blocks
  const blocks = searchText.split(/\n\n(?=[A-Z])/);

  for (const ref of refs) {
    if (ref.kind !== "person" || !ref.url) continue;

    const url = ref.url.startsWith("http")
      ? ref.url
      : `https://www.linkedin.com${ref.url}`;
    const name = ref.text || "";

    // Find this person's block in the search text for title/company/location
    let title = "";
    let company = "";
    let location = "";

    const block = blocks.find((b) => b.includes(name));
    if (block) {
      const lines = block.split("\n").map((l: string) => l.trim()).filter(Boolean);
      // Typical format:
      // Name \n • 3rd+\n\nHeadline\n\nLocation\n\nConnect\n\nCurrent: Title at Company
      for (const line of lines) {
        if (line.startsWith("Current:") || line.startsWith("current:")) {
          const currentParts = line.replace(/^Current:\s*/i, "").split(" at ");
          title = currentParts[0]?.trim() || title;
          company = currentParts[1]?.trim() || company;
        } else if (
          line.includes("India") ||
          line.includes("States") ||
          line.includes("Area") ||
          line.includes(",")
        ) {
          if (
            !line.includes("Connect") &&
            !line.includes("•") &&
            !line.includes("@") &&
            line.length < 60
          ) {
            location = line;
          }
        }
      }

      // If no "Current:" found, try headline (usually 3rd line)
      if (!title) {
        const headlineLine = lines.find(
          (l: string) =>
            !l.includes("•") &&
            !l.includes("Connect") &&
            l !== name &&
            !l.includes("Skills:") &&
            l.length > 5 &&
            l.length < 200
        );
        if (headlineLine) {
          title = headlineLine;
        }
      }
    }

    profiles.push({
      full_name: name,
      title,
      company,
      linkedin_url: url,
      location,
    });
  }

  return profiles;
}

function parseSearchResults(text: string): LinkedInProfile[] {
  const profiles: LinkedInProfile[] = [];
  // The MCP returns structured text — parse name, title, company, URL
  const lines = text.split("\n");
  let current: Partial<LinkedInProfile> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.full_name && current.linkedin_url) {
        profiles.push({
          full_name: current.full_name,
          title: current.title || "",
          company: current.company || "",
          linkedin_url: current.linkedin_url,
          location: current.location,
        });
      }
      current = {};
      continue;
    }

    // Try to extract LinkedIn URL
    const urlMatch = trimmed.match(/linkedin\.com\/in\/[^\s)]+/);
    if (urlMatch) {
      current.linkedin_url = `https://www.${urlMatch[0]}`;
    }

    // Common patterns from MCP output
    if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      current.full_name = trimmed.replace(/\*\*/g, "").trim();
    } else if (trimmed.includes(" at ")) {
      const parts = trimmed.split(" at ");
      current.title = parts[0].replace(/^[-•]\s*/, "").trim();
      current.company = parts[1]?.trim() || "";
    } else if (trimmed.includes(" - ")) {
      const parts = trimmed.split(" - ");
      if (!current.full_name) {
        current.full_name = parts[0].replace(/^[-•]\s*/, "").trim();
      }
      if (!current.title && parts[1]) {
        current.title = parts[1].trim();
      }
      if (!current.company && parts[2]) {
        current.company = parts[2].trim();
      }
    }
  }

  // Push last entry
  if (current.full_name && current.linkedin_url) {
    profiles.push({
      full_name: current.full_name,
      title: current.title || "",
      company: current.company || "",
      linkedin_url: current.linkedin_url,
      location: current.location,
    });
  }

  return profiles;
}

function parseProfileText(text: string, profileUrl: string): LinkedInProfile | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const profile: LinkedInProfile = {
    full_name: "",
    title: "",
    company: "",
    linkedin_url: profileUrl,
  };

  for (const line of lines) {
    if (line.startsWith("# ") || (line.startsWith("**") && !profile.full_name)) {
      profile.full_name = line.replace(/^#\s*/, "").replace(/\*\*/g, "").trim();
    }
    if (line.toLowerCase().includes("headline:") || line.toLowerCase().includes("title:")) {
      profile.title = line.split(":").slice(1).join(":").trim();
    }
    if (line.toLowerCase().includes("company:") || line.toLowerCase().includes("current:")) {
      profile.company = line.split(":").slice(1).join(":").trim();
    }
  }

  return profile.full_name ? profile : null;
}
