-- V2.3 | Etapas operacionais e auditoria, com isolamento financeiro.
-- Apenas novos atendimentos recebem etapas automaticamente. Históricos não são reconstruídos.
create table public.atendimento_etapas (
 id uuid primary key default gen_random_uuid(),
 atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
 tipo text not null check (tipo in ('principal','adicional')),
 nome varchar(120) not null,
 adicional_id uuid references public.catalogo_adicionais(id),
 ordem smallint not null default 1,
 status text not null default 'aguardando' check(status in ('aguardando','em_execucao','concluido')),
 iniciado_em timestamptz,
 concluido_em timestamptz,
 criado_em timestamptz not null default now(),
 unique(atendimento_id,tipo,ordem),
 constraint etapas_datas check(concluido_em is null or (iniciado_em is not null and concluido_em>=iniciado_em))
);
create index etapas_pai_idx on public.atendimento_etapas(atendimento_id,status);
create table public.etapa_profissionais (
 etapa_id uuid not null references public.atendimento_etapas(id) on delete cascade,
 profissional_id uuid not null references public.profissionais(id),
 papel text not null check(papel in ('previsto','em_execucao','confirmado')),
 vinculado_em timestamptz not null default now(),
 primary key(etapa_id,profissional_id,papel)
);
create index etapa_profissionais_indice on public.etapa_profissionais(profissional_id,papel);
create table public.etapa_valores (
 etapa_id uuid primary key references public.atendimento_etapas(id) on delete cascade,
 peso_pacote integer not null default 100 check(peso_pacote between 0 and 100),
 valor_centavos integer check(valor_centavos is null or valor_centavos>=0),
 cobertura text not null default 'pendente' check(cobertura in ('pendente','completo','parcial','sob_consulta','sem_dados')),
 atualizado_em timestamptz not null default now()
);
create table public.etapa_rateios (
 etapa_id uuid not null references public.atendimento_etapas(id) on delete cascade,
 profissional_id uuid not null references public.profissionais(id),
 percentual integer not null check (percentual between 0 and 100),
 valor_centavos integer check(valor_centavos is null or valor_centavos>=0),
 primary key(etapa_id,profissional_id)
);
create table public.fichas_conferencia (
 atendimento_id uuid primary key references public.atendimentos(id) on delete cascade,
 conferido_em timestamptz not null default now(),
 conferido_por uuid not null references auth.users(id)
);
create table public.etapa_auditoria (
 id bigint generated always as identity primary key,
 atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
 etapa_id uuid references public.atendimento_etapas(id) on delete cascade,
 evento text not null,
 anterior jsonb,
 posterior jsonb,
 justificativa varchar(500) not null,
 administrador_id uuid not null references auth.users(id),
 registrado_em timestamptz not null default now()
);
create index etapa_auditoria_atendimento on public.etapa_auditoria(atendimento_id,registrado_em desc);
-- Todos os registros operacionais consultáveis pelos dois perfis, sem qualquer valor.
alter table public.atendimento_etapas enable row level security;
alter table public.etapa_profissionais enable row level security;
alter table public.etapa_valores enable row level security;
alter table public.etapa_rateios enable row level security;
alter table public.fichas_conferencia enable row level security;
alter table public.etapa_auditoria enable row level security;
revoke all on public.atendimento_etapas,public.etapa_profissionais,public.etapa_valores,
 public.etapa_rateios,public.fichas_conferencia,public.etapa_auditoria from public,anon,authenticated;
grant select on public.atendimento_etapas,public.etapa_profissionais to authenticated;
grant select on public.etapa_valores,public.etapa_rateios,public.fichas_conferencia,public.etapa_auditoria to authenticated;
create policy equipe_etapas on public.atendimento_etapas for select to authenticated
 using(exists(select 1 from public.app_admins where user_id=(select auth.uid()))
   or exists(select 1 from public.app_operadores where user_id=(select auth.uid())));
create policy equipe_etapas_prof on public.etapa_profissionais for select to authenticated
 using(exists(select 1 from public.app_admins where user_id=(select auth.uid()))
   or exists(select 1 from public.app_operadores where user_id=(select auth.uid())));
