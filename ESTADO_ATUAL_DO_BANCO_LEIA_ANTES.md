# Estado atual do banco - leia antes de mexer

Data: 18/07/2026

## O que está valendo agora

O último SQL aplicado no Supabase foi o modo estável:

`correcao-final-rls-estavel-sem-bloqueio.sql`

Esse arquivo deixa:

- RLS ligado;
- usuário anônimo sem acesso direto;
- usuário logado podendo operar exames, convênios e avisos;
- favoritos separados por usuário;
- perfis ainda usados pelo site para mostrar/esconder botões.

## O que NÃO rodar

Não rode os SQL antigos que estão em:

`_SQL_ANTIGOS_NAO_RODAR`

Eles foram arquivados porque representam etapas anteriores/remendos. Rodar um deles agora pode desfazer a regra atual.

## SQL que pode rodar sem alterar nada

Se precisar conferir o estado do banco, rode apenas:

`DIAGNOSTICO_SUPABASE_SOMENTE_LEITURA.sql`

Esse arquivo só consulta. Ele não altera dados, policies, funções ou tabelas.

## Se o site der erro ao salvar

Não rode SQL no chute.

Faça assim:

1. Tire print da mensagem exata do erro.
2. Anote em qual tela aconteceu:
   - Exame;
   - Convênio;
   - Aviso;
   - Usuário;
   - Favorito;
   - Credencial.
3. Só depois corrija o ponto específico.

## Sobre as queries no Supabase

As várias `Untitled query` do painel do Supabase são rascunhos/abas do SQL Editor.

Elas não são tabelas.
Elas não são migrações rodando.
Elas não destroem o banco.

Pode fechar essas abas no painel se quiser limpar a tela.

## Regra de segurança daqui pra frente

Antes de qualquer SQL novo:

1. backup;
2. diagnóstico;
3. alteração pequena;
4. teste;
5. só então considerar concluído.

