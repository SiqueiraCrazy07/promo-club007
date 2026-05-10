# Arquitetura de performance da vitrine

## Objetivo

A vitrine agora usa renderização progressiva para reduzir o volume inicial de DOM sem alterar layout, CSS ou controles visuais.

O estado de paginação interna fica em:

```js
window.store.pagination = {
  page: 1,
  perPage: 24,
  hasMore: true
};
```

O catálogo renderiza 24 produtos na primeira carga. Ao aproximar do fim da página, o scroll aumenta `page` e anexa o próximo lote de 24 cards.

## Fluxo de renderização

1. `products.json` continua sendo a fonte prioritária.
2. Se o JSON falhar, `data/products.js` continua sendo fallback.
3. Filtros, busca e ordenação calculam a lista completa em `window.store.filtered`.
4. A paginação interna decide quantos itens dessa lista entram no DOM.
5. `refreshView()` renderiza a primeira página ou anexa a próxima página quando chamado pelo scroll.
6. A meta de resultados continua baseada no total filtrado, preservando a UX anterior.

## Imagens

Os cards mantêm:

- `loading="lazy"`;
- `decoding="async"`;
- `referrerPolicy="no-referrer"`;
- fallback visual quando a imagem quebra.

Isso reduz concorrência de rede e decodificação inicial, mas a maior economia vem de não criar centenas ou milhares de nós no primeiro render.

## Redução estimada de DOM nodes

Com o `products.json` atual, a vitrine tem 455 ofertas válidas. Antes, o primeiro render criava cards para todas. Agora cria 24.

Redução inicial de cards:

- antes: 455 cards;
- agora: 24 cards;
- redução: aproximadamente 94,7%.

Como cada card possui vários elementos internos, a redução real de nós de DOM segue a mesma proporção. Considerando cerca de 14 a 16 nós por card, o primeiro render deixa de criar milhares de nós em catálogos médios.

Para 10k ofertas:

- antes: 10.000 cards no DOM;
- agora: 24 cards no primeiro render;
- redução inicial: aproximadamente 99,76%.

## Impacto esperado em mobile

Em mobile, o ganho esperado é maior porque CPU, memória e layout/paint são mais restritos.

Impactos esperados:

- menor tempo de bloqueio no carregamento inicial;
- menor pressão de memória;
- menos recálculo de layout;
- menos decodificação de imagens no início;
- busca e filtros com resposta mais estável, porque a renderização recria só a primeira página visível.

O custo de filtrar e ordenar ainda existe sobre a lista completa, mas o custo de DOM passa a ser limitado pelo lote renderizado.

## Gargalos atuais

Os gargalos restantes são:

- filtro e busca ainda percorrem todos os produtos;
- ordenação ainda pode custar `O(n log n)`;
- o cache de render ainda é local e simples;
- não há debounce na busca;
- o DOM cresce conforme o usuário avança no scroll;
- não há virtualização para remover cards antigos fora da viewport.

## Cache de render

`renderState.renderCache` guarda cards por uma chave derivada de produto e posição. Isso prepara reuso interno sem alterar o HTML visual.

`renderState.filterCache` guarda listas filtradas/ordenadas por termo, loja e ordenação. Quando filtros ou ordenação mudam, a paginação volta para a página 1 e a visão é recalculada.

## Estratégia para 10k+ ofertas

Para 10k+ ofertas, a renderização progressiva é necessária, mas não suficiente sozinha.

Estratégia recomendada:

1. Adicionar debounce na busca para reduzir cálculos por tecla.
2. Limitar o tamanho dos caches com política LRU simples.
3. Pré-normalizar campos de busca em lowercase no carregamento.
4. Usar Web Worker para filtros e ordenação em catálogos muito grandes.
5. Ativar virtualização quando o DOM acumulado passar de algumas centenas de cards.
6. Manter infinite scroll como camada de UX e virtualização como camada de performance.
7. Separar cache por marketplace e versão de dados.
8. Medir `filter`, `sort`, `render` e `append` com `performance.mark()` antes de ampliar a otimização.

## Compatibilidade preservada

- Visual e CSS não foram alterados.
- Busca continua operando sobre todos os produtos carregados.
- Filtros continuam operando sobre todos os produtos carregados.
- “Melhores ofertas” continua limitado ao top 5 por desconto.
- `products.json` continua prioritário.
- `data/products.js` continua como fallback.
