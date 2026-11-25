-- Bolhas & Latidos V1.6
-- Agendamento aprovado fica pré-cadastrado, sem entrada operacional antecipada.
-- Na data programada, recepção registra chegada OU recusa com justificativa.
-- Migração compatível com agendamentos e atendimentos existentes.

alter table public.programacao
  add column status varchar(18) not null default 'programado',
  add column atendimento_id uuid references public.atendimentos(id) on delete set null,
  add column motivo_recusa varchar(24),
  add column justificativa_outro varchar(200),
  add column registrado_em timestamptz,
  add column registrado_por uuid;

alter table public.programacao add constraint status_programacao_valido
  check(status in ('programado','entrada_realizada','recusado'));

alter table public.programacao add constraint decisao_programacao_consistente check (
  (status='programado' and atendimento_id is null and motivo_recusa is null
   and justificativa_outro is null and registrado_em is null)
  or
  (status='entrada_realizada' and atendimento_id is not null
   and motivo_recusa is null and justificativa_outro is null and registrado_em is not null)
  or
  (status='recusado' and atendimento_id is null and registrado_em is not null
   and motivo_recusa in ('tutor_cancelou','nao_compareceu','coleta_nao_realizada','outro')
   and ((motivo_recusa='outro' and length(btrim(coalesce(justificativa_outro,''))) between 1 and 200)
    or (motivo_recusa<>'outro' and justificativa_outro is null)))
);

create index programacao_status_data on public.programacao(data_programada,status);

-- Dados integrais do agendamento devem acompanhar o atendimento quando ele inicia na recepção.
alter table public.atendimentos
  add column agendamento_id uuid unique references public.solicitacoes_agendamento(id) on delete set null,
  add column porte varchar(7),
  add column cep char(8),
  add column rua varchar(180),
  add column numero varchar(20),
  add column complemento varchar(180),
  add column bairro varchar(120),
  add column cidade varchar(120),
  add column uf char(2);

-- Pedidos online aprovados não possuem horário específico; entrada manual agendada segue exigindo horário.
alter table public.atendimentos drop constraint horario_agendado_valido;
alter table public.atendimentos add constraint horario_agendado_valido
  check (not agendado or horario_agendado is not null or agendamento_id is not null);

-- Apenas autorização administrativa ou operacional permite consultar a programação aprovada.
-- A tabela de pedidos pendentes continua privada do administrador.
create function app_private.listar_programacao_entrada_interna(p_data date)
returns table (
  programacao_id uuid, solicitacao_id uuid, data_programada date,
  status varchar(18), motivo_recusa varchar(24), justificativa_outro varchar(200),
  atendimento_id uuid, registrado_em timestamptz,
  tutor_nome varchar(120), pet_nome varchar(120), porte varchar(7), servico_id uuid,
  cep char(8), rua varchar(180), numero varchar(20), complemento varchar(180),
  bairro varchar(120), cidade varchar(120), uf char(2)
)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select auth.uid()) is null or not (
    exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
    or exists(select 1 from public.app_operadores o where o.user_id=(select auth.uid()))
  ) then
    raise exception 'Perfil sem acesso a programacao' using errcode='42501';
  end if;
  if p_data is null or p_data < v_hoje or p_data > v_hoje+30 then
    raise exception 'Consulta permitida apenas entre hoje e os proximos 30 dias';
  end if;
  return query
  select p.id,p.solicitacao_id,p.data_programada,p.status,p.motivo_recusa,
    p.justificativa_outro,p.atendimento_id,p.registrado_em,
    s.tutor_nome,s.pet_nome,s.porte,s.servico_id,s.cep,s.rua,s.numero,
    s.complemento,s.bairro,s.cidade,s.uf
  from public.programacao p
    join public.solicitacoes_agendamento s on s.id=p.solicitacao_id
  where p.data_programada=p_data and s.status='aprovado'
  order by s.pet_nome,p.incluido_em;
end; $$;

-- Check-in atômico: nunca coloca reserva futura na fila, nem duplica entradas.
create function app_private.registrar_entrada_programada_interna(p_programacao_id uuid)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_programa public.programacao%rowtype;
declare v_solicita public.solicitacoes_agendamento%rowtype;
declare v_atendimento uuid;
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select auth.uid()) is null or not (
    exists(select 1 from public.app_admins where user_id=(select auth.uid()))
    or exists(select 1 from public.app_operadores where user_id=(select auth.uid()))
  ) then
    raise exception 'Perfil sem permissao para registrar entrada' using errcode='42501';
  end if;
  select * into v_programa from public.programacao
    where id=p_programacao_id for update;
  if not found or v_programa.status<>'programado' then
    raise exception 'Agendamento indisponivel ou ja processado';
  end if;
  if v_programa.data_programada<>v_hoje then
    raise exception 'A entrada so pode ser realizada na data programada';
  end if;
  select * into v_solicita from public.solicitacoes_agendamento
    where id=v_programa.solicitacao_id and status='aprovado';
  if not found then raise exception 'Solicitacao aprovada nao encontrada'; end if;

  insert into public.atendimentos(
    animal_nome,tutor,servico_id,agendado,horario_agendado,agendamento_id,
    porte,cep,rua,numero,complemento,bairro,cidade,uf
  )
  values (
    v_solicita.pet_nome,v_solicita.tutor_nome,v_solicita.servico_id,true,null,
    v_solicita.id,v_solicita.porte,v_solicita.cep,v_solicita.rua,v_solicita.numero,
    v_solicita.complemento,v_solicita.bairro,v_solicita.cidade,v_solicita.uf
  ) returning id into v_atendimento;

  update public.programacao
  set status='entrada_realizada',atendimento_id=v_atendimento,
      registrado_em=now(),registrado_por=(select auth.uid())
  where id=p_programacao_id;

  return v_atendimento;
