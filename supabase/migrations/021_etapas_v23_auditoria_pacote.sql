-- V2.3: correção de horários também atualiza o consolidado do atendimento.
create or replace function public.corrigir_etapa_v23(
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
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim>now()
   or p_inicio<(select criado_em from public.atendimentos where id=v_etapa.atendimento_id) then
  raise exception 'Os horários devem ser posteriores à entrada e o fim não pode estar no futuro';end if;
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
 select coalesce(jsonb_agg(app_private.snapshot_etapa_v23(x.id) order by x.tipo,x.ordem),'[]'::jsonb)
 into v_before from public.atendimento_etapas x where x.atendimento_id=v_etapa.atendimento_id;
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
 -- Refletir correções de horários no tempo agregado do atendimento.
 update public.atendimentos a set
   iniciado_em=(select min(iniciado_em) from public.atendimento_etapas
      where atendimento_id=v_etapa.atendimento_id),
   concluido_em=(select max(concluido_em) from public.atendimento_etapas
      where atendimento_id=v_etapa.atendimento_id)
 where a.id=v_etapa.atendimento_id and a.status='concluido';
 perform app_private.distribuir_valores_v23(v_etapa.atendimento_id,false);
 delete from public.fichas_conferencia where atendimento_id=v_etapa.atendimento_id;
 select coalesce(jsonb_agg(app_private.snapshot_etapa_v23(x.id) order by x.tipo,x.ordem),'[]'::jsonb)
 into v_after from public.atendimento_etapas x where x.atendimento_id=v_etapa.atendimento_id;
 insert into public.etapa_auditoria(atendimento_id,etapa_id,evento,anterior,posterior,justificativa,administrador_id)
 values(v_etapa.atendimento_id,p_etapa_id,'correcao',v_before,v_after,trim(p_justificativa),auth.uid());
end $$;