create policy admin_etapa_valores on public.etapa_valores for select to authenticated
 using(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_etapa_rateios on public.etapa_rateios for select to authenticated
 using(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_fichas_conferencia on public.fichas_conferencia for select to authenticated
 using(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_etapa_auditoria on public.etapa_auditoria for select to authenticated
 using(exists(select 1 from public.app_admins where user_id=(select auth.uid())));

create function app_private.equipe_v23() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and (
 exists(select 1 from public.app_admins where user_id=auth.uid())
 or exists(select 1 from public.app_operadores where user_id=auth.uid()));
$$;
create function app_private.admin_v23() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.app_admins where user_id=auth.uid());
$$;
revoke all on function app_private.equipe_v23(),app_private.admin_v23() from public,anon,authenticated;

-- Uma ficha de banho+tosa tem duas etapas. Serviços somente de banho/tosa isolados
-- têm uma etapa. Cada adicional é tarefa independente. Nenhum preço aqui.
create function app_private.criar_etapas_v23() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s_name text; a record; e_id uuid; i smallint:=0; second_name text; 
begin
 select nome into s_name from public.servicos where id=new.servico_id;
 if s_name is null then raise exception 'Serviço inexistente';end if;
 if lower(s_name) like '%banho%' and lower(s_name) like '%tosa%' then
   insert into public.atendimento_etapas(atendimento_id,tipo,nome,ordem)
    values(new.id,'principal','Banho',1) returning id into e_id;
   insert into public.etapa_valores(etapa_id,peso_pacote) values(e_id,50);
   second_name := case
     when lower(s_name) like '%máquina%' or lower(s_name) like '%maquina%' then 'Tosa na Máquina'
     when lower(s_name) like '%tesoura%' then 'Tosa na Tesoura'
     when lower(s_name) like '%higi%' then 'Tosa Higiênica'
     else 'Tosa' end;
   insert into public.atendimento_etapas(atendimento_id,tipo,nome,ordem)
    values(new.id,'principal',second_name,2) returning id into e_id;
   insert into public.etapa_valores(etapa_id,peso_pacote) values(e_id,50);
 else
   insert into public.atendimento_etapas(atendimento_id,tipo,nome,ordem)
    values(new.id,'principal',s_name,1) returning id into e_id;
   insert into public.etapa_valores(etapa_id,peso_pacote) values(e_id,100);
 end if;
 for a in select id,nome from public.catalogo_adicionais where id=any(coalesce(new.adicionais,array[]::uuid[]))
 loop
   i:=i+1;
   insert into public.atendimento_etapas(atendimento_id,tipo,nome,adicional_id,ordem)
    values(new.id,'adicional',a.nome,a.id,i) returning id into e_id;
   insert into public.etapa_valores(etapa_id,peso_pacote) values(e_id,100);
 end loop;
 return new;
end;
$$;
revoke all on function app_private.criar_etapas_v23() from public,anon,authenticated;
create trigger trg_criar_etapas_v23 after insert on public.atendimentos
 for each row execute function app_private.criar_etapas_v23();

-- RPC para planejamento na recepção. Pode ser chamada após criar o atendimento.
create function public.planejar_etapa_v23(p_etapa_id uuid,p_profissionais uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.atendimento_etapas%rowtype;
begin
 if not app_private.equipe_v23() then raise exception 'Sem autorização' using errcode='42501';end if;
 select * into e from public.atendimento_etapas where id=p_etapa_id for update;
 if not found or e.status<>'aguardando' then raise exception 'Atividade não pode ser planejada';end if;
 if cardinality(coalesce(p_profissionais,array[]::uuid[]))>8 or
   (select count(*) from unnest(coalesce(p_profissionais,array[]::uuid[])) x) <>
   (select count(distinct x) from unnest(coalesce(p_profissionais,array[]::uuid[])) x)
   then raise exception 'Lista de profissionais inválida';end if;
 if exists(select 1 from unnest(coalesce(p_profissionais,array[]::uuid[])) x
   where not exists(select 1 from public.profissionais p where p.id=x and p.ativo))
   then raise exception 'Profissional inválido ou inativo';end if;
 delete from public.etapa_profissionais where etapa_id=e.id and papel='previsto';
 insert into public.etapa_profissionais(etapa_id,profissional_id,papel)
  select e.id,x,'previsto' from unnest(coalesce(p_profissionais,array[]::uuid[])) x;
end $$;
revoke all on function public.planejar_etapa_v23(uuid,uuid[]) from public,anon;
grant execute on function public.planejar_etapa_v23(uuid,uuid[]) to authenticated;

-- Iniciar uma atividade com 1 ou mais profissionais, independentemente do plano.
create function public.iniciar_etapa_v23(p_etapa_id uuid,p_profissionais uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.atendimento_etapas%rowtype; n integer;
begin
 if not app_private.equipe_v23() then raise exception 'Sem autorização' using errcode='42501';end if;
 select * into e from public.atendimento_etapas where id=p_etapa_id for update;
 if not found or e.status<>'aguardando' then raise exception 'Atividade não está aguardando';end if;
 n:=cardinality(coalesce(p_profissionais,array[]::uuid[]));
 if n<1 or n>8 or n<>(select count(distinct x) from unnest(p_profissionais) x)
   then raise exception 'Selecione de 1 a 8 profissionais sem repetição';end if;
 if exists(select 1 from unnest(p_profissionais) x where not exists
   (select 1 from public.profissionais p where p.id=x and p.ativo))
   then raise exception 'Profissional inválido ou inativo';end if;
 insert into public.etapa_profissionais(etapa_id,profissional_id,papel)
   select e.id,x,'em_execucao' from unnest(p_profissionais) x;
 update public.atendimento_etapas set status='em_execucao',iniciado_em=now() where id=e.id;
 update public.atendimentos a set
   status='em_execucao', iniciado_em=coalesce(a.iniciado_em,now())
   where a.id=e.atendimento_id and a.status='aguardando';
end $$;
revoke all on function public.iniciar_etapa_v23(uuid,uuid[]) from public,anon;
grant execute on function public.iniciar_etapa_v23(uuid,uuid[]) to authenticated;

-- Concluir uma atividade após confirmação explícita dos executores reais.
create function public.finalizar_etapa_v23(p_etapa_id uuid,p_profissionais uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.atendimento_etapas%rowtype; n integer;
begin
 if not app_private.equipe_v23() then raise exception 'Sem autorização' using errcode='42501';end if;
 select * into e from public.atendimento_etapas where id=p_etapa_id for update;
 if not found or e.status<>'em_execucao' then raise exception 'Atividade não está em execução';end if;
 n:=cardinality(coalesce(p_profissionais,array[]::uuid[]));
 if n<1 or n>8 or n<>(select count(distinct x) from unnest(p_profissionais) x)
   then raise exception 'Confirme de 1 a 8 executores reais, sem repetição';end if;
 if exists(select 1 from unnest(p_profissionais) x where not exists
  (select 1 from public.profissionais where id=x))
  then raise exception 'Executor inexistente';end if;
 delete from public.etapa_profissionais where etapa_id=e.id and papel='confirmado';
 insert into public.etapa_profissionais(etapa_id,profissional_id,papel)
   select e.id,x,'confirmado' from unnest(p_profissionais) x;
 update public.atendimento_etapas set status='concluido',concluido_em=now() where id=e.id;
 if not exists(select 1 from public.atendimento_etapas where atendimento_id=e.atendimento_id and status<>'concluido') then
   update public.atendimentos set status='concluido',concluido_em=now()
     where id=e.atendimento_id and status='em_execucao';
 end if;
end $$;
revoke all on function public.finalizar_etapa_v23(uuid,uuid[]) from public,anon;
grant execute on function public.finalizar_etapa_v23(uuid,uuid[]) to authenticated;

-- Não permitir que a interface antiga pule as etapas recém-criadas.
create or replace function public.iniciar_atendimento(p_atendimento_id uuid,p_profissional_id uuid)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.atendimento_etapas where atendimento_id=p_atendimento_id) then
   raise exception 'Utilize a execução por atividades para este animal';
 end if;
 perform app_private.iniciar_atendimento_seguro(p_atendimento_id,p_profissional_id);
end $$;
create or replace function public.finalizar_atendimento(p_atendimento_id uuid)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.atendimento_etapas where atendimento_id=p_atendimento_id) then
   raise exception 'Conclua individualmente todas as atividades';
 end if;
 perform app_private.finalizar_atendimento_seguro(p_atendimento_id);
end $$;
