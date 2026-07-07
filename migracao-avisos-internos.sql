-- CENTRAL OPERACIONAL - AVISOS INTERNOS
-- Executar uma unica vez no SQL Editor do Supabase.

begin;

create table if not exists public.avisos_internos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensagem text not null,
  tipo text not null default 'info'
    check (tipo in ('info', 'alerta', 'urgente', 'sucesso')),
  ativo boolean not null default true,
  prioridade integer not null default 0,
  criado_por uuid references auth.users(id) on delete set null,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.avisos_internos enable row level security;

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

create or replace function public.atualizar_data_aviso_interno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em = now();
  new.atualizado_por = auth.uid();
  if tg_op = 'INSERT' then
    new.criado_por = coalesce(new.criado_por, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists avisos_internos_atualizar_data on public.avisos_internos;
create trigger avisos_internos_atualizar_data
before insert or update on public.avisos_internos
for each row execute function public.atualizar_data_aviso_interno();

commit;

select
  'Avisos internos configurados' as resultado,
  count(*) as total_avisos
from public.avisos_internos;
