# Melhorias UX/CRO da vitrine

## Objetivo

As melhorias foram aplicadas mantendo a arquitetura atual: `index.html` concentra o visual, `js/render.js` continua responsável pela renderização e as fontes `products.json` e `data/products.js` permanecem com o mesmo contrato.

Não houve alteração em `automation/`, GitHub Actions ou `products.json`.

## Cards de produto

Os cards receberam ajustes de hierarquia para melhorar leitura e clique:

- preço atual mais forte e contrastado;
- desconto com badge mais claro;
- botão de compra em verde, com maior altura e seta visual;
- loja com badge mais visível;
- separação mais nítida entre imagem, conteúdo e preço;
- estados de hover mais profissionais no desktop.

O DOM dos cards continua usando as mesmas classes renderizadas por `renderCard()`, preservando compatibilidade com a camada de dados.

## Filtros e busca

A área de filtros recebeu melhorias de clareza:

- chips com altura mínima consistente;
- estado ativo com indicador visual;
- melhor contraste de borda e sombra;
- grid de 2 colunas no mobile para evitar chips apertados;
- campo de busca com foco mais evidente.

Os filtros continuam usando os mesmos `data-store` e os mesmos listeners da camada de renderização.

## Ofertas em destaque

A seção de destaques recebeu:

- cabeçalho com marcador visual;
- cards com borda e sombra mais refinadas;
- hover discreto no desktop;
- miniaturas preservando `object-fit: contain`;
- renderização inicial dos destaques após carregar os produtos.

A seleção continua vindo de `getBestDeals()`, com top 5 por desconto.

## Estados vazios e carregamento

O estado vazio foi melhorado via CSS com uma mensagem de apoio visual usando pseudo-elemento. O texto base continua vindo da renderização atual.

O estado inicial de carregamento continua sendo o texto existente em `#resultsMeta`, preservando GitHub Pages e carregamento estático.

## Mobile

No mobile, os ajustes focam legibilidade e toque:

- chips em grid de 2 colunas;
- botões com área de toque maior;
- preço com tamanho reforçado sem estourar o card;
- badges compactas para evitar quebra visual;
- seletor de ordenação com largura total.

## Compatibilidade

Compatibilidades preservadas:

- `products.json` continua prioritário;
- `data/products.js` continua fallback;
- busca não muda contrato;
- filtros não mudam contrato;
- melhores ofertas continuam top 5 por desconto;
- scroll progressivo continua usando `window.store.pagination`;
- GitHub Pages continua compatível, sem build ou backend.

## Risco residual

As mudanças são majoritariamente CSS. O único ajuste em JavaScript foi chamar `renderFeatured()` após o carregamento inicial para preencher a seção de destaques já existente. Isso usa a função e o estado já existentes, sem alterar automação ou origem dos produtos.
