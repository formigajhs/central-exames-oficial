-- CENTRAL OPERACIONAL V2 - PAINEL DE USUARIOS
-- Executar uma unica vez no SQL Editor do Supabase.

begin;

alter table public.perfis_usuarios
  add column if not exists email text;

update public.perfis_usuarios p
set email = lower(u.email),
    atualizado_em = now()
from auth.users u
where p.usuario_id = u.id
  and p.email is distinct from lower(u.email);

create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis_usuarios (usuario_id, nome, email, perfil, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    lower(new.email),
    'consulta',
    false
  )
  on conflict (usuario_id) do update
  set email = excluded.email,
      atualizado_em = now();
  return new;
end;
$$;

commit;

select nome, email, perfil, ativo
from public.perfis_usuarios
order by criado_em;
