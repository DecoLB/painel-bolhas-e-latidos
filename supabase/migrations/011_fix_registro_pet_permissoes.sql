-- Bolhas & Latidos: correção de permissão para registrar animais.
-- A tabela já tinha políticas RLS de INSERT para app_admins e app_operadores.
-- Faltava o privilégio de tabela INSERT para a role "authenticated",
-- o que causava "permission denied for table atendimentos".
-- Mantém a autorização apenas a usuários com perfil interno válido.
revoke all privileges on table public.atendimentos from anon;
grant insert on table public.atendimentos to authenticated;
