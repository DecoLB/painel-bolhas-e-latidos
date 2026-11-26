-- V2.4.1: Valor comercial integral por produto e vínculo real do executor.
-- Nenhuma remuneração/comissão é calculada. Preserva histórico anterior de auditabilidade.
create or replace function app_private.distribuir_valores_v23(
 p_atendimento_id uuid,p_primeira_vez boolean default false
) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_fin public.producao_valores%rowtype;
 v_pet public.atendimentos%rowtype;
 etapa record;
 v_val integer;
 v_extra record;
begin
 select * into v_fin from public.producao_valores where atendimento_id=p_atendimento_id;
 select * into v_pet from public.atendimentos where id=p_atendimento_id;
 if v_fin.atendimento_id is null or v_pet.id is null or v_pet.status<>'concluido' then return;end if;
 for etapa in
   select e.*,v.valor_centavos as valor_guardado
   from public.atendimento_etapas e
   join public.etapa_valores v on v.etapa_id=e.id
   where e.atendimento_id=p_atendimento_id
   order by e.ordem,e.id
 loop
   v_val:=null;
   if etapa.tipo='principal' then
     -- Referência do produto comercial completo, inclusive em pacote Banho + Tosa.
     -- A referência se repete em atividades relacionadas: NÃO somar essas linhas como vendas.
     v_val:=v_fin.valor_base_centavos;
   else
     if p_primeira_vez then
       select p.valor_centavos,p.modalidade into v_extra
       from app_private.preco_adicional_v24(
         v_pet.especie,v_pet.raca,v_pet.porte,etapa.adicional_id) p;
       if found and v_extra.modalidade in ('fixo','a_partir') then
         v_val:=v_extra.valor_centavos;
       end if;
     else
       -- A correção posterior conserva o valor registrado ao concluir.
       v_val:=etapa.valor_guardado;
     end if;
   end if;
   update public.etapa_valores
      set valor_centavos=v_val,cobertura=v_fin.cobertura,atualizado_em=now()
    where etapa_id=etapa.id;
 end loop;
 -- Nenhuma gravação em etapa_rateios: o valor cheio é associado ao produto,
 -- e os executores reais são identificados em etapa_profissionais.
end $$;
revoke all on function public.ajustar_rateio_v23(uuid,jsonb,text) from public,anon,authenticated;
