# Shopee offer quality scoring

## Objetivo

O Shopee Collector Agent agora usa um score v2 para selecionar ofertas com maior potencial real de conversão. A seleção deixa de depender apenas de desconto percentual e passa a ponderar preço, economia real, reputação, vendas, comissão, imagem, qualidade do nome e afinidade com categorias/palavras-chave.

O limite operacional continua igual:

- até 5 ofertas por execução;
- `envio_whatsapp = pendente`;
- mesma estrutura da planilha A:H;
- compatível com Make, Evolution API e GitHub Actions.

## Componentes positivos

O score v2 soma pontos para:

- desconto percentual;
- economia real em reais;
- preço promocional em faixa convertível;
- vendas;
- avaliação;
- comissão;
- presença de imagem;
- nome descritivo;
- termos preferidos no nome, loja ou palavra-chave.

## Penalidades

O score aplica penalidades para:

- preço muito baixo com desconto alto, típico de desconto artificial;
- ausência de economia real;
- termos sensíveis ou bloqueados;
- baixa reputação;
- poucas vendas;
- nome genérico;
- nome curto, repetitivo ou pouco informativo;
- ausência de imagem.

## Rejeição direta

Uma oferta é rejeitada antes do corte final quando:

- não tem nome;
- não tem link afiliado;
- não tem imagem;
- não tem preço válido;
- desconto fica abaixo de `SHOPEE_MIN_DISCOUNT_PERCENT`;
- avaliação fica abaixo de `SHOPEE_MIN_RATING`, quando disponível;
- vendas ficam abaixo de `SHOPEE_MIN_SALES`, quando disponível;
- contém termo bloqueado;
- economia real fica abaixo de `SHOPEE_MIN_REAL_SAVINGS`;
- score final fica abaixo de `SHOPEE_MIN_SCORE`.

## Termos bloqueados

Lista padrão:

```text
adulto, emagrecedor, remedio, medicamento, anvisa, cigarro, vape, arma,
faca, replica, cassino, aposta, pirata, falsificado, 1 linha, primeira linha,
sem garantia, milagroso, cura, sexual, erotico
```

Pode ser sobrescrita com:

```env
SHOPEE_BLOCKED_TERMS=termo1,termo2,termo3
```

## Termos preferidos

Lista padrão:

```text
organizador, cozinha, casa, limpeza, smart, carregador, fone, garrafa,
termica, beleza, skincare, kit, infantil, utilidade, oferta, promo, desconto
```

Pode ser sobrescrita com:

```env
SHOPEE_PREFERRED_TERMS=termo1,termo2,termo3
```

## Variáveis de ajuste

- `SHOPEE_MIN_SCORE`: score mínimo. Padrão `45`.
- `SHOPEE_MIN_REAL_SAVINGS`: economia real mínima em reais. Padrão `3`.
- `SHOPEE_MIN_DISCOUNT_PERCENT`: desconto mínimo. Padrão `5`.
- `SHOPEE_MIN_RATING`: avaliação mínima. Padrão `4.2`.
- `SHOPEE_MIN_SALES`: vendas mínimas. Padrão `1`.
- `SHOPEE_NAME_SIMILARITY_THRESHOLD`: similaridade para deduplicação por nome. Padrão `0.86`.

## Logs

O resumo do job agora inclui:

- `scoreFinal`;
- `motivosAprovacao`;
- `motivosRejeicao`;
- `top10CandidatosAntesDoCorte`;
- `selecionados`;
- `rejeitados`;
- métricas usadas no score.

Exemplo de métrica por oferta:

```json
{
  "scoreFinal": 72.4,
  "motivosAprovacao": ["desconto_relevante", "economia_real", "boa_avaliacao"],
  "motivosRejeicao": [],
  "metricas": {
    "discountPercent": 35,
    "realSavings": 28,
    "promoPrice": 51.9,
    "sales": 120,
    "rating": 4.8,
    "commission": 0.04,
    "hasImage": true
  }
}
```

## Estratégia de seleção

1. Coletar candidatos por keyword.
2. Calcular score v2 para cada oferta.
3. Rejeitar ofertas inválidas ou abaixo da qualidade mínima.
4. Remover duplicatas internas por link e nome parecido.
5. Remover duplicatas já existentes na planilha por link e nome recente parecido.
6. Ordenar por score final.
7. Inserir até 5 ofertas.

## Compatibilidade

O score v2 não altera:

- colunas da planilha;
- valor `envio_whatsapp = pendente`;
- integração com Make;
- workflow do GitHub Actions;
- site;
- `products.json`.
