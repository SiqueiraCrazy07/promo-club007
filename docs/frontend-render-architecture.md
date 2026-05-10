# Arquitetura de renderização da vitrine

## Objetivo

A camada de renderização foi isolada em `js/render.js` para manter o HTML visual e o CSS estáveis, mas permitir evolução do catálogo sem acoplar dados, filtros e DOM no mesmo bloco inline.

O estado central da vitrine agora é:

```js
window.store = {
  products: [],
  filtered: [],
  source: null
};
```

`window.store.products` guarda a lista carregada, `window.store.filtered` guarda a visão atual após filtros, busca, ordenação e paginação futura, e `window.store.source` registra a origem ativa dos dados.

## Fluxo atual

1. `data/products.js` carrega primeiro e continua sendo o fallback local.
2. `js/render.js` inicializa a camada de renderização no `DOMContentLoaded`.
3. `loadProducts()` tenta carregar `automation/outputs/products.json` com prioridade.
4. Se o JSON for válido, ele popula `window.store.products` e `window.store.source = "products.json"`.
5. Se falhar, a vitrine valida e usa `window.products` vindo de `data/products.js`, com `window.store.source = "fallback"`.
6. Busca, filtros e ordenação passam por `getFilteredProducts()`.
7. `refreshView()` renderiza a visão filtrada no catálogo.
8. `renderCard()` cria cada card mantendo as mesmas classes CSS e o mesmo DOM visual.
9. `renderFeatured()` permanece isolado para os destaques e é atualizado no mesmo ponto em que já era atualizado antes.

## Responsabilidades extraídas

- Filtros: `filterProducts()`, `matchesStore()`.
- Busca: `getSearchTerm()`, `matchesSearch()`.
- Ordenação: `sortProducts()`.
- Paginação futura: `paginateProducts()`, `renderState.page`, `renderState.pageSize`.
- Card: `renderCard()`.
- Atualização da vitrine: `refreshView()`, `renderCatalog()`.
- Melhores ofertas: `getBestDeals()`, `renderFeatured()` e o filtro `best`.
- Fonte de dados e fallback: `loadProducts()`, `setProducts()`.
- Cache futuro: `renderState.cache`.
- Múltiplos marketplaces: `renderState.marketplaces`.

## Gargalos atuais

O gargalo principal continua sendo renderização total: cada alteração de busca, filtro ou ordenação esvazia `#catalog` e recria todos os cards visíveis.

Também há custo repetido de cálculo:

- busca percorre todos os produtos;
- filtro por loja percorre todos os produtos;
- ordenação cria cópia e ordena a lista filtrada;
- cada render cria novos nós de DOM, novas imagens, novos handlers de fallback e novo `DocumentFragment`.

As imagens já usam `loading="lazy"` e `decoding="async"`, o que reduz custo de rede e decodificação inicial, mas não elimina o custo de criar milhares de elementos.

## Custo atual de render

Para `n` ofertas, o custo básico por atualização é:

- filtro e busca: `O(n)`;
- ordenação: até `O(n log n)`;
- criação de DOM: `O(k)`, onde `k` é a quantidade renderizada;
- layout/paint do navegador: cresce com a quantidade de cards no DOM.

Hoje, sem paginação ativa, `k` tende a ser igual ao total filtrado. Em listas pequenas isso é aceitável. Em listas grandes, o gargalo passa a ser o DOM, não apenas o JavaScript.

## Riscos com 5k+ ofertas

Com 5k+ ofertas, os principais riscos são:

- input de busca com atraso perceptível, porque cada tecla recalcula e recria a lista;
- travamentos curtos no main thread durante sort e render;
- memória elevada por milhares de cards e imagens no DOM;
- layout e paint caros, principalmente em mobile;
- lazy loading menos efetivo se muitos nós de imagem forem criados de uma vez;
- maior chance de cache de visão crescer sem política de descarte;
- dificuldade de combinar marketplaces com regras próprias sem normalização mais forte.

## Estratégia recomendada

1. Ativar paginação progressiva usando `renderState.pageSize`.
2. Debounce na busca para evitar render a cada tecla em sequência.
3. Cachear resultados por termo, loja e ordenação com limite de tamanho.
4. Normalizar dados de marketplaces antes de chegar ao render, preservando um schema único.
5. Introduzir infinite scroll apenas depois da paginação base estar estável.
6. Usar virtualização quando o catálogo precisar manter navegação fluida com milhares de cards.
7. Separar cache de dados de cache de visão: dados por fonte/versão, visão por critérios de UI.
8. Medir `filter + sort + render` com `performance.mark()` antes de otimizações maiores.

## Pontos preparados no código

`renderState.page` e `renderState.pageSize` permitem ativar paginação sem mudar o contrato de `refreshView()`.

`renderState.cache` centraliza cache de resultados filtrados. Hoje ele é limpo quando filtro ou ordenação mudam, mas pode receber política de limite e expiração.

`renderState.marketplaces` mantém o índice de lojas disponíveis a partir dos produtos carregados. Isso prepara múltiplos marketplaces sem depender de uma lista fixa no render.

`renderState.lazyLoading`, `renderState.virtualized` e `renderState.infiniteScroll` deixam flags explícitas para evolução sem mudar o HTML visual agora.

## Compatibilidade preservada

- `products.json` continua prioritário.
- `data/products.js` continua como fallback.
- `window.products` continua atualizado para compatibilidade com integrações antigas.
- O CSS não foi alterado.
- O HTML visual não foi alterado.
- As classes dos cards, destaques, badges, preços e botões foram preservadas.
