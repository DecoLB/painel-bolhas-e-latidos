-- Bolhas & Latidos | Migração inicial do MVP
-- EXECUTAR SOMENTE NO PROJETO SUPABASE "Bolhas e Latidos".
-- Contém RLS; somente usuários previamente autorizados em app_admins têm acesso.
create extension if not exists pgcrypto;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome varchar(100) not null check(length(btrim(nome))>0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists servicos_nome_unico on public.servicos(lower(nome));

create table if not exists public.profissionais (
  id uuid primary key default gen_random_uuid(),
  sigla varchar(12) not null check(length(btrim(sigla))>0),
  nome varchar(100) not null check(length(btrim(nome))>0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists profissionais_sigla_unica on public.profissionais(lower(sigla));

create table if not exists public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  animal_nome varchar(120) not null check(length(btrim(animal_nome))>0),
  tutor varchar(150),
  servico_id uuid not null references public.servicos(id) on delete restrict,
  agendado boolean not null,
  horario_agendado time,
  observacao varchar(1000),
  foto_path text,
  status text not null default 'aguardando' check(status in ('aguardando','em_execucao','concluido')),
  profissional_id uuid references public.profissionais(id) on delete restrict,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  constraint horario_agendado_valido check(not agendado or horario_agendado is not null),
  constraint transicoes_consistentes check(
    (status='aguardando' and profissional_id is null and iniciado_em is null and concluido_em is null)
    or (status='em_execucao' and profissional_id is not null and iniciado_em is not null and concluido_em is null)
    or (status='concluido' and profissional_id is not null and iniciado_em is not null and concluido_em is not null)
  ),
  constraint horarios_consistentes check(
    (iniciado_em is null or iniciado_em >= criado_em)
    and (concluido_em is null or (iniciado_em is not null and concluido_em >= iniciado_em))
  )
);
create index if not exists atendimentos_status_criado on public.atendimentos(status,criado_em);
create index if not exists atendimentos_conclusao on public.atendimentos(concluido_em);
create index if not exists atendimentos_expiracao on public.atendimentos(criado_em) where status='concluido';

-- Acesso à Data API só para autenticados; RLS restringe aos administradores autorizados.\ngrant usage on schema public to authenticated;\ngrant select on public.app_admins to authenticated;\ngrant select, insert, update on public.servicos, public.profissionais, public.atendimentos to authenticated;\n\nalter table public.app_admins enable row level security;
alter table public.servicos enable row level security;
alter table public.profissionais enable row level security;
alter table public.atendimentos enable row level security;

-- app_admins só pode ser populada por gestor de projeto/service role pelo SQL Editor.
create policy "admins_leem_proprio_vinculo" on public.app_admins
  for select to authenticated using (user_id=(select auth.uid()));

create policy "admins_servicos_select" on public.servicos
  for select to authenticated
  using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_servicos_insert" on public.servicos
  for insert to authenticated
  with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_servicos_update" on public.servicos
  for update to authenticated
  using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())))
  with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));

create policy "admins_profissionais_select" on public.profissionais
  for select to authenticated
  using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_profissionais_insert" on public.profissionais
  for insert to authenticated
  with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_profissionais_update" on public.profissionais
  for update to authenticated
  using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())))
  with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));

create policy "admins_atendimentos_select" on public.atendimentos
  for select to authenticated
  using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_atendimentos_insert" on public.atendimentos
  for insert to authenticated
  with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_atendimentos_update" on public.atendimentos
  for update to authenticated
  using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())))
  with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));

-- Bucket privado: arquivos de fotos não devem ser acessíveis anonimamente.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fotos-atendimentos','fotos-atendimentos',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false;

create policy "admins_fotos_select" on storage.objects
  for select to authenticated
  using(bucket_id='fotos-atendimentos' and exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_fotos_insert" on storage.objects
  for insert to authenticated
  with check(bucket_id='fotos-atendimentos' and exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admins_fotos_delete" on storage.objects
  for delete to authenticated
  using(bucket_id='fotos-atendimentos' and exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));

-- Validação atômica da troca de estado: uma chamada pode assumir o registro.
create or replace function public.iniciar_atendimento(
  p_atendimento_id uuid, p_profissional_id uuid
) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  update public.atendimentos a
  set status='em_execucao', profissional_id=p_profissional_id, iniciado_em=now()
  where a.id=p_atendimento_id and a.status='aguardando'
    and exists(select 1 from public.profissionais p where p.id=p_profissional_id and p.ativo)
  returning a.id into v_id;
  if v_id is null then
    raise exception 'Atendimento indisponível ou profissional não ativo';
  end if;
end; $$;

create or replace function public.finalizar_atendimento(
  p_atendimento_id uuid
) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  update public.atendimentos a
  set status='concluido', concluido_em=now()
  where a.id=p_atendimento_id and a.status='em_execucao'
  returning a.id into v_id;
  if v_id is null then
    raise exception 'Atendimento não está mais em execução';
  end if;
end; $$;

revoke all on function public.iniciar_atendimento(uuid,uuid) from public,anon;
revoke all on function public.finalizar_atendimento(uuid) from public,anon;
grant execute on function public.iniciar_atendimento(uuid,uuid) to authenticated;
grant execute on function public.finalizar_atendimento(uuid) to authenticated;

-- Expira dados anteriores aos sete dias do calendário de Brasília, incluindo o atual.
create or replace function public.retention_cutoff()
returns timestamptz
language sql stable security invoker
set search_path=public,pg_temp
as $$
  select ((timezone('America/Sao_Paulo',now())::date - 6)::timestamp
          at time zone 'America/Sao_Paulo');
$$;
revoke all on function public.retention_cutoff() from public,anon;
grant execute on function public.retention_cutoff() to service_role;

-- Publica mudanças para outras abas/dispositivos já autenticados.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='atendimentos') then
      alter publication supabase_realtime add table public.atendimentos;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='servicos') then
      alter publication supabase_realtime add table public.servicos;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profissionais') then
      alter publication supabase_realtime add table public.profissionais;
    end if;
  end if;
end $$;

insert into public.servicos(nome)
values ('Banho'),('Banho com Tosa Higiênica'),('Banho com Tosa na Máquina'),('Banho e Tosa na Tesoura')
on conflict do nothing;

insert into public.profissionais(sigla,nome)
values ('Ro','Rosana'),('V','Vitor'),('D','Eduarda (Duda)'),('Outros','Freelancers'),('AR','Ariana')
on conflict do nothing;

-- Próxima etapa MANUAL: criar usuário admin em Authentication e adicionar seu UUID:
-- insert into public.app_admins(user_id) values('UUID_DO_USUARIO');
