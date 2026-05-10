# Migração da camada de dados

Este documento registra a primeira etapa de desacoplamento da camada de dados do Site Vitrine.

## O que mudou

O array `products`, antes embutido diretamente no `index.html`, foi movido para:

```text
data/products.js
```

O `index.html` passou a carregar esse arquivo antes do script que contém filtros, ordenação e renderização:

```html
<script src="data/products.js"></script>
<script>
  ...
</script>
```

O arquivo `data/products.js` mantém a mesma variável global:

```js
const products = [ ... ];
```

Essa decisão preserva compatibilidade com o código atual, que já referencia `products` diretamente em funções como `getFilteredProducts()`, `renderFeatured()` e `renderCatalog()`.

## O que não mudou

- O visual do site não foi alterado.
- O CSS não foi alterado.
- O modelo dos produtos não foi alterado.
- A ordem dos produtos foi mantida.
- Os campos usados pela UI continuam os mesmos: `name`, `desc`, `oldPrice`, `newPrice`, `discount`, `link`, `image` e `store`.
- Os filtros continuam dependendo de `store`.
- A busca continua usando `name`, `desc` e `store`.
- A ordenação continua usando os mesmos parsers de preço e desconto.
- Não foi adicionado backend.
- Não foi adicionado framework.
- Não foi adicionado React.

## Compatibilidade

A migração usa um script JavaScript clássico, não um ES module. Isso mantém compatibilidade com GitHub Pages e com a forma atual de execução do site como HTML estático.

Como `data/products.js` é carregado antes do script principal, a variável `products` já existe quando as funções de filtro e renderização são executadas. O script principal continua funcionando como antes, sem precisar conhecer a origem física dos dados.

A Content Security Policy atual permite scripts vindos de `'self'`, então `data/products.js` é compatível com a política existente:

```html
script-src 'self' 'unsafe-inline'
```

## Riscos

O principal risco é a ordem de carregamento. Se `data/products.js` for removido, renomeado, bloqueado ou carregado depois do script principal, o site encontrará erro ao acessar `products`.

Outro risco é cache. Em produção, o navegador pode manter uma versão antiga de `data/products.js`. Enquanto o catálogo for atualizado manualmente, isso tende a ser aceitável. Em uma etapa futura, pode ser necessário versionar o arquivo ou adicionar hash no nome.

Também passa a existir uma dependência entre dois arquivos. Antes, o `index.html` era totalmente autocontido; agora ele depende de `data/products.js` estar publicado junto no GitHub Pages.

## Rollback

O rollback é direto:

1. Copiar o conteúdo de `data/products.js`.
2. Colar o bloco `const products = [...]` de volta no início do script principal do `index.html`.
3. Remover a linha:

```html
<script src="data/products.js"></script>
```

4. Remover `data/products.js` se ele não for mais usado.

Como nenhuma regra de renderização foi alterada, o rollback não exige mudança em CSS, HTML visual, filtros ou funções de card.

## Benefícios

- Reduz o tamanho e a responsabilidade do `index.html`.
- Separa catálogo de apresentação visual.
- Facilita atualização futura dos produtos sem mexer na UI.
- Prepara o caminho para gerar dados automaticamente.
- Permite validar e versionar dados separadamente em uma próxima etapa.
- Mantém GitHub Pages simples, sem backend e sem build obrigatório.

## Próximos passos recomendados

1. Criar um contrato formal do produto atual.
2. Adicionar validação simples para `data/products.js` ou migrar para `data/products.json`.
3. Introduzir uma função `loadProducts()` com fallback controlado.
4. Criar normalização de preço e desconto sem mudar a exibição atual.
5. Separar configuração de marketplaces dos dados de produto.
6. Gerar filtros de loja a partir da configuração ou do catálogo.
7. Planejar cache/versionamento para atualizações automáticas.

Esta etapa é propositalmente pequena: ela desacopla a origem dos dados sem mudar a camada visual nem a experiência do usuário.
