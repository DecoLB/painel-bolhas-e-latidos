-- V2.7.0 | Controle financeiro: referencia, cobertura, cobrança, recebimento e fechamento.
-- Sem comissão, sem reprecificação dos snapshots e sem presunção de recebimento.
create table if not exists public.financeiro_itens (
 id uuid primary key default gen_random_uuid(),
 atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
 chave text not null, tipo text not null check(tipo in ('principal','adicional','transporte')),
 descricao text not null,
 valor_referencia_centavos integer check(valor_referencia_centavos>=0),
 valor_corrigido_centavos integer check(valor_corrigido_centavos>=0),
 valor_cobrado_centavos integer check(valor_cobrado_centavos>=0),
 coberto_pacote boolean,
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now(),
 unique(atendimento_id,chave)
);
create index if not exists idx_fin_itens_atendimento on public.financeiro_itens(atendimento_id);
create table if not exists public.financeiro_pagamentos (
 id uuid primary key default gen_random_uuid(),
 atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
 valor_centavos integer not null check(valor_centavos>0),
 meio text not null check(meio in ('dinheiro','debito','credito','pix','outro')),
 recebido_em timestamptz not null,
 status text not null default 'confirmado' check(status in ('confirmado','cancelado')),
 criado_em timestamptz not null default now(),
 registrado_por uuid not null
);
create index if not exists idx_fin_pag_atendimento on public.financeiro_pagamentos(atendimento_id);
create index if not exists idx_fin_pag_dia on public.financeiro_pagamentos(recebido_em);
create table if not exists public.financeiro_conferencias (
 atendimento_id uuid primary key references public.atendimentos(id) on delete cascade,
 conferido_por uuid not null,
 conferido_em timestamptz not null default now()
);
create table if not exists public.financeiro_fechamentos (
 dia date primary key,
 status text not null default 'pendente' check(status in ('pendente','em_conferencia','fechado')),
 producao_centavos bigint,
 cobranca_prevista_centavos bigint,
 recebido_atendimentos_centavos bigint,
 pendente_centavos bigint,
 atualizado_por uuid,
 fechado_em timestamptz,
 atualizado_em timestamptz not null default now()
);
create table if not exists public.financeiro_auditoria (
 id bigint generated always as identity primary key,
 entidade text not null check(entidade in ('item','pagamento','conferencia','fechamento')),
 entidade_id text not null,
 atendimento_id uuid,
 dia date,
 evento text not null,
 anterior jsonb,
 posterior jsonb,
 justificativa text not null,
 administrador_id uuid not null,
 registrado_em timestamptz not null default now()
);
create index if not exists idx_fin_audit_dia on public.financeiro_auditoria(dia,registrado_em desc);
do $$
declare t text;
begin
 foreach t in array array['financeiro_itens','financeiro_pagamentos','financeiro_conferencias','financeiro_fechamentos','financeiro_auditoria'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
  execute format('grant select on table public.%I to authenticated',t);
  execute format('drop policy if exists financeiro_admin_select on public.%I',t);
  execute format('create policy financeiro_admin_select on public.%I for select to authenticated using (exists(select 1 from public.app_admins where user_id=(select auth.uid())))',t);
 end loop;
end $$;

create or replace function app_private.financeiro_require_admin() returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or not exists(select 1 from public.app_admins where user_id=uid)
 then raise exception 'Acesso financeiro exclusivo do Administrador' using errcode='42501'; end if;
 return uid;
end $$;
revoke all on function app_private.financeiro_require_admin() from public,anon;

create or replace function app_private.financeiro_reabrir(p_atendimento uuid,p_reason text,p_admin uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_dia date; old_row public.financeiro_fechamentos%rowtype;
begin
 delete from public.financeiro_conferencias where atendimento_id=p_atendimento;
 select (concluido_em at time zone 'America/Sao_Paulo')::date into v_dia from public.atendimentos where id=p_atendimento;
 if v_dia is null then return;end if;
 select * into old_row from public.financeiro_fechamentos where dia=v_dia for update;
 if found and old_row.status='fechado' then
  update public.financeiro_fechamentos
    set status='em_conferencia',fechado_em=null,producao_centavos=null,cobranca_prevista_centavos=null,
    recebido_atendimentos_centavos=null,pendente_centavos=null,atualizado_por=p_admin,atualizado_em=now()
    where dia=v_dia;
  insert into public.financeiro_auditoria(entidade,entidade_id,dia,evento,anterior,posterior,justificativa,administrador_id)
  values('fechamento',v_dia::text,v_dia,'reaberto_por_correcao',to_jsonb(old_row),
   jsonb_build_object('status','em_conferencia'),p_reason,p_admin);
 end if;
end $$;
revoke all on function app_private.financeiro_reabrir(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.financeiro_preparar_dia(p_dia date) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; rec record; inserted_count integer:=0; n integer;
begin
 uid:=app_private.financeiro_require_admin();
 if p_dia is null then raise exception 'Data obrigatória';end if;
 for rec in
  select a.*,v.valor_base_centavos, s.nome as servico_nome
  from public.atendimentos a
  left join public.producao_valores v on v.atendimento_id=a.id
  join public.servicos s on s.id=a.servico_id
  where a.status='concluido' and (a.concluido_em at time zone 'America/Sao_Paulo')::date=p_dia
 loop
  insert into public.financeiro_itens(atendimento_id,chave,tipo,descricao,valor_referencia_centavos,coberto_pacote)
  values(rec.id,'principal','principal',rec.servico_nome,rec.valor_base_centavos,
     case when rec.pacote_pre_pago is true then true when rec.pacote_pre_pago is false then false else null end)
  on conflict(atendimento_id,chave) do nothing;
  get diagnostics n=row_count;inserted_count:=inserted_count+n;
  insert into public.financeiro_itens(atendimento_id,chave,tipo,descricao,valor_referencia_centavos,coberto_pacote)
  select rec.id,'adicional:'||x.id::text,'adicional',coalesce(c.nome,'Adicional'),
     (select v.valor_centavos from public.atendimento_etapas e
      join public.etapa_valores v on v.etapa_id=e.id
      where e.atendimento_id=rec.id and e.tipo='adicional' and e.adicional_id=x.id
      order by e.ordem limit 1),
     case when rec.pacote_pre_pago is false then false else null end
  from unnest(coalesce(rec.adicionais,array[]::uuid[])) as x(id)
  left join public.catalogo_adicionais c on c.id=x.id
  on conflict(atendimento_id,chave) do nothing;
  get diagnostics n=row_count;inserted_count:=inserted_count+n;
  if rec.transporte_bolhas is true then
   insert into public.financeiro_itens(atendimento_id,chave,tipo,descricao,coberto_pacote)
   values(rec.id,'transporte','transporte','Transporte Bolhas & Latidos',
     case when rec.pacote_pre_pago is false then false else null end)
   on conflict(atendimento_id,chave) do nothing;
   get diagnostics n=row_count;inserted_count:=inserted_count+n;
  end if;
 end loop;
 insert into public.financeiro_fechamentos(dia,status,atualizado_por)
 values(p_dia,'pendente',uid) on conflict(dia) do nothing;
 return inserted_count;
end $$;
revoke all on function public.financeiro_preparar_dia(date) from public,anon;
grant execute on function public.financeiro_preparar_dia(date) to authenticated;

create or replace function public.financeiro_salvar_item(
 p_id uuid,p_corrigido integer,p_cobrado integer,p_coberto boolean,p_justificativa text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; before_row public.financeiro_itens%rowtype;after_row public.financeiro_itens%rowtype;d date;
begin
 uid:=app_private.financeiro_require_admin();
 if length(trim(coalesce(p_justificativa,'')))<8 or length(p_justificativa)>500
 then raise exception 'Justificativa obrigatória de 8 a 500 caracteres'; end if;
 if p_corrigido<0 or p_cobrado<0 or (p_coberto is true and p_cobrado>0)
 then raise exception 'Valores inválidos ou cobrança conflitante com item coberto';end if;
 select * into before_row from public.financeiro_itens where id=p_id for update;
 if not found then raise exception 'Componente financeiro inexistente'; end if;
 update public.financeiro_itens
 set valor_corrigido_centavos=p_corrigido,valor_cobrado_centavos=p_cobrado,
   coberto_pacote=p_coberto,atualizado_em=now()
 where id=p_id returning * into after_row;
 if to_jsonb(before_row)-'atualizado_em' is not distinct from to_jsonb(after_row)-'atualizado_em' then return;end if;
 perform app_private.financeiro_reabrir(before_row.atendimento_id,p_justificativa,uid);
 select (concluido_em at time zone 'America/Sao_Paulo')::date into d
 from public.atendimentos where id=before_row.atendimento_id;
 insert into public.financeiro_auditoria(entidade,entidade_id,atendimento_id,dia,evento,anterior,posterior,justificativa,administrador_id)
 values('item',p_id::text,before_row.atendimento_id,d,'correcao',to_jsonb(before_row),to_jsonb(after_row),trim(p_justificativa),uid);
end $$;
revoke all on function public.financeiro_salvar_item(uuid,integer,integer,boolean,text) from public,anon;
grant execute on function public.financeiro_salvar_item(uuid,integer,integer,boolean,text) to authenticated;

create or replace function public.financeiro_adicionar_transporte(p_atendimento uuid,p_justificativa text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;a record;row_id uuid;
begin
 uid:=app_private.financeiro_require_admin();
 if length(trim(coalesce(p_justificativa,'')))<8 then raise exception 'Justificativa obrigatória';end if;
 select id,concluido_em,pacote_pre_pago from public.atendimentos where id=p_atendimento and status='concluido' into a;
 if not found then raise exception 'Atendimento não concluído';end if;
 insert into public.financeiro_itens(atendimento_id,chave,tipo,descricao,coberto_pacote)
 values(p_atendimento,'transporte','transporte','Transporte Bolhas & Latidos',
  case when a.pacote_pre_pago is false then false else null end)
 on conflict(atendimento_id,chave) do nothing returning id into row_id;
 if row_id is null then raise exception 'Transporte já consta deste atendimento';end if;
 perform app_private.financeiro_reabrir(p_atendimento,p_justificativa,uid);
 insert into public.financeiro_auditoria(entidade,entidade_id,atendimento_id,dia,evento,posterior,justificativa,administrador_id)
 values('item',row_id::text,p_atendimento,(a.concluido_em at time zone 'America/Sao_Paulo')::date,
 'inclusao_transporte',jsonb_build_object('tipo','transporte'),trim(p_justificativa),uid);
end $$;
revoke all on function public.financeiro_adicionar_transporte(uuid,text) from public,anon;
grant execute on function public.financeiro_adicionar_transporte(uuid,text) to authenticated;

create or replace function public.financeiro_registrar_pagamento(
 p_atendimento uuid,p_valor integer,p_meio text,p_recebido_em timestamptz,p_justificativa text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;new_id uuid;d date;
begin
 uid:=app_private.financeiro_require_admin();
 if p_valor is null or p_valor<=0 then raise exception 'Valor recebido deve ser positivo';end if;
 if p_meio not in ('dinheiro','debito','credito','pix','outro') or p_meio is null
 then raise exception 'Meio de pagamento inválido';end if;
 if p_recebido_em is null or p_recebido_em>now()+interval '1 day'
 then raise exception 'Data de recebimento inválida';end if;
 if length(trim(coalesce(p_justificativa,'')))<8 or length(p_justificativa)>500
 then raise exception 'Justificativa obrigatória de 8 a 500 caracteres';end if;
 select (concluido_em at time zone 'America/Sao_Paulo')::date into d
 from public.atendimentos where id=p_atendimento and status='concluido';
 if d is null then raise exception 'Atendimento não concluído';end if;
 insert into public.financeiro_pagamentos(atendimento_id,valor_centavos,meio,recebido_em,registrado_por)
 values(p_atendimento,p_valor,p_meio,p_recebido_em,uid) returning id into new_id;
 perform app_private.financeiro_reabrir(p_atendimento,p_justificativa,uid);
 insert into public.financeiro_auditoria(entidade,entidade_id,atendimento_id,dia,evento,posterior,justificativa,administrador_id)
 values('pagamento',new_id::text,p_atendimento,d,'recebimento_confirmado',
  jsonb_build_object('valor_centavos',p_valor,'meio',p_meio,'recebido_em',p_recebido_em),
  trim(p_justificativa),uid);
 return new_id;
end $$;
revoke all on function public.financeiro_registrar_pagamento(uuid,integer,text,timestamptz,text) from public,anon;
grant execute on function public.financeiro_registrar_pagamento(uuid,integer,text,timestamptz,text) to authenticated;

create or replace function public.financeiro_cancelar_pagamento(p_id uuid,p_justificativa text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;old_row public.financeiro_pagamentos%rowtype;d date;
begin
 uid:=app_private.financeiro_require_admin();
 if length(trim(coalesce(p_justificativa,'')))<8 then raise exception 'Justificativa obrigatória';end if;
 select * into old_row from public.financeiro_pagamentos where id=p_id for update;
 if not found or old_row.status<>'confirmado' then raise exception 'Pagamento inexistente ou já cancelado';end if;
 update public.financeiro_pagamentos set status='cancelado' where id=p_id;
 perform app_private.financeiro_reabrir(old_row.atendimento_id,p_justificativa,uid);
 select (concluido_em at time zone 'America/Sao_Paulo')::date into d
 from public.atendimentos where id=old_row.atendimento_id;
 insert into public.financeiro_auditoria(entidade,entidade_id,atendimento_id,dia,evento,anterior,posterior,justificativa,administrador_id)
 values('pagamento',p_id::text,old_row.atendimento_id,d,'cancelamento',to_jsonb(old_row),
  jsonb_build_object('status','cancelado'),trim(p_justificativa),uid);
end $$;
revoke all on function public.financeiro_cancelar_pagamento(uuid,text) from public,anon;
grant execute on function public.financeiro_cancelar_pagamento(uuid,text) to authenticated;

create or replace function public.financeiro_conferir(p_atendimento uuid,p_justificativa text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;d date; n integer;
begin
 uid:=app_private.financeiro_require_admin();
 if length(trim(coalesce(p_justificativa,'')))<8 then raise exception 'Justificativa obrigatória';end if;
 select (concluido_em at time zone 'America/Sao_Paulo')::date into d
 from public.atendimentos where id=p_atendimento and status='concluido';
 if d is null then raise exception 'Atendimento não concluído';end if;
 select count(*) into n from public.financeiro_itens where atendimento_id=p_atendimento;
 if n=0 then raise exception 'Atendimento ainda não possui composição financeira';end if;
 if exists(select 1 from public.financeiro_itens where atendimento_id=p_atendimento
   and (coberto_pacote is null or
   (coberto_pacote is false and coalesce(valor_cobrado_centavos,valor_corrigido_centavos,valor_referencia_centavos) is null)))
 then raise exception 'Existem itens sem definição de cobertura ou preço';end if;
 insert into public.financeiro_conferencias(atendimento_id,conferido_por,conferido_em)
 values(p_atendimento,uid,now())
 on conflict(atendimento_id) do update set conferido_por=excluded.conferido_por,conferido_em=excluded.conferido_em;
 insert into public.financeiro_auditoria(entidade,entidade_id,atendimento_id,dia,evento,posterior,justificativa,administrador_id)
 values('conferencia',p_atendimento::text,p_atendimento,d,'conferido',
  jsonb_build_object('conferido_em',now()),trim(p_justificativa),uid);
end $$;
revoke all on function public.financeiro_conferir(uuid,text) from public,anon;
grant execute on function public.financeiro_conferir(uuid,text) to authenticated;

create or replace function public.financeiro_definir_fechamento(p_dia date,p_status text,p_justificativa text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;old_row public.financeiro_fechamentos%rowtype;
 v_producao bigint;v_cobrado bigint;v_recebido bigint;v_incomplete integer;
begin
 uid:=app_private.financeiro_require_admin();
 if p_status not in ('em_conferencia','fechado') or p_dia is null
 then raise exception 'Status ou data inválidos';end if;
 if length(trim(coalesce(p_justificativa,'')))<8 then raise exception 'Justificativa obrigatória';end if;
 select * into old_row from public.financeiro_fechamentos where dia=p_dia for update;
 if not found then raise exception 'Dia ainda não preparado';end if;
 if old_row.status='fechado' then raise exception 'Dia fechado; uma correção auditada reabre o fechamento';end if;
 if p_status='fechado' then
  select count(*) into v_incomplete
  from public.atendimentos a
  where a.status='concluido'
  and (a.concluido_em at time zone 'America/Sao_Paulo')::date=p_dia
  and not exists(select 1 from public.financeiro_conferencias c where c.atendimento_id=a.id);
  if v_incomplete>0 then raise exception '% atendimento(s) sem conferência financeira',v_incomplete;end if;
 end if;
 select coalesce(sum(coalesce(i.valor_corrigido_centavos,i.valor_referencia_centavos)),0),
 coalesce(sum(case when i.coberto_pacote is true then 0
   else coalesce(i.valor_cobrado_centavos,i.valor_corrigido_centavos,i.valor_referencia_centavos,0) end),0)
 into v_producao,v_cobrado
 from public.financeiro_itens i join public.atendimentos a on a.id=i.atendimento_id
 where a.status='concluido' and (a.concluido_em at time zone 'America/Sao_Paulo')::date=p_dia;
 select coalesce(sum(p.valor_centavos),0) into v_recebido
 from public.financeiro_pagamentos p join public.atendimentos a on a.id=p.atendimento_id
 where p.status='confirmado' and a.status='concluido'
 and (a.concluido_em at time zone 'America/Sao_Paulo')::date=p_dia;
 update public.financeiro_fechamentos
  set status=p_status,producao_centavos=case when p_status='fechado' then v_producao else null end,
  cobranca_prevista_centavos=case when p_status='fechado' then v_cobrado else null end,
  recebido_atendimentos_centavos=case when p_status='fechado' then v_recebido else null end,
  pendente_centavos=case when p_status='fechado' then greatest(0,v_cobrado-v_recebido) else null end,
  fechado_em=case when p_status='fechado' then now() else null end,
  atualizado_por=uid,atualizado_em=now()
 where dia=p_dia;
 insert into public.financeiro_auditoria(entidade,entidade_id,dia,evento,anterior,posterior,justificativa,administrador_id)
 values('fechamento',p_dia::text,p_dia,p_status,to_jsonb(old_row),
 jsonb_build_object('status',p_status,'producao_centavos',v_producao,'cobranca_prevista_centavos',v_cobrado,'recebido_centavos',v_recebido),
 trim(p_justificativa),uid);
end $$;
revoke all on function public.financeiro_definir_fechamento(date,text,text) from public,anon;
grant execute on function public.financeiro_definir_fechamento(date,text,text) to authenticated;
