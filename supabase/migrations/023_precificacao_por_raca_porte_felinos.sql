-- V2.4.0 | Tabelas por porte, raça especial e felinos.
-- Snapshot financeiro V2.2/V2.3 permanece imutável; nenhum atendimento antigo é reprecificado.
create table public.grupos_precificacao (
 codigo text primary key,
 nome text not null,
 criterio text not null check (criterio in ('porte','raca','especie')),
 especie text not null check (especie in ('cachorro','gato')),
 ordem integer not null default 0
);
create table public.racas_grupos_precificacao (
 especie varchar(20) not null default 'cachorro',
 raca varchar(100) not null,
 grupo_codigo text not null references public.grupos_precificacao(codigo),
 primary key(especie,raca),
 foreign key (especie,raca) references public.catalogo_racas(especie,nome)
);
create table public.precos_servicos_grupos (
 grupo_codigo text not null references public.grupos_precificacao(codigo),
 servico_id uuid not null references public.servicos(id),
 valor_centavos integer not null check(valor_centavos between 0 and 100000000),
 atualizado_em timestamptz not null default now(),
 primary key(grupo_codigo,servico_id)
);
create table public.precos_adicionais_grupos (
 grupo_codigo text not null references public.grupos_precificacao(codigo),
 adicional_id uuid not null references public.catalogo_adicionais(id),
 valor_centavos integer check(valor_centavos is null or valor_centavos between 0 and 100000000),
 modalidade text not null check(modalidade in ('fixo','a_partir','sob_consulta')),
 observacao text,
 atualizado_em timestamptz not null default now(),
 primary key(grupo_codigo,adicional_id),
 constraint precos_adicionais_grupos_consistente check(modalidade='sob_consulta' or valor_centavos is not null)
);
create table public.precos_manejo_grupos (
 grupo_codigo text not null references public.grupos_precificacao(codigo),
 manejo text not null check(manejo in ('ansioso','agressivo','idoso')),
 valor_centavos integer not null check(valor_centavos between 0 and 100000000),
 primary key(grupo_codigo,manejo)
);
create table public.catalogo_veterinario (
 id uuid primary key default gen_random_uuid(),
 categoria text not null check(categoria in ('Vacinas','Consultas','Exames')),
 nome text not null,
 valor_centavos integer check(valor_centavos is null or valor_centavos between 0 and 100000000),
 modalidade text not null check(modalidade in ('fixo','a_partir','sob_consulta')),
 observacao text,
 ativo boolean not null default true,
 atualizado_em timestamptz not null default now(),
 unique(categoria,nome),
 check(modalidade='sob_consulta' or valor_centavos is not null)
);
-- Preços e seus mapeamentos não são legíveis por funcionários operacionais.
alter table public.grupos_precificacao enable row level security;
alter table public.racas_grupos_precificacao enable row level security;
alter table public.precos_servicos_grupos enable row level security;
alter table public.precos_adicionais_grupos enable row level security;
alter table public.precos_manejo_grupos enable row level security;
alter table public.catalogo_veterinario enable row level security;
revoke all on public.grupos_precificacao,public.racas_grupos_precificacao,
 public.precos_servicos_grupos,public.precos_adicionais_grupos,
 public.precos_manejo_grupos,public.catalogo_veterinario from public,anon,authenticated;
grant select,insert,update,delete on public.grupos_precificacao,public.racas_grupos_precificacao,
 public.precos_servicos_grupos,public.precos_adicionais_grupos,
 public.precos_manejo_grupos,public.catalogo_veterinario to authenticated;
create policy admin_grupos_v24 on public.grupos_precificacao for all to authenticated
 using((select app_private.admin_v23())) with check((select app_private.admin_v23()));
create policy admin_racas_grupos_v24 on public.racas_grupos_precificacao for all to authenticated
 using((select app_private.admin_v23())) with check((select app_private.admin_v23()));
create policy admin_precos_servicos_v24 on public.precos_servicos_grupos for all to authenticated
 using((select app_private.admin_v23())) with check((select app_private.admin_v23()));
create policy admin_precos_adicionais_v24 on public.precos_adicionais_grupos for all to authenticated
 using((select app_private.admin_v23())) with check((select app_private.admin_v23()));
create policy admin_manejos_v24 on public.precos_manejo_grupos for all to authenticated
 using((select app_private.admin_v23())) with check((select app_private.admin_v23()));
