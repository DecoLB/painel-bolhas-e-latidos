-- V2.7.3: não permitir encerramento com valor de referência desconhecido,
-- inclusive quando o serviço é coberto por pacote pré-pago.
create or replace function public.financeiro_conferir(p_atendimento uuid,p_justificativa text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;d date; n integer;
begin
 uid:=app_private.financeiro_require_admin();
 if length(trim(coalesce(p_justificativa,'')))<8 or length(p_justificativa)>500
 then raise exception 'Justificativa entre 8 e 500 caracteres é obrigatória';end if;
 select (concluido_em at time zone 'America/Sao_Paulo')::date into d
 from public.atendimentos where id=p_atendimento and status='concluido';
 if d is null then raise exception 'Atendimento não concluído';end if;
 select count(*) into n from public.financeiro_itens where atendimento_id=p_atendimento;
 if n=0 then raise exception 'Atendimento sem composição financeira';end if;
 if exists(select 1 from public.financeiro_itens where atendimento_id=p_atendimento
  and (coberto_pacote is null or
       coalesce(valor_corrigido_centavos,valor_referencia_centavos) is null))
 then raise exception 'Existem itens sem definição de cobertura ou valor de referência; corrija antes de conferir';end if;
 insert into public.financeiro_conferencias(atendimento_id,conferido_por,conferido_em)
 values(p_atendimento,uid,now())
 on conflict(atendimento_id) do update
 set conferido_por=excluded.conferido_por,conferido_em=excluded.conferido_em;
 insert into public.financeiro_auditoria(entidade,entidade_id,atendimento_id,dia,evento,posterior,justificativa,administrador_id)
 values('conferencia',p_atendimento::text,p_atendimento,d,'conferido',
  jsonb_build_object('conferido_em',now()),trim(p_justificativa),uid);
end $$;
revoke all on function public.financeiro_conferir(uuid,text) from public,anon;
grant execute on function public.financeiro_conferir(uuid,text) to authenticated;
