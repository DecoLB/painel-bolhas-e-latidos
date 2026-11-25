-- V2.0: transporte condicionado no agendamento e especie/raca no ciclo de atendimento.
-- Dados históricos permanecem sem espécie/raça/transporte inferidos.
create table if not exists public.catalogo_racas (
  especie varchar(10) not null check (especie in ('cachorro','gato')),
  nome varchar(100) not null,
  primary key (especie,nome)
);
alter table public.catalogo_racas enable row level security;
insert into public.catalogo_racas(especie,nome) values
  ('cachorro','SRD - Sem raça definida'),
  ('cachorro','Akita'),
  ('cachorro','American Bully'),
  ('cachorro','American Staffordshire Terrier'),
  ('cachorro','Bassethound'),
  ('cachorro','Beagle'),
  ('cachorro','Bichon Frise'),
  ('cachorro','Biewer Terrier'),
  ('cachorro','Boiadeiro-australiano'),
  ('cachorro','Border Collie'),
  ('cachorro','Border Terrier'),
  ('cachorro','Boxer'),
  ('cachorro','Buldogue francês'),
  ('cachorro','Buldogue Ingles'),
  ('cachorro','Bull Terrier'),
  ('cachorro','Bull Terrier Miniatura'),
  ('cachorro','Bulldogue'),
  ('cachorro','Cane Corso'),
  ('cachorro','Cavalier King Charles Spaniel'),
  ('cachorro','Chihuahua'),
  ('cachorro','Chow Chow'),
  ('cachorro','Cocker Spaniel Americano'),
  ('cachorro','Cocker Spaniel Ingles'),
  ('cachorro','Collie'),
  ('cachorro','Dachshund'),
  ('cachorro','Dachshund Miniatura'),
  ('cachorro','Dalmata'),
  ('cachorro','Dobermann'),
  ('cachorro','Dogo Argentino'),
  ('cachorro','Dogue Alemão'),
  ('cachorro','Fila Brasileiro'),
  ('cachorro','Fox Terrier'),
  ('cachorro','Fox Terrier Brasileiro'),
  ('cachorro','Foxhound Americano'),
  ('cachorro','Foxhound Ingles'),
  ('cachorro','Golden Retriever'),
  ('cachorro','Husky Siberiano'),
  ('cachorro','Jack Russell'),
  ('cachorro','Lhasa Apso'),
  ('cachorro','Lulu da Pomerânia'),
  ('cachorro','Malamute dos Alasca'),
  ('cachorro','Maltês'),
  ('cachorro','Papillon'),
  ('cachorro','Pastor Alemão'),
  ('cachorro','Pastor Australiano'),
  ('cachorro','Pastor Belga'),
  ('cachorro','Pastor de Shetland'),
  ('cachorro','Pequinês'),
  ('cachorro','Pinscher'),
  ('cachorro','Pinscher Miniatura'),
  ('cachorro','Pit Bull'),
  ('cachorro','Poodle Gigante'),
  ('cachorro','Poodle Micro'),
  ('cachorro','Poodle Standard'),
  ('cachorro','Poodle Toy'),
  ('cachorro','Pug'),
  ('cachorro','Labrador'),
  ('cachorro','Rottweiller'),
  ('cachorro','Samoieda'),
  ('cachorro','São Bernardo'),
  ('cachorro','Schnauzer'),
  ('cachorro','Schnauzer Anão'),
  ('cachorro','Schnauzer Gigante'),
  ('cachorro','Shar-pei'),
  ('cachorro','SHIBA INU'),
  ('cachorro','Shih- Tzu'),
  ('cachorro','Spitz'),
  ('cachorro','Terra Nova'),
  ('cachorro','Weimaraner'),
  ('cachorro','West highland white terrier'),
  ('cachorro','Yorkshire Terrier'),
  ('gato','Gato/Felino')
on conflict (especie,nome) do nothing;
revoke all on public.catalogo_racas from anon;
grant select on public.catalogo_racas to authenticated,service_role;
drop policy if exists "Equipe autorizada consulta racas" on public.catalogo_racas;
create policy "Equipe autorizada consulta racas" on public.catalogo_racas
for select to authenticated using (
  (select auth.uid()) is not null
  and (
    exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()))
    or exists (select 1 from public.app_operadores o where o.user_id = (select auth.uid()))
  )
);
alter table public.solicitacoes_agendamento
  add column especie varchar(10),
  add column raca varchar(100),
  add column transporte_bolhas boolean;
alter table public.atendimentos
  add column especie varchar(10),
  add column raca varchar(100),
  add column transporte_bolhas boolean;
alter table public.solicitacoes_agendamento
  add constraint solicitacao_especie_raca_valida check (
    (especie is null and raca is null) or
    (especie = 'cachorro' and raca is not null) or
    (especie = 'gato' and raca = 'Gato/Felino')
  ),
  add constraint solicitacao_raca_catalogo_fkey
    foreign key (especie,raca) references public.catalogo_racas(especie,nome);
alter table public.atendimentos
  add constraint atendimento_especie_raca_valida check (
    (especie is null and raca is null) or
    (especie = 'cachorro' and raca is not null) or
    (especie = 'gato' and raca = 'Gato/Felino')
  ),
  add constraint atendimento_raca_catalogo_fkey
    foreign key (especie,raca) references public.catalogo_racas(especie,nome);