create policy admin_veterinario_v24 on public.catalogo_veterinario for all to authenticated
 using((select app_private.admin_v23())) with check((select app_private.admin_v23()));

insert into public.grupos_precificacao(codigo,nome,criterio,especie,ordem) values
 ('porte_p','Porte P, até 10 kg','porte','cachorro',1),
 ('porte_m','Porte M, 11 a 20 kg','porte','cachorro',2),
 ('porte_g','Porte G, 21 a 40 kg','porte','cachorro',3),
 ('fila_lobo_husky_belga','Fila / Lobo / Husky Siberiano / Pastor Belga','raca','cachorro',10),
 ('golden_chow','Golden Retriever / Chow Chow','raca','cachorro',11),
 ('pastor_rott_labrador_border','Pastor Alemão / Rottweiller / Labrador / Border Collie','raca','cachorro',12),
 ('bernardo_samoieda_terra_bernese','São Bernardo / Samoieda / Terra Nova / Bernese','raca','cachorro',13),
 ('felino','Felinos','especie','gato',20);
-- Os nomes "Lobo" e "Bernese" reproduzem exatamente os rótulos das tabelas
-- recebidas, sem supor uma classificação zoológica que não foi informada.
insert into public.catalogo_racas(especie,nome)
 values ('cachorro','Lobo'),('cachorro','Bernese')
 on conflict (especie,nome) do nothing;
insert into public.racas_grupos_precificacao(especie,raca,grupo_codigo)
values
 ('cachorro','Fila Brasileiro','fila_lobo_husky_belga'),
 ('cachorro','Lobo','fila_lobo_husky_belga'),
 ('cachorro','Husky Siberiano','fila_lobo_husky_belga'),
 ('cachorro','Pastor Belga','fila_lobo_husky_belga'),
 ('cachorro','Golden Retriever','golden_chow'),
 ('cachorro','Chow Chow','golden_chow'),
 ('cachorro','Pastor Alemão','pastor_rott_labrador_border'),
 ('cachorro','Rottweiller','pastor_rott_labrador_border'),
 ('cachorro','Labrador','pastor_rott_labrador_border'),
 ('cachorro','Border Collie','pastor_rott_labrador_border'),
 ('cachorro','São Bernardo','bernardo_samoieda_terra_bernese'),
 ('cachorro','Samoieda','bernardo_samoieda_terra_bernese'),
 ('cachorro','Terra Nova','bernardo_samoieda_terra_bernese'),
 ('cachorro','Bernese','bernardo_samoieda_terra_bernese');

-- Tabelas gerais M/G, mantendo P já homologada e sem sobrepor seu conteúdo.
insert into public.precos_servicos(servico_id,especie,porte,pelagem,valor_centavos)
select s.id,'cachorro',v.porte,v.pelagem,v.centavos
from (values
('medio','curto','Banho',8000),('medio','medio','Banho',9000),('medio','longo','Banho',10000),
('medio','curto','Banho com Tosa Higiênica',9000),('medio','medio','Banho com Tosa Higiênica',10000),('medio','longo','Banho com Tosa Higiênica',11000),
('medio','curto','Banho e Tosa na Tesoura',16000),('medio','medio','Banho e Tosa na Tesoura',17000),('medio','longo','Banho e Tosa na Tesoura',18000),
('medio','curto','Banho com Tosa na Máquina',10500),('medio','medio','Banho com Tosa na Máquina',11500),('medio','longo','Banho com Tosa na Máquina',12500),
('grande','curto','Banho',9000),('grande','medio','Banho',10000),('grande','longo','Banho',11000),
('grande','curto','Banho com Tosa Higiênica',10000),('grande','medio','Banho com Tosa Higiênica',11000),('grande','longo','Banho com Tosa Higiênica',12000),
('grande','curto','Banho e Tosa na Tesoura',18000),('grande','medio','Banho e Tosa na Tesoura',19000),('grande','longo','Banho e Tosa na Tesoura',20000),
('grande','curto','Banho com Tosa na Máquina',11500),('grande','medio','Banho com Tosa na Máquina',12500),('grande','longo','Banho com Tosa na Máquina',13500)
) v(porte,pelagem,nome,centavos)
join public.servicos s on s.nome=v.nome
on conflict (servico_id,especie,porte,pelagem) do nothing;

