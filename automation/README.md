# Site Vitrine Offer Automation

Automacao inicial para ler ofertas de Google Sheets, validar dados, normalizar produtos e gerar uma saida estruturada em JSON.

Esta base foi desenhada para evoluir gradualmente para multiplos marketplaces, reducao da dependencia do Make e futura reutilizacao em um SaaS proprio de automacao.

## Estrutura

```text
automation/
  config/
    example.env
  ingest/
    google-sheets-ingest.js
  logs/
  normalizers/
    offer-normalizer.js
  outputs/
    products.json
  validators/
    offer-validator.js
  package.json
  README.md
```

## Fluxo inicial

1. Ler ofertas de uma planilha Google Sheets.
2. Converter cada linha em uma oferta bruta.
3. Validar campos obrigatorios, preco, links, imagens e disponibilidade.
4. Normalizar os dados para um modelo unico de oferta.
5. Gerar JSON estruturado em `outputs/products.json`.
6. Registrar logs de execucao e erros em `logs/`.

## Configuracao

Copie `config/example.env` para um arquivo `.env` local antes de integrar com dados reais.

Variaveis principais:

- `GOOGLE_SHEETS_ID`: ID da planilha.
- `GOOGLE_SHEETS_RANGE`: intervalo de leitura, por exemplo `Ofertas!A1:K`.
- `GOOGLE_APPLICATION_CREDENTIALS`: caminho local para credenciais da service account.
- `OUTPUT_FILE`: caminho do JSON de saida.
- `LOG_LEVEL`: nivel de log esperado pela automacao.

Nao versionar credenciais, tokens ou arquivos `.env` com dados reais.

## Comandos

```bash
npm install
npm run ingest
```

## Modelo esperado da planilha

Colunas recomendadas:

- marketplace
- titulo
- categoria
- preco
- preco_anterior
- url_afiliado
- url_imagem
- disponibilidade
- prioridade
- status
- observacoes

## Saida normalizada

Cada oferta normalizada deve conter:

- `id`
- `marketplace`
- `title`
- `category`
- `price`
- `previousPrice`
- `currency`
- `affiliateUrl`
- `imageUrl`
- `availability`
- `priority`
- `status`
- `source`
- `validation`
- `updatedAt`

O arquivo publicado para o site usa a chave `products`, no formato consumido pela vitrine estatica.

## Seguranca

- Nao expor credenciais no repositorio.
- Usar service account com permissao minima necessaria.
- Validar dados antes de publicar no site.
- Registrar erros sem vazar tokens, cookies ou dados sensiveis.
- Exigir revisao antes de mudancas em schema, regras de validacao, integracoes ou deploy.

## Evolucao recomendada

1. Adicionar suporte real a `.env`.
2. Criar adaptadores por marketplace.
3. Persistir ofertas normalizadas em banco.
4. Criar logs estruturados e monitoramento.
5. Adicionar QA automatico de links, imagens e paginas.
6. Criar scheduler proprio para substituir fluxos do Make.
7. Evoluir ingestores e validadores para modulos reutilizaveis no SaaS de Automacao.
