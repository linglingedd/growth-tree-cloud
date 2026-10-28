-- Run after deploying the Edge Function and setting GROWTH_TREE_CRON_SECRET.
-- Replace both placeholder values in the two vault calls before running.
select vault.create_secret('https://YOUR-PROJECT.supabase.co/functions/v1/growth-tree/api/cron', 'growth_tree_cron_url');
select vault.create_secret('YOUR-LONG-RANDOM-CRON-SECRET', 'growth_tree_cron_secret');

select cron.schedule(
  'growth-tree-daily-analysis',
  '30 13 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'growth_tree_cron_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'growth_tree_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);
