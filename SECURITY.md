# Política de segurança

O VINTE lida com dados bancários. Leve isso a sério ao contribuir e ao hospedar.

## Reportando uma vulnerabilidade

**Não abra uma issue pública.** Use o
[reporte privado de vulnerabilidades do GitHub](../../security/advisories/new)
com a descrição, o impacto e os passos para reproduzir. A resposta inicial vem
em até 7 dias.

## Onde ficam os segredos

| Valor | Onde fica | Público? |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env` (fora do Git) → bundle | Sim, por design. A proteção é a RLS. |
| `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` | `supabase secrets set` | **Não** |
| `PLUGGY_WEBHOOK_SECRET` | `supabase secrets set` | **Não** |
| `SUPABASE_SERVICE_ROLE_KEY` | injetado pelo Supabase nas Edge Functions | **Não** |

Nenhum valor real deve entrar no repositório. O `.gitignore` bloqueia `.env*`
(exceto `.env.example`) e o workflow `security` roda o gitleaks sobre todo o
histórico em cada push e pull request.

**Vazou uma chave?** Apagar o commit não basta — o valor continua no histórico e
em forks. Primeiro **revogue/rotacione** a chave no painel (Pluggy ou Supabase),
depois limpe o histórico.

## Modelo de ameaça, resumido

- **Isolamento entre usuários:** Row Level Security em todas as tabelas. As
  políticas de escrita também exigem que contas, conexões e categorias
  referenciadas sejam do próprio usuário (`0006_security_hardening.sql`).
- **Credenciais do Pluggy são da aplicação** e enxergam os itens de todos os
  usuários. Por isso toda sincronização confere que o `clientUserId` do item no
  Pluggy é o usuário que está pedindo — um `itemId` alheio é recusado.
- **Webhook** roda sem JWT e com a service role; é autenticado por segredo
  compartilhado comparado em tempo constante.
- **Erros** internos (Pluggy, Postgres) são registrados no log da função e
  nunca devolvidos ao navegador.
- **Senha do banco** nunca passa pelo VINTE: fica no widget do Pluggy.

## Checklist para quem hospeda

- [ ] Rodou todas as migrations, incluindo `0006_security_hardening.sql`.
- [ ] `PLUGGY_WEBHOOK_SECRET` gerado com `openssl rand -hex 32`.
- [ ] `ALLOWED_ORIGINS` definido com o domínio do seu frontend.
- [ ] `VITE_PLUGGY_INCLUDE_SANDBOX=false` em produção.
- [ ] Confirmação de e-mail ligada no Supabase Auth; cadastro aberto desligado
      se o uso for só pessoal/familiar.