-- Raças especiais e felinos independem da pelagem/porte na tabela fornecida.
insert into public.precos_servicos_grupos(grupo_codigo,servico_id,valor_centavos)
select v.grupo,s.id,v.centavos
from (values
('fila_lobo_husky_belga','Banho',14000),
('fila_lobo_husky_belga','Banho com Tosa Higiênica',17000),
('fila_lobo_husky_belga','Banho e Tosa na Tesoura',21000),
('golden_chow','Banho',13000),
('golden_chow','Banho com Tosa Higiênica',15000),
('golden_chow','Banho e Tosa na Tesoura',21000),
('golden_chow','Banho com Tosa na Máquina',18000),
('pastor_rott_labrador_border','Banho',12000),
('pastor_rott_labrador_border','Banho com Tosa Higiênica',14000),
('bernardo_samoieda_terra_bernese','Banho',18000),
('bernardo_samoieda_terra_bernese','Banho com Tosa Higiênica',20000),
('bernardo_samoieda_terra_bernese','Banho e Tosa na Tesoura',24000),
('felino','Banho',8000),
('felino','Banho com Tosa Higiênica',9000),
('felino','Banho com Tosa na Máquina',11000)
) v(grupo,nome,centavos)
join public.servicos s on s.nome=v.nome
on conflict (grupo_codigo,servico_id) do nothing;

insert into public.catalogo_adicionais(nome)
 values ('Hotelzinho')
 on conflict (nome) do nothing;

-- Preços por grupo. TaxiDog exige verificação de distância (R$25 até 3 km);
-- guarda valor de referência, mas não entra no total fechado sem confirmação.
insert into public.precos_adicionais_grupos(grupo_codigo,adicional_id,valor_centavos,modalidade,observacao)
select v.grupo,a.id,v.centavos,v.modalidade,
 case when v.nome='TaxiDog' then 'Até 3 km: R$ 25,00. Acima de 3 km, valor a consultar.'
      when v.modalidade='a_partir' then 'Preço mínimo; valor final a confirmar.'
      when v.nome='Hotelzinho' then 'Período/diária não especificado na tabela. Confirmar antes da cobrança.'
      else null end
from (values
('porte_m','Hidratação',3000,'fixo'),('porte_m','Tosa Geral sem Banho',6000,'a_partir'),('porte_m','Antipulgas',3000,'fixo'),('porte_m','Desembolo',8000,'fixo'),('porte_m','Escovação Dental',1000,'fixo'),('porte_m','TaxiDog',2500,'sob_consulta'),
('porte_g','Hidratação',4000,'fixo'),('porte_g','Tosa Geral sem Banho',7000,'a_partir'),('porte_g','Antipulgas',3000,'fixo'),('porte_g','Desembolo',9000,'fixo'),('porte_g','Escovação Dental',1000,'fixo'),('porte_g','TaxiDog',2500,'sob_consulta'),
('fila_lobo_husky_belga','Hidratação',6000,'fixo'),('fila_lobo_husky_belga','Antipulgas',4000,'fixo'),('fila_lobo_husky_belga','Desembolo',10000,'fixo'),('fila_lobo_husky_belga','Escovação Dental',1000,'fixo'),('fila_lobo_husky_belga','TaxiDog',2500,'sob_consulta'),
('golden_chow','Hidratação',5000,'fixo'),('golden_chow','Antipulgas',4000,'fixo'),('golden_chow','Desembolo',10000,'fixo'),('golden_chow','Escovação Dental',1000,'fixo'),('golden_chow','TaxiDog',2500,'sob_consulta'),
('pastor_rott_labrador_border','Hidratação',5000,'fixo'),('pastor_rott_labrador_border','Antipulgas',4000,'fixo'),('pastor_rott_labrador_border','Desembolo',10000,'fixo'),('pastor_rott_labrador_border','Escovação Dental',1000,'fixo'),('pastor_rott_labrador_border','TaxiDog',2500,'sob_consulta'),
('bernardo_samoieda_terra_bernese','Hotelzinho',7000,'sob_consulta'),('bernardo_samoieda_terra_bernese','Antipulgas',5000,'fixo'),('bernardo_samoieda_terra_bernese','Desembolo',12000,'fixo'),('bernardo_samoieda_terra_bernese','Escovação Dental',1000,'fixo'),('bernardo_samoieda_terra_bernese','TaxiDog',2500,'sob_consulta'),
('felino','Hidratação',3000,'fixo'),('felino','Antipulgas',3000,'fixo'),('felino','Escovação Dental',1000,'fixo'),('felino','TaxiDog',2500,'sob_consulta')
) v(grupo,nome,centavos,modalidade)
join public.catalogo_adicionais a on a.nome=v.nome
on conflict (grupo_codigo,adicional_id) do nothing;

