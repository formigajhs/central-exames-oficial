-- CORRECAO DEFINITIVA - MODO OPERACIONAL SEM BLOQUEIO
-- Execute no SQL Editor do Supabase.
--
-- Objetivo:
-- Evitar que o sistema trave edicoes normais com "banco bloqueou a edicao".
--
-- O que fica liberado para usuarios autenticados:
-- - exames: consultar, criar, editar, excluir
-- - convenios: consultar, criar, editar, excluir
-- - avisos internos: consultar, criar, editar, excluir
-- - favoritos: consultar, criar, editar, excluir
--
-- Importante:
-- - Usuarios ainda precisam estar logados no sistema.
-- - O controle de Consulta / Operador / Administrador continua na tela do sistema.
-- - Credenciais criptografadas dos convenios NAO sao alteradas aqui.
--   Elas continuam protegidas no Vault e acessadas por funcao segura.

begin;

-- Ninguem anonimo deve operar essas tabelas diretamente.
revoke all on table public.exames from anon;
revoke all on table public.convenios from anon;
revoke all on table public.avisos_internos from anon;
revoke all on table public.favoritos_exames from anon;

-- Usuarios logados podem operar as tabelas de trabalho.
grant select, insert, update, delete on table public.exames to authenticated;
grant select, insert, update, delete on table public.convenios to authenticated;
grant select, insert, update, delete on table public.avisos_internos to authenticated;
grant select, insert, update, delete on table public.favoritos_exames to authenticated;

-- Para essas tabelas operacionais, deixamos o app controlar os perfis.
-- Isso evita bloqueios recorrentes de RLS no atendimento.
alter table public.exames disable row level security;
alter table public.convenios disable row level security;
alter table public.avisos_internos disable row level security;
alter table public.favoritos_exames disable row level security;

commit;

select
  'Modo operacional aplicado: edicoes liberadas para usuarios logados' as resultado,
  (select count(*) from public.exames) as total_exames,
  (select count(*) from public.convenios) as total_convenios,
  (select count(*) from public.avisos_internos) as total_avisos;
