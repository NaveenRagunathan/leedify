import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint: runs the lead pipeline for all active users.
 * Called nightly at 12:00 AM IST by an external cron service (cron-job.org / Railway cron).
 *
 * GET /api/public/cron-leads?secret=<CRON_SECRET>
 */
export const Route = createFileRoute("/api/public/cron-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const secret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

        // Validate cron secret to prevent unauthorized triggers
        const { getSecret } = await import("@/lib/secrets.server");
        let cronSecret: string;
        try {
          cronSecret = await getSecret("CRON_SECRET");
        } catch {
          cronSecret = "";
        }

        if (!cronSecret || secret !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runPipelineForAllUsers } = await import("@/lib/pipeline.server");
        const results = await runPipelineForAllUsers();

        return new Response(
          JSON.stringify({
            ok: true,
            usersProcessed: results.length,
            results: results.map((r) => ({
              userId: r.userId,
              leads: r.leadsGenerated,
              emailSent: r.emailSent,
              error: r.error || null,
            })),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  },
});