-- Manejo permanece somente informativo no fluxo; guarda preço comercial para administração.
insert into public.precos_manejo_grupos(grupo_codigo,manejo,valor_centavos)
select g.codigo,v.manejo,v.cents
from (values
('porte_p',2000,2500,3000),('porte_m',2000,2500,3000),('porte_g',2000,2500,3000),
('fila_lobo_husky_belga',3000,3500,4000),('golden_chow',3000,3500,4000),
('pastor_rott_labrador_border',3000,3500,4000),
('bernardo_samoieda_terra_bernese',3000,3500,4000),
('felino',2000,2500,3000)
) x(grupo,ansioso,agressivo,idoso)
join public.grupos_precificacao g on g.codigo=x.grupo
cross join lateral (values('ansioso',x.ansioso),('agressivo',x.agressivo),('idoso',x.idoso)) v(manejo,cents)
on conflict (grupo_codigo,manejo) do nothing;

insert into public.catalogo_veterinario(categoria,nome,valor_centavos,modalidade,observacao) values
 ('Vacinas','V4',9000,'fixo',null),('Vacinas','V10',9000,'fixo',null),('Vacinas','Raiva',7500,'fixo',null),
 ('Vacinas','Bronchiguard',9000,'fixo',null),('Vacinas','Giardia',10000,'fixo',null),
 ('Consultas','Clínico geral',9000,'fixo','Retorno em até 30 dias.'),
 ('Consultas','Ortopedista',25000,'fixo','Retorno em até 30 dias.'),
 ('Consultas','Dermatologista / Oftalmologista / Endocrinologista',40000,'a_partir','1 retorno.'),
 ('Exames','Hemograma simples',10000,'fixo',null),
 ('Exames','Hemograma + Bioquímicos',17500,'fixo',null),
 ('Exames','Raio-X (2 projeções)',31500,'fixo','A partir da 3ª projeção, cobrança adicional a consultar.'),
 ('Exames','Ultrassom abdominal',24000,'fixo',null),
 ('Exames','Ultrassom abdominal + Cistocentese',30000,'fixo',null),
 ('Exames','Eletrocardiograma',19000,'fixo',null),
 ('Exames','Ecodopplercardiograma',24000,'fixo',null),
 ('Exames','Demais exames de imagem/laboratório',null,'sob_consulta','Consultar preço e disponibilidade.')
on conflict(categoria,nome) do nothing;

do $$
begin
 if (select count(*) from public.racas_grupos_precificacao)<>14 then raise exception 'Mapeamento de raça incompleto';end if;
 if (select count(*) from public.precos_servicos where especie='cachorro' and porte in ('medio','grande'))<24 then raise exception 'M/G incompleto';end if;
 if (select count(*) from public.precos_servicos_grupos)<>15 then raise exception 'Preços específicos incompletos';end if;
 if (select count(*) from public.precos_adicionais_grupos)<>36 then raise exception 'Adicionais de grupo incompletos';end if;
 if (select count(*) from public.catalogo_veterinario)<>16 then raise exception 'Catálogo veterinário incompleto';end if;
end $$;

create function app_private.grupo_precificacao_v24(p_especie text,p_raca text,p_porte text)
returns text language sql stable security definer set search_path=public,pg_temp as $$
 select case when p_especie='gato' then 'felino'
   when p_especie<>'cachorro' then null
   else coalesce((select m.grupo_codigo from public.racas_grupos_precificacao m
       where m.especie='cachorro' and m.raca=p_raca),
       case p_porte when 'pequeno' then 'porte_p'
                    when 'medio' then 'porte_m'
                    when 'grande' then 'porte_g' end) end;
$$;
revoke all on function app_private.grupo_precificacao_v24(text,text,text) from public,anon,authenticated;

