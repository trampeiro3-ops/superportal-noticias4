# VÉRTICE 4.1 — Cloudflare Pages + GitHub

Pacote preparado para implantação pelo **Git integration do Cloudflare Pages** (GitHub). O backend é executado em Cloudflare Pages Advanced Mode (`_worker.js`) e usa o banco Turso/libSQL via HTTP.

## O que foi adaptado

- Backend empacotado para Cloudflare Pages Advanced Mode.
- Roteamento de API, painel `/admin`, páginas públicas, páginas de matéria, sitemap e `robots.txt` mantidos.
- Arquivos estáticos publicados na pasta `dist`, incluindo o template HTML usado nas matérias.
- Integração Turso mantida, sem colocar URL/token no código-fonte.
- Rota protegida `POST /api/cron` adaptada para executar a rotina agendada quando chamada por um agendador externo.
- Interface administrativa e política de privacidade atualizadas para Cloudflare Pages.

## 1. Banco de dados Turso

1. Entre no banco Turso que será usado pelo VÉRTICE.
2. Abra o SQL Editor.
3. Execute o conteúdo completo de `database/VERTICE_4_1_SCHEMA_TURSO.sql`.
4. Crie ou confirme um token de acesso **Read & Write** para esse banco.

Não publique o token em arquivos, prints ou mensagens. Se algum token antigo já foi compartilhado, revogue-o e gere outro.

## 2. Enviar o código para o GitHub

O repositório deve conter o conteúdo desta pasta na sua raiz. Não basta colocar apenas o ZIP dentro do repositório: o GitHub armazena o ZIP como um arquivo e não extrai os arquivos do site automaticamente.

Estrutura mínima que precisa aparecer na raiz do repositório:

```text
index.html
admin/
cloud-functions/
cloudflare/
database/
scripts/
package.json
package-lock.json (quando gerado pelo npm install)
wrangler.toml
```

O arquivo ZIP entregue contém uma pasta principal chamada `VERTICE_4_1_CLOUDFLARE_GITHUB`. Extraia essa pasta em algum lugar e envie o conteúdo dela para a raiz do repositório GitHub, preservando as subpastas. Não envie chaves ou tokens.

## 3. Conectar o GitHub ao Cloudflare Pages

1. No Cloudflare, entre em **Workers & Pages** e escolha **Create application > Pages > Connect to Git**.
2. Autorize a integração com GitHub e selecione o repositório do VÉRTICE.
3. Selecione a branch de produção (normalmente `main`).
4. Use o preset **None**. O arquivo `wrangler.toml` já aponta a pasta de saída `dist`.
5. Configuração esperada: comando de build `npm run build`; pasta de saída `dist`; diretório raiz `/`.
6. Inicie o deployment e confira o log de build. A integração Git faz novos deployments quando houver mudanças na branch configurada.

**Importante:** escolha Git integration, não Direct Upload. O projeto usa Pages Functions em Advanced Mode; o Direct Upload do painel não publica Functions.

## 4. Configurar variáveis e segredos no Cloudflare

No projeto Pages, abra **Settings > Variables and Secrets** (a nomenclatura pode variar) e cadastre em **Production**. Repita em **Preview** apenas se for usar deployments de pré-visualização.

Obrigatórias:

| Nome | Valor |
|---|---|
| `TURSO_DATABASE_URL` | URL do banco Turso, normalmente começando com `libsql://` |
| `TURSO_AUTH_TOKEN` | Token Read & Write do Turso |
| `ADMIN_TOKEN` | Chave privada criada por você, com pelo menos 32 caracteres |
| `ENVIRONMENT` | `production` |

O `TURSO_AUTH_TOKEN` e o `ADMIN_TOKEN` devem ser cadastrados como **Secrets**, nunca como valores públicos no repositório. A chave `ADMIN_TOKEN` é a senha do painel `/admin`; não existe senha padrão.

Opcionais:

| Nome | Para que serve |
|---|---|
| `GEMINI_API_KEY` | Ativa a integração Gemini no backend, caso queira configurá-la por variável |
| `GEMINI_MODEL` | Modelo de IA; padrão do sistema: `gemini-3.8-flash` |
| `CRON_SECRET` | Segredo de pelo menos 32 caracteres para proteger chamadas externas a `/api/cron` |
| `AUTOMATION_SCHEDULER_ENABLED` | Use `true` somente depois de configurar um agendador externo para chamar a rota protegida |

Depois de cadastrar ou alterar as variáveis, faça um novo deployment para garantir que estejam disponíveis no Worker.

## 5. Testar depois de publicar

Troque `SEU-SITE.pages.dev` pelo domínio real do projeto:

- `https://SEU-SITE.pages.dev/` — portal público.
- `https://SEU-SITE.pages.dev/api/health` — deve retornar JSON com `ok: true` quando o banco e as tabelas estiverem configurados.
- `https://SEU-SITE.pages.dev/admin` — tela de acesso ao painel; use o valor privado configurado em `ADMIN_TOKEN`.
- `https://SEU-SITE.pages.dev/robots.txt` e `/sitemap.xml` — arquivos de indexação.

No primeiro acesso ao painel, confira as fontes e execute uma coleta manual. Mantenha geração e publicação automáticas desligadas até validar as fontes, a chave Gemini e os resultados.

## 6. Automação opcional

Cloudflare Pages não agenda automaticamente a rotina deste projeto. Por padrão, a coleta pode ser iniciada manualmente no painel. Para automatizar, configure um serviço de agendamento externo que faça uma requisição HTTPS `POST` para `https://SEU-DOMINIO/api/cron`, com cabeçalho `Content-Type: application/json` e corpo:

```json
{"secret":"MESMO_VALOR_DE_CRON_SECRET"}
```

Só depois disso defina `AUTOMATION_SCHEDULER_ENABLED=true`. Nunca coloque o segredo na URL.

## Segurança e limites

- Não há credenciais reais incluídas neste pacote.
- Não existe senha padrão para o administrador.
- O SQL é fornecido separadamente em `database/` e precisa ser executado no Turso real.
- O build local verifica sintaxe e gera os arquivos de publicação, mas não valida as credenciais, o banco remoto nem o deployment da sua conta.
- Não ative publicação automática antes de testar o sistema no domínio final.
