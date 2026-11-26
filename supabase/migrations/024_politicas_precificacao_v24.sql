-- V2.4.0.1 | Políticas consultam app_admins diretamente.
-- Não se concede EXECUTE em app_private ao perfil operacional.
drop policy if exists admin_grupos_v24 on public.grupos_precificacao;
drop policy if exists admin_racas_grupos_v24 on public.racas_grupos_precificacao;
drop policy if exists admin_precos_servicos_v24 on public.precos_servicos_grupos;
drop policy if exists admin_precos_adicionais_v24 on public.precos_adicionais_grupos;
drop policy if exists admin_manejos_v24 on public.precos_manejo_grupos;
drop policy if exists admin_veterinario_v24 on public.catalogo_veterinario;
create policy admin_grupos_v24 on public.grupos_precificacao for all to authenticated
using(exists(select 1 from public.app_admins where user_id=(select auth.uid())))
with check(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_racas_grupos_v24 on public.racas_grupos_precificacao for all to authenticated
using(exists(select 1 from public.app_admins where user_id=(select auth.uid())))
with check(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_precos_servicos_v24 on public.precos_servicos_grupos for all to authenticated
using(exists(select 1 from public.app_admins where user_id=(select auth.uid())))
with check(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_precos_adicionais_v24 on public.precos_adicionais_grupos for all to authenticated
using(exists(select 1 from public.app_admins where user_id=(select auth.uid())))
with check(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_manejos_v24 on public.precos_manejo_grupos for all to authenticated
using(exists(select 1 from public.app_admins where user_id=(select auth.uid())))
with check(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
create policy admin_veterinario_v24 on public.catalogo_veterinario for all to authenticated
using(exists(select 1 from public.app_admins where user_id=(select auth.uid())))
with check(exists(select 1 from public.app_admins where user_id=(select auth.uid())));
