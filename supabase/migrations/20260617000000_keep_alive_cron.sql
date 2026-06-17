
-- Enable extensions for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Keep-alive: pings the Render app every 5 minutes to prevent free-tier spin-down.
-- After deployment, replace the URL below with your actual Render app URL.
SELECT cron.schedule(
  'keep-alive-render',
  '*/5 * * * *',
  $$
    SELECT net.http_get(
      url := current_setting('app.settings.app_url', true)
             || '/api/public/health'
    );
  $$
);

-- Nightly lead generation at 12:00 AM IST (18:30 UTC).
-- Uses POST with Authorization header instead of URL query param.
SELECT cron.schedule(
  'nightly-leads',
  '30 18 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.app_url', true)
             || '/api/public/cron-leads',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || current_setting('app.settings.cron_secret', true),
        'Content-Type',
        'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

COMMENT ON FUNCTION cron.schedule IS
  'Scheduled via pg_cron + pg_net. Set app.settings.app_url and app.settings.cron_secret via ALTER DATABASE or Supabase Dashboard > SQL Editor.';
