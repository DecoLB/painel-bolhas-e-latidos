-- V2.3.1 | Domingo não é dia de atendimento.
-- A validação ocorre somente em novas solicitações ou alterações da data.
-- Agendamentos aprovados antes desta regra permanecem intactos.
create or replace function app_private.validar_dia_util_agendamento()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if extract(isodow from new.data_desejada) = 7 then
    raise exception 'Agendamentos aos domingos não são permitidos.'
      using errcode = '23514', constraint = 'agendamento_sem_domingo';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validar_dia_util_agendamento() from public, anon, authenticated;
drop trigger if exists trg_agendamento_sem_domingo on public.solicitacoes_agendamento;
create trigger trg_agendamento_sem_domingo
before insert or update of data_desejada
on public.solicitacoes_agendamento
for each row execute function app_private.validar_dia_util_agendamento();
