# Shopee offer collector

Coletor para substituir o script local `shopee_ofertas_whatsapp.py` executado pelo Agendador de Tarefas do Windows.

O coletor roda em GitHub Actions, consulta a Shopee Affiliate API GraphQL, filtra ofertas e insere até 5 linhas por execução na planilha Google Sheets.

## Arquivos

- `collect-shopee-offers.js`: agente de coleta.
- `.github/workflows/collect-shopee-offers.yml`: agendamento e execução manual.
- `docs/shopee-collector-agent.md`: documentação operacional.

## Secrets obrigatórios

Configure no GitHub em `Settings > Secrets and variables > Actions`:

- `SHOPEE_APP_ID`
- `SHOPEE_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME`

Nenhuma credencial deve ser commitada no repositório.

## Planilha

O coletor escreve na aba configurada por `GOOGLE_SHEET_NAME`, nas colunas:

| Coluna | Campo |
| --- | --- |
| A | envio_whatsapp |
| B | link_produto_filiado |
| C | plataforma |
| D | nome_produto |
| E | preco |
| F | preco_promocional |
| G | desconto_percentual |
| H | imagem_url |

Novas ofertas entram com `envio_whatsapp = pendente`.

## Execução local opcional

Crie `automation/config/.env` localmente, sem commitar:

```env
SHOPEE_APP_ID=...
SHOPEE_SECRET=...
GOOGLE_SERVICE_ACCOUNT_JSON={...}
GOOGLE_SHEET_ID=...
GOOGLE_SHEET_NAME=Ofertas
```

Depois rode:

```bash
cd automation
npm run collect:shopee
```

## Variáveis opcionais

- `SHOPEE_ENDPOINT`: endpoint GraphQL. Padrão: `https://open-api.affiliate.shopee.com.br/graphql`.
- `SHOPEE_KEYWORDS`: lista separada por vírgula. Padrão: `casa,cozinha,organizador,eletronicos,beleza,moda,oferta`.
- `SHOPEE_MAX_OFFERS_PER_RUN`: padrão `5`.
- `SHOPEE_SEARCH_LIMIT`: padrão `20`.
- `SHOPEE_MIN_DISCOUNT_PERCENT`: padrão `5`.
- `SHOPEE_MIN_RATING`: padrão `4.2`.
- `SHOPEE_MIN_SALES`: padrão `1`.
- `SHOPEE_RECENT_ROWS_LIMIT`: padrão `200`.

## Logs

O job imprime:

- total buscado;
- total aprovado por qualidade;
- total aprovado após deduplicação;
- total selecionado;
- total rejeitado;
- motivos de rejeição;
- linhas adicionadas na planilha;
- resumo das ofertas selecionadas.
