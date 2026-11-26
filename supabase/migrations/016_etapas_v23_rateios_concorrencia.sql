-- V2.3 ajustes de concorrência e preservação de rateio manual.
create or replace function app_private.distribuir_valores_v23(p_atendimento_id uuid,p_primeira_vez boolean default false)
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
   select count(*) into v_n from public.etapa_profissionais
      where etapa_id=a.id and papel='confirmado';
   -- Preservar percentuais manuais existentes quando os executores não mudaram.
   if (select count(*) from public.etapa_rateios where etapa_id=a.id)<>v_n or
      exists(select 1 from public.etapa_rateios rt where rt.etapa_id=a.id and not exists
        (select 1 from public.etapa_profissionais ep where ep.etapa_id=a.id
          and ep.profissional_id=rt.profissional_id and ep.papel='confirmado'))
   then
     delete from public.etapa_rateios where etapa_id=a.id;
     if v_n>0 then
       insert into public.etapa_rateios(etapa_id,profissional_id,percentual,valor_centavos)
       select a.id,ep.profissional_id,
         (100/v_n)+case when row_number() over(order by ep.profissional_id)<=100%v_n then 1 else 0 end,
         null
       from public.etapa_profissionais ep
       where ep.etapa_id=a.id and ep.papel='confirmado';
     end if;
   end if;
   -- Distribui centavos residuais para o último executor, sem duplicação.
   with partes as (
    select r.profissional_id,r.percentual,
      row_number() over(order by r.profissional_id) as rn,
      count(*) over() as n,
      sum(floor(coalesce(v_val,0)*r.percentual/100.0)::int) over() as base
    from public.etapa_rateios r where r.etapa_id=a.id
   )
   update public.etapa_rateios rt set
     valor_centavos=case when v_val is null then null
       when p.rn=p.n then floor(v_val*p.percentual/100.0)::int+(v_val-p.base)
       else floor(v_val*p.percentual/100.0)::int end
     from partes p where rt.etapa_id=a.id and rt.profissional_id=p.profissional_id;
 end loop;
end $$;

create or replace function public.iniciar_etapa_v23(p_etapa_id uuid,p_profissionais uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.atendimento_etapas%rowtype; n integer;
begin
 if not app_private.equipe_v23() then raise exception 'Sem autorização' using errcode='42501';end if;
 select * into e from public.atendimento_etapas where id=p_etapa_id for update;
 if not found or e.status<>'aguardando' then raise exception 'Atividade não está aguardando';end if;
 perform 1 from public.atendimentos where id=e.atendimento_id for update;
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

create or replace function public.finalizar_etapa_v23(p_etapa_id uuid,p_profissionais uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.atendimento_etapas%rowtype; n integer;
begin
 if not app_private.equipe_v23() then raise exception 'Sem autorização' using errcode='42501';end if;
 select * into e from public.atendimento_etapas where id=p_etapa_id for update;
 if not found or e.status<>'em_execucao' then raise exception 'Atividade não está em execução';end if;
 -- Serializa a última etapa concorrente, garantindo conclusão geral atômica.
 perform 1 from public.atendimentos where id=e.atendimento_id for update;
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
