-- V1.4 | Dois perfis: administrador e conta operacional unica
-- Destino exclusivo: Supabase Bolhas e Latidos / owvbaruywsmiiduqlrbj
-- App_admins permanece inalterado, protegendo a conta existente.

create table if not exists public.app_operadores (
  vaga smallint primary key default 1 check (vaga = 1),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.app_operadores enable row level security;
revoke all on public.app_operadores from anon, authenticated;
grant select on public.app_operadores to authenticated;
create policy "operador_visualiza_proprio_perfil"
  on public.app_operadores for select to authenticated
  using (user_id = (select auth.uid()));

-- A conta operacional ve dados da operacao mas nao altera cadastros.
create policy "operador_servicos_leitura"
  on public.servicos for select to authenticated
  using (exists (
    select 1 from public.app_operadores o where o.user_id = (select auth.uid())
  ));
create policy "operador_profissionais_leitura"
  on public.profissionais for select to authenticated
  using (exists (
    select 1 from public.app_operadores o where o.user_id = (select auth.uid())
  ));
create policy "operador_atendimentos_leitura"
  on public.atendimentos for select to authenticated
  using (exists (
    select 1 from public.app_operadores o where o.user_id = (select auth.uid())
  ));
create policy "operador_atendimentos_entrada"
  on public.atendimentos for insert to authenticated
  with check (
    exists (select 1 from public.app_operadores o where o.user_id = (select auth.uid()))
    and status = 'aguardando'
    and profissional_id is null and iniciado_em is null and concluido_em is null
  );

-- Permitir somente os campos do formulario na insercao: nenhuma conta
-- autenticada pode forjar timestamps ou status via API direta.
revoke insert on public.atendimentos from authenticated;
grant insert (animal_nome,tutor,servico_id,agendado,horario_agendado,observacao,foto_path)
  on public.atendimentos to authenticated;

-- Fotos: bucket continua privado, com leitura/upload por contas autorizadas.
create policy "operador_fotos_leitura"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos-atendimentos'
    and exists (select 1 from public.app_operadores o where o.user_id=(select auth.uid()))
  );
create policy "operador_fotos_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-atendimentos'
    and exists (select 1 from public.app_operadores o where o.user_id=(select auth.uid()))
  );
-- Somente a foto enviada pela propria conta e sem referencia em atendimento
-- pode ser eliminada pelo operacional (limpeza de falha de cadastro).
create policy "operador_fotos_desfazer_envio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-atendimentos'
    and owner_id = (select auth.uid())::text
    and exists (select 1 from public.app_operadores o where o.user_id=(select auth.uid()))
    and not exists (select 1 from public.atendimentos a where a.foto_path=storage.objects.name)
  );

-- Funcoes internas privilegiadas nao estao na Data API. A operacao
-- valida usuario e transicao atomicamente, evitando dupla atribuicao.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create function app_private.iniciar_atendimento_seguro(
  p_atendimento_id uuid, p_profissional_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or not (
    exists(select 1 from public.app_admins where user_id=(select auth.uid()))
    or exists(select 1 from public.app_operadores where user_id=(select auth.uid()))
  ) then
    raise exception 'Usuario sem autorizacao para iniciar atendimento'
      using errcode = '42501';
  end if;
  update public.atendimentos a
  set status='em_execucao', profissional_id=p_profissional_id, iniciado_em=now()
  where a.id=p_atendimento_id and a.status='aguardando'
    and exists(select 1 from public.profissionais p where p.id=p_profissional_id and p.ativo)
  returning a.id into v_id;
  if v_id is null then
    raise exception 'Atendimento indisponivel ou profissional inativo';
  end if;
end;
$$;

create function app_private.finalizar_atendimento_seguro(
  p_atendimento_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or not (
    exists(select 1 from public.app_admins where user_id=(select auth.uid()))
    or exists(select 1 from public.app_operadores where user_id=(select auth.uid()))
  ) then
    raise exception 'Usuario sem autorizacao para finalizar atendimento'
      using errcode = '42501';
  end if;
  update public.atendimentos a
  set status='concluido', concluido_em=now()
  where a.id=p_atendimento_id and a.status='em_execucao'
  returning a.id into v_id;
  if v_id is null then
    raise exception 'Atendimento nao esta em execucao';
  end if;
end;
$$;

revoke all on function app_private.iniciar_atendimento_seguro(uuid,uuid) from public,anon;
revoke all on function app_private.finalizar_atendimento_seguro(uuid) from public,anon;
grant execute on function app_private.iniciar_atendimento_seguro(uuid,uuid) to authenticated;
grant execute on function app_private.finalizar_atendimento_seguro(uuid) to authenticated;

-- Mantem contratos das RPCs ja utilizadas pelo JavaScript.
create or replace function public.iniciar_atendimento(
  p_atendimento_id uuid, p_profissional_id uuid
) returns void
language sql security invoker
set search_path = public, pg_temp
as $$
  select app_private.iniciar_atendimento_seguro(p_atendimento_id,p_profissional_id);
$$;
create or replace function public.finalizar_atendimento(
  p_atendimento_id uuid
) returns void
language sql security invoker
set search_path = public, pg_temp
as $$
  select app_private.finalizar_atendimento_seguro(p_atendimento_id);
$$;

revoke all on function public.iniciar_atendimento(uuid,uuid) from public,anon;
revoke all on function public.finalizar_atendimento(uuid) from public,anon;
grant execute on function public.iniciar_atendimento(uuid,uuid) to authenticated;
grant execute on function public.finalizar_atendimento(uuid) to authenticated;

-- Inserir a conta operacional somente apos criacao em Supabase Auth:
-- insert into public.app_operadores(vaga,user_id)
-- values (1, 'UID_DA_CONTA_OPERACIONAL')
-- on conflict (vaga) do update set user_id=excluded.user_id;
