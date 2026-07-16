-- RESTAURA RLS COM POLITICAS SIMPLES E OPERACIONAIS
-- Execute no SQL Editor do Supabase.
--
-- Objetivo:
-- - Remover alertas "RLS Disabled in Public"
-- - Remover alertas "Policy Exists RLS Disabled"
-- - Evitar multiplas policies antigas se acumulando
-- - Manter o sistema funcionando sem bloquear edicoes normais
--
-- Regra:
-- - Usuario precisa estar autenticado.
-- - Consulta, Operador e Administrador visualizam registros ativos.
-- - Administrador tambem visualiza registros inativos.
-- - Operador e Administrador criam/editam exames e convenios.
-- - Somente Administrador exclui exames e convenios.
-- - Avisos: todos visualizam ativos; somente Administrador gerencia.
-- - Favoritos: cada usuario cuida dos proprios favoritos.

begin;

-- Garante permissao base para usuarios logados.
grant select, insert, update, delete on table public.exames to authenticated;
grant select, insert, update, delete on table public.convenios to authenticated;
grant select, insert, update, delete on table public.avisos_internos to authenticated;
grant select, insert, update, delete on table public.favoritos_exames to authenticated;

-- Nao libera operacao anonima direta.
revoke all on table public.exames from anon;
revoke all on table public.convenios from anon;
revoke all on table public.avisos_internos from anon;
revoke all on table public.favoritos_exames from anon;

-- Liga RLS novamente.
alter table public.exames enable row level security;
alter table public.convenios enable row level security;
alter table public.avisos_internos enable row level security;
alter table public.favoritos_exames enable row level security;

-- Limpeza de policies conhecidas para evitar conflitos e alertas de multiplas permissivas.
drop policy if exists exames_consultar_ativos on public.exames;
drop policy if exists exames_operador_criar on public.exames;
drop policy if exists exames_operador_editar on public.exames;
drop policy if exists exames_admin_excluir on public.exames;

drop policy if exists convenios_operacao_consultar on public.convenios;
drop policy if exists convenios_consultar_ativos on public.convenios;
drop policy if exists convenios_operador_criar on public.convenios;
drop policy if exists convenios_operador_editar on public.convenios;
drop policy if exists convenios_admin_excluir on public.convenios;

drop policy if exists avisos_internos_consultar on public.avisos_internos;
drop policy if exists avisos_internos_admin_criar on public.avisos_internos;
drop policy if exists avisos_internos_admin_editar on public.avisos_internos;
drop policy if exists avisos_internos_admin_excluir on public.avisos_internos;

drop policy if exists favoritos_exames_consultar on public.favoritos_exames;
drop policy if exists favoritos_exames_criar on public.favoritos_exames;
drop policy if exists favoritos_exames_editar on public.favoritos_exames;
drop policy if exists favoritos_exames_excluir on public.favoritos_exames;

-- EXAMES
create policy exames_select_perfil on public.exames
for select to authenticated
using (
  (coalesce(ativo, true) = true and public.usuario_tem_perfil(array['consulta','operador','administrador']))
  or public.usuario_tem_perfil(array['administrador'])
);

create policy exames_insert_operacao on public.exames
for insert to authenticated
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy exames_update_operacao on public.exames
for update to authenticated
using (public.usuario_tem_perfil(array['operador','administrador']))
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy exames_delete_admin on public.exames
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

-- CONVENIOS
create policy convenios_select_perfil on public.convenios
for select to authenticated
using (
  (coalesce(ativo, true) = true and public.usuario_tem_perfil(array['consulta','operador','administrador']))
  or public.usuario_tem_perfil(array['administrador'])
);

create policy convenios_insert_operacao on public.convenios
for insert to authenticated
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy convenios_update_operacao on public.convenios
for update to authenticated
using (public.usuario_tem_perfil(array['operador','administrador']))
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy convenios_delete_admin on public.convenios
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

-- AVISOS INTERNOS
create policy avisos_select_perfil on public.avisos_internos
for select to authenticated
using (
  (ativo = true and public.usuario_tem_perfil(array['consulta','operador','administrador']))
  or public.usuario_tem_perfil(array['administrador'])
);

create policy avisos_insert_admin on public.avisos_internos
for insert to authenticated
with check (public.usuario_tem_perfil(array['administrador']));

create policy avisos_update_admin on public.avisos_internos
for update to authenticated
using (public.usuario_tem_perfil(array['administrador']))
with check (public.usuario_tem_perfil(array['administrador']));

create policy avisos_delete_admin on public.avisos_internos
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

-- FAVORITOS
create policy favoritos_select_proprio on public.favoritos_exames
for select to authenticated
using (usuario_id = auth.uid());

create policy favoritos_insert_proprio on public.favoritos_exames
for insert to authenticated
with check (usuario_id = auth.uid());

create policy favoritos_update_proprio on public.favoritos_exames
for update to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

create policy favoritos_delete_proprio on public.favoritos_exames
for delete to authenticated
using (usuario_id = auth.uid());

commit;

select
  'RLS restaurado com politicas operacionais' as resultado,
  (select count(*) from public.exames) as total_exames,
  (select count(*) from public.convenios) as total_convenios,
  (select count(*) from public.avisos_internos) as total_avisos;
