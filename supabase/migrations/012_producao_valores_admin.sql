-- Gestão financeira V2.2: instantâneo ESTIMADO na conclusão, separado da operação.
-- Valores nunca gravados na tabela atendimentos, consultada por Operacional.
-- Não representa pagamento/receita recebida; retido só durante a vida do atendimento (ON DELETE CASCADE).
create table if not exists public.producao_valores (
  atendimento_id uuid primary key references public.atendimentos(id) on delete cascade,
  valor_base_centavos integer,
  valor_adicionais_centavos integer not null default 0,
  valor_referencia_centavos integer,
  cobertura varchar(15) not null check(cobertura in ('completo','parcial','sob_consulta','sem_dados')),
  observacao text,
  origem varchar(18) not null check(origem in ('conclusao','retroativo')),
  registrado_em timestamptz not null default now(),
  constraint producao_valores_nao_negativos check (
    (valor_base_centavos is null or valor_base_centavos>=0) and
    valor_adicionais_centavos>=0 and
    (valor_referencia_centavos is null or valor_referencia_centavos>=0)
  )
);
alter table public.producao_valores enable row level security;
revoke all on table public.producao_valores from public,anon,authenticated;
grant select on table public.producao_valores to authenticated;
grant all on table public.producao_valores to service_role;
drop policy if exists producao_valores_somente_administrador on public.producao_valores;
create policy producao_valores_somente_administrador on public.producao_valores
 for select to authenticated using(
  (select auth.uid()) is not null
  and exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
 );

create or replace function app_private.registrar_valor_producao(p_id uuid,p_origem varchar)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r public.atendimentos%rowtype;
 v_base integer;
 v_extra integer:=0;
 v_preco record;
 v_add uuid;
 v_pendencia boolean:=false;
 v_motivos text[]:=array[]::text[];
 v_cobertura varchar(15);
begin
 if p_origem not in ('conclusao','retroativo') then
  raise exception 'Origem de precificacao inválida';
 end if;
 select * into r from public.atendimentos where id=p_id;
 if not found or r.status<>'concluido' then return; end if;

 if r.especie is null or r.porte is null or r.pelagem is null then
   v_cobertura:='sem_dados';
   v_motivos:=array_append(v_motivos,'Espécie, porte ou pelagem ausente');
 else
   select ps.valor_centavos into v_base
    from public.precos_servicos ps
    where ps.servico_id=r.servico_id and ps.especie=r.especie
      and ps.porte=r.porte and ps.pelagem=r.pelagem;
   if v_base is null then
     v_cobertura:='sob_consulta';
     v_motivos:=array_append(v_motivos,'Sem tabela comercial para espécie, porte e pelagem');
   else
     v_cobertura:='completo';
   end if;
 end if;

 for v_add in select unnest(coalesce(r.adicionais,array[]::uuid[])) loop
   select pa.valor_centavos,pa.modalidade,pa.faixa_aplicacao
     into v_preco from public.precos_adicionais pa where pa.adicional_id=v_add;
   if not found or v_preco.faixa_aplicacao<>'cachorro_P_ate_10kg'
      or r.especie is distinct from 'cachorro'
      or r.porte is distinct from 'pequeno'
      or v_preco.modalidade='sob_consulta' or v_preco.valor_centavos is null then
     v_pendencia:=true;
     v_motivos:=array_append(v_motivos,'Adicional sem preço fechado aplicável');
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

 if v_base is not null and v_pendencia then v_cobertura:='parcial'; end if;

 insert into public.producao_valores(
    atendimento_id,valor_base_centavos,valor_adicionais_centavos,
    valor_referencia_centavos,cobertura,observacao,origem
 ) values (
    r.id,v_base,v_extra,
    case when v_base is not null then v_base+v_extra else null end,
    v_cobertura,
    case when cardinality(v_motivos)>0 then array_to_string(v_motivos,'; ') else null end,
    p_origem
 )
 on conflict (atendimento_id) do nothing; -- Histórico financeiro imutável ante alterações de preço.
end;
$$;
revoke all on function app_private.registrar_valor_producao(uuid,varchar) from public,anon,authenticated;

create or replace function app_private.capturar_producao_conclusao()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='concluido' and old.status is distinct from new.status then
   perform app_private.registrar_valor_producao(new.id,'conclusao');
 end if;
 return new;
end;
$$;
revoke all on function app_private.capturar_producao_conclusao() from public,anon,authenticated;
drop trigger if exists trg_capturar_producao_conclusao on public.atendimentos;
create trigger trg_capturar_producao_conclusao
after update of status on public.atendimentos for each row
when (new.status='concluido' and old.status is distinct from new.status)
execute function app_private.capturar_producao_conclusao();

-- Retroativo: não inventar espécie, porte, pelagem nem preço histórico.
do $$
declare x record;
begin
 for x in
  select a.id from public.atendimentos a
  left join public.producao_valores v on v.atendimento_id=a.id
  where a.status='concluido' and v.atendimento_id is null
 loop
  perform app_private.registrar_valor_producao(x.id,'retroativo');
 end loop;
end;
$$;
