(function () {
  const PRODUCTS_JSON_URL = 'automation/outputs/products.json';
  const BEST_DEALS_LIMIT = 5;

  window.store = {
    products: [],
    filtered: [],
    source: null,
    pagination: {
      page: 1,
      perPage: 24,
      hasMore: true
    }
  };

  const renderState = {
    activeStore: 'all',
    activeSort: 'relevance',
    filterCache: new Map(),
    renderCache: new Map(),
    marketplaces: new Set(),
    lazyLoading: true,
    virtualized: false,
    infiniteScroll: true,
    renderedCount: 0,
    isAppending: false,
    scrollThreshold: 900
  };

  const PLACEHOLDER =
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop stop-color="#f8fafc"/>
            <stop offset="1" stop-color="#e2e8f0"/>
          </linearGradient>
        </defs>
        <rect width="800" height="800" fill="url(#g)"/>
        <rect x="84" y="84" width="632" height="632" rx="34" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>
        <circle cx="400" cy="292" r="88" fill="#e2e8f0"/>
        <path d="M265 518c32-76 93-116 135-116s103 40 135 116" fill="none" stroke="#94a3b8" stroke-width="26" stroke-linecap="round"/>
        <text x="400" y="610" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#475569">Imagem indisponível</text>
      </svg>
    `);

  function parsePrice(value) {
    const raw = escapeText(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const num = Number(raw);
    return Number.isFinite(num) ? num : 0;
  }

  function parseDiscount(value) {
    const raw = escapeText(value).replace(/[^\d.-]/g, '');
    const num = Number(raw);
    return Number.isFinite(num) ? num : 0;
  }

  function brandedFallback(product) {
    const store = escapeText(product?.store || 'Oferta');
    const title = escapeText(product?.name || 'Produto').slice(0, 28);
    const storeColor = normalizeStore(store) === 'shopee' ? '#ff6a3d' : '#fff159';
    const storeText = normalizeStore(store) === 'shopee' ? '#ffffff' : '#111827';

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
        <defs>
          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
            <stop stop-color="#ffffff"/>
            <stop offset="1" stop-color="#f8fafc"/>
          </linearGradient>
        </defs>
        <rect width="800" height="800" fill="url(#bg)"/>
        <rect x="50" y="50" width="700" height="700" rx="34" fill="#ffffff" stroke="#dbe4ef" stroke-width="4"/>
        <rect x="88" y="88" width="220" height="58" rx="29" fill="${storeColor}"/>
        <text x="198" y="126" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="800" fill="${storeText}">${store}</text>
        <circle cx="400" cy="330" r="112" fill="#e2e8f0"/>
        <path d="M248 564c40-98 111-148 152-148s112 50 152 148" fill="none" stroke="#94a3b8" stroke-width="30" stroke-linecap="round"/>
        <text x="400" y="664" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#334155">${title}</text>
        <text x="400" y="708" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#64748b">Imagem em atualização</text>
      </svg>
    `);
  }

  function escapeText(value) {
    return String(value ?? '');
  }

  function normalizeStore(value) {
    return escapeText(value).trim().toLowerCase();
  }

  function safeUrl(value) {
    const raw = escapeText(value).trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.origin);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.href;
      }
    } catch (e) {
      return '';
    }
    return '';
  }

  function imageUrl(value) {
    const url = safeUrl(value);
    return url || PLACEHOLDER;
  }

  function cardStoreClass(store) {
    return normalizeStore(store).replace(/\s+/g, '-');
  }

  function normalizeProduct(product) {
    if (!product || typeof product !== 'object') return null;

    const normalized = {
      name: escapeText(product.name).trim(),
      desc: escapeText(product.desc),
      oldPrice: escapeText(product.oldPrice),
      newPrice: escapeText(product.newPrice),
      discount: escapeText(product.discount),
      link: escapeText(product.link),
      image: escapeText(product.image),
      store: escapeText(product.store).trim()
    };

    if (!normalized.name || !normalized.store) return null;
    return normalized;
  }

  function extractProductsPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.products)) return payload.products;
    return [];
  }

  function validateProductsPayload(payload) {
    return extractProductsPayload(payload)
      .map(normalizeProduct)
      .filter(Boolean);
  }

  function updateMarketplaceIndex(products) {
    renderState.marketplaces = new Set(products.map((product) => product.store).filter(Boolean));
  }

  function setProducts(products, source) {
    window.store.products = products;
    window.store.filtered = products;
    window.store.source = source;
    window.products = products;
    resetPagination();
    clearRenderCaches();
    updateMarketplaceIndex(products);
  }

  function reportDataSource(source, count) {
    const info = { source, count };
    window.__PROMO_CLUB_DATA_SOURCE__ = info;
    console.info('[Promo.Club007] data source', info);
  }

  async function loadProducts() {
    const fallbackProducts = Array.isArray(window.products) ? window.products : [];

    try {
      const response = await fetch(PRODUCTS_JSON_URL, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`products.json returned ${response.status}`);
      }

      const loadedProducts = validateProductsPayload(await response.json());
      if (!loadedProducts.length) {
        throw new Error('products.json has no valid products');
      }

      setProducts(loadedProducts, 'products.json');
      reportDataSource('products.json', loadedProducts.length);
    } catch (error) {
      const validatedFallback = validateProductsPayload(fallbackProducts);
      setProducts(validatedFallback, 'fallback');
      reportDataSource('fallback', validatedFallback.length);
      console.warn('Usando fallback local data/products.js:', error);
    }

    return window.store.products;
  }

  function getSearchTerm() {
    const input = document.getElementById('searchInput');
    return input ? input.value.toLowerCase().trim() : '';
  }

  function matchesStore(product, store) {
    if (store === 'all' || store === 'best') return true;
    return normalizeStore(product.store) === normalizeStore(store);
  }

  function matchesSearch(product, term) {
    if (!term) return true;
    return (
      escapeText(product.name).toLowerCase().includes(term) ||
      escapeText(product.desc).toLowerCase().includes(term) ||
      escapeText(product.store).toLowerCase().includes(term)
    );
  }

  function filterProducts(products, criteria = {}) {
    const term = escapeText(criteria.term).toLowerCase().trim();
    const store = criteria.store || renderState.activeStore;

    return products.filter((product) => matchesStore(product, store) && matchesSearch(product, term));
  }

  function sortProducts(products, sort = renderState.activeSort, store = renderState.activeStore) {
    const sorted = [...products];

    if (store === 'best') {
      sorted.sort((a, b) => {
        const byDiscount = parseDiscount(b.discount) - parseDiscount(a.discount);
        if (byDiscount !== 0) return byDiscount;
        return parsePrice(a.newPrice || a.oldPrice) - parsePrice(b.newPrice || b.oldPrice);
      });
      return sorted.slice(0, BEST_DEALS_LIMIT);
    }

    if (sort === 'discount') {
      sorted.sort((a, b) => parseDiscount(b.discount) - parseDiscount(a.discount));
    } else if (sort === 'lowest') {
      sorted.sort((a, b) => parsePrice(a.newPrice || a.oldPrice) - parsePrice(b.newPrice || b.oldPrice));
    } else if (sort === 'highest') {
      sorted.sort((a, b) => parsePrice(b.newPrice || b.oldPrice) - parsePrice(a.newPrice || a.oldPrice));
    } else if (sort === 'name') {
      sorted.sort((a, b) => escapeText(a.name).localeCompare(escapeText(b.name), 'pt-BR'));
    }

    return sorted;
  }

  function resetPagination() {
    window.store.pagination.page = 1;
    window.store.pagination.hasMore = true;
    renderState.renderedCount = 0;
  }

  function clearRenderCaches() {
    renderState.filterCache.clear();
    renderState.renderCache.clear();
  }

  function getRenderCacheKey(product, index) {
    return [
      escapeText(product.link),
      escapeText(product.name),
      escapeText(product.store),
      escapeText(product.newPrice || product.oldPrice),
      index
    ].join('|');
  }

  function getVisibleProducts(products) {
    const end = window.store.pagination.page * window.store.pagination.perPage;
    const visible = products.slice(0, end);
    window.store.pagination.hasMore = visible.length < products.length;
    return visible;
  }

  function nextPage() {
    if (!window.store.pagination.hasMore || renderState.isAppending) return;
    window.store.pagination.page += 1;
    refreshView({ append: true });
  }

  function getFilteredProducts() {
    const criteria = {
      term: getSearchTerm(),
      store: renderState.activeStore,
      sort: renderState.activeSort
    };
    const cacheKey = JSON.stringify(criteria);

    if (renderState.filterCache.has(cacheKey)) {
      window.store.filtered = renderState.filterCache.get(cacheKey);
      return window.store.filtered;
    }

    const filtered = filterProducts(window.store.products, criteria);
    const sorted = sortProducts(filtered, criteria.sort, criteria.store);

    window.store.filtered = sorted;
    renderState.filterCache.set(cacheKey, sorted);
    return sorted;
  }

  function updateMeta(count) {
    const label = renderState.activeStore === 'all'
      ? 'todas as lojas'
      : renderState.activeStore === 'best'
        ? 'top 5 melhores ofertas'
        : renderState.activeStore;
    const text = `${count} oferta(s) disponíveis em ${label}`;
    const meta = document.getElementById('resultsMeta');
    if (meta) meta.textContent = text;
  }

  function renderCard(product, index = 0) {
    const cacheKey = getRenderCacheKey(product, index);
    if (renderState.renderCache.has(cacheKey)) {
      return renderState.renderCache.get(cacheKey);
    }

    const hasLink = !!safeUrl(product.link);
    const card = document.createElement('article');
    card.className = 'card';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'card-image';

    if (parseDiscount(product.discount) >= 30) {
      const hot = document.createElement('span');
      hot.className = 'badge-hot';
      hot.textContent = '🔥 Destaque';
      imageWrap.appendChild(hot);
    }

    const img = document.createElement('img');
    img.src = imageUrl(product.image);
    img.alt = escapeText(product.name) || 'Produto';
    img.loading = renderState.lazyLoading ? 'lazy' : 'eager';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      img.onerror = null;
      img.src = brandedFallback(product);
    };
    imageWrap.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';

    const head = document.createElement('div');
    head.className = 'card-head';

    const store = document.createElement('span');
    store.className = `badge-store ${cardStoreClass(product.store)}`;
    store.textContent = escapeText(product.store) || 'Loja';

    const verified = document.createElement('span');
    verified.className = 'badge-verified';
    verified.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12,2L4,5V11C4,16.55 7.84,21.74 12,23C16.16,21.74 20,16.55 20,11V5L12,2M12,11.91L14.59,14.5L15.41,13.67L12,10.25L8.59,13.67L9.41,14.5L12,11.91Z"/></svg>Verificada';

    head.appendChild(store);
    head.appendChild(verified);

    const title = document.createElement('h2');
    title.className = 'title';
    title.textContent = escapeText(product.name);

    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = escapeText(product.desc);

    const priceBox = document.createElement('div');
    priceBox.className = 'price-box';

    const priceRow = document.createElement('div');
    priceRow.className = 'price-row';

    if (product.oldPrice) {
      const oldPrice = document.createElement('span');
      oldPrice.className = 'old-price';
      oldPrice.textContent = escapeText(product.oldPrice);
      priceRow.appendChild(oldPrice);
    }

    if (product.newPrice) {
      const newPrice = document.createElement('span');
      newPrice.className = 'new-price';
      newPrice.textContent = escapeText(product.newPrice);
      priceRow.appendChild(newPrice);
    }

    priceBox.appendChild(priceRow);

    if (product.discount) {
      const discount = document.createElement('span');
      discount.className = 'discount';
      discount.textContent = escapeText(product.discount);
      priceBox.appendChild(discount);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btn = document.createElement('a');
    btn.className = 'btn';
    btn.textContent = hasLink ? 'Comprar agora' : 'Link indisponível';
    btn.href = hasLink ? safeUrl(product.link) : '#';
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer nofollow';
    if (!hasLink) {
      btn.setAttribute('aria-disabled', 'true');
    }

    actions.appendChild(btn);

    body.appendChild(head);
    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(priceBox);
    body.appendChild(actions);

    card.appendChild(imageWrap);
    card.appendChild(body);

    renderState.renderCache.set(cacheKey, card);
    return card;
  }

  function getBestDeals(products, limit = BEST_DEALS_LIMIT) {
    return [...products]
      .sort((a, b) => parseDiscount(b.discount) - parseDiscount(a.discount))
      .filter((product) => parseDiscount(product.discount) > 0)
      .slice(0, limit);
  }

  function renderFeatured() {
    const grid = document.getElementById('featuredGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const topDeals = getBestDeals(window.store.products);

    if (!topDeals.length) {
      grid.innerHTML = '<div class="empty">Ainda não há produtos suficientes com desconto para compor os destaques.</div>';
      return;
    }

    topDeals.forEach((product) => {
      const item = document.createElement('article');
      item.className = 'featured-card';

      const thumb = document.createElement('div');
      thumb.className = 'featured-thumb';

      const img = document.createElement('img');
      img.src = imageUrl(product.image);
      img.alt = escapeText(product.name) || 'Produto';
      img.loading = renderState.lazyLoading ? 'lazy' : 'eager';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        img.onerror = null;
        img.src = brandedFallback(product);
      };
      thumb.appendChild(img);

      const info = document.createElement('div');
      info.className = 'featured-info';

      const name = document.createElement('div');
      name.className = 'featured-name';
      name.textContent = escapeText(product.name);

      const prices = document.createElement('div');
      prices.className = 'featured-prices';

      if (product.oldPrice) {
        const oldP = document.createElement('span');
        oldP.className = 'old-price';
        oldP.textContent = escapeText(product.oldPrice);
        prices.appendChild(oldP);
      }

      if (product.newPrice) {
        const newP = document.createElement('span');
        newP.className = 'new-price';
        newP.textContent = escapeText(product.newPrice);
        prices.appendChild(newP);
      }

      const discount = document.createElement('div');
      discount.className = 'featured-discount';
      discount.textContent = escapeText(product.discount || 'Oferta');

      info.appendChild(name);
      info.appendChild(prices);
      info.appendChild(discount);

      item.appendChild(thumb);
      item.appendChild(info);
      grid.appendChild(item);
    });
  }

  function renderCatalog(list, options = {}) {
    const catalog = document.getElementById('catalog');
    if (!catalog) return;
    const append = !!options.append;
    const visible = getVisibleProducts(list);

    if (!append) {
      catalog.innerHTML = '';
      renderState.renderedCount = 0;
    }

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Nenhum produto encontrado para esse filtro.';
      catalog.appendChild(empty);
      updateMeta(0);
      return;
    }

    if (append && renderState.renderedCount >= visible.length) {
      updateMeta(list.length);
      return;
    }

    renderState.isAppending = true;
    const fragment = document.createDocumentFragment();
    visible
      .slice(renderState.renderedCount)
      .forEach((product, index) => {
        fragment.appendChild(renderCard(product, renderState.renderedCount + index));
      });
    catalog.appendChild(fragment);
    renderState.renderedCount = visible.length;
    renderState.isAppending = false;
    updateMeta(window.store.filtered.length);
  }

  function refreshView(options = {}) {
    renderCatalog(getFilteredProducts(), options);
  }

  function resetAndRefreshView() {
    resetPagination();
    refreshView();
  }

  function shouldLoadNextPage() {
    if (!renderState.infiniteScroll || !window.store.pagination.hasMore) return false;
    const viewportBottom = window.innerHeight + window.scrollY;
    const documentHeight = document.documentElement.scrollHeight;
    return documentHeight - viewportBottom <= renderState.scrollThreshold;
  }

  function handleScroll() {
    if (shouldLoadNextPage()) nextPage();
  }

  function bindSearch() {
    const input = document.getElementById('searchInput');
    if (input) input.addEventListener('input', resetAndRefreshView);
  }

  function bindSorting() {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', (event) => {
      renderState.activeSort = event.target.value;
      resetPagination();
      renderState.filterCache.clear();
      renderFeatured();
      refreshView();
    });
  }

  function bindFilters() {
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach((current) => current.classList.remove('active'));
        chip.classList.add('active');
        renderState.activeStore = chip.dataset.store;
        resetPagination();
        renderState.filterCache.clear();
        refreshView();
      });
    });
  }

  function bindInfiniteScroll() {
    if (!window.addEventListener) return;
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  function bindControls() {
    bindSearch();
    bindSorting();
    bindFilters();
    bindInfiniteScroll();
  }

  async function initRenderLayer() {
    bindControls();
    await loadProducts();
    refreshView();
  }

  window.renderRuntime = renderState;
  window.renderCard = renderCard;
  window.refreshView = refreshView;
  window.getFilteredProducts = getFilteredProducts;

  document.addEventListener('DOMContentLoaded', initRenderLayer);
})();
