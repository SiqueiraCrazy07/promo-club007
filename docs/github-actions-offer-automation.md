# GitHub Actions: automação de ofertas

Este documento descreve o workflow `.github/workflows/update-offers.yml`, responsável por atualizar `automation/outputs/products.json` a partir do pipeline de ofertas.

## Objetivo

O fluxo esperado é:

```text
Google Sheets -> ingestao Node.js -> automation/outputs/products.json -> commit automatico -> GitHub Pages
```

O site já tenta carregar `automation/outputs/products.json`. Se esse arquivo estiver publicado no GitHub Pages, ele passa a ser a fonte principal das ofertas. Se o arquivo falhar, o site usa `data/products.js` como fallback.

## Quando roda

O workflow roda em dois modos:

- manualmente, por `workflow_dispatch`;
- automaticamente a cada 6 horas, via cron:

```yaml
0 */6 * * *
```

O horário do cron é UTC, como padrão do GitHub Actions.

## Arquivo criado

Workflow:

```text
.github/workflows/update-offers.yml
```

## Secrets necessários

Configure estes secrets em:

```text
GitHub repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Secrets:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: conteúdo completo do JSON da service account do Google.
- `GOOGLE_SHEET_ID`: ID da planilha Google Sheets.
- `GOOGLE_SHEET_RANGE`: intervalo lido pelo pipeline, por exemplo `Ofertas!A:Z`.

`GOOGLE_SHEET_RANGE` pode ficar vazio se o script de automação já tiver um intervalo padrão, mas o workflow expõe a variável para permitir configuração sem editar código.

## Segurança

Não versionar `service-account.json`.

O workflow escreve a credencial somente no diretório temporário do runner:

```text
$RUNNER_TEMP/google-service-account.json
```

Depois expõe o caminho via:

```text
GOOGLE_APPLICATION_CREDENTIALS
```

Isso permite que bibliotecas oficiais do Google leiam a credencial sem colocar o arquivo dentro do repositório.

O step `Validate automation workspace` também falha se encontrar:

```text
service-account.json
automation/service-account.json
```

Também é necessário compartilhar a planilha com o e-mail da service account. Esse e-mail aparece dentro do JSON no campo `client_email`.

## Contrato esperado da pasta automation

O workflow espera que exista:

```text
automation/package.json
automation/package-lock.json
```

E que `automation/package.json` tenha o script:

```json
{
  "scripts": {
    "ingest": "..."
  }
}
```

O comando executado pelo workflow é:

```bash
cd automation
npm ci
npm run ingest
```

O script `npm run ingest` deve gerar:

```text
automation/outputs/products.json
```

## Formato esperado do products.json

O workflow aceita os mesmos formatos compatíveis com o site:

```json
[
  {
    "name": "Produto",
    "store": "Shopee"
  }
]
```

ou:

```json
{
  "generatedAt": "2026-05-10T00:00:00-03:00",
  "products": []
}
```

A validação mínima do workflow exige:

- JSON válido;
- lista não vazia;
- cada item precisa ser objeto;
- cada item precisa ter `name`;
- cada item precisa ter `store`.

Campos como `desc`, `oldPrice`, `newPrice`, `discount`, `link` e `image` continuam recomendados porque a vitrine usa esses campos na renderização.

## Como rodar manualmente

1. Abra o repositório no GitHub.
2. Vá em `Actions`.
3. Escolha `Update offers`.
4. Clique em `Run workflow`.
5. Selecione o branch `main`.
6. Confirme em `Run workflow`.

## Como validar logs

No run do GitHub Actions, verifique os steps:

- `Validate automation workspace`: confirma que a pasta `automation` existe.
- `Install automation dependencies`: instala dependências com `npm ci`.
- `Prepare Google credentials`: confirma que o secret da service account existe.
- `Generate products.json`: executa a ingestão.
- `Validate products.json`: confirma que o JSON foi criado e tem produtos válidos.
- `Commit updated offers`: cria commit apenas quando há alteração no JSON.

Se o step `Validate products.json` imprimir `Validated products: N`, o arquivo foi gerado e passou na validação mínima.

## Commit automático

O workflow usa o `GITHUB_TOKEN` padrão com permissão:

```yaml
permissions:
  contents: write
```

Depois da validação, ele executa:

```bash
git add automation/outputs/products.json
git diff --cached --quiet
```

Se não houver mudanças, o workflow termina sem commit.

Se houver mudanças, ele cria:

```text
chore: update offers data
```

e faz push para `main`.

Esse push atualiza o arquivo estático usado pelo GitHub Pages.

## Riscos

O principal risco é o pipeline gerar dados tecnicamente válidos, mas comercialmente errados, como preço incorreto, oferta expirada ou link de afiliado errado. A validação atual é mínima e não substitui regras mais completas de qualidade de dados.

Outro risco é loop de atualização: se o pipeline gerar JSON com ordenação instável, timestamps sempre diferentes ou formatação variável, o workflow fará commit a cada execução. Para evitar isso, o gerador deve produzir saída determinística sempre que as ofertas não mudarem.

Também existe risco de falha por permissão. O workflow precisa conseguir fazer push em `main`, e a configuração do repositório precisa permitir escrita pelo `GITHUB_TOKEN`.

## Rollback

Para reverter uma atualização ruim:

1. Encontre o commit automático `chore: update offers data`.
2. Reverta o commit pelo GitHub ou localmente:

```bash
git revert <sha-do-commit>
git push origin main
```

3. O GitHub Pages publicará novamente o JSON anterior.

Se o JSON publicado quebrar, o site ainda tem fallback em `data/products.js` quando o carregamento do JSON falha. Porém, se o JSON for válido mas com conteúdo ruim, ele será usado. Nesses casos, o rollback do commit é o caminho correto.

## Próximos passos

- Adicionar validação de schema mais rígida no pipeline.
- Validar URLs de imagem e compra.
- Validar domínios permitidos por marketplace.
- Normalizar preços e descontos antes de gerar o JSON.
- Garantir saída determinística para evitar commits sem mudança real.
- Adicionar resumo do run com contagens por marketplace.
