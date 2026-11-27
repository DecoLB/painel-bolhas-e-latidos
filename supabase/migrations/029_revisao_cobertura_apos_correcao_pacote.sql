-- V2.7.1: uma correção do indicador de pacote força reavaliação da cobertura financeira.
create or replace function public.corrigir_pacote_pre_pago(
 p_atendimento_id uuid,p_pacote_pre_pago boolean,p_justificativa text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_antes boolean;uid uuid;d date;itens_anteriores jsonb;
begin
 uid:=auth.uid();
 if uid is null or not exists(select 1 from public.app_admins where user_id=uid)
 then raise exception 'Somente Administrador pode corrigir o indicador de pacote' using errcode='42501';end if;
 if p_pacote_pre_pago is null then raise exception 'Informe Sim ou Não' using errcode='22023';end if;
 if length(trim(coalesce(p_justificativa,'')))<8 or length(p_justificativa)>500
 then raise exception 'Justificativa entre 8 e 500 caracteres é obrigatória';end if;
 select pacote_pre_pago,(concluido_em at time zone 'America/Sao_Paulo')::date into v_antes,d
 from public.atendimentos where id=p_atendimento_id for update;
 if not found then raise exception 'Atendimento não encontrado';end if;
 if v_antes is not distinct from p_pacote_pre_pago then raise exception 'Indicador já possui este valor';end if;
 select jsonb_agg(jsonb_build_object('id',id,'coberto_pacote',coberto_pacote))
 into itens_anteriores from public.financeiro_itens where atendimento_id=p_atendimento_id;
 update public.atendimentos set pacote_pre_pago=p_pacote_pre_pago where id=p_atendimento_id;
 delete from public.fichas_conferencia where atendimento_id=p_atendimento_id;
 perform app_private.financeiro_reabrir(p_atendimento_id,p_justificativa,uid);
 if itens_anteriores is not null then
   update public.financeiro_itens set coberto_pacote=null,atualizado_em=now()
   where atendimento_id=p_atendimento_id;
   insert into public.financeiro_auditoria(entidade,entidade_id,atendimento_id,dia,evento,anterior,posterior,justificativa,administrador_id)
   values('item',p_atendimento_id::text,p_atendimento_id,d,'cobertura_a_reconfirmar',
    itens_anteriores,jsonb_build_object('cobertura','não definida após correção do pacote'),
    trim(p_justificativa),uid);
 end if;
 insert into public.etapa_auditoria
  (atendimento_id,etapa_id,evento,anterior,posterior,justificativa,administrador_id)
 values(p_atendimento_id,null,'correcao_pacote',
  jsonb_build_object('pacote_pre_pago',v_antes),
  jsonb_build_object('pacote_pre_pago',p_pacote_pre_pago),
  trim(p_justificativa),uid);
end $$;
revoke all on function public.corrigir_pacote_pre_pago(uuid,boolean,text) from public,anon;
grant execute on function public.corrigir_pacote_pre_pago(uuid,boolean,text) to authenticated;
