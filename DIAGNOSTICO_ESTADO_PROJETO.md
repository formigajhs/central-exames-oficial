# Diagnóstico do estado atual - Central Operacional

Data: 18/07/2026

## Resumo direto

O projeto não está destruído, mas a parte de banco/permissões ficou bagunçada por excesso de migrações e correções sobrepostas.

O problema principal não são as 29 queries do Supabase. Aquilo é lista de rascunhos/abas do SQL Editor.

O problema real é que existem vários arquivos SQL com ideias diferentes:

- alguns ligam RLS e bloqueiam por perfil;
- um desliga RLS para operação sem bloqueio;
- outros recriam policies só de exames/convênios;
- outros mexem em avisos;
- outros mexem em credenciais/funções.

Isso cria insegurança porque fica difícil saber qual regra final está valendo no banco.

## Estado funcional provável

Pelo que foi visto:

- Login funciona.
- Exames existem.
- Convênios existem.
- Avisos existem.
- Orçamento funciona.
- O último SQL aplicado retornou sucesso.
- O site deve conseguir salvar de novo para usuários logados.

## Ponto crítico

O banco não deve mais receber SQL no impulso.

A partir de agora, só existem dois tipos de SQL aceitáveis:

1. diagnóstico somente leitura;
2. migração final revisada.

## Tabelas principais usadas pelo site

- `public.exames`
- `public.convenios`
- `public.avisos_internos`
- `public.favoritos_exames`
- `public.perfis_usuarios`
- `public.exame_alteracoes`
- `public.acessos_credenciais_convenios`

## Operações que o site faz

### Exames

- busca registros;
- cria exame;
- edita exame;
- ativa/desativa exame;
- exclui exame;
- consulta histórico.

### Convênios

- busca registros;
- cria convênio via função segura;
- edita dados básicos;
- salva credencial via função segura;
- desbloqueia credencial via função;
- ativa/desativa;
- exclui via função segura.

### Avisos

- busca avisos;
- cria aviso;
- edita aviso;
- exclui aviso.

### Usuários

- consulta perfis;
- altera perfil;
- ativa/desativa usuário;
- redefinição de senha passa pela Edge Function `smart-worker`.

### Favoritos

- cada usuário salva/remove seus próprios favoritos.

## Arquivos SQL que existem hoje

### Devem ser considerados históricos/remendos

- `migracao-restaura-rls-seguro.sql`
- `migracao-corrige-edicao-exames-convenios.sql`
- `migracao-corrige-avisos-visibilidade.sql`
- `migracao-modo-operacional-sem-bloqueio.sql`
- `correcao-rls-banco-bloqueando-edicao.sql`

### Último modo aplicado

- `correcao-final-rls-estavel-sem-bloqueio.sql`

Esse foi feito para parar bloqueio operacional: RLS ligado, usuário logado consegue salvar dados principais.

## Por que o Advisor ainda mostra alertas

Alguns alertas do Supabase Advisor não significam que o site está quebrado.

Exemplos:

- `Auth RLS Initialization Plan`: geralmente performance/recomendação.
- `Leaked Password Protection Disabled`: configuração do Auth.
- `Public Can Execute SECURITY DEFINER Function`: precisa revisar função por função, mas não quer dizer que o site está quebrado agora.

O erro foi tentar corrigir todos os alertas de uma vez enquanto o sistema já estava em uso.

## O que NÃO fazer agora

- Não rodar migração antiga.
- Não rodar SQL novo sem backup.
- Não desligar/ligar RLS no impulso.
- Não tentar “limpar Advisor” sem entender cada aviso.
- Não apagar tabela.
- Não apagar função.
- Não mexer em Vault/credenciais sem backup.

## Próximo passo correto

1. Rodar apenas o arquivo `DIAGNOSTICO_SUPABASE_SOMENTE_LEITURA.sql`.
2. Salvar o resultado/print.
3. Confirmar se o site salva:
   - exame;
   - convênio;
   - aviso;
   - favorito;
   - alteração de perfil.
4. Só depois criar uma migração final única.

## Classificação honesta

Produto visual: bom para uso interno.

Funcionalidade: boa, com muitos recursos.

Banco/permissões: funcionando, mas precisa documentação e consolidação.

Risco atual: médio, por falta de migração final única e por histórico de remendos.

Situação: recuperável.