-- Endereço não é solicitado nem armazenado para quem não precisa de transporte.
-- As cinco colunas eram NOT NULL; a semântica original é preservada via CHECK para transporte SIM.
alter table public.solicitacoes_agendamento
  alter column cep drop not null,
  alter column rua drop not null,
  alter column numero drop not null,
  alter column cidade drop not null,
  alter column uf drop not null;
alter table public.solicitacoes_agendamento
  add constraint solicitacao_transporte_endereco check (
    transporte_bolhas is null
    or (
      transporte_bolhas is true and
      cep is not null and rua is not null and numero is not null
      and cidade is not null and uf is not null
    )
    or (
      transporte_bolhas is false and
      cep is null and rua is null and numero is null
      and complemento is null and bairro is null and cidade is null and uf is null
    )
  );
-- Os três campos são copiados para o atendimento somente na data autorizada.
create or replace function app_private.registrar_entrada_programada_interna(p_programacao_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$
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
  if not found or v_programa.status<>'programado' then
    raise exception 'Agendamento indisponivel ou ja processado';
  end if;
  if v_programa.data_programada<>v_hoje then
    raise exception 'A entrada so pode ser realizada na data programada';
  end if;
  select * into v_solicita from public.solicitacoes_agendamento
    where id=v_programa.solicitacao_id and status='aprovado';
  if not found then raise exception 'Solicitacao aprovada nao encontrada'; end if;

  insert into public.atendimentos(
    animal_nome,tutor,servico_id,agendado,horario_agendado,agendamento_id,
    porte,cep,rua,numero,complemento,bairro,cidade,uf,
    especie,raca,transporte_bolhas
  ) values (
    v_solicita.pet_nome,v_solicita.tutor_nome,v_solicita.servico_id,true,null,
    v_solicita.id,v_solicita.porte,v_solicita.cep,v_solicita.rua,
    v_solicita.numero,v_solicita.complemento,v_solicita.bairro,
    v_solicita.cidade,v_solicita.uf,
    v_solicita.especie,v_solicita.raca,v_solicita.transporte_bolhas
  ) returning id into v_atendimento;
  update public.programacao set
    status='entrada_realizada',atendimento_id=v_atendimento,
    registrado_em=now(),registrado_por=(select auth.uid())
  where id=p_programacao_id;
  return v_atendimento;
end;
$$;
-- Contrato V2: preserva a RPC V1 usada por clientes já abertos.
-- Disponibiliza espécie, raça e transporte somente aos perfis autorizados.
create function app_private.listar_programacao_entrada_v2_interna(p_data date)
returns table (
  programacao_id uuid, solicitacao_id uuid, data_programada date,
  status varchar(18), motivo_recusa varchar(24), justificativa_outro varchar(200),
  atendimento_id uuid, registrado_em timestamptz,
  tutor_nome varchar(120), pet_nome varchar(120), porte varchar(7), servico_id uuid,
  cep char(8), rua varchar(180), numero varchar(20), complemento varchar(180),
  bairro varchar(120), cidade varchar(120), uf char(2),
  especie varchar(10), raca varchar(100), transporte_bolhas boolean
) language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if (select auth.uid()) is null or not (
    exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
    or exists(select 1 from public.app_operadores o where o.user_id=(select auth.uid()))
  ) then raise exception 'Perfil sem acesso a programacao' using errcode='42501'; end if;
  if p_data is null or p_data < v_hoje or p_data > v_hoje+30 then
    raise exception 'Consulta permitida apenas entre hoje e os proximos 30 dias'; end if;
  return query
  select p.id,p.solicitacao_id,p.data_programada,p.status,p.motivo_recusa,
    p.justificativa_outro,p.atendimento_id,p.registrado_em,
    s.tutor_nome,s.pet_nome,s.porte,s.servico_id,s.cep,s.rua,s.numero,
    s.complemento,s.bairro,s.cidade,s.uf,
    s.especie,s.raca,s.transporte_bolhas
  from public.programacao p
  join public.solicitacoes_agendamento s on s.id=p.solicitacao_id
  where p.data_programada=p_data and s.status='aprovado'
  order by s.pet_nome,p.incluido_em;
end;
$$;
create function public.listar_programacao_entrada_v2(p_data date)
returns table (
  programacao_id uuid, solicitacao_id uuid, data_programada date,
  status varchar(18), motivo_recusa varchar(24), justificativa_outro varchar(200),
  atendimento_id uuid, registrado_em timestamptz,
  tutor_nome varchar(120), pet_nome varchar(120), porte varchar(7), servico_id uuid,
  cep char(8), rua varchar(180), numero varchar(20), complemento varchar(180),
  bairro varchar(120), cidade varchar(120), uf char(2),
  especie varchar(10), raca varchar(100), transporte_bolhas boolean
) language sql security invoker set search_path=public,pg_temp
as $$ select * from app_private.listar_programacao_entrada_v2_interna(p_data); $$;
revoke all on function app_private.listar_programacao_entrada_v2_interna(date) from public,anon;
revoke all on function public.listar_programacao_entrada_v2(date) from public,anon;
grant execute on function app_private.listar_programacao_entrada_v2_interna(date) to authenticated;
grant execute on function public.listar_programacao_entrada_v2(date) to authenticated;
