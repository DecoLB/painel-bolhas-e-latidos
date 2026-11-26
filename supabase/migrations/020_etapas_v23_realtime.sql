-- Publicar apenas dados operacionais. Nenhuma tabela financeira entra no Realtime.
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public' and tablename='atendimento_etapas') then
     alter publication supabase_realtime add table public.atendimento_etapas;
   end if;
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
     and schemaname='public' and tablename='etapa_profissionais') then
     alter publication supabase_realtime add table public.etapa_profissionais;
   end if;
 end if;
end $$;