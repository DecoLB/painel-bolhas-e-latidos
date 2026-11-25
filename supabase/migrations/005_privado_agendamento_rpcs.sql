-- Refatoração de segurança: funções privilegiadas em schema não exposto.
-- O frontend continua chamando as mesmas RPCs públicas, agora SECURITY INVOKER.
create function app_private.aprovar_agendamento_interno(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_dia date;
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select auth.uid()) is null or
     not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'Apenas administradores podem aprovar agendamentos' using errcode='42501';
  end if;
  update public.solicitacoes_agendamento
  set status='aprovado',aprovado_em=now()
  where id=p_id and status='pendente' and data_desejada between (v_hoje+1) and (v_hoje+30)
  returning data_desejada into v_dia;
  if v_dia is null then raise exception 'Solicitacao indisponivel ou fora da janela permitida'; end if;
  insert into public.programacao(solicitacao_id,data_programada) values(p_id,v_dia);
end;
$$;

create function app_private.recusar_agendamento_interno(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or
     not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'Apenas administradores podem recusar agendamentos' using errcode='42501';
  end if;
  delete from public.solicitacoes_agendamento where id=p_id and status='pendente'
    returning id into v_id;
  if v_id is null then raise exception 'Solicitacao nao encontrada ou ja analisada'; end if;
end;
$$;
revoke all on function app_private.aprovar_agendamento_interno(uuid) from public,anon;
revoke all on function app_private.recusar_agendamento_interno(uuid) from public,anon;
grant execute on function app_private.aprovar_agendamento_interno(uuid) to authenticated;
grant execute on function app_private.recusar_agendamento_interno(uuid) to authenticated;

create or replace function public.aprovar_solicitacao_agendamento(p_id uuid)
returns void language sql security invoker set search_path=public,pg_temp
as $$select app_private.aprovar_agendamento_interno(p_id);$$;
create or replace function public.recusar_solicitacao_agendamento(p_id uuid)
returns void language sql security invoker set search_path=public,pg_temp
as $$select app_private.recusar_agendamento_interno(p_id);$$;
revoke all on function public.aprovar_solicitacao_agendamento(uuid) from public,anon;
revoke all on function public.recusar_solicitacao_agendamento(uuid) from public,anon;
grant execute on function public.aprovar_solicitacao_agendamento(uuid) to authenticated;
grant execute on function public.recusar_solicitacao_agendamento(uuid) to authenticated;
