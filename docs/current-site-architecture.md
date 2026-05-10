# Arquitetura atual do Site Vitrine

Este documento descreve a arquitetura atual do `index.html` do Site Vitrine Promo.Club007 sem propor alterações imediatas no funcionamento. A análise considera o estado atual do repositório, que contém apenas o arquivo `index.html` na raiz e esta documentação em `docs/`.

## 1. Estrutura atual do projeto

Hoje o site é uma página estática monolítica:

- `index.html`: contém HTML, CSS, dados das ofertas e JavaScript de renderização no mesmo arquivo.
- Não há bundler, framework, servidor, API, arquivos JSON externos, rotas, assets locais separados, testes ou configuração de build.
- O carregamento depende do navegador interpretar diretamente o HTML e executar o script inline ao final do `body`.

O arquivo tem três blocos principais:

1. `<head>`: metadados, CSP, fonte Google Fonts e CSS inline.
2. `<body>`: estrutura visual fixa da vitrine, barra de busca, chips de filtro, painel de destaques, catálogo, rodapé e botões flutuantes.
3. `<script>`: array de produtos, utilitários, filtros, ordenação, montagem dos cards e inicialização por `DOMContentLoaded`.

## 2. Como as ofertas são armazenadas atualmente

As ofertas estão armazenadas em memória, em um array JavaScript inline:

```js
const products = [
  {
    "name": "...",
    "desc": "...",
    "oldPrice": "R$ ...",
    "newPrice": "R$ ...",
    "discount": "...% OFF",
    "link": "https://...",
    "image": "https://...",
    "store": "..."
  }
];
```

O array começa dentro do `index.html` logo após a abertura do `<script>`, por volta da linha 853, e termina por volta da linha 5163. A contagem atual observada é de 431 produtos:

- 24 produtos com `store: "Mercado Livre"`.
- 407 produtos com `store: "Shopee"`.

O modelo atual de produto é implícito. Não existe schema formal, validação ou normalização prévia. A renderização espera, por convenção, estes campos:

- `name`: título exibido no card, usado também no `alt` da imagem e na busca.
- `desc`: descrição exibida no card e usada na busca.
- `oldPrice`: preço anterior, exibido riscado quando existe.
- `newPrice`: preço atual, exibido como preço principal quando existe.
- `discount`: texto do desconto, usado para ordenação e destaque.
- `link`: URL externa do botão de compra.
- `image`: URL externa da imagem.
- `store`: nome do marketplace, usado em filtro, badge, fallback visual e classes CSS.

Os preços e descontos são armazenados como strings já formatadas para exibição, não como números. Isso simplifica o HTML atual, mas mistura dados de apresentação com dados de negócio.

## 3. Onde os dados estão hardcoded

Os dados hardcoded aparecem em várias camadas do mesmo arquivo:

- Produtos: todo o catálogo está dentro de `const products`.
- Marketplaces filtráveis: os chips são fixos no HTML com `data-store="Mercado Livre"` e `data-store="Shopee"`.
- Filtro especial: `data-store="best"` representa "Melhores ofertas" e é tratado diretamente no JavaScript.
- Ordenações: as opções do `<select id="sortSelect">` são fixas no HTML e mapeadas por strings no JavaScript.
- Textos institucionais: hero, legendas, rodapé, mensagens vazias, texto do botão e metadados são fixos.
- Links sociais: Instagram e WhatsApp estão fixos no HTML.
- Regras visuais por loja: Shopee possui estilos específicos em CSS e lógica específica no fallback de imagem. Mercado Livre depende do estilo padrão/amarelo.
- Origem das imagens: as imagens apontam diretamente para Cloudinary, Shopee e outros hosts externos.
- Links de afiliado: os links finais dos marketplaces já estão embutidos em cada produto.

Esse acoplamento significa que qualquer atualização de produto, inclusão de loja, mudança de copy ou ajuste de fonte de dados exige editar o `index.html`.

## 4. Como o sistema de renderização funciona

A renderização é 100% client-side e imperativa. O HTML inicial entrega apenas os contêineres vazios:

- `#featuredGrid` para os destaques.
- `#catalog` para o catálogo principal.
- `#resultsMeta` para a contagem textual.

