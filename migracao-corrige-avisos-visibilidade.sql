-- CORRECAO - AVISOS VISIVEIS PARA TODOS OS USUARIOS LOGADOS
-- Execute no SQL Editor do Supabase.

begin;

grant select, insert, update, delete on table public.avisos_internos to authenticated;

drop policy if exists avisos_internos_consultar on public.avisos_internos;
create policy avisos_internos_consultar on public.avisos_internos
for select to authenticated
using (
  (ativo = true and public.usuario_tem_perfil(array['consulta','operador','administrador']))
  or public.usuario_tem_perfil(array['administrador'])
);

drop policy if exists avisos_internos_admin_criar on public.avisos_internos;
create policy avisos_internos_admin_criar on public.avisos_internos
for insert to authenticated
with check (public.usuario_tem_perfil(array['administrador']));

drop policy if exists avisos_internos_admin_editar on public.avisos_internos;
create policy avisos_internos_admin_editar on public.avisos_internos
for update to authenticated
using (public.usuario_tem_perfil(array['administrador']))
with check (public.usuario_tem_perfil(array['administrador']));

drop policy if exists avisos_internos_admin_excluir on public.avisos_internos;
create policy avisos_internos_admin_excluir on public.avisos_internos
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

commit;

select
  'Visibilidade dos avisos corrigida' as resultado,
  count(*) filter (where ativo = true) as avisos_ativos
from public.avisos_internos;
