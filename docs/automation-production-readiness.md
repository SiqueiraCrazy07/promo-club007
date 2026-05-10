# Automation Production Readiness

Data da validacao local: 2026-05-10.

## Resumo

A pasta `automation` esta quase pronta para producao, mas precisava de ajustes pequenos para ficar compativel com o workflow e com o contrato atual do Site Vitrine.

Status apos os ajustes:

- GitHub Actions: compativel.
- `npm run ingest`: existe.
- `automation/outputs/products.json`: gerado localmente e validado.
- Caminhos relativos: alinhados para execucao local, GitHub Actions e GitHub Pages.
- GitHub Pages: consegue acessar `automation/outputs/products.json` se o arquivo estiver commitado no branch publicado.
- Visual do site: nao alterado.

## 1. Compatibilidade com GitHub Actions

O workflow `.github/workflows/update-offers.yml` espera:

- `automation/package.json`;
- `automation/package-lock.json`;
- instalacao com `npm ci` dentro de `automation`;
- execucao de `npm run ingest`;
- geracao de `automation/outputs/products.json`;
- validacao de uma lista nao vazia de produtos;
- commit apenas do JSON gerado.

Problemas encontrados antes do ajuste:

- `automation/package.json` nao tinha o script `ingest`, apenas `ingest:sheets`.
- O ingest usava como padrao `outputs/sample-output.json`, mas o workflow e o site esperam `outputs/products.json`.
- O workflow passava `GOOGLE_SHEET_ID` e `GOOGLE_SHEET_RANGE`, enquanto o script lia apenas `GOOGLE_SHEETS_ID` e `GOOGLE_SHEETS_RANGE`.
- A validacao do workflow esperava `name` e `store`, mas o ingest gerava somente `offers` normalizadas com campos como `title`, `marketplace`, `affiliateUrl` e `imageUrl`.
- O workflow bloqueava `service-account.json` em caminhos parciais, mas nao bloqueava `automation/config/service-account.json`.

Correcoes aplicadas:

- Adicionado script `ingest`.
- Mantido `ingest:sheets` como alias retrocompativel.
- Adicionado suporte a `GOOGLE_SHEET_ID`/`GOOGLE_SHEET_RANGE` e `GOOGLE_SHEETS_ID`/`GOOGLE_SHEETS_RANGE`.
- Alterada a saida padrao para `automation/outputs/products.json`.
- Adicionada chave `products` no JSON, no formato que a UI ja consome.
- Endurecida a validacao do workflow para bloquear `automation/config/service-account.json` e `automation/config/.env`.
- Endurecida a validacao do workflow para exigir tambem `link` e `image`.

## 2. `npm run ingest`

Validacao local:

```text
npm run
```

Resultado relevante:

```text
ingest
  node ingest/google-sheets-ingest.js
```

Status: existe e esta compativel com o workflow.

## 3. Geracao de `products.json`

O arquivo `automation/outputs/products.json` foi gerado localmente a partir do snapshot existente `automation/outputs/sample-output.json`, sem depender da API do Google Sheets durante esta validacao.

Validacao local executada:

```text
Validated products: 455
```

Contrato atual do JSON:

```json
{
  "products": [
    {
      "name": "Produto",
      "desc": "Categoria ou descricao",
      "oldPrice": "R$ 100,00",
      "newPrice": "R$ 80,00",
      "discount": "20% OFF",
      "link": "https://...",
      "image": "https://...",
      "store": "Shopee"
    }
  ],
  "metadata": {},
  "rejected": []
}
```

Esse formato publica `products`, que e o contrato estavel do frontend atual. O JSON de producao evita timestamps dinamicos para nao gerar commits sem mudanca real em toda execucao agendada.

## 4. Caminhos relativos

Caminhos validados:

- Site: `automation/outputs/products.json`, relativo ao `index.html`.
- Workflow: `automation/outputs/products.json`, relativo a raiz do repositorio.
- Script de ingestao: `outputs/products.json`, resolvido a partir de `automation`.
- `.env` local: `automation/config/.env`, apenas para desenvolvimento local.
- Credencial local: `automation/config/service-account.json`, ignorada e bloqueada no workflow.
- Credencial do GitHub Actions: `${{ runner.temp }}/google-service-account.json`.

Status: corretos apos os ajustes.

## 5. Acesso pelo GitHub Pages

GitHub Pages publica arquivos estaticos versionados no branch configurado. Como `automation/outputs/products.json` fica dentro do repositorio e nao esta ignorado, ele sera acessivel pelo site em:

```text
automation/outputs/products.json
```

desde que o arquivo esteja commitado no branch usado pelo Pages.

O site ja carrega:

```js
const PRODUCTS_JSON_URL = 'automation/outputs/products.json';
```

Se o JSON falhar, o fallback `data/products.js` continua funcionando.

## 6. Ajustes necessarios para producao

Ajustes aplicados:

- `.gitignore` criado para impedir versionamento de `automation/node_modules`, `.env`, credencial local e logs.
- `automation/config/example.env` atualizado para apontar para `outputs/products.json`.
- `automation/README.md` atualizado para documentar `npm run ingest` e `outputs/products.json`.
- Workflow ajustado para validar credenciais locais em caminhos reais.
- Ingest ajustado para produzir `products.json` compativel com o frontend.
- Saida de `products.json` mantida deterministica para evitar commits recorrentes sem mudanca real.

Pontos ainda operacionais, fora do codigo:

- Configurar secrets `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID` e `GOOGLE_SHEET_RANGE` no GitHub.
- Garantir que a planilha esteja compartilhada com o `client_email` da service account.
- Confirmar que o reposititorio permite escrita do `GITHUB_TOKEN` em `main`.
- Nao commitar `automation/config/.env`, `automation/config/service-account.json`, `automation/node_modules` nem logs locais.

## Validacoes executadas

```text
npm run
```

Confirmou a existencia de `ingest`.

```text
node --check automation/ingest/google-sheets-ingest.js
node --check automation/normalizers/offer-normalizer.js
node --check automation/validators/offer-validator.js
node --check automation/publish/site-publisher.js
```

Confirmou sintaxe valida dos scripts.

```text
Validated products: 455
```

Confirmou que `automation/outputs/products.json` foi gerado com lista nao vazia e campos minimos para o site.
