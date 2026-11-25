-- Bolhas & Latidos V1.5: solicitação pública e programação administrativa
-- Apenas a Edge Function autenticada via service_role pode inserir pedido público.
create table public.solicitacoes_agendamento (
  id uuid primary key default gen_random_uuid(),
  tutor_nome varchar(120) not null check (length(btrim(tutor_nome)) > 0),
  pet_nome varchar(120) not null check (length(btrim(pet_nome)) > 0),
  porte varchar(7) not null check (porte in ('pequeno','medio','grande')),
  servico_id uuid not null references public.servicos(id) on delete restrict,
  data_desejada date not null,
  cep char(8) not null check (cep ~ '^[0-9]{8}$'),
  rua varchar(180) not null check (length(btrim(rua)) > 0),
  numero varchar(20) not null check (length(btrim(numero)) > 0),
  complemento varchar(180),
  bairro varchar(120),
  cidade varchar(120) not null check (length(btrim(cidade)) > 0),
  uf char(2) not null check (uf ~ '^[A-Z]{2}$'),
  status varchar(8) not null default 'pendente' check (status in ('pendente','aprovado')),
  criado_em timestamptz not null default now(),
  aprovado_em timestamptz,
  check ((status='pendente' and aprovado_em is null) or (status='aprovado' and aprovado_em is not null))
);
create index solicitacoes_agendamento_data_status on public.solicitacoes_agendamento (data_desejada,status);
create index solicitacoes_agendamento_criado_em on public.solicitacoes_agendamento (criado_em);

create table public.programacao (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null unique references public.solicitacoes_agendamento(id) on delete cascade,
  data_programada date not null,
  incluido_em timestamptz not null default now()
);
create index programacao_data on public.programacao (data_programada);

-- Janela de amanhã a 30 dias (fuso de Brasília) validada no banco.
create function public.validar_data_agendamento() returns trigger
language plpgsql security invoker set search_path = public,pg_temp
as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if NEW.data_desejada < (v_hoje+1) or NEW.data_desejada > (v_hoje+30) then
    raise exception 'A data deve estar entre amanha e 30 dias a frente';
  end if;
  return NEW;
end;
$$;
create trigger validar_janela_agendamento
before insert or update of data_desejada on public.solicitacoes_agendamento
for each row execute function public.validar_data_agendamento();

alter table public.solicitacoes_agendamento enable row level security;
alter table public.programacao enable row level security;
revoke all on public.solicitacoes_agendamento, public.programacao from public,anon,authenticated;
grant select on public.solicitacoes_agendamento, public.programacao to authenticated;
create policy "administradores_consultam_solicitacoes" on public.solicitacoes_agendamento
  for select to authenticated
  using (exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy "administradores_consultam_programacao" on public.programacao
  for select to authenticated
  using (exists(select 1 from public.app_admins where user_id=(select auth.uid())));

-- Para modificar um pedido, o usuário autenticado DEVE constar em app_admins.
-- A função é SECURITY DEFINER apenas para viabilizar a transação atômica;
-- sem validação por auth.uid() não executa nenhuma ação.
create function public.aprovar_solicitacao_agendamento(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_dia date;
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select auth.uid()) is null or
     not exists (select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'Apenas administradores podem aprovar agendamentos' using errcode='42501';
  end if;

  update public.solicitacoes_agendamento
  set status='aprovado', aprovado_em=now()
  where id=p_id and status='pendente'
    and data_desejada between (v_hoje + 1) and (v_hoje + 30)
  returning data_desejada into v_dia;

  if v_dia is null then
    raise exception 'Solicitacao nao encontrada, ja analisada ou fora da janela permitida';
  end if;

  insert into public.programacao(solicitacao_id,data_programada)
    values(p_id,v_dia);
end;
$$;

create function public.recusar_solicitacao_agendamento(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or
     not exists (select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'Apenas administradores podem recusar agendamentos' using errcode='42501';
  end if;

  delete from public.solicitacoes_agendamento where id=p_id and status='pendente'
    returning id into v_id;
  if v_id is null then raise exception 'Solicitacao nao encontrada ou ja analisada'; end if;
end;
$$;

revoke all on function public.aprovar_solicitacao_agendamento(uuid) from public, anon;
revoke all on function public.recusar_solicitacao_agendamento(uuid) from public, anon;
grant execute on function public.aprovar_solicitacao_agendamento(uuid) to authenticated;
grant execute on function public.recusar_solicitacao_agendamento(uuid) to authenticated;

-- Limitação básica de abuso para o endpoint público (hash não reversível, sem IP puro).
create table app_private.agendamento_limites (
  fingerprint text not null,
  janela timestamptz not null,
  tentativas integer not null default 0,
  primary key(fingerprint,janela)
);
revoke all on app_private.agendamento_limites from public,anon,authenticated;
create function public.reservar_cota_agendamento(p_fingerprint text) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_total int;
begin
  if length(p_fingerprint) <> 64 then raise exception 'Hash invalido'; end if;
  insert into app_private.agendamento_limites(fingerprint,janela,tentativas)
    values (p_fingerprint,date_trunc('hour',now()),1)
    on conflict (fingerprint,janela) do update set tentativas=app_private.agendamento_limites.tentativas+1
    returning tentativas into v_total;
  delete from app_private.agendamento_limites where janela < now()-interval '48 hours';
  return v_total <= 6;
end;
$$;
revoke all on function public.reservar_cota_agendamento(text) from public,anon,authenticated;
grant execute on function public.reservar_cota_agendamento(text) to service_role;

-- Pré-aprovação não gera entrada física na fila.
-- Um registro aprovado tem referência garantida em programacao no mesmo commit.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='solicitacoes_agendamento') then
    alter publication supabase_realtime add table public.solicitacoes_agendamento;
  end if;
end $$;
