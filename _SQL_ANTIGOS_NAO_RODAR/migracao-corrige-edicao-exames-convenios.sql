-- CORRECAO - PERMISSOES DE EDICAO DE EXAMES E CONVENIOS
-- Execute no SQL Editor do Supabase.
-- Regra:
-- - Consulta visualiza registros ativos.
-- - Operador e Administrador criam/editam.
-- - Administrador tambem visualiza inativos e exclui.

begin;

grant select, insert, update, delete on table public.exames to authenticated;
grant select, insert, update, delete on table public.convenios to authenticated;

-- EXAMES
drop policy if exists exames_consultar_ativos on public.exames;
create policy exames_consultar_ativos on public.exames
for select to authenticated
using (
  (coalesce(ativo, true) = true and public.usuario_tem_perfil(array['consulta','operador','administrador']))
  or public.usuario_tem_perfil(array['administrador'])
);

drop policy if exists exames_operador_criar on public.exames;
create policy exames_operador_criar on public.exames
for insert to authenticated
with check (public.usuario_tem_perfil(array['operador','administrador']));

drop policy if exists exames_operador_editar on public.exames;
create policy exames_operador_editar on public.exames
for update to authenticated
using (public.usuario_tem_perfil(array['operador','administrador']))
with check (public.usuario_tem_perfil(array['operador','administrador']));

drop policy if exists exames_admin_excluir on public.exames;
create policy exames_admin_excluir on public.exames
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

-- CONVENIOS
drop policy if exists convenios_consultar_ativos on public.convenios;
create policy convenios_consultar_ativos on public.convenios
for select to authenticated
using (
  (coalesce(ativo, true) = true and public.usuario_tem_perfil(array['consulta','operador','administrador']))
  or public.usuario_tem_perfil(array['administrador'])
);

drop policy if exists convenios_operador_criar on public.convenios;
create policy convenios_operador_criar on public.convenios
for insert to authenticated
with check (public.usuario_tem_perfil(array['operador','administrador']));

drop policy if exists convenios_operador_editar on public.convenios;
create policy convenios_operador_editar on public.convenios
for update to authenticated
using (public.usuario_tem_perfil(array['operador','administrador']))
with check (public.usuario_tem_perfil(array['operador','administrador']));

drop policy if exists convenios_admin_excluir on public.convenios;
create policy convenios_admin_excluir on public.convenios
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

commit;

select
  'Permissoes de edicao corrigidas' as resultado,
  (select count(*) from public.exames) as total_exames,
  (select count(*) from public.convenios) as total_convenios;
