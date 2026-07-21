-- CORRECAO FINAL - MODO ESTAVEL SEM BLOQUEIO DE EDICAO
-- Execute no SQL Editor do Supabase.
--
-- Ideia:
-- - RLS continua LIGADO para nao aparecer alerta critico de tabela publica aberta.
-- - ANONIMO nao acessa nada diretamente.
-- - Qualquer usuario LOGADO consegue consultar/salvar dados operacionais.
-- - O controle visual de "Consulta / Operador / Administrador" continua no site.
--
-- Por que assim?
-- As policies baseadas em perfil podem bloquear quando a funcao/perfil/RLS entra em conflito.
-- Este arquivo remove essa fragilidade nas tabelas de uso diario.

begin;

-- 1) Permissoes base somente para usuario autenticado.
grant select, insert, update, delete on table public.exames to authenticated;
grant select, insert, update, delete on table public.convenios to authenticated;
grant select, insert, update, delete on table public.avisos_internos to authenticated;
grant select, insert, update, delete on table public.favoritos_exames to authenticated;
grant select, insert, update on table public.perfis_usuarios to authenticated;

revoke all on table public.exames from anon;
revoke all on table public.convenios from anon;
revoke all on table public.avisos_internos from anon;
revoke all on table public.favoritos_exames from anon;
revoke all on table public.perfis_usuarios from anon;

-- 2) Mantem RLS ligado.
alter table public.exames enable row level security;
alter table public.convenios enable row level security;
alter table public.avisos_internos enable row level security;
alter table public.favoritos_exames enable row level security;
alter table public.perfis_usuarios enable row level security;

-- 3) Limpa policies antigas dessas tabelas para parar conflito/acumulo.
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

-- 4) Funcao de perfil continua existindo para o SITE decidir o que mostrar.
-- Ela nao sera mais usada para bloquear salvar nas tabelas operacionais.
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

-- 5) Policies operacionais SEM BLOQUEIO por perfil.
-- Qualquer usuario logado consegue usar o sistema.

create policy exames_logado_select on public.exames
for select to authenticated
using (true);

create policy exames_logado_insert on public.exames
for insert to authenticated
with check (true);

create policy exames_logado_update on public.exames
for update to authenticated
using (true)
with check (true);

create policy exames_logado_delete on public.exames
for delete to authenticated
using (true);

create policy convenios_logado_select on public.convenios
for select to authenticated
using (true);

create policy convenios_logado_insert on public.convenios
for insert to authenticated
with check (true);

create policy convenios_logado_update on public.convenios
for update to authenticated
using (true)
with check (true);

create policy convenios_logado_delete on public.convenios
for delete to authenticated
using (true);

create policy avisos_logado_select on public.avisos_internos
for select to authenticated
using (true);

create policy avisos_logado_insert on public.avisos_internos
for insert to authenticated
with check (true);

create policy avisos_logado_update on public.avisos_internos
for update to authenticated
using (true)
with check (true);

create policy avisos_logado_delete on public.avisos_internos
for delete to authenticated
using (true);

-- Favoritos continuam por usuario, para nao misturar favoritos de todo mundo.
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

-- Perfis:
-- Usuario ve o proprio perfil; administradores conseguem ver/alterar todos pelo painel.
-- Se a funcao falhar, pelo menos cada usuario ainda consegue ver o proprio perfil.
create policy perfis_select_proprio_ou_admin on public.perfis_usuarios
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.usuario_tem_perfil(array['administrador'])
);

create policy perfis_insert_proprio_ou_admin on public.perfis_usuarios
for insert to authenticated
with check (
  usuario_id = auth.uid()
  or public.usuario_tem_perfil(array['administrador'])
);

create policy perfis_update_admin on public.perfis_usuarios
for update to authenticated
using (public.usuario_tem_perfil(array['administrador']))
with check (public.usuario_tem_perfil(array['administrador']));

commit;

-- Conferencia final.
-- Se retornar linhas e nao erro, a base operacional voltou.
select
  'MODO ESTAVEL APLICADO - RLS ligado, logados sem bloqueio operacional' as resultado,
  auth.email() as usuario_logado,
  public.usuario_tem_perfil(array['administrador']) as perfil_admin_reconhecido,
  (select count(*) from public.exames) as total_exames,
  (select count(*) from public.convenios) as total_convenios,
  (select count(*) from public.avisos_internos) as total_avisos;
