# Agente Curador de Ofertas V2

## Objetivo

O Curador V2 adiciona uma camada inteligente entre a coleta da Shopee e a gravação no Google Sheets. O objetivo é priorizar ofertas com maior potencial de conversão e retenção do grupo, sem alterar Make, Evolution API, workflows, `products.json`, site ou estrutura da planilha.

Arquivo principal:

```text
automation/collectors/shopee/offer-curator.js
```

O coletor `collect-shopee-offers.js` continua responsável por API, Google Sheets e limite de 5 ofertas por execução. O curador decide qualidade, ranking e balanceamento.

## Arquitetura

Fluxo:

1. `collect-shopee-offers.js` busca candidatos na Shopee Affiliate API.
2. `offer-curator.js` calcula `qualityScore` para cada candidato.
3. O curador rejeita ofertas ruins, spam ou sensíveis.
4. O curador deduplica candidatos por link e nome parecido.
5. O curador ranqueia por `qualityScore`.
6. O coletor remove duplicatas já existentes na planilha.
7. O coletor aplica balanceamento final e grava até 5 linhas.

Essa separação prepara múltiplos marketplaces: outros coletores podem adaptar ofertas para o mesmo shape e chamar a mesma curadoria.

## Score final

O score final é `qualityScore`.

Ele considera componentes positivos:

- desconto percentual;
- economia real em reais;
- ticket médio/preço promocional;
- avaliação;
- vendas;
- comissão;
- reputação da categoria;
- potencial viral;
- qualidade do nome;
- qualidade da imagem;
- categoria;
- histórico de repetição.

Também calcula sub-scores:

- `conversionScore`;
- `reputationScore`;
- `spamScore`.

## Pesos

Pesos principais:

- desconto percentual: até 18 pontos aproximados;
- economia real: até 21,6 pontos;
- ticket médio: até 18 pontos;
- avaliação: até 15 pontos;
- vendas: até 24 pontos;
- comissão: até 12 pontos;
- reputação de categoria: 18% do score de reputação;
- potencial viral: até 18 pontos;
- qualidade do nome: até 15 pontos;
- qualidade da imagem: até 8 pontos;
- conversão: 25% do `conversionScore`.

Os pesos foram escolhidos para evitar que desconto alto sozinho domine a seleção.

## Penalizações

Penalizações aplicadas:

- `descontoFake`;
- `precoArtificial`;
- `produtoMuitoBarato`;
- `semEconomiaReal`;
- `nomeRuim`;
- `excessoPromocional`;
- `produtoSensivel`;
- `repetitivo`;
- `spamCategoria`;
- `baixaPercepcaoValor`;
- `baixaReputacao`;
- `semImagem`.

Produtos sensíveis e padrões bloqueados recebem penalidade alta e são rejeitados diretamente.

## Keywords

O curador tem:

- preferred keywords;
- blocked keywords;
- blocked patterns.

Variáveis compatíveis:

```env
SHOPEE_PREFERRED_TERMS=organizador,cozinha,casa
SHOPEE_BLOCKED_TERMS=adulto,emagrecedor,vape
```

Patterns bloqueados são definidos em código para proteger reputação contra termos sensíveis e promessas problemáticas.

## Categorias

Categorias detectadas:

- `casa_cozinha`;
- `beleza`;
- `eletronicos`;
- `moda`;
- `infantil`;
- `ferramentas`;
- `outros`.

Cada categoria tem reputação base. Casa/cozinha tende a ser mais segura para grupo de ofertas, enquanto eletrônicos baratos recebem mais controle por risco de baixa percepção de valor.

## Balanceamento

O balanceamento evita inserir 5 produtos iguais na mesma execução.

Limites padrão:

- `eletronicos`: 1;
- `casa_cozinha`: 2;
- `beleza`: 2;
- `moda`: 1;
- `infantil`: 1;
- `ferramentas`: 1;
- `outros`: 1.

Se não houver variedade suficiente, o curador preenche vagas restantes por score.

## Logs

O resumo do job inclui:

- `top20CandidatosAntesDoCorte`;
- `scoreDetalhado`;
- `motivosAprovacao`;
- `motivosRejeicao`;
- `scoreFinal`;
- `categoria`;
- `economiaReal`;
- `scoreConversao`;
- `scoreReputacao`;
- `scoreSpam`;
- `balanceamentoCategorias`;
- `selecionados`;
- `rejeitados`.

Esses logs ajudam a calibrar o ranking sem chamar Make ou alterar a planilha.

## Proteção reputacional

O curador rejeita ou penaliza:

- produtos sensíveis;
- promessas milagrosas;
- termos adultos;
- produtos de baixa reputação;
- spam promocional;
- desconto artificial;
- itens baratos demais com pouca economia real.

Isso reduz risco de queda de confiança no grupo.

## Futuro

A arquitetura está preparada para:

- múltiplos marketplaces;
- IA de previsão de conversão;
- analytics de clique, venda e rejeição;
- ajuste dinâmico de pesos por performance histórica;
- reputação por categoria e marketplace.

## Compatibilidade

Preservado:

- máximo de 5 ofertas por execução;
- `envio_whatsapp = pendente`;
- estrutura A:H do Google Sheets;
- Make e Evolution API;
- `products.json`;
- fallback;
- `update-offers.yml`;
- `collect-shopee-offers.yml`;
- `index.html`;
- `js/render.js`.
