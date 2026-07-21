-- CORRECAO RLS - BANCO BLOQUEANDO SALVAR EDICAO
-- Execute no SQL Editor do Supabase.
--
-- Objetivo:
-- - Manter RLS ligado para nao voltar alerta critico.
-- - Fazer o banco reconhecer corretamente Consulta / Operador / Administrador.
-- - Liberar edicao de exames e convenios para Operador e Administrador.
-- - Liberar gerenciamento de avisos e usuarios para Administrador.
-- - Evitar policies duplicadas/conflitantes acumuladas.

begin;

-- 1) Funcao central de permissao.
-- SECURITY DEFINER é importante: sem isso, a propria RLS da tabela de perfis
-- pode impedir a funcao de enxergar o perfil do usuario logado.
create or replace function public.usuario_tem_perfil(perfis_permitidos text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis_usuarios p
    where p.usuario_id = auth.uid()
      and coalesce(p.ativo, false) = true
      and lower(p.perfil) = any (
        select lower(valor)
        from unnest(perfis_permitidos) as valor
      )
  );
$$;

grant execute on function public.usuario_tem_perfil(text[]) to authenticated;

-- 2) Permissoes base para usuarios logados.
grant select, insert, update, delete on table public.exames to authenticated;
grant select, insert, update, delete on table public.convenios to authenticated;
grant select, insert, update, delete on table public.avisos_internos to authenticated;
grant select, insert, update, delete on table public.favoritos_exames to authenticated;
grant select, insert, update, delete on table public.perfis_usuarios to authenticated;

-- Nao deixar anonimo operar diretamente.
revoke all on table public.exames from anon;
revoke all on table public.convenios from anon;
revoke all on table public.avisos_internos from anon;
revoke all on table public.favoritos_exames from anon;
revoke all on table public.perfis_usuarios from anon;

-- 3) RLS ligado.
alter table public.exames enable row level security;
alter table public.convenios enable row level security;
alter table public.avisos_internos enable row level security;
alter table public.favoritos_exames enable row level security;
alter table public.perfis_usuarios enable row level security;

-- 4) Limpa TODAS as policies dessas tabelas para evitar policy velha acumulada.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'exames',
        'convenios',
        'avisos_internos',
        'favoritos_exames',
        'perfis_usuarios'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 5) PERFIS DE USUARIO
-- Cada usuario ve o proprio perfil; administrador ve todos e gerencia.
create policy perfis_select_proprio_ou_admin on public.perfis_usuarios
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.usuario_tem_perfil(array['administrador'])
);

create policy perfis_insert_admin_ou_proprio on public.perfis_usuarios
for insert to authenticated
with check (
  usuario_id = auth.uid()
  or public.usuario_tem_perfil(array['administrador'])
);

create policy perfis_update_admin on public.perfis_usuarios
for update to authenticated
using (public.usuario_tem_perfil(array['administrador']))
with check (public.usuario_tem_perfil(array['administrador']));

create policy perfis_delete_admin on public.perfis_usuarios
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

-- 6) EXAMES
-- Consulta/Operador/Admin veem ativos. Admin tambem ve inativos.
create policy exames_select_perfil on public.exames
for select to authenticated
using (
  (
    coalesce(ativo, true) = true
    and public.usuario_tem_perfil(array['consulta','operador','administrador'])
  )
  or public.usuario_tem_perfil(array['administrador'])
);

create policy exames_insert_operador_admin on public.exames
for insert to authenticated
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy exames_update_operador_admin on public.exames
for update to authenticated
using (public.usuario_tem_perfil(array['operador','administrador']))
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy exames_delete_admin on public.exames
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

-- 7) CONVENIOS
create policy convenios_select_perfil on public.convenios
for select to authenticated
using (
  (
    coalesce(ativo, true) = true
    and public.usuario_tem_perfil(array['consulta','operador','administrador'])
  )
  or public.usuario_tem_perfil(array['administrador'])
);

create policy convenios_insert_operador_admin on public.convenios
for insert to authenticated
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy convenios_update_operador_admin on public.convenios
for update to authenticated
using (public.usuario_tem_perfil(array['operador','administrador']))
with check (public.usuario_tem_perfil(array['operador','administrador']));

create policy convenios_delete_admin on public.convenios
for delete to authenticated
using (public.usuario_tem_perfil(array['administrador']));

-- 8) AVISOS INTERNOS
-- Todos logados ativos veem avisos ativos. Admin gerencia tudo.
create policy avisos_select_perfil on public.avisos_internos
for select to authenticated
using (
  (
    coalesce(ativo, true) = true
    and public.usuario_tem_perfil(array['consulta','operador','administrador'])
  )
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

-- 9) FAVORITOS
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

-- Conferencia:
-- 1) Seu email precisa aparecer como administrador e ativo.
-- 2) Usuarios operadores precisam aparecer como operador e ativo.
-- 3) Todas as tabelas abaixo continuam com RLS ligado.
select
  'RLS corrigido sem desligar seguranca' as resultado,
  auth.email() as usuario_logado,
  public.usuario_tem_perfil(array['administrador']) as sou_admin,
  public.usuario_tem_perfil(array['operador','administrador']) as posso_editar,
  (select count(*) from public.exames) as total_exames,
  (select count(*) from public.convenios) as total_convenios,
  (select count(*) from public.avisos_internos) as total_avisos;
