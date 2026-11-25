-- Aplicar APENAS no projeto Bolhas e Latidos e APÓS implantar a Edge Function.
-- Também configurar a variável CRON_SECRET nos secrets da Edge Function.
-- Habilitar pg_cron e pg_net no painel Supabase > Integrations/Cron/Extensions.
-- Acesse Supabase Vault para cadastrar ambos os segredos abaixo; NÃO os deixe no Git.

-- EXECUTAR UMA VEZ, substituindo os placeholders APENAS no SQL Editor do Supabase:
-- select vault.create_secret('https://ID-PROJETO.supabase.co','bolhas_project_url');
-- select vault.create_secret('SEGREDO-FORTE-ALEATORIO','bolhas_cron_secret');

-- 00:10 horário de Brasília (03:10 UTC). Reavaliar se o fuso civil mudar.
-- A função aceita apenas POST e valida o segredo via x-cron-secret.
select cron.schedule(
  'bolhas_retencao_7_dias',
  '10 3 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='bolhas_project_url') || '/functions/v1/retencao-7-dias',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='bolhas_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
-- Revisar execução e eventuais falhas em cron.job_run_details e Edge Functions > Logs.