end; $$;

-- Recusa operacional: a justificativa é obrigatória e nunca é apagada imediatamente.
-- Recusa administrativa de solicitação PENDENTE continua seguindo a regra anterior: exclusão.
create function app_private.recusar_entrada_programada_interna(
  p_programacao_id uuid, p_motivo text, p_outro text default null
) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_programa public.programacao%rowtype;
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
declare v_outro text := nullif(btrim(coalesce(p_outro,'')),'');
begin
  if (select auth.uid()) is null or not (
    exists(select 1 from public.app_admins where user_id=(select auth.uid()))
    or exists(select 1 from public.app_operadores where user_id=(select auth.uid()))
  ) then
    raise exception 'Perfil sem permissao para recusar entrada' using errcode='42501';
  end if;

  if p_motivo is null or p_motivo not in
    ('tutor_cancelou','nao_compareceu','coleta_nao_realizada','outro') then
    raise exception 'Selecione uma justificativa valida';
  end if;
  if p_motivo='outro' and (v_outro is null or length(v_outro)>200) then
    raise exception 'Informe a justificativa Outro com ate 200 caracteres';
  end if;
  if p_motivo<>'outro' and v_outro is not null then
    raise exception 'Justificativa adicional so e aceita para Outro';
  end if;

  select * into v_programa from public.programacao
    where id=p_programacao_id for update;
  if not found or v_programa.status<>'programado' then
    raise exception 'Agendamento indisponivel ou ja processado';
  end if;
  if v_programa.data_programada<>v_hoje then
    raise exception 'A recusa operacional deve ocorrer na data programada';
  end if;
  update public.programacao
    set status='recusado',motivo_recusa=p_motivo,
      justificativa_outro=case when p_motivo='outro' then v_outro else null end,
      registrado_em=now(),registrado_por=(select auth.uid())
  where id=p_programacao_id;
end; $$;

revoke all on function app_private.listar_programacao_entrada_interna(date) from public,anon;
revoke all on function app_private.registrar_entrada_programada_interna(uuid) from public,anon;
revoke all on function app_private.recusar_entrada_programada_interna(uuid,text,text) from public,anon;
grant execute on function app_private.listar_programacao_entrada_interna(date) to authenticated;
grant execute on function app_private.registrar_entrada_programada_interna(uuid) to authenticated;
grant execute on function app_private.recusar_entrada_programada_interna(uuid,text,text) to authenticated;

-- RPCs públicas invoker são os únicos pontos de entrada do frontend.
create function public.listar_programacao_entrada(p_data date)
returns table (
  programacao_id uuid, solicitacao_id uuid, data_programada date,
  status varchar(18), motivo_recusa varchar(24), justificativa_outro varchar(200),
  atendimento_id uuid, registrado_em timestamptz,
  tutor_nome varchar(120), pet_nome varchar(120), porte varchar(7), servico_id uuid,
  cep char(8), rua varchar(180), numero varchar(20), complemento varchar(180),
  bairro varchar(120), cidade varchar(120), uf char(2)
)
language sql security invoker set search_path=public,pg_temp
as $$ select * from app_private.listar_programacao_entrada_interna(p_data); $$;

create function public.registrar_entrada_programada(p_programacao_id uuid)
returns uuid language sql security invoker set search_path=public,pg_temp
as $$ select app_private.registrar_entrada_programada_interna(p_programacao_id); $$;

create function public.recusar_entrada_programada(
  p_programacao_id uuid,p_motivo text,p_outro text default null
) returns void language sql security invoker set search_path=public,pg_temp
as $$ select app_private.recusar_entrada_programada_interna(p_programacao_id,p_motivo,p_outro); $$;

revoke all on function public.listar_programacao_entrada(date) from public,anon;
revoke all on function public.registrar_entrada_programada(uuid) from public,anon;
revoke all on function public.recusar_entrada_programada(uuid,text,text) from public,anon;
grant execute on function public.listar_programacao_entrada(date) to authenticated;
grant execute on function public.registrar_entrada_programada(uuid) to authenticated;
grant execute on function public.recusar_entrada_programada(uuid,text,text) to authenticated;