Depois que o DOM carrega, o script chama `refreshView()`, que executa:

```js
renderCatalog(getFilteredProducts());
```

Fluxo principal:

1. `getFilteredProducts()` lê o estado atual de busca, loja ativa e ordenação.
2. Retorna uma nova lista filtrada/ordenada.
3. `renderCatalog(list)` limpa `#catalog` com `innerHTML = ''`.
4. Para cada produto, chama `buildCard(product)`.
5. `buildCard(product)` cria manualmente os nós DOM com `document.createElement`.
6. Os cards são adicionados em um `DocumentFragment`.
7. O fragmento é anexado ao catálogo.
8. `updateMeta(list.length)` atualiza a contagem.

Há também `renderFeatured()`, responsável pelo painel de "Ofertas em destaque". Ele:

- limpa `#featuredGrid`;
- copia `products`;
- ordena por maior desconto;
- remove itens sem desconto numérico positivo;
- pega os 5 primeiros;
- cria cards compactos com imagem, nome, preços e desconto.

Ponto importante: no carregamento inicial, `renderFeatured()` não é chamado. Ele só é chamado quando o usuário altera a ordenação no select. Isso significa que o painel de destaques começa vazio no estado atual, apesar de existir o contêiner no HTML. Essa é uma particularidade relevante antes de qualquer refatoração.

## 5. Como filtros e busca funcionam

O estado de UI é guardado em duas variáveis globais:

```js
let activeStore = 'all';
let activeSort = 'relevance';
```

A busca não tem estado global próprio. O termo é lido diretamente do DOM:

```js
const term = document.getElementById('searchInput').value.toLowerCase().trim();
```

### Filtro por loja

Os botões `.chip` possuem `data-store`. No clique:

1. remove `.active` de todos os chips;
2. adiciona `.active` ao chip clicado;
3. grava `activeStore = chip.dataset.store`;
4. chama `refreshView()`.

As regras atuais são:

- `all`: mostra todos os produtos.
- `best`: considera todos os produtos, ordena por maior desconto e retorna só 5.
- qualquer outro valor: compara `normalizeStore(product.store)` com `normalizeStore(activeStore)`.

### Busca textual

A busca usa `includes` em três campos:

- `name`;
- `desc`;
- `store`.

Não busca por categoria, preço, desconto, marketplace id ou tags porque esses campos não existem. Também não remove acentos, não tokeniza palavras, não ranqueia relevância e não faz debounce. A cada tecla digitada, o catálogo inteiro é filtrado e renderizado novamente.

### Ordenação

As opções atuais são:

- `relevance`: não aplica sort adicional; preserva a ordem original do array após o filtro.
- `discount`: maior desconto primeiro.
- `lowest`: menor preço primeiro.
- `highest`: maior preço primeiro.
- `name`: ordem alfabética por `name` usando locale `pt-BR`.

Quando `activeStore === 'best'`, a ordenação do select é ignorada e a regra própria de "melhores ofertas" prevalece: maior desconto e, em empate, menor preço.

## 6. Como imagens e links são montados

### Links

Links são lidos de `product.link` e passam por `safeUrl(value)`.

`safeUrl`:

- converte o valor para string;
- remove espaços no começo/fim;
- tenta construir `new URL(raw, window.location.origin)`;
- aceita apenas protocolos `http:` e `https:`;
- retorna URL vazia em caso de erro ou protocolo inválido.

No card:

- se o link é válido, o botão recebe `href` com a URL e texto "Comprar agora";
- se o link é inválido, o botão recebe `href="#"`, texto "Link indisponível" e `aria-disabled="true"`;
- todos os links de produto abrem em nova aba com `target="_blank"` e `rel="noopener noreferrer nofollow"`.

Não existe camada intermediária de tracking própria. O link usado é exatamente o link hardcoded no produto.

### Imagens

Imagens são lidas de `product.image` e passam por `imageUrl(value)`.

`imageUrl`:

- chama `safeUrl`;
- se a URL for válida, retorna a imagem externa;
- caso contrário, retorna `PLACEHOLDER`, um SVG inline em data URI.

Cada `<img>` recebe:

