-- Consulta visualiza convenios e credenciais; somente Operador/Admin alteram.
begin;

drop policy if exists convenios_operacao_consultar on public.convenios;
create policy convenios_operacao_consultar on public.convenios
for select to authenticated
using (
  (ativo = true and public.usuario_tem_perfil(array['consulta','operador','administrador']))
  or public.usuario_tem_perfil(array['administrador'])
);

create or replace function public.obter_credencial_convenio(p_convenio_id uuid)
returns table(usuario text, senha text)
language plpgsql
security definer
set search_path = public, private, vault
as $$
begin
  if auth.uid() is null
     or not public.usuario_tem_perfil(array['consulta','operador','administrador']) then
    raise exception 'ACESSO_NEGADO';
  end if;
  if not exists (select 1 from public.convenios where id = p_convenio_id and ativo = true)
     and not public.usuario_tem_perfil(array['administrador']) then
    raise exception 'CONVENIO_INDISPONIVEL';
  end if;
  insert into public.acessos_credenciais_convenios
    (convenio_id, usuario_id, usuario_email, acao)
  values (p_convenio_id, auth.uid(), auth.jwt() ->> 'email', 'consultar');
  return query
  select u.decrypted_secret, s.decrypted_secret
  from private.credenciais_convenios c
  join vault.decrypted_secrets u on u.id = c.usuario_secret_id
  join vault.decrypted_secrets s on s.id = c.senha_secret_id
  where c.convenio_id = p_convenio_id;
end;
$$;

revoke all on function public.obter_credencial_convenio(uuid) from public;
grant execute on function public.obter_credencial_convenio(uuid) to authenticated;
commit;

select 'Consulta visualiza; Operador edita; Administrador gerencia' as regra,
       count(*) filter (where ativo) as convenios_ativos
from public.convenios;
