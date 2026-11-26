-- V2.6.0 | Pacote pre-pago: uso informativo, sem efeito financeiro.
-- NULL preserva a incerteza dos registros históricos; novas entradas exigem Sim/Não no aplicativo.
alter table public.atendimentos
  add column if not exists pacote_pre_pago boolean;
comment on column public.atendimentos.pacote_pre_pago is
 'Indica se este atendimento consumiu serviço de plano pré-pago do tutor. Sim/Não/NULL (legado desconhecido). Não altera precificação, faturamento nem executores.';

-- Check-in de agendamento aprovado: pacote é informado na chegada, nunca pelo tutor na solicitação pública.
create or replace function app_private.registrar_entrada_programada_v4_interna(
 p_programacao_id uuid,p_manejo text,p_pacote_pre_pago boolean
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_atendimento uuid;
begin
 if p_pacote_pre_pago is null then
   raise exception 'Selecione Sim ou Não para pacote pré-pago' using errcode='22023';
 end if;
 -- Rotina existente protege perfil, data, status, concorrência e atribuição ao agendamento.
 v_atendimento:=app_private.registrar_entrada_programada_v3_interna(p_programacao_id,p_manejo);
 update public.atendimentos set pacote_pre_pago=p_pacote_pre_pago where id=v_atendimento;
 return v_atendimento;
end $$;

revoke all on function app_private.registrar_entrada_programada_v4_interna(uuid,text,boolean) from public,anon;
grant execute on function app_private.registrar_entrada_programada_v4_interna(uuid,text,boolean) to authenticated;
create or replace function public.registrar_entrada_programada_v4(
 p_programacao_id uuid,p_manejo text,p_pacote_pre_pago boolean
) returns uuid
language sql set search_path=public,pg_temp as $$
 select app_private.registrar_entrada_programada_v4_interna(p_programacao_id,p_manejo,p_pacote_pre_pago);
$$;
revoke all on function public.registrar_entrada_programada_v4(uuid,text,boolean) from public,anon;
grant execute on function public.registrar_entrada_programada_v4(uuid,text,boolean) to authenticated;

-- Correção somente administrativa, com justificativa e reabertura de ficha revisada.
create or replace function public.corrigir_pacote_pre_pago(
 p_atendimento_id uuid,p_pacote_pre_pago boolean,p_justificativa text
) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_antes boolean;v_admin uuid;
begin
 v_admin:=auth.uid();
 if v_admin is null or not exists(select 1 from public.app_admins where user_id=v_admin) then
   raise exception 'Somente Administrador pode corrigir o indicador de pacote' using errcode='42501';
 end if;
 if p_pacote_pre_pago is null then raise exception 'Informe Sim ou Não para pacote' using errcode='22023'; end if;
 if length(trim(coalesce(p_justificativa,'')))<8 or length(p_justificativa)>500 then
   raise exception 'Justificativa entre 8 e 500 caracteres é obrigatória';
 end if;
 select pacote_pre_pago into v_antes from public.atendimentos
  where id=p_atendimento_id for update;
 if not found then raise exception 'Atendimento não encontrado';end if;
 if v_antes is not distinct from p_pacote_pre_pago then
   raise exception 'O indicador já possui este valor; nenhuma correção necessária';
 end if;
 update public.atendimentos set pacote_pre_pago=p_pacote_pre_pago where id=p_atendimento_id;
 delete from public.fichas_conferencia where atendimento_id=p_atendimento_id;
 insert into public.etapa_auditoria
  (atendimento_id,etapa_id,evento,anterior,posterior,justificativa,administrador_id)
 values(p_atendimento_id,null,'correcao_pacote',
  jsonb_build_object('pacote_pre_pago',v_antes),
  jsonb_build_object('pacote_pre_pago',p_pacote_pre_pago),
  trim(p_justificativa),v_admin);
end $$;
revoke all on function public.corrigir_pacote_pre_pago(uuid,boolean,text) from public,anon;
grant execute on function public.corrigir_pacote_pre_pago(uuid,boolean,text) to authenticated;
