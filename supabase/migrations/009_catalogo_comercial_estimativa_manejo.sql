-- V2.1: catálogo comercial isolado da operação. Preço em centavos (sem arredondamento flutuante).
create table public.precos_servicos (
  servico_id uuid not null references public.servicos(id) on delete cascade,
  especie varchar(10) not null check(especie in ('cachorro','gato')),
  porte varchar(7) not null check(porte in ('pequeno','medio','grande')),
  pelagem varchar(8) not null check(pelagem in ('curto','medio','longo')),
  valor_centavos integer not null check(valor_centavos>=0 and valor_centavos<=100000000),
  atualizado_em timestamptz not null default now(),
  primary key (servico_id,especie,porte,pelagem)
);
create table public.catalogo_adicionais (
  id uuid primary key default gen_random_uuid(),
  nome varchar(120) not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table public.precos_adicionais (
  adicional_id uuid primary key references public.catalogo_adicionais(id) on delete cascade,
  valor_centavos integer check(valor_centavos is null or (valor_centavos>=0 and valor_centavos<=100000000)),
  modalidade varchar(15) not null default 'sob_consulta'
    check(modalidade in ('fixo','a_partir','sob_consulta')),
  atualizado_em timestamptz not null default now(),
  constraint preco_adicional_consistente check (
    (modalidade='sob_consulta') or (valor_centavos is not null)
  )
);
alter table public.precos_servicos enable row level security;
alter table public.catalogo_adicionais enable row level security;
alter table public.precos_adicionais enable row level security;
revoke all on public.precos_servicos,public.precos_adicionais,public.catalogo_adicionais from anon;
grant select,insert,update,delete on public.precos_servicos,public.precos_adicionais to authenticated;
grant select,insert,update,delete on public.catalogo_adicionais to authenticated;
-- As tabelas com valores só são consultáveis/modificáveis por administradores.
create policy "admin_precos_servicos" on public.precos_servicos
for all to authenticated using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "admin_precos_adicionais" on public.precos_adicionais
for all to authenticated using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "consulta_adicionais_equipe" on public.catalogo_adicionais
for select to authenticated using (
 exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
 or exists(select 1 from public.app_operadores o where o.user_id=(select auth.uid()))
);
create policy "admin_edita_adicionais" on public.catalogo_adicionais
for all to authenticated
using (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
alter table public.solicitacoes_agendamento
 add column pelagem varchar(8) check(pelagem in ('curto','medio','longo')),
 add column adicionais uuid[] not null default '{}'::uuid[];
alter table public.atendimentos
 add column pelagem varchar(8) check(pelagem in ('curto','medio','longo')),
 add column adicionais uuid[] not null default '{}'::uuid[],
 add column manejo varchar(20) check(manejo in ('nao_se_aplica','ansioso','agressivo','idoso'));
create index atendimentos_manejo_idx on public.atendimentos(manejo) where manejo is not null;
-- Preços informados unicamente para cães de até 10 kg (porte P).
with valores(nome,especie,porte,pelagem,centavos) as (
 values
 ('Banho','cachorro','pequeno','curto',7000),
('Banho','cachorro','pequeno','medio',7500),
('Banho','cachorro','pequeno','longo',8000),
('Banho com Tosa Higiênica','cachorro','pequeno','curto',8000),
('Banho com Tosa Higiênica','cachorro','pequeno','medio',8500),
('Banho com Tosa Higiênica','cachorro','pequeno','longo',9500),
('Banho e Tosa na Tesoura','cachorro','pequeno','curto',15000),
('Banho e Tosa na Tesoura','cachorro','pequeno','medio',16000),
('Banho e Tosa na Tesoura','cachorro','pequeno','longo',17000),
('Banho com Tosa na Máquina','cachorro','pequeno','curto',9500),
('Banho com Tosa na Máquina','cachorro','pequeno','medio',10500),
('Banho com Tosa na Máquina','cachorro','pequeno','longo',11000)
)
insert into public.precos_servicos(servico_id,especie,porte,pelagem,valor_centavos)
select s.id,v.especie,v.porte,v.pelagem,v.centavos
from valores v join public.servicos s on s.nome=v.nome
on conflict do nothing;

with valores(nome,centavos,modalidade) as (
 values
 ('Hidratação',2500,'fixo'),
('Tosa Geral sem Banho',5500,'a_partir'),
('Antipulgas',3000,'fixo'),
('Desembolo',7000,'fixo'),
('Escovação Dental',1000,'fixo'),
('TaxiDog',2500,'sob_consulta')
)
insert into public.catalogo_adicionais(nome)
select nome from valores on conflict(nome) do nothing;
with valores(nome,centavos,modalidade) as (
 values
 ('Hidratação',2500,'fixo'),
('Tosa Geral sem Banho',5500,'a_partir'),
('Antipulgas',3000,'fixo'),
('Desembolo',7000,'fixo'),
('Escovação Dental',1000,'fixo'),
('TaxiDog',2500,'sob_consulta')
)
insert into public.precos_adicionais(adicional_id,valor_centavos,modalidade)
select a.id,v.centavos,v.modalidade
from valores v join public.catalogo_adicionais a on a.nome=v.nome
on conflict do nothing;

-- Guardar itens do pedido no atendimento somente quando a entrada for autorizada.
create or replace function app_private.registrar_entrada_programada_interna(p_programacao_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_programa public.programacao%rowtype;
declare v_solicita public.solicitacoes_agendamento%rowtype;
declare v_atendimento uuid;
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select auth.uid()) is null or not (
    exists(select 1 from public.app_admins where user_id=(select auth.uid()))
    or exists(select 1 from public.app_operadores where user_id=(select auth.uid()))
  ) then raise exception 'Perfil sem permissao para registrar entrada' using errcode='42501'; end if;
  select * into v_programa from public.programacao where id=p_programacao_id for update;
  if not found or v_programa.status<>'programado' then raise exception 'Agendamento indisponivel ou ja processado'; end if;
  if v_programa.data_programada<>v_hoje then raise exception 'A entrada so pode ser realizada na data programada'; end if;
  select * into v_solicita from public.solicitacoes_agendamento where id=v_programa.solicitacao_id and status='aprovado';
  if not found then raise exception 'Solicitacao aprovada nao encontrada'; end if;
  insert into public.atendimentos(
    animal_nome,tutor,servico_id,agendado,horario_agendado,agendamento_id,
    porte,cep,rua,numero,complemento,bairro,cidade,uf,
    especie,raca,transporte_bolhas,pelagem,adicionais
  ) values (
    v_solicita.pet_nome,v_solicita.tutor_nome,v_solicita.servico_id,true,null,
    v_solicita.id,v_solicita.porte,v_solicita.cep,v_solicita.rua,
    v_solicita.numero,v_solicita.complemento,v_solicita.bairro,
    v_solicita.cidade,v_solicita.uf,v_solicita.especie,v_solicita.raca,
    v_solicita.transporte_bolhas,v_solicita.pelagem,v_solicita.adicionais
  ) returning id into v_atendimento;
  update public.programacao set status='entrada_realizada',atendimento_id=v_atendimento,
    registrado_em=now(),registrado_por=(select auth.uid()) where id=p_programacao_id;
  return v_atendimento;
end $$;
-- A seleção de manejo na chegada não deve permitir preço nem duplicação.
create function app_private.registrar_entrada_programada_v3_interna(p_programacao_id uuid,p_manejo text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if p_manejo not in ('nao_se_aplica','ansioso','agressivo','idoso') or p_manejo is null
  then raise exception 'Manejo inválido';end if;
  v_id:=app_private.registrar_entrada_programada_interna(p_programacao_id);
  update public.atendimentos set manejo=p_manejo where id=v_id;
  return v_id;
end $$;
create function public.registrar_entrada_programada_v3(p_programacao_id uuid,p_manejo text)
returns uuid language sql security invoker set search_path=public,pg_temp as $$
 select app_private.registrar_entrada_programada_v3_interna(p_programacao_id,p_manejo);
$$;
revoke all on function app_private.registrar_entrada_programada_v3_interna(uuid,text) from public,anon;
revoke all on function public.registrar_entrada_programada_v3(uuid,text) from public,anon;
grant execute on function app_private.registrar_entrada_programada_v3_interna(uuid,text) to authenticated;
grant execute on function public.registrar_entrada_programada_v3(uuid,text) to authenticated;

-- Compatibilidade do contrato de lista, novo campo de adicionais sem valores.
create function app_private.listar_programacao_entrada_v3_interna(p_data date)
returns table (
  programacao_id uuid, solicitacao_id uuid, data_programada date,
  status varchar(18), motivo_recusa varchar(24), justificativa_outro varchar(200),
  atendimento_id uuid, registrado_em timestamptz,
  tutor_nome varchar(120), pet_nome varchar(120), porte varchar(7), servico_id uuid,
  cep char(8), rua varchar(180), numero varchar(20), complemento varchar(180),
  bairro varchar(120), cidade varchar(120), uf char(2),
  especie varchar(10), raca varchar(100), transporte_bolhas boolean,
  pelagem varchar(8), adicionais uuid[]
) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
 if (select auth.uid()) is null or not (
  exists(select 1 from public.app_admins where user_id=(select auth.uid()))
  or exists(select 1 from public.app_operadores where user_id=(select auth.uid()))
 ) then raise exception 'Perfil sem acesso' using errcode='42501';end if;
 if p_data is null or p_data<v_hoje or p_data>v_hoje+30 then raise exception 'Data inválida';end if;
 return query select p.id,p.solicitacao_id,p.data_programada,p.status,p.motivo_recusa,p.justificativa_outro,
 p.atendimento_id,p.registrado_em,s.tutor_nome,s.pet_nome,s.porte,s.servico_id,
 s.cep,s.rua,s.numero,s.complemento,s.bairro,s.cidade,s.uf,s.especie,s.raca,
 s.transporte_bolhas,s.pelagem,s.adicionais
 from public.programacao p join public.solicitacoes_agendamento s on s.id=p.solicitacao_id
 where p.data_programada=p_data and s.status='aprovado'
 order by s.pet_nome,p.incluido_em;
end $$;
create function public.listar_programacao_entrada_v3(p_data date)
returns table (
  programacao_id uuid, solicitacao_id uuid, data_programada date,
  status varchar(18), motivo_recusa varchar(24), justificativa_outro varchar(200),
  atendimento_id uuid, registrado_em timestamptz,
  tutor_nome varchar(120), pet_nome varchar(120), porte varchar(7), servico_id uuid,
  cep char(8), rua varchar(180), numero varchar(20), complemento varchar(180),
  bairro varchar(120), cidade varchar(120), uf char(2),
  especie varchar(10), raca varchar(100), transporte_bolhas boolean,
  pelagem varchar(8), adicionais uuid[]
) language sql security invoker set search_path=public,pg_temp as $$
 select * from app_private.listar_programacao_entrada_v3_interna(p_data);
$$;
revoke all on function app_private.listar_programacao_entrada_v3_interna(date) from public,anon;
revoke all on function public.listar_programacao_entrada_v3(date) from public,anon;
grant execute on function app_private.listar_programacao_entrada_v3_interna(date) to authenticated;
grant execute on function public.listar_programacao_entrada_v3(date) to authenticated;
