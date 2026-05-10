# Arquitetura de dados dinâmica

Este documento descreve a integração inicial do Site Vitrine com um pipeline automático de dados, mantendo compatibilidade com GitHub Pages e com o fallback local.

## Objetivo

A camada visual continua estática e sem framework. A mudança concentra-se apenas na origem dos produtos:

1. O site tenta carregar `automation/outputs/products.json`.
2. Se o carregamento falhar, usa `data/products.js`.
3. A renderização, os filtros, a busca e a ordenação continuam consumindo a variável global `products`.

## Fluxo completo

No HTML, o fallback local é carregado primeiro:

```html
<script src="data/products.js"></script>
```

Esse arquivo define:

```js
var products = [ ... ];
```

Depois, o script principal executa no `DOMContentLoaded`:

1. Registra eventos de busca, ordenação e chips de loja.
2. Mantém o estado inicial de loading já existente em `#resultsMeta`.
3. Chama `loadProducts()`.
4. `loadProducts()` tenta buscar `automation/outputs/products.json`.
5. Se o JSON for carregado e validado, substitui `products`.
6. Se houver erro, mantém `products` vindo de `data/products.js`.
7. Chama `refreshView()`.
8. A renderização atual cria os cards com `buildCard()` e atualiza a contagem com `updateMeta()`.

## Formatos aceitos

O carregador aceita dois formatos para o JSON:

```json
[
  {
    "name": "Produto",
    "desc": "Descrição",
    "oldPrice": "R$ 100,00",
    "newPrice": "R$ 80,00",
    "discount": "20% OFF",
    "link": "https://...",
    "image": "https://...",
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

## Validação mínima

Cada item passa por `normalizeProduct()` antes de entrar na vitrine.

A validação atual é propositalmente pequena:

- o item precisa ser um objeto;
- `name` precisa existir após trim;
- `store` precisa existir após trim;
- os campos esperados pela UI são convertidos para string;
- itens inválidos são descartados;
- se a lista resultante ficar vazia, o carregador considera o JSON inválido e usa fallback.

Não há validação rígida de preço, desconto, marketplace ou URL nesta etapa para não mudar comportamento visual nem regras de filtro. Links e imagens continuam sendo tratados pela lógica existente `safeUrl()` e `imageUrl()`.

## Fallback

O fallback é `data/products.js`.

Ele é carregado antes da tentativa de JSON, então funciona mesmo quando:

- `automation/outputs/products.json` não existe;
- o JSON retorna 404;
- o JSON está malformado;
- a lista validada fica vazia;
- o site é aberto offline;
- o site é aberto direto via arquivo local e `fetch()` é bloqueado pelo navegador.

Quando o fallback é usado, a página mantém os produtos estáticos já conhecidos.

## Compatibilidade com GitHub Pages

A solução é compatível com GitHub Pages porque usa apenas arquivos estáticos:

- `index.html`;
- `data/products.js`;
- `automation/outputs/products.json`, quando publicado.

Não há backend, runtime de servidor, build obrigatório, React ou framework.

O caminho `automation/outputs/products.json` é relativo ao `index.html`, então funcionará em GitHub Pages desde que o arquivo seja publicado no repositório junto com a página.

## Loading state

O estado inicial já existente em `#resultsMeta` continua exibindo "Carregando ofertas..." enquanto o carregador tenta buscar o JSON.

O catálogo só é renderizado depois que `loadProducts()` termina. Isso evita renderizar o fallback e logo em seguida substituir por outra lista, reduzindo trabalho de DOM e evitando piscar conteúdo.

## Riscos

O principal risco é publicar um `products.json` com dados incorretos, mas ainda minimamente válidos. Como a validação atual é leve, valores estranhos de preço ou desconto ainda podem afetar ordenação, exatamente como já acontecia com o catálogo estático.

Outro risco é cache. Mesmo usando `fetch(..., { cache: 'no-cache' })`, proxies, CDN ou navegador podem manter respostas por algum tempo dependendo dos headers do GitHub Pages. Para atualizações frequentes, o ideal será versionar o arquivo, usar hash ou publicar um manifesto com versão.

Também há risco de latência: o site espera a tentativa de JSON terminar antes de renderizar. Se o JSON estiver lento, o usuário ficará mais tempo no estado de loading. Em uma etapa futura, pode ser avaliado um timeout curto para cair mais rápido no fallback.

## Cache

Estado atual:

- `data/products.js` pode ser cacheado pelo navegador como asset estático.
- `automation/outputs/products.json` é solicitado com `cache: 'no-cache'`.
- Não há Service Worker.
- Não há cache local persistente.

Evolução recomendada:

- adicionar `generatedAt` e `version` no JSON;
- publicar `automation/outputs/products.json` como snapshot atual;
- considerar `automation/outputs/products.v{hash}.json` no futuro;
- usar um manifesto pequeno apontando para o snapshot mais recente;
- manter `data/products.js` como fallback estável.

## Deploy automático futuro

Um fluxo seguro de deploy automático pode ser:

1. Pipeline coleta ou recebe ofertas.
2. Pipeline normaliza dados em um schema conhecido.
3. Pipeline valida campos obrigatórios, URLs, preços, descontos e marketplaces.
4. Pipeline gera `automation/outputs/products.json`.
5. Pipeline executa testes de sintaxe e contagem mínima.
6. Pipeline publica o repositório no GitHub Pages.
7. O site carrega o JSON novo na próxima visita.
8. Se o JSON falhar, o fallback local mantém a vitrine online.

Esse desenho mantém o frontend simples e evita expor credenciais, scraping ou integrações de marketplace no navegador.

## Performance mobile

A mudança melhora a separação de responsabilidades, mas ainda não resolve todos os pontos de performance:

- a renderização continua criando todos os cards de uma vez;
- filtros e busca continuam recriando o catálogo inteiro;
- imagens continuam lazy, como antes;
- o JSON adiciona uma requisição inicial quando disponível.

Para mobile, a decisão de esperar `loadProducts()` evita render duplo. A próxima etapa de performance deve focar em paginação, carregamento progressivo ou virtualização quando o catálogo crescer muito.

## Próximos passos

1. Definir schema formal para `products.json`.
2. Adicionar validação automática no pipeline.
3. Incluir `generatedAt`, `version` e contagens por marketplace.
4. Criar timeout para fallback rápido em redes ruins.
5. Adicionar testes automatizados para JSON válido, inválido e ausente.
6. Preparar versionamento/cache busting para deploys frequentes.
