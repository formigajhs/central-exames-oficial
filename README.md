# Central Operacional de Exames

## Recuperação de senha por código especial

O código nunca fica no site nem no GitHub. Ele deve existir somente nos Secrets da Edge Function `smart-worker`.

1. No Supabase, abra **Edge Functions > Secrets**.
2. Crie o secret `PASSWORD_RESET_CODE` com um código longo e difícil de adivinhar.
3. Substitua o conteúdo da função `smart-worker` pelo arquivo `smart-worker-index.ts` deste projeto.
4. Na configuração da função, deixe **Verify JWT with legacy secret** desligado. A própria função valida o código especial e continua validando o login de administrador no fluxo antigo.
5. Faça o deploy e teste **Esqueci minha senha** com uma conta de teste.

O funcionário informa o próprio e-mail, o código especial e escolhe a nova senha. O administrador não vê nem define essa senha.