- `src` calculado por `imageUrl(product.image)`;
- `alt` baseado em `product.name`;
- `loading="lazy"`;
- `decoding="async"`;
- `referrerPolicy="no-referrer"`;
- `onerror` que substitui a imagem quebrada por `brandedFallback(product)`.

`brandedFallback(product)` gera um SVG em data URI com nome da loja e título curto do produto. Ele tem lógica específica para Shopee:

- Shopee: cor laranja `#ff6a3d` e texto branco.
- demais lojas: amarelo `#fff159` e texto escuro.

## 7. Como funciona o carregamento inicial da página

O navegador recebe um HTML grande, com CSS e produtos embutidos. O fluxo inicial é:

1. O HTML é baixado integralmente.
2. O CSS inline é interpretado.
3. A fonte Inter é solicitada ao Google Fonts.
4. A estrutura visual inicial é montada com catálogo e destaques vazios.
5. O script inline é interpretado, incluindo a criação do grande array `products`.
6. No `DOMContentLoaded`, o script registra listeners:
   - `input` no campo de busca;
   - `change` no select de ordenação;
   - `click` nos chips de loja.
7. Ainda dentro do `DOMContentLoaded`, chama `refreshView()`.
8. `refreshView()` renderiza o catálogo inicial com todos os produtos.

Como `renderFeatured()` não é chamado no carregamento inicial, o painel `#featuredGrid` não é preenchido inicialmente. Ele só é atualizado no evento de mudança de ordenação.

O tempo de primeira renderização depende do tamanho do próprio `index.html`, do parse do array de 431 produtos, do custo de criar todos os cards no DOM e do carregamento de imagens externas em lazy loading.

## 8. Partes que devem ser desacopladas primeiro

A ordem mais segura de desacoplamento deve preservar a UI atual e reduzir risco por etapas:

1. **Dados dos produtos**
   - Extrair `products` para uma fonte separada, inicialmente estática, como `data/products.json` ou `data/products.js`.
   - Manter o mesmo schema atual para não quebrar renderização.

2. **Normalização de produto**
   - Criar uma função de adaptação que receba dados brutos e devolva o formato esperado pela UI.
   - Converter preço e desconto para campos numéricos auxiliares sem remover os textos atuais.

3. **Configuração de marketplaces**
   - Tirar lojas do HTML fixo e criar uma configuração como `marketplaces`.
   - Cada marketplace deveria ter `id`, `name`, `brandColor`, `textColor`, domínios permitidos, regras de imagem/link e flags de exibição.

4. **Renderização**
   - Separar funções puras de filtro/ordenação das funções que manipulam DOM.
   - Manter `buildCard`, `renderCatalog` e `renderFeatured` inicialmente com a mesma saída visual.

5. **Inicialização**
   - Trocar o `DOMContentLoaded` para uma sequência assíncrona controlada:
     `loadProducts() -> normalizeProducts() -> bindEvents() -> renderInitialView()`.

6. **SEO e metadados**
   - Planejar dados estruturados, sitemap e páginas/indexação por oferta ou categoria antes de depender apenas de renderização client-side.

## 9. Estratégia mais segura para integrar dados dinâmicos

A integração dinâmica deve ser incremental e reversível.

### Etapa 1: snapshot externo estático

Criar um arquivo de dados gerado automaticamente, mas servido como estático:

- `data/products.json`
- ou `data/products.generated.json`

O `index.html` passaria a carregar esse arquivo com `fetch`. Para reduzir risco, manteria um fallback para o array inline ou para um snapshot embutido durante a transição.

Contrato recomendado:

```json
{
  "generatedAt": "2026-05-10T00:00:00-03:00",
  "version": 1,
  "products": []
}
```

### Etapa 2: adaptador e validação

Antes de renderizar, cada item deve passar por um adaptador:

- garante strings seguras para `name`, `desc`, `store`;
- valida URLs de imagem e compra;
- calcula `priceValue`, `oldPriceValue`, `discountValue`;
- gera `id` estável;
- remove ou marca produtos inválidos;
- preserva os campos de exibição atuais.

### Etapa 3: fallback operacional

Se o JSON externo falhar:

- exibir o último snapshot válido, quando houver;
- ou exibir uma lista embutida mínima;
- ou mostrar estado de erro amigável no catálogo.

