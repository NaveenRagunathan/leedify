import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSecret } from "@/lib/secrets.server";

interface Lead {
  full_name: string;
  title: string;
  company: string;
  linkedin_url: string | null;
  email: string | null;
  phone: string | null;
  score: number;
  score_reason: string | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#2563eb";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function buildLeadCard(lead: Lead, i: number) {
  const color = scoreColor(lead.score);
  const subtitle = [lead.title, lead.company].filter(Boolean).join(" at ");

  const contacts: string[] = [];
  if (lead.linkedin_url) {
    contacts.push(`<a href="${lead.linkedin_url}" style="color:#2563eb;text-decoration:none">LinkedIn</a>`);
  }
  if (lead.email) {
    contacts.push(`<a href="mailto:${lead.email}" style="color:#374151;text-decoration:none">${lead.email}</a>`);
  }
  if (lead.phone) {
    contacts.push(`<span>${lead.phone}</span>`);
  }

  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e5e7eb">
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="vertical-align:top">
            <div style="font-size:15px;font-weight:600;color:#111827">${lead.full_name}</div>
            ${subtitle ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">${subtitle}</div>` : ""}
            <div style="margin-top:8px;font-size:12px;color:#6b7280">${contacts.join(" &middot; ")}</div>
            ${lead.score_reason ? `<div style="margin-top:6px;font-size:12px;color:#9ca3af;line-height:1.4">${lead.score_reason}</div>` : ""}
          </td>
          <td style="vertical-align:top;text-align:right;width:50px;padding-left:12px">
            <div style="font-size:16px;font-weight:700;color:${color}">${lead.score}</div>
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">/100</div>
          </td>
        </tr></table>
      </td>
    </tr>`;
}

function buildEmailHtml(userName: string, leads: Lead[], batchDate: string) {
  const rows = leads.map((l, i) => buildLeadCard(l, i)).join("");
  const avgScore = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">

    <div style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:32px">

      <!-- Header -->
      <table style="width:100%;margin-bottom:28px"><tr>
        <td>
          <span style="display:inline-block;background:#111827;color:#ffffff;font-weight:700;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;font-size:13px">L</span>
          <span style="margin-left:8px;font-weight:600;color:#111827;font-size:15px">Leadify</span>
        </td>
        <td style="text-align:right;font-size:12px;color:#9ca3af">${batchDate}</td>
      </tr></table>

      <!-- Greeting -->
      <h1 style="color:#111827;font-size:20px;margin:0 0 4px;font-weight:600">Good morning, ${userName}</h1>
      <p style="color:#6b7280;font-size:14px;margin:0 0 24px">
        ${leads.length === 1 ? "Here's 1 lead" : `Here are ${leads.length} leads`} matched to your ICP.
      </p>

      <!-- Stats -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;background:#f9fafb;border-radius:6px">
        <tr>
          <td style="text-align:center;padding:12px 8px">
            <div style="font-size:18px;font-weight:700;color:#111827">${leads.length}</div>
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Leads</div>
          </td>
          <td style="text-align:center;padding:12px 8px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
            <div style="font-size:18px;font-weight:700;color:#111827">${avgScore}</div>
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Avg Score</div>
          </td>
          <td style="text-align:center;padding:12px 8px">
            <div style="font-size:18px;font-weight:700;color:#111827">${leads.filter((l) => l.email).length}</div>
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">With Email</div>
          </td>
        </tr>
      </table>

      <!-- Leads -->
      <table style="width:100%;border-collapse:collapse">
        <tbody>${rows}</tbody>
      </table>

    </div>

    <!-- Footer -->
    <div style="margin-top:20px;text-align:center">
      <p style="color:#9ca3af;font-size:12px;margin:0 0 4px">Next batch arrives tomorrow at 8:00 AM IST</p>
      <p style="color:#d1d5db;font-size:11px;margin:0">
        <a href="mailto:support@leadify.in" style="color:#9ca3af;text-decoration:underline">Unsubscribe</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:support@leadify.in" style="color:#9ca3af;text-decoration:underline">Get help</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Send the daily lead batch email to a specific user.
 * Called server-side — either from webhook after payment or from the daily cron.
 */
export async function sendLeadBatchEmail(opts: {
  to: string;
  userName: string;
  leads: Lead[];
  batchDate: string;
}) {
  const apiKey = await getSecret("RESEND_API_KEY");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Leadify <leads@plainly.cloud>",
      to: opts.to,
      subject: `Your ${opts.leads.length} leads for ${opts.batchDate} — Leadify`,
      html: buildEmailHtml(opts.userName, opts.leads, opts.batchDate),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Resend send failed", res.status, text);
    throw new Error(`Email send failed: ${res.status}`);
  }

  return (await res.json()) as { id: string };
}

/**
 * Test endpoint — sends a sample lead email to the logged-in user.
 * Useful for verifying the email setup works.
 */
export const sendTestLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .single();

    const email = (context.claims as any)?.email as string | undefined;
    if (!email) throw new Error("No email found in auth token");

    const sampleLeads: Lead[] = [
      {
        full_name: "Ravi Sharma",
        title: "Founder",
        company: "ProductHQ",
        linkedin_url: "https://linkedin.com/in/ravisharma",
        email: "ravi@producthq.com",
        phone: "+91 9876543210",
        score: 87,
        score_reason: "SaaS founder, 500 Twitter followers, active buyer signals",
      },
      {
        full_name: "Priya Desai",
        title: "Head of Growth",
        company: "ScaleUp.io",
        linkedin_url: "https://linkedin.com/in/priyadesai",
        email: "priya@scaleup.io",
        phone: "+91 9123456789",
        score: 74,
        score_reason: "Growth role at funded startup, matches geography",
      },
      {
        full_name: "Alex Chen",
        title: "Solo Founder",
        company: "ShipFast Labs",
        linkedin_url: "https://linkedin.com/in/alexchen",
        email: "alex@shipfastlabs.com",
        phone: null,
        score: 68,
        score_reason: "Indie hacker, recent Product Hunt launch",
      },
    ];

    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });

    const result = await sendLeadBatchEmail({
      to: email,
      userName: profile?.name || "there",
      leads: sampleLeads,
      batchDate: today,
    });

    return { sent: true, emailId: result.id };
  });
