import { createFileRoute } from "@tanstack/react-router";

/**
 * On-demand endpoint: runs the lead pipeline for a specific user.
 * Called after payment success (from webhook or client).
 *
 * POST /api/public/trigger-leads
 * Body: { "userId": "...", "secret": "..." }
 */
export const Route = createFileRoute("/api/public/trigger-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const { userId, secret } = body;
        if (!userId) {
          return new Response("Missing userId", { status: 400 });
        }

        // Validate secret
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

        const { runPipelineForUser } = await import("@/lib/pipeline.server");
        const result = await runPipelineForUser(userId);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