Evitar uma tela em branco. A vitrine precisa continuar navegável mesmo quando a fonte dinâmica falhar.

### Etapa 4: automação fora do frontend

Atualização automática deve acontecer fora do navegador:

- script de coleta/curadoria;
- validação;
- geração do JSON;
- deploy estático.

O frontend deve consumir um snapshot pronto. Isso evita expor credenciais, regras de scraping ou APIs sensíveis no cliente.

### Etapa 5: feature flag

Durante a migração, usar uma flag simples:

- `DATA_SOURCE = 'inline' | 'json'`;
- ou query param interno para teste, como `?source=json`.

Assim é possível comparar dados antigos e novos sem alterar o comportamento público de uma vez.

## 10. Riscos da arquitetura atual

### Acoplamento alto

Dados, layout, estilos, regras de negócio e inicialização estão no mesmo arquivo. Qualquer mudança em produto ou marketplace aumenta o risco de regressão visual ou funcional.

### Escalabilidade limitada

Com 431 produtos, o site ainda é simples, mas o modelo atual renderiza todos os cards de uma vez. Com milhares de ofertas, a busca por tecla e a recriação completa do DOM podem prejudicar o mobile.

### SEO limitado

O conteúdo principal é renderizado via JavaScript. Robôs modernos podem executar JS, mas a indexação é menos previsível que HTML pré-renderizado. Não há páginas por produto, categorias, sitemap, dados estruturados ou URLs filtráveis.

### Dados sem schema

Não há validação de preço, desconto, loja, imagem ou link. Um item malformado pode degradar ordenação, busca, visual ou conversão.

### Ordenação baseada em texto

`parsePrice` e `parseDiscount` tentam extrair números de strings formatadas. Isso pode falhar com formatos diferentes, descontos ausentes, preços internacionais ou campos como "A partir de".

### Marketplaces fixos

Adicionar uma loja exige mexer em HTML, CSS e JS. A lógica visual e de fallback conhece apenas Shopee de forma explícita.

### Atualização manual e propensa a erro

Como o catálogo está dentro do HTML, atualizar produtos exige editar um arquivo grande. Isso aumenta risco de quebrar sintaxe JS, encoding, CSP ou estrutura da página.

### Performance mobile

O HTML é pesado porque carrega todos os dados no documento inicial. A primeira interação também cria muitos nós DOM. As imagens são lazy, mas a estrutura de todos os cards é criada imediatamente.

### Observabilidade inexistente

Não há logs, métricas, contagem de cliques, erros de imagem, falhas de link, performance web vitals ou validação em build.

### Segurança parcialmente boa, mas rígida

Há CSP e sanitização básica por uso de `textContent`/`createElement`, o que é positivo. Porém `script-src 'unsafe-inline'` é necessário pelo script inline atual. A migração para arquivos JS externos permitiria endurecer a CSP.

## 11. Preparação para atualização automática

Arquitetura recomendada:

- Um pipeline gera `data/products.generated.json`.
- O pipeline valida schema e descarta dados inválidos.
- O frontend apenas consome o snapshot.
- O JSON inclui `generatedAt`, `source`, `marketplace`, `id`, `status`, `expiresAt` e campos numéricos normalizados.
- O deploy publica HTML, JS, CSS e JSON estáticos.

Campos úteis para atualização:

- `id`: chave estável da oferta.
- `marketplaceId`: id interno, por exemplo `shopee` ou `mercado-livre`.
- `title`, `description`.
- `price`, `oldPrice`, `discountPercent` como números.
- `priceText`, `oldPriceText`, `discountText` como strings de exibição.
- `affiliateUrl`, `canonicalUrl`.
- `imageUrl`, `imageAlt`.
- `category`, `tags`.
- `createdAt`, `updatedAt`, `expiresAt`.
- `availability`.

## 12. Preparação para múltiplos marketplaces

Criar uma camada de configuração por marketplace:

