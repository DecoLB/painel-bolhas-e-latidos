-- V2.3 | Rateio gerencial e correção auditável; preços invisíveis para o Operacional.
create function app_private.distribuir_valores_v23(p_atendimento_id uuid,p_primeira_vez boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_fin public.producao_valores%rowtype;
 v_pai public.atendimentos%rowtype; a record; v_n int; v_rank int;
 v_main_n int; v_seen int:=0; v_prev int:=0; v_main_val int; v_val int;
 v_preco record; v_coverage text; v_em int; v_percent int;
begin
 select * into v_fin from public.producao_valores where atendimento_id=p_atendimento_id;
 select * into v_pai from public.atendimentos where id=p_atendimento_id;
 if not found or v_pai.status<>'concluido' then return;end if;
 if v_fin.atendimento_id is null then return; end if;
 select count(*) into v_main_n from public.atendimento_etapas
   where atendimento_id=p_atendimento_id and tipo='principal';
 if v_main_n<1 then return;end if;
 if (select coalesce(sum(v.peso_pacote),0) from public.etapa_valores v
    join public.atendimento_etapas e on e.id=v.etapa_id
    where e.atendimento_id=p_atendimento_id and e.tipo='principal')<>100
 then raise exception 'Percentuais das etapas principais devem totalizar 100';end if;
 for a in select e.*,v.peso_pacote,v.valor_centavos,v.cobertura
    from public.atendimento_etapas e join public.etapa_valores v on v.etapa_id=e.id
    where e.atendimento_id=p_atendimento_id
    order by (case when e.tipo='principal' then 0 else 1 end),e.ordem loop
   v_val:=null;v_coverage:=v_fin.cobertura;
   if a.tipo='principal' then
     v_seen:=v_seen+1;
     if v_fin.valor_base_centavos is not null then
       if v_seen<v_main_n then
         v_val:=floor(v_fin.valor_base_centavos*a.peso_pacote/100.0);
       else
         v_val:=v_fin.valor_base_centavos-v_prev;
       end if;
       v_prev:=v_prev+v_val;
     end if;
   else
     if p_primeira_vez then
       select pa.valor_centavos,pa.modalidade,pa.faixa_aplicacao into v_preco
         from public.precos_adicionais pa where pa.adicional_id=a.adicional_id;
       if found and v_pai.especie='cachorro' and v_pai.porte='pequeno'
         and v_preco.faixa_aplicacao='cachorro_P_ate_10kg'
         and v_preco.modalidade in ('fixo','a_partir')
       then v_val:=v_preco.valor_centavos;end if;
     else
       v_val:=a.valor_centavos; -- Não reconsultar valores alterados após a conclusão.
     end if;
   end if;
   update public.etapa_valores
      set valor_centavos=v_val,cobertura=v_coverage,atualizado_em=now()
      where etapa_id=a.id;
   delete from public.etapa_rateios where etapa_id=a.id;
   select count(*) into v_n from public.etapa_profissionais
      where etapa_id=a.id and papel='confirmado';
   if v_n>0 then
     v_rank:=0;
     for v_em in select 1 from generate_series(1,v_n) loop
       null;
     end loop;
     insert into public.etapa_rateios(etapa_id,profissional_id,percentual,valor_centavos)
       select a.id,ep.profissional_id,
         (100/v_n)+case when row_number() over(order by ep.profissional_id)<=100%v_n then 1 else 0 end,
         case when v_val is null then null
           else (v_val/v_n)+case when row_number() over(order by ep.profissional_id)<=v_val%v_n then 1 else 0 end end
       from public.etapa_profissionais ep
       where ep.etapa_id=a.id and ep.papel='confirmado';
   end if;
 end loop;
end $$;
revoke all on function app_private.distribuir_valores_v23(uuid,boolean) from public,anon,authenticated;
-- Trigger existente registra o valor de referência V2.2 primeiro, depois detalha.
create or replace function app_private.capturar_producao_conclusao()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='concluido' and old.status is distinct from new.status then
   perform app_private.registrar_valor_producao(new.id,'conclusao');
   if exists(select 1 from public.atendimento_etapas where atendimento_id=new.id) then
     perform app_private.distribuir_valores_v23(new.id,true);
   end if;
 end if;
 return new;
end $$;

-- Imutabilidade de eventos, inclusive para contas privilegiadas autenticadas.
create function app_private.bloquear_mutacao_auditoria_v23() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin raise exception 'Trilha de auditoria é imutável';end $$;
create trigger audit_v23_imutavel before update or delete on public.etapa_auditoria
for each row execute function app_private.bloquear_mutacao_auditoria_v23();
revoke all on function app_private.bloquear_mutacao_auditoria_v23() from public,anon,authenticated;

create function app_private.snapshot_etapa_v23(p_etapa uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'etapa',(select to_jsonb(e) from public.atendimento_etapas e where e.id=p_etapa),
  'previstos',coalesce((select jsonb_agg(ep.profissional_id order by ep.profissional_id)
     from public.etapa_profissionais ep where ep.etapa_id=p_etapa and ep.papel='previsto'),'[]'::jsonb),
  'confirmados',coalesce((select jsonb_agg(ep.profissional_id order by ep.profissional_id)
     from public.etapa_profissionais ep where ep.etapa_id=p_etapa and ep.papel='confirmado'),'[]'::jsonb),
  'valor',(select to_jsonb(v) from public.etapa_valores v where v.etapa_id=p_etapa),
  'rateios',coalesce((select jsonb_agg(to_jsonb(rt) order by rt.profissional_id)
     from public.etapa_rateios rt where rt.etapa_id=p_etapa),'[]'::jsonb)
 );
$$;
revoke all on function app_private.snapshot_etapa_v23(uuid) from public,anon,authenticated;

create function public.corrigir_etapa_v23(
 p_etapa_id uuid,p_profissionais uuid[],p_inicio timestamptz,p_fim timestamptz,
 p_peso integer,p_justificativa text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_etapa public.atendimento_etapas%rowtype;v_before jsonb;v_after jsonb;
 v_n int;v_sibling uuid;v_pesos int;
begin
 if not app_private.admin_v23() then raise exception 'Somente Administrador pode corrigir ficha' using errcode='42501';end if;
 if length(trim(coalesce(p_justificativa,'')))<8 or length(p_justificativa)>500 then
  raise exception 'Justificativa obrigatória entre 8 e 500 caracteres';end if;
 select * into v_etapa from public.atendimento_etapas where id=p_etapa_id for update;
 if not found or v_etapa.status<>'concluido' then raise exception 'Somente etapas concluídas podem ser corrigidas';end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim>now() then
  raise exception 'Horários de execução inválidos';end if;
 v_n:=cardinality(coalesce(p_profissionais,array[]::uuid[]));
 if v_n<1 or v_n>8 or v_n<>(select count(distinct x) from unnest(p_profissionais) x)
 then raise exception 'Informe de 1 a 8 executores distintos';end if;
 if exists(select 1 from unnest(p_profissionais) x where not exists
   (select 1 from public.profissionais where id=x))
 then raise exception 'Executor não cadastrado';end if;
 if p_peso<0 or p_peso>100 or p_peso is null then raise exception 'Percentual fora de 0 a 100';end if;
 select count(*) into v_pesos from public.atendimento_etapas
   where atendimento_id=v_etapa.atendimento_id and tipo='principal';
 if v_etapa.tipo='principal' and v_pesos>2 then raise exception 'Rateio de pacotes com mais de duas etapas exige configuração adicional';end if;
 if v_etapa.tipo='principal' and v_pesos=1 and p_peso<>100 then raise exception 'Etapa única deve representar 100%%';end if;
 v_before:=app_private.snapshot_etapa_v23(p_etapa_id);
 update public.atendimento_etapas set iniciado_em=p_inicio,concluido_em=p_fim where id=p_etapa_id;
 delete from public.etapa_profissionais where etapa_id=p_etapa_id and papel='confirmado';
 insert into public.etapa_profissionais(etapa_id,profissional_id,papel)
 select p_etapa_id,x,'confirmado' from unnest(p_profissionais) x;
 if v_etapa.tipo='principal' then
  update public.etapa_valores set peso_pacote=p_peso where etapa_id=p_etapa_id;
  if v_pesos=2 then
    select e.id into v_sibling from public.atendimento_etapas e
      where e.atendimento_id=v_etapa.atendimento_id and e.id<>p_etapa_id and e.tipo='principal';
    update public.etapa_valores set peso_pacote=100-p_peso where etapa_id=v_sibling;
  end if;
 end if;
 perform app_private.distribuir_valores_v23(v_etapa.atendimento_id,false);
 delete from public.fichas_conferencia where atendimento_id=v_etapa.atendimento_id;
 v_after:=app_private.snapshot_etapa_v23(p_etapa_id);
 insert into public.etapa_auditoria(atendimento_id,etapa_id,evento,anterior,posterior,justificativa,administrador_id)
 values(v_etapa.atendimento_id,p_etapa_id,'correcao',v_before,v_after,trim(p_justificativa),auth.uid());
end $$;
revoke all on function public.corrigir_etapa_v23(uuid,uuid[],timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.corrigir_etapa_v23(uuid,uuid[],timestamptz,timestamptz,integer,text) to authenticated;

create function public.ajustar_rateio_v23(p_etapa_id uuid,p_distribuicao jsonb,p_justificativa text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_etapa public.atendimento_etapas%rowtype;v_before jsonb;v_after jsonb;
v_fin public.etapa_valores%rowtype;v_n int;v_sum int;v_total int:=0;item record;
begin
 if not app_private.admin_v23() then raise exception 'Somente Administrador' using errcode='42501';end if;
 if length(trim(coalesce(p_justificativa,'')))<8 or length(p_justificativa)>500 then
  raise exception 'Informe justificativa de 8 a 500 caracteres';end if;
 if jsonb_typeof(p_distribuicao)<>'array' then raise exception 'Distribuição inválida';end if;
 select * into v_etapa from public.atendimento_etapas where id=p_etapa_id for update;
 if not found or v_etapa.status<>'concluido' then raise exception 'Etapa não concluída';end if;
 select * into v_fin from public.etapa_valores where etapa_id=p_etapa_id;
 select count(*),coalesce(sum((x->>'percentual')::integer),0) into v_n,v_sum
   from jsonb_array_elements(p_distribuicao) x;
 if v_n<1 or v_n>8 or v_sum<>100 or v_n<>(
   select count(*) from public.etapa_profissionais where etapa_id=p_etapa_id and papel='confirmado')
   then raise exception 'Percentuais devem somar 100 para todos os executores confirmados';end if;
 if exists(select 1 from jsonb_array_elements(p_distribuicao) x
  where (x->>'percentual')::integer not between 0 and 100
   or not exists(select 1 from public.etapa_profissionais ep
     where ep.etapa_id=p_etapa_id and ep.profissional_id=(x->>'profissional_id')::uuid and ep.papel='confirmado'))
   or (select count(distinct x->>'profissional_id') from jsonb_array_elements(p_distribuicao) x)<>v_n
 then raise exception 'Profissionais ou percentuais inválidos';end if;
 v_before:=app_private.snapshot_etapa_v23(p_etapa_id);
 for item in select (x->>'profissional_id')::uuid as profissional_id,
   (x->>'percentual')::integer as percentual,row_number() over(order by x->>'profissional_id') as seq
   from jsonb_array_elements(p_distribuicao) x order by x->>'profissional_id' loop
   update public.etapa_rateios set percentual=item.percentual,
     valor_centavos=case when v_fin.valor_centavos is null then null
       when item.seq=v_n then v_fin.valor_centavos-v_total
       else floor(v_fin.valor_centavos*item.percentual/100.0) end
    where etapa_id=p_etapa_id and profissional_id=item.profissional_id;
   if v_fin.valor_centavos is not null and item.seq<>v_n then
     v_total:=v_total+floor(v_fin.valor_centavos*item.percentual/100.0);
   end if;
 end loop;
 delete from public.fichas_conferencia where atendimento_id=v_etapa.atendimento_id;
 v_after:=app_private.snapshot_etapa_v23(p_etapa_id);
 insert into public.etapa_auditoria(atendimento_id,etapa_id,evento,anterior,posterior,justificativa,administrador_id)
 values(v_etapa.atendimento_id,p_etapa_id,'rateio',v_before,v_after,trim(p_justificativa),auth.uid());
end $$;
revoke all on function public.ajustar_rateio_v23(uuid,jsonb,text) from public,anon;
grant execute on function public.ajustar_rateio_v23(uuid,jsonb,text) to authenticated;

create function public.conferir_ficha_v23(p_atendimento_id uuid,p_justificativa text default 'Conferência da ficha diária')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev jsonb;
begin
 if not app_private.admin_v23() then raise exception 'Somente Administrador' using errcode='42501';end if;
 if not exists(select 1 from public.atendimentos where id=p_atendimento_id and status='concluido')
  or exists(select 1 from public.atendimento_etapas where atendimento_id=p_atendimento_id and status<>'concluido')
  or not exists(select 1 from public.atendimento_etapas where atendimento_id=p_atendimento_id)
 then raise exception 'Todas as etapas devem estar concluídas';end if;
 if exists(select 1 from public.atendimento_etapas e
  where e.atendimento_id=p_atendimento_id and not exists
    (select 1 from public.etapa_profissionais x where x.etapa_id=e.id and x.papel='confirmado'))
 then raise exception 'Existe etapa sem executor confirmado';end if;
 if exists(select 1 from public.fichas_conferencia where atendimento_id=p_atendimento_id) then return;end if;
 insert into public.fichas_conferencia(atendimento_id,conferido_por) values(p_atendimento_id,auth.uid());
 insert into public.etapa_auditoria(atendimento_id,evento,anterior,posterior,justificativa,administrador_id)
 values(p_atendimento_id,'conferencia',null,
   jsonb_build_object('conferido_em',now()),left(coalesce(p_justificativa,'Conferência'),500),auth.uid());
end $$;
revoke all on function public.conferir_ficha_v23(uuid,text) from public,anon;
grant execute on function public.conferir_ficha_v23(uuid,text) to authenticated;
