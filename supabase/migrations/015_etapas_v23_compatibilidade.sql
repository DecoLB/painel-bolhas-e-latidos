-- V2.3: o atendimento pode ter múltiplos executores distribuídos por etapa.
-- A coluna profissional_id permanece exigida nas fichas legadas.
alter table public.atendimentos
 add column execucao_por_etapas boolean not null default false;
update public.atendimentos a set execucao_por_etapas=true
 where exists(select 1 from public.atendimento_etapas e where e.atendimento_id=a.id);
alter table public.atendimentos drop constraint transicoes_consistentes;
alter table public.atendimentos add constraint transicoes_consistentes check (
 (status='aguardando' and profissional_id is null and iniciado_em is null and concluido_em is null)
 or (status='em_execucao' and iniciado_em is not null and concluido_em is null
     and (profissional_id is not null or execucao_por_etapas))
 or (status='concluido' and iniciado_em is not null and concluido_em is not null
     and (profissional_id is not null or execucao_por_etapas))
);
create or replace function app_private.criar_etapas_v23() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s_name text;a record;e_id uuid;i smallint:=0;second_name text;
begin
 select nome into s_name from public.servicos where id=new.servico_id;
 if s_name is null then raise exception 'Serviço inexistente';end if;
 update public.atendimentos set execucao_por_etapas=true where id=new.id;
 if lower(s_name) like '%banho%' and lower(s_name) like '%tosa%' then
  insert into public.atendimento_etapas(atendimento_id,tipo,nome,ordem)
   values(new.id,'principal','Banho',1) returning id into e_id;
  insert into public.etapa_valores(etapa_id,peso_pacote) values(e_id,50);
  second_name:=case
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
 for a in select id,nome from public.catalogo_adicionais
  where id=any(coalesce(new.adicionais,array[]::uuid[])) loop
  i:=i+1;
  insert into public.atendimento_etapas(atendimento_id,tipo,nome,adicional_id,ordem)
   values(new.id,'adicional',a.nome,a.id,i) returning id into e_id;
  insert into public.etapa_valores(etapa_id,peso_pacote) values(e_id,100);
 end loop;
 return new;
end $$;