```js
const marketplaces = {
  shopee: {
    name: 'Shopee',
    color: '#ff6a3d',
    textColor: '#ffffff',
    allowedHosts: ['s.shopee.com.br', 'shopee.com.br', 'cf.shopee.com.br']
  },
  mercadoLivre: {
    name: 'Mercado Livre',
    color: '#fff159',
    textColor: '#111827',
    allowedHosts: ['mercadolivre.com.br', 'www.mercadolivre.com.br']
  }
};
```

Com isso:

- filtros podem ser gerados automaticamente a partir dos dados;
- badges e fallback visual deixam de depender de `if store === 'shopee'`;
- regras de domínio por loja podem ser validadas;
- novas lojas entram por configuração, não por alteração espalhada.

## 13. Preparação para SEO

O caminho atual client-side é bom para uma vitrine simples, mas limitado para tráfego orgânico.

Evoluções recomendadas:

- Gerar HTML inicial com as principais ofertas já presentes no documento.
- Criar `sitemap.xml`.
- Criar `robots.txt`.
- Adicionar JSON-LD para `ItemList` e, quando aplicável, `Product`/`Offer`.
- Criar URLs estáveis para categorias, lojas e possivelmente ofertas individuais.
- Adicionar metadados Open Graph/Twitter.
- Evitar depender de busca/filtro client-side como única forma de descobrir ofertas.
- Manter descrições limpas, títulos únicos e imagens estáveis.

Para uma vitrine estática, uma abordagem segura seria gerar páginas no build a partir do JSON, sem introduzir backend no primeiro momento.

## 14. Preparação para performance mobile

Prioridades:

- Separar dados do HTML para reduzir peso inicial.
- Paginar, virtualizar ou carregar mais cards sob demanda.
- Fazer debounce da busca.
- Pré-calcular campos normalizados para evitar parsing repetido.
- Renderizar destaques e primeira página primeiro, depois o restante.
- Definir dimensões estáveis para imagens para reduzir layout shift.
- Usar imagens otimizadas, com tamanhos responsivos quando a fonte permitir.
- Reduzir CSS duplicado e mover CSS/JS para arquivos cacheáveis.
- Considerar cache com Service Worker somente depois de estabilizar dados e invalidação.

O ponto mais sensível é que `refreshView()` recria todo o catálogo a cada busca, filtro ou ordenação. Isso é simples e correto para centenas de itens, mas caro para milhares.

## 15. Preparação para escalabilidade futura

A arquitetura alvo pode continuar simples, mas precisa de fronteiras claras:

- `data/`: snapshots gerados.
- `src/data/`: carregamento, validação e normalização.
- `src/domain/`: filtro, busca, ordenação e regras de destaque.
- `src/ui/`: criação de cards e atualização do DOM.
- `src/config/`: marketplaces, links sociais e textos globais.
- `scripts/`: geração/validação de catálogo.
- `docs/`: decisões arquiteturais e contratos de dados.

Sem framework, ainda é possível ter boa organização com módulos ES. Com crescimento maior, pode fazer sentido adotar um gerador estático ou framework com pré-renderização, mas isso não é necessário como primeiro passo.

## 16. Sequência recomendada de evolução sem quebrar o site

1. Documentar o contrato atual de produto.
2. Extrair o array para um arquivo de dados mantendo exatamente o mesmo conteúdo.
3. Introduzir `loadProducts()` com fallback.
4. Corrigir a inicialização de destaques em uma alteração pequena e testável.
5. Criar normalização numérica para preço/desconto sem mudar o visual.
6. Gerar filtros de loja a partir dos dados/configuração.
7. Mover CSS e JS para arquivos separados cacheáveis.
8. Adicionar validação de dados no processo de atualização.
9. Adicionar SEO estático a partir do mesmo JSON.
10. Implementar paginação ou carregamento progressivo quando o catálogo crescer.

## 17. Conclusão

O site atual é funcional e relativamente seguro para uma vitrine estática pequena/média, porque usa DOM APIs em vez de interpolar HTML de produto e valida URLs antes de montar links e imagens. O principal problema arquitetural é que dados, regras, renderização e apresentação estão concentrados em um único arquivo.

A primeira mudança estrutural deve ser separar os dados mantendo o contrato atual. Depois disso, a arquitetura pode evoluir para atualização automática, múltiplos marketplaces, SEO e melhor performance mobile sem reescrever a interface inteira de uma vez.