create function app_private.preco_servico_v24(p_especie text,p_raca text,p_porte text,p_pelagem text,p_servico_id uuid)
returns table(valor_centavos integer,grupo_codigo text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_grupo text;v_criterio text;
begin
 v_grupo:=app_private.grupo_precificacao_v24(p_especie,p_raca,p_porte);
 select criterio into v_criterio from public.grupos_precificacao where codigo=v_grupo;
 if v_criterio in ('raca','especie') then
   return query select pg.valor_centavos,pg.grupo_codigo
     from public.precos_servicos_grupos pg
     where pg.grupo_codigo=v_grupo and pg.servico_id=p_servico_id;
 else
   return query select ps.valor_centavos,v_grupo
     from public.precos_servicos ps
     where ps.servico_id=p_servico_id and ps.especie=p_especie
       and ps.porte=p_porte and ps.pelagem=p_pelagem;
 end if;
end $$;
revoke all on function app_private.preco_servico_v24(text,text,text,text,uuid) from public,anon,authenticated;

create function app_private.preco_adicional_v24(p_especie text,p_raca text,p_porte text,p_adicional_id uuid)
returns table(valor_centavos integer,modalidade text,grupo_codigo text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_grupo text;
begin
 v_grupo:=app_private.grupo_precificacao_v24(p_especie,p_raca,p_porte);
 if v_grupo='porte_p' then
   return query select pa.valor_centavos,pa.modalidade::text,v_grupo
     from public.precos_adicionais pa
     where pa.adicional_id=p_adicional_id and pa.faixa_aplicacao='cachorro_P_ate_10kg';
 else
   return query select p.valor_centavos,p.modalidade,p.grupo_codigo
     from public.precos_adicionais_grupos p
     where p.grupo_codigo=v_grupo and p.adicional_id=p_adicional_id;
 end if;
end $$;
revoke all on function app_private.preco_adicional_v24(text,text,text,uuid) from public,anon,authenticated;

create or replace function app_private.registrar_valor_producao(p_id uuid,p_origem varchar)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r public.atendimentos%rowtype;
 v_base integer;v_extra integer:=0;v_preco record;v_add uuid;
 v_pendencia boolean:=false;v_motivos text[]:=array[]::text[];v_cobertura varchar(15);
 v_grupo text;
begin
 if p_origem not in ('conclusao','retroativo') then raise exception 'Origem de precificação inválida';end if;
 select * into r from public.atendimentos where id=p_id;
 if not found or r.status<>'concluido' then return;end if;
 -- Não recalcular atendimentos já congelados antes da mudança de preços.
 if exists(select 1 from public.producao_valores where atendimento_id=p_id) then return;end if;
 v_grupo:=app_private.grupo_precificacao_v24(r.especie,r.raca,r.porte);
 if r.especie is null or (r.especie='cachorro' and (r.porte is null or r.raca is null or
    (v_grupo in ('porte_p','porte_m','porte_g') and r.pelagem is null))) then
   v_cobertura:='sem_dados';
   v_motivos:=array_append(v_motivos,'Dados de espécie, raça, porte ou pelagem ausentes');
 else
   select p.valor_centavos into v_base from app_private.preco_servico_v24(
       r.especie,r.raca,r.porte,r.pelagem,r.servico_id) p;
   if v_base is null then
      v_cobertura:='sob_consulta';
      v_motivos:=array_append(v_motivos,'Serviço sem tabela para a categoria específica');
   else v_cobertura:='completo';end if;
 end if;
 for v_add in select unnest(coalesce(r.adicionais,array[]::uuid[])) loop
   select p.valor_centavos,p.modalidade into v_preco
     from app_private.preco_adicional_v24(r.especie,r.raca,r.porte,v_add) p;
   if not found or v_preco.modalidade='sob_consulta' or v_preco.valor_centavos is null then
     v_pendencia:=true;
     v_motivos:=array_append(v_motivos,'Adicional não precificado integralmente para esta categoria');
   else
     v_extra:=v_extra+v_preco.valor_centavos;
     if v_preco.modalidade='a_partir' then
       v_pendencia:=true;
       v_motivos:=array_append(v_motivos,'Adicional com preço mínimo (a partir de)');
     end if;
   end if;
 end loop;
 if r.transporte_bolhas is true then
   v_pendencia:=true;
   v_motivos:=array_append(v_motivos,'Transporte sob consulta');
 end if;
 -- Manejo segue apenas informativo: tabela gerencial não gera cobrança.
 if v_base is not null and v_pendencia then v_cobertura:='parcial';end if;
 insert into public.producao_valores(
  atendimento_id,valor_base_centavos,valor_adicionais_centavos,
  valor_referencia_centavos,cobertura,observacao,origem)
 values (r.id,v_base,v_extra,
     case when v_base is not null then v_base+v_extra else null end,
     v_cobertura,case when cardinality(v_motivos)>0 then array_to_string(v_motivos,'; ') else null end,p_origem)
 on conflict(atendimento_id) do nothing;
end $$;
revoke all on function app_private.registrar_valor_producao(uuid,varchar) from public,anon,authenticated;

-- Snapshot por atividade utiliza os mesmos preços por grupo do atendimento.
create or replace function app_private.distribuir_valores_v23(p_atendimento_id uuid,p_primeira_vez boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_fin public.producao_valores%rowtype;
 v_pai public.atendimentos%rowtype;a record;v_n int;
 v_main_n int;v_seen int:=0;v_prev int:=0;v_val int;v_preco record;
begin
 select * into v_fin from public.producao_valores where atendimento_id=p_atendimento_id;
 select * into v_pai from public.atendimentos where id=p_atendimento_id;
 if not found or v_pai.status<>'concluido' or v_fin.atendimento_id is null then return;end if;
 select count(*) into v_main_n from public.atendimento_etapas
  where atendimento_id=p_atendimento_id and tipo='principal';
 if v_main_n<1 then return;end if;
 if (select coalesce(sum(v.peso_pacote),0) from public.etapa_valores v
   join public.atendimento_etapas e on e.id=v.etapa_id
   where e.atendimento_id=p_atendimento_id and e.tipo='principal')<>100
 then raise exception 'Percentuais do serviço principal precisam totalizar 100';end if;
 for a in select e.*,v.peso_pacote,v.valor_centavos
   from public.atendimento_etapas e join public.etapa_valores v on v.etapa_id=e.id
   where e.atendimento_id=p_atendimento_id
   order by (case when e.tipo='principal' then 0 else 1 end),e.ordem loop
   v_val:=null;
   if a.tipo='principal' then
     v_seen:=v_seen+1;
     if v_fin.valor_base_centavos is not null then
       if v_seen<v_main_n then v_val:=floor(v_fin.valor_base_centavos*a.peso_pacote/100.0);
       else v_val:=v_fin.valor_base_centavos-v_prev;end if;
       v_prev:=v_prev+v_val;
     end if;
   else
     if p_primeira_vez then
       select p.valor_centavos,p.modalidade into v_preco from
         app_private.preco_adicional_v24(v_pai.especie,v_pai.raca,v_pai.porte,a.adicional_id) p;
       if found and v_preco.modalidade in ('fixo','a_partir') then
         v_val:=v_preco.valor_centavos;
       end if;
     else v_val:=a.valor_centavos;end if;
   end if;
   update public.etapa_valores set valor_centavos=v_val,cobertura=v_fin.cobertura,atualizado_em=now()
     where etapa_id=a.id;
   select count(*) into v_n from public.etapa_profissionais
     where etapa_id=a.id and papel='confirmado';
   if (select count(*) from public.etapa_rateios where etapa_id=a.id)<>v_n
    or exists(select 1 from public.etapa_rateios rt where rt.etapa_id=a.id
       and not exists(select 1 from public.etapa_profissionais ep
         where ep.etapa_id=a.id and ep.profissional_id=rt.profissional_id and ep.papel='confirmado')) then
     delete from public.etapa_rateios where etapa_id=a.id;
     if v_n>0 then
       insert into public.etapa_rateios(etapa_id,profissional_id,percentual,valor_centavos)
       select a.id,ep.profissional_id,
         (100/v_n)+case when row_number() over(order by ep.profissional_id)<=100%v_n then 1 else 0 end,null
       from public.etapa_profissionais ep where ep.etapa_id=a.id and ep.papel='confirmado';
     end if;
   end if;
   with parcelas as (
      select r.profissional_id,r.percentual,
        row_number() over(order by r.profissional_id) as rn,count(*) over() as n,
        sum(floor(coalesce(v_val,0)*r.percentual/100.0)::int) over() as base
      from public.etapa_rateios r where r.etapa_id=a.id
   )
   update public.etapa_rateios rt
   set valor_centavos=case when v_val is null then null
     when x.rn=x.n then floor(v_val*x.percentual/100.0)::int+(v_val-x.base)
     else floor(v_val*x.percentual/100.0)::int end
   from parcelas x where rt.etapa_id=a.id and rt.profissional_id=x.profissional_id;
 end loop;
end $$;
revoke all on function app_private.distribuir_valores_v23(uuid,boolean) from public,anon,authenticated;
