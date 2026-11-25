-- Retenção de dados pessoais de solicitações de agendamento.
-- Manter pedidos futuros, pois o tutor pode reservar até 30 dias à frente.
-- Depois da data desejada, manter no máximo 7 dias completos e excluir.
-- A recusa já exclui imediatamente via recusar_solicitacao_agendamento.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'bolhas_limpeza_agendamentos',
  '10 3 * * *',
  $$ delete from public.solicitacoes_agendamento
     where data_desejada < ((now() at time zone 'America/Sao_Paulo')::date - 7);
  $$
);
