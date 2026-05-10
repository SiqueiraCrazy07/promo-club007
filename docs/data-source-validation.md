# Validacao da fonte de dados da vitrine

Este documento registra a validacao da camada de dados dinamica do Site Vitrine.

## Arquivos verificados

Arquivos locais esperados:

- `automation/outputs/products.json`
- `data/products.js`
- `index.html`

Resultado local:

- `automation/outputs/products.json` existe.
- `data/products.js` existe.
- `index.html` carrega `data/products.js` como fallback e tenta buscar `automation/outputs/products.json` em `loadProducts()`.

## Contagem de produtos

Contagens locais verificadas:

| Fonte | Total | Shopee | Mercado Livre |
| --- | ---: | ---: | ---: |
| `automation/outputs/products.json` | 455 | 428 | 27 |
| `data/products.js` | 431 | 407 | 24 |

Isso confirma que o JSON dinamico contem mais ofertas que o fallback local.

## Fluxo de carregamento

O fluxo atual do `index.html` e:

1. Carrega `data/products.js` para disponibilizar `products` como fallback imediato.
2. No `DOMContentLoaded`, registra eventos de busca, ordenacao e filtros.
3. Chama `loadProducts()`.
4. `loadProducts()` tenta `fetch('automation/outputs/products.json', { cache: 'no-cache' })`.
5. Se o JSON for valido, substitui `products` pela lista dinamica.
6. Se o JSON falhar, mantem `products` vindo de `data/products.js`.
7. Chama `refreshView()` usando a mesma renderizacao existente.

Mesmo que o fallback seja carregado antes como arquivo estatico, ele so e usado como fonte final se o JSON falhar.

## Indicador tecnico

Foi adicionado um indicador invisivel no console:

```js
console.info('[Promo.Club007] data source', { source, count });
```

Tambem fica disponivel para inspecao manual:

```js
window.__PROMO_CLUB_DATA_SOURCE__
```

Valores esperados:

- `{ source: 'products.json', count: 455 }` quando o JSON dinamico carrega.
- `{ source: 'fallback', count: 431 }` quando o fallback local e usado.

Esse indicador nao altera DOM, CSS, layout ou experiencia visual.

## Validacao em producao

URL validada:

```text
https://siqueiracrazy07.github.io/promo-club007/
```

JSON validado em producao:

```text
https://siqueiracrazy07.github.io/promo-club007/automation/outputs/products.json
```

Resultado:

- O arquivo `automation/outputs/products.json` responde em producao.
- O conteudo publicado contem `products` com 455 itens.
- O HTML publicado contem referencia a `automation/outputs/products.json`.
- O HTML publicado contem o fallback `data/products.js`.

Observacao: o indicador de console adicionado nesta etapa so aparecera em producao depois de commit e push.

## Validacao do fallback

O fallback foi validado com simulacao local de falha no `fetch()`.

Resultado esperado e observado:

- fonte final: `fallback`;
- total: 431 produtos;
- Shopee: 407;
- Mercado Livre: 24;
- melhores ofertas: 5;
- busca por `casio`: 1.

Isso confirma que a vitrine continua funcional quando `products.json` esta indisponivel.

## Validacao do JSON dinamico

O caminho dinamico foi validado com `automation/outputs/products.json`.

Resultado esperado e observado:

- fonte final: `products.json`;
- total: 455 produtos;
- Shopee: 428;
- Mercado Livre: 27.

## Risco residual

O site esta seguro para usar o JSON dinamico, mas ainda ha riscos de qualidade de dados:

- JSON valido pode conter preco incorreto, oferta expirada ou link errado.
- O fallback so protege falhas de carregamento ou JSON invalido, nao dados ruins porem validos.
- O cache do GitHub Pages pode atrasar a troca do JSON por alguns minutos.

## Conclusao

A camada de dados esta funcionando com prioridade para `automation/outputs/products.json` e fallback para `data/products.js`. A alteracao do indicador tecnico e segura para commit e push porque nao muda visual, CSS, layout nem regras de filtro.
