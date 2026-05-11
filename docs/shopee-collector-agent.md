# Agente de coleta de ofertas da Shopee

## Objetivo

Este agente migra a coleta local feita pelo `shopee_ofertas_whatsapp.py` e pelo Agendador de Tarefas do Windows para GitHub Actions.

O novo fluxo:

1. Executa no GitHub Actions.
2. Consulta a Shopee Affiliate API GraphQL.
3. Busca ofertas por palavras-chave.
4. Aplica filtros de qualidade.
5. Evita duplicidade por link e por nome parecido.
6. Seleciona até 5 ofertas por execução.
7. Insere as ofertas na planilha Google Sheets com `envio_whatsapp = pendente`.

## Arquivos criados

- `automation/collectors/shopee/collect-shopee-offers.js`
- `automation/collectors/shopee/README.md`
- `.github/workflows/collect-shopee-offers.yml`

## Agendamento

O workflow roda manualmente por `workflow_dispatch` e automaticamente nestes crons UTC:

```yaml
- cron: "30 10 * * *"
- cron: "30 16 * * *"
- cron: "30 22 * * *"
```

Esses horários equivalem a 07:30, 13:30 e 19:30 no Brasil quando considerado UTC-03.

## Secrets necessários

Configure em `Settings > Secrets and variables > Actions`:

| Secret | Uso |
| --- | --- |
| `SHOPEE_APP_ID` | App ID da Shopee Affiliate API |
| `SHOPEE_SECRET` | Secret usado para assinar as chamadas GraphQL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON completo da service account |
| `GOOGLE_SHEET_ID` | ID da planilha `Ofertas_Whatsapp` |
| `GOOGLE_SHEET_NAME` | Nome da aba, por exemplo `Ofertas` |

O JSON da service account precisa ter permissão de edição na planilha. Compartilhe a planilha com o e-mail `client_email` desse JSON.

## Compatibilidade com a planilha

O coletor preserva o layout:

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

Todas as novas linhas entram com:

```text
envio_whatsapp = pendente
plataforma = Shopee
```

## Como rodar manualmente

1. Acesse o repositório no GitHub.
2. Abra `Actions`.
3. Selecione `Collect Shopee offers`.
4. Clique em `Run workflow`.
5. Escolha a branch principal.
6. Confirme a execução.

## Como validar logs

No job `Shopee Affiliate API to Google Sheets`, abra o step `Collect Shopee offers`.

Procure por:

- `totalBuscado`: quantidade retornada pela API antes dos filtros;
- `totalAprovadoQualidade`: quantidade aprovada pelos filtros;
- `totalAprovadoFinal`: quantidade aprovada depois de remover duplicados da planilha;
- `totalSelecionado`: quantidade escolhida para inserir;
- `totalRejeitado`: quantidade rejeitada;
- `motivosRejeicao`: agrupamento por motivo;
- `linhasAdicionadasPlanilha`: quantidade efetivamente inserida.

Motivos comuns:

- `missing_name`
- `missing_affiliate_link`
- `missing_image`
- `invalid_price`
- `low_discount`
- `low_rating`
- `low_sales`
- `duplicate_in_api_link`
- `duplicate_in_api_similar_name`
- `duplicate_sheet_link`
- `duplicate_sheet_similar_name`

## Filtros de qualidade

Padrões atuais:

- desconto mínimo: `5%`;
- rating mínimo: `4.2`, quando a API retorna rating;
- vendas mínimas: `1`, quando a API retorna vendas;
- nome, link afiliado, imagem e preço são obrigatórios.

É possível ajustar por variáveis de ambiente no workflow, se necessário:

- `SHOPEE_KEYWORDS`
- `SHOPEE_MAX_OFFERS_PER_RUN`
- `SHOPEE_SEARCH_LIMIT`
- `SHOPEE_MIN_DISCOUNT_PERCENT`
- `SHOPEE_MIN_RATING`
- `SHOPEE_MIN_SALES`
- `SHOPEE_RECENT_ROWS_LIMIT`
- `SHOPEE_NAME_SIMILARITY_THRESHOLD`

## Proteção contra duplicidade

O agente não insere uma oferta quando:

- `link_produto_filiado` já existe em qualquer linha lida da planilha;
- `nome_produto` é muito parecido com uma oferta recente.

A comparação por nome usa similaridade por tokens normalizados. A janela de ofertas recentes é controlada por `SHOPEE_RECENT_ROWS_LIMIT`, padrão `200`.

## Conexão com Make e Evolution API

O fluxo esperado fica:

1. GitHub Actions coleta ofertas da Shopee.
2. O coletor adiciona até 5 linhas na aba `Ofertas` com `envio_whatsapp = pendente`.
3. O cenário do Make monitora ou consulta a planilha.
4. Make seleciona linhas pendentes.
5. Make envia mensagem via Evolution API para o WhatsApp.
6. Make atualiza `envio_whatsapp` para enviado, erro ou outro status operacional.

O GitHub Actions não chama Evolution API diretamente. Ele só abastece a fila de ofertas na planilha.

## Como desativar o Agendador do Windows

Depois de validar pelo menos algumas execuções bem-sucedidas no GitHub Actions:

1. Abra o Agendador de Tarefas do Windows.
2. Localize a tarefa que executa `shopee_ofertas_whatsapp.py`.
3. Clique com o botão direito.
4. Escolha `Desabilitar`, não `Excluir`, na primeira etapa.
5. Aguarde um ciclo completo de 07:30, 13:30 e 19:30 no GitHub Actions.
6. Confirme que as linhas estão entrando na planilha.
7. Confirme que Make e Evolution API continuam processando `pendente`.
8. Só depois remova a tarefa antiga, se quiser.

## Relação com GitHub Pages

Este agente não publica arquivos e não altera o site visual.

Ele também não altera o workflow `update-offers.yml`. O fluxo de atualização da vitrine a partir da planilha continua separado.

## Referências técnicas

A Shopee Affiliate API usa GraphQL via `POST` e assinatura no header `Authorization` no formato `SHA256 Credential=..., Timestamp=..., Signature=...`. A assinatura é calculada com SHA256 sobre:

```text
APP_ID + TIMESTAMP + PAYLOAD + SECRET
```

O coletor usa `productOfferV2` com busca por `keyword`, paginação e campos de produto como nome, link afiliado, imagem, preço, desconto, vendas e rating.
