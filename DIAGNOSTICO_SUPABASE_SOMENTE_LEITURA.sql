-- DIAGNOSTICO SOMENTE LEITURA
-- Pode rodar no SQL Editor do Supabase.
-- Nao altera tabelas, policies, funcoes ou dados.

-- 1) Tabelas principais: RLS ligado/desligado e quantidade aproximada.
select
  'tabelas_principais' as secao,
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  c.relforcerowsecurity as rls_forcado,
  n.nspname as schema
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'exames',
    'convenios',
    'avisos_internos',
    'favoritos_exames',
    'perfis_usuarios',
    'exame_alteracoes',
    'acessos_credenciais_convenios'
  )
order by c.relname;

-- 2) Policies existentes nessas tabelas.
select
  'policies' as secao,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'exames',
    'convenios',
    'avisos_internos',
    'favoritos_exames',
    'perfis_usuarios',
    'exame_alteracoes',
    'acessos_credenciais_convenios'
  )
order by tablename, policyname;

-- 3) Grants das tabelas para anon/authenticated.
select
  'grants_tabelas' as secao,
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'exames',
    'convenios',
    'avisos_internos',
    'favoritos_exames',
    'perfis_usuarios',
    'exame_alteracoes',
    'acessos_credenciais_convenios'
  )
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- 4) Funcoes public relevantes.
select
  'funcoes_public' as secao,
  n.nspname as schema,
  p.proname as funcao,
  pg_get_function_arguments(p.oid) as argumentos,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as seguranca
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'usuario_tem_perfil',
    'criar_perfil_novo_usuario',
    'obter_credencial_convenio',
    'salvar_credencial_convenio',
    'criar_convenio_seguro',
    'excluir_convenio_seguro',
    'registrar_alteracao_exame',
    'atualizar_data_aviso_interno',
    'auditar_status_convenio'
  )
order by p.proname;

-- 5) Permissao de executar funcoes para public/anon/authenticated.
select
  'grants_funcoes' as secao,
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee in ('public','anon','authenticated')
order by routine_name, grantee;

-- 6) Triggers existentes nas tabelas principais.
select
  'triggers' as secao,
  event_object_table as tabela,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'exames',
    'convenios',
    'avisos_internos',
    'favoritos_exames',
    'perfis_usuarios'
  )
order by event_object_table, trigger_name;

-- 7) Contagens basicas.
select
  'contagens' as secao,
  (select count(*) from public.exames) as total_exames,
  (select count(*) from public.convenios) as total_convenios,
  (select count(*) from public.avisos_internos) as total_avisos,
  (select count(*) from public.favoritos_exames) as total_favoritos,
  (select count(*) from public.perfis_usuarios) as total_perfis;

-- 8) Perfis cadastrados.
select
  'perfis' as secao,
  nome,
  email,
  perfil,
  ativo,
  criado_em
from public.perfis_usuarios
order by criado_em nulls last, email;
