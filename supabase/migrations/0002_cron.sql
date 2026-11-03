-- Cron: cada minuto llama a la Edge Function que envía los recordatorios vencidos.
-- (los secretos se guardan en public.app_secrets, solo legible por service_role)
select cron.schedule('send-reminders', '* * * * *', $$
  select net.http_post(
    'https://ljesyblxcbknstsyeohu.supabase.co/functions/v1/send-reminders', '{}'::jsonb,
    headers => jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')),
    timeout_milliseconds => 20000);
$$);
select cron.schedule('purge-net-responses', '17 3 * * *',
  $$ delete from net._http_response where created < now() - interval '1 day' $$);

-- Secretos a cargar una sola vez (no versionados):
-- insert into public.app_secrets(key,value) values
--   ('vapid_public','...'),('vapid_private','...'),('vapid_subject','mailto:...'),
--   ('cron_secret','...'),('invite_code','...');
