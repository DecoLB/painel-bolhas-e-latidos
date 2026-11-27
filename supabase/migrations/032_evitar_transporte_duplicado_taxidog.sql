-- V2.7.1 — Evita contabilização duplicada do TaxiDog e transporte do Bolhas.
-- Quando TaxiDog é um adicional, ele será o componente de transporte (uma vez).
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
  select rec.id,'adicional:'||x.id::text,
     case when lower(coalesce(c.nome,'')) like 'taxidog%' then 'transporte' else 'adicional' end,
     coalesce(c.nome,'Adicional'),
     (select v.valor_centavos from public.atendimento_etapas e
      join public.etapa_valores v on v.etapa_id=e.id
      where e.atendimento_id=rec.id and e.tipo='adicional' and e.adicional_id=x.id
      order by e.ordem limit 1),
     case when rec.pacote_pre_pago is false then false else null end
  from unnest(coalesce(rec.adicionais,array[]::uuid[])) as x(id)
  left join public.catalogo_adicionais c on c.id=x.id
  on conflict(atendimento_id,chave) do nothing;
  get diagnostics n=row_count;inserted_count:=inserted_count+n;
  if rec.transporte_bolhas is true and not exists(
    select 1 from public.catalogo_adicionais ca
    where ca.id=any(coalesce(rec.adicionais,array[]::uuid[]))
    and lower(ca.nome) like 'taxidog%'
   ) then
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

create or replace function public.financeiro_adicionar_transporte(p_atendimento uuid,p_justificativa text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;a record;row_id uuid;
begin
 uid:=app_private.financeiro_require_admin();
 if length(trim(coalesce(p_justificativa,'')))<8 then raise exception 'Justificativa obrigatória';end if;
 select id,concluido_em,pacote_pre_pago from public.atendimentos where id=p_atendimento and status='concluido' into a;
 if not found then raise exception 'Atendimento não concluído';end if;
 if exists(select 1 from public.financeiro_itens
   where atendimento_id=p_atendimento and tipo='transporte')
 then raise exception 'Transporte já vinculado ao atendimento';end if;
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

