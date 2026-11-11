const categories = ['Mercearia', 'Hortifruti', 'Laticínios', 'Bebidas', 'Limpeza', 'Brinquedos', 'Eletrônicos'];
const seed = [
  ['101', 'Arroz tipo 1 · 5 kg', 'Mercearia', 2490, 24, '🍚'],
  ['102', 'Feijão carioca · 1 kg', 'Mercearia', 849, 18, '🫘'],
  ['103', 'Café torrado · 500 g', 'Mercearia', 2890, 12, '☕'],
  ['104', 'Banana prata · bandeja', 'Hortifruti', 699, 10, '🍌'],
  ['105', 'Leite integral · 1 L', 'Laticínios', 579, 25, '🥛'],
  ['106', 'Suco de laranja · 1 L', 'Bebidas', 990, 12, '🧃'],
  ['107', 'Detergente neutro · 500 ml', 'Limpeza', 279, 31, '🫧'],
  ['108', 'Água sanitária · 1 L', 'Limpeza', 549, 4, '🧴'],
  ['109', 'Carrinho de brinquedo', 'Brinquedos', 1490, 6, '🚗'],
  ['110', 'Cabo USB-C · 1 m', 'Eletrônicos', 1990, 3, '🔌']
].map(([code, name, category, price, stock, icon]) => {
  const digits = '200000000' + code;
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return { code, name, category, price, stock, icon, barcode: digits + (10 - sum % 10) % 10, qr: 'DEMO:' + code };
});

const storageKey = 'mercado-em-dia-v1';
const content = document.querySelector('#content');
const modal = document.querySelector('#modal');
const notice = document.querySelector('#notice');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const currency = cents => money.format(cents / 100);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const parseMoney = value => {
  const input = value.trim();
  if (!/^\d{1,7}(?:[,.]\d{1,2})?$/.test(input)) return NaN;
  return Math.round(Number(input.replace(',', '.')) * 100);
};
const titles = {
  caixa: ['Frente de caixa', 'Busque produtos e registre uma venda.'],
  painel: ['Visão geral', 'Acompanhe as vendas de hoje e os produtos com estoque baixo.'],
  produtos: ['Produtos e estoque', 'Cadastre produtos e atualize os preços e as quantidades.'],
  vendas: ['Histórico de vendas', 'Consulte as vendas registradas neste navegador.']
};

let data = { products: seed, sales: [] };
let storageAvailable = true;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) data = JSON.parse(saved);
} catch {
  storageAvailable = false;
}

let page = 'caixa';
let category = '';
let query = '';
let cart = new Map();
let noticeTimer;
document.querySelector('#today').textContent = new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' });

function message(text) {
  notice.textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 4200);
}

function save(next) {
  if (storageAvailable) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      storageAvailable = false;
    }
  }
  data = next;
}

function findProduct(code) {
  return data.products.find(product => product.code === code);
}

function lines() {
  return [...cart].map(([code, quantity]) => ({ ...findProduct(code), quantity }));
}

function totalOf(items) {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}

function matchingProducts() {
  const term = normalize(query);
  return data.products.filter(product =>
    (!category || product.category === category || page !== 'caixa') &&
    normalize([product.name, product.code, product.barcode, product.qr].join(' ')).includes(term)
  );
}

function productTiles() {
  return matchingProducts().map(product => {
    const remaining = product.stock - (cart.get(product.code) || 0);
    return `<button class="product" data-add="${escapeHtml(product.code)}" ${remaining <= 0 ? 'disabled' : ''}>
      <span class="tile ${product.category}" aria-hidden="true">${product.icon}</span>
      <strong>${escapeHtml(product.name)}</strong>
      <small>${remaining ? 'Cód. ' + escapeHtml(product.barcode || product.code) : 'Sem unidades disponíveis'}</small>
      <span class="price">${currency(product.price)}</span>
    </button>`;
  }).join('') || '<p class="empty">Nenhum produto encontrado.</p>';
}

function cartView() {
  const items = lines();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return `<div class="row cart-head"><h2>Venda atual</h2><span class="tag">${count} ${count === 1 ? 'item' : 'itens'}</span></div>
    ${items.length ? items.map(item => `<div class="row cart-item">
      <div><b>${escapeHtml(item.name)}</b><small>${currency(item.price)} por unidade</small></div>
      <div class="qty">
        <button data-minus="${escapeHtml(item.code)}" aria-label="Diminuir quantidade de ${escapeHtml(item.name)}">−</button>
        <b>${item.quantity}</b>
        <button data-add="${escapeHtml(item.code)}" aria-label="Aumentar quantidade de ${escapeHtml(item.name)}" ${item.quantity >= item.stock ? 'disabled' : ''}>+</button>
      </div>
    </div>`).join('') : '<div class="empty"><span aria-hidden="true">🛒</span>Adicione produtos à venda.</div>'}
    <div class="row total"><span>Total a pagar</span><strong>${currency(totalOf(items))}</strong></div>
    <button class="primary wide" data-action="checkout" ${count ? '' : 'disabled'}>Ir para pagamento</button>`;
}

function posView() {
  return `<div class="pos">
    <section class="surface"><h2>Catálogo de produtos</h2>
      <input id="search" class="search" aria-label="Buscar produtos" placeholder="Bipe um produto ou busque pelo nome" autocomplete="off" value="${escapeHtml(query)}">
      <p class="form-note scanner-note">Com o leitor no modo teclado, bipe o código de barras ou QR Code. Para testar, digite <b>2000000001012</b> e pressione Enter.</p>
      <div class="filters" aria-label="Categorias">${['', ...categories].map(name =>
        `<button class="chip ${name === category ? 'active' : ''}" data-category="${name}" aria-pressed="${name === category}">${name || 'Todos'}</button>`
      ).join('')}</div>
      <div class="grid" id="results">${productTiles()}</div>
    </section>
    <section class="surface cart" id="cart">${cartView()}</section>
  </div>`;
}

function inventoryRows(products, editable) {
  return products.map(product => `<tr>
    <td>${escapeHtml(product.name)}</td><td>${escapeHtml(product.barcode || product.code)}</td><td>${product.category}</td>
    <td>${currency(product.price)}</td><td><span class="tag ${product.stock <= 5 ? 'low' : ''}">${product.stock} un.</span></td>
    ${editable ? `<td><button class="secondary" data-edit="${escapeHtml(product.code)}" aria-label="Editar ${escapeHtml(product.name)}">Editar</button></td>` : ''}
  </tr>`).join('') || `<tr><td colspan="${editable ? 6 : 5}">Nenhum produto encontrado.</td></tr>`;
}

function inventoryTable(products, editable) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Produto</th><th>Código</th><th>Categoria</th><th>Preço</th><th>Estoque</th>${editable ? '<th>Ações</th>' : ''}</tr></thead>
    <tbody id="results">${inventoryRows(products, editable)}</tbody>
  </table></div>`;
}

function dashboard() {
  const today = new Date().toDateString();
  const sales = data.sales.filter(sale => new Date(sale.at).toDateString() === today);
  const lowStock = data.products.filter(product => product.stock <= 5).sort((a, b) => a.stock - b.stock);
  return `<div class="cards">
    <div class="surface metric"><p>Total vendido hoje</p><strong>${currency(sales.reduce((sum, sale) => sum + sale.total, 0))}</strong></div>
    <div class="surface metric"><p>Vendas de hoje</p><strong>${sales.length}</strong></div>
    <div class="surface metric"><p>Produtos com estoque baixo</p><strong>${lowStock.length}</strong></div>
  </div><section class="surface"><h2>Estoque baixo</h2>
    <p class="form-note">Produtos com até 5 unidades disponíveis.</p>
    ${lowStock.length ? inventoryTable(lowStock, false) : '<p class="empty">Nenhum produto com estoque baixo.</p>'}
  </section>`;
}

function history() {
  if (!data.sales.length) return '<section class="surface empty">As vendas finalizadas no caixa aparecerão aqui.</section>';
  return `<section class="surface table-wrap"><table><thead><tr><th>Venda</th><th>Data e hora</th><th>Pagamento</th><th>Total</th><th>Itens</th></tr></thead>
    <tbody>${data.sales.toReversed().map(sale => `<tr><td>#${sale.id}</td><td>${new Date(sale.at).toLocaleString('pt-BR')}</td>
      <td>${sale.method}</td><td>${currency(sale.total)}</td><td><button class="secondary" data-sale="${sale.id}" aria-label="Detalhes da venda ${sale.id}">Ver detalhes</button></td></tr>`).join('')}</tbody></table></section>`;
}

function render() {
  const [title, description] = titles[page];
  document.querySelector('#breadcrumb').textContent = (page === 'caixa' ? 'Operação' : 'Gestão') + ' / ' + title;
  document.querySelectorAll('[data-page]').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const views = {
    caixa: posView,
    painel: dashboard,
    produtos: () => `<section class="surface"><input id="search" class="search" aria-label="Buscar produtos" placeholder="Buscar por nome ou código" value="${escapeHtml(query)}">${inventoryTable(matchingProducts(), true)}</section>`,
    vendas: history
  };
  content.innerHTML = `<div class="intro"><div><h1>${title}</h1><p>${description}</p></div>
    ${page === 'produtos' ? '<button class="primary" data-action="new">Novo produto</button>' : ''}
  </div>${views[page]()}`;
}

function updateCart(code, change) {
  const product = findProduct(code);
  const quantity = (cart.get(code) || 0) + change;
  if (!product || quantity > product.stock) return;
  if (quantity <= 0) cart.delete(code);
  else cart.set(code, quantity);
  document.querySelector('#cart').innerHTML = cartView();
  document.querySelector('#results').innerHTML = productTiles();
}

function showDialog(markup) {
  modal.innerHTML = markup;
  modal.showModal();
  modal.setAttribute('aria-labelledby', 'dialog-title');
}

function formActions(label) {
  return `<div class="form-actions"><button type="button" class="secondary" data-action="close">Cancelar</button>
    <button class="primary" type="submit">${label}</button></div>`;
}

function checkout() {
  const items = lines();
  if (!items.length) return;
  const total = totalOf(items);
  showDialog(`<form><h2 id="dialog-title">Pagamento</h2>
    <div class="row total"><span>Total da venda</span><strong>${currency(total)}</strong></div>
    <p class="form-note">Pagamento simulado para a demonstração.</p>
    <label>Forma de pagamento<select name="method"><option>Pix</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Dinheiro</option></select></label>
    <label id="cash" hidden>Valor recebido<input name="received" inputmode="decimal" placeholder="0,00"></label>
    <p class="form-note" id="change"></p><p class="error" role="alert"></p>${formActions('Finalizar venda')}</form>`);
  const form = modal.querySelector('form');
  const { method, received } = form.elements;
  form.addEventListener('input', () => {
    const cash = method.value === 'Dinheiro';
    const amount = parseMoney(received.value);
    modal.querySelector('#cash').hidden = !cash;
    modal.querySelector('#change').textContent = cash && amount >= total ? 'Troco: ' + currency(amount - total) : '';
    modal.querySelector('.error').textContent = '';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const amount = parseMoney(received.value);
    if (method.value === 'Dinheiro' && !(amount >= total)) {
      modal.querySelector('.error').textContent = 'Informe um valor recebido igual ou superior ao total.';
      received.focus();
      return;
    }
    const sale = { id: data.sales.length + 1, at: new Date().toISOString(), method: method.value, total, items };
    if (method.value === 'Dinheiro') {
      sale.received = amount;
      sale.change = amount - total;
    }
    save({
      products: data.products.map(product => ({ ...product, stock: product.stock - (cart.get(product.code) || 0) })),
      sales: [...data.sales, sale]
    });
    cart.clear();
    modal.close();
    render();
    message(`Venda #${sale.id} registrada. ${currency(total)}${storageAvailable ? '' : ' · Salva apenas nesta sessão.'}`);
  });
}

function editProduct(product) {
  showDialog(`<form><h2 id="dialog-title">${product ? 'Editar produto' : 'Novo produto'}</h2>
    <label>Nome<input name="name" required maxlength="80" value="${escapeHtml(product?.name || '')}"></label>
    <label>Código<input name="code" required maxlength="30" value="${escapeHtml(product?.code || '')}" ${product ? 'readonly' : ''}></label>
    <label>Código de barras<input name="barcode" maxlength="40" value="${escapeHtml(product?.barcode || '')}"></label>
    <label>Conteúdo do QR Code<input name="qr" maxlength="250" value="${escapeHtml(product?.qr || '')}"></label>
    <label>Categoria<select name="category">${categories.map(name => `<option ${name === product?.category ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
    <label>Preço em reais<input name="price" required inputmode="decimal" placeholder="0,00" value="${product ? (product.price / 100).toFixed(2).replace('.', ',') : ''}"></label>
    <label>Quantidade em estoque<input type="number" name="stock" required min="0" max="999999" step="1" value="${product?.stock ?? 0}"></label>
    <p class="error" role="alert"></p>${formActions('Salvar produto')}</form>`);
  modal.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const code = values.get('code').trim();
    const name = values.get('name').trim();
    const barcode = values.get('barcode').trim();
    const qr = values.get('qr').trim();
    const price = parseMoney(values.get('price'));
    const stock = Number(values.get('stock'));
    const error = modal.querySelector('.error');
    if (!code || !name || !(price > 0)) {
      error.textContent = 'Preencha o nome, o código e um preço maior que zero.';
      return;
    }
    const codes = [code, barcode, qr].filter(Boolean).map(normalize);
    if (data.products.some(item => item.code !== product?.code &&
      [item.code, item.barcode, item.qr].filter(Boolean).some(value => codes.includes(normalize(value))))) {
      error.textContent = 'Um dos códigos informados já pertence a outro produto.';
      return;
    }
    if (stock < (cart.get(code) || 0)) {
      error.textContent = 'O estoque precisa cobrir as unidades que já estão na venda atual.';
      return;
    }
    const updated = { code, barcode, qr, name, price, stock, category: values.get('category'), icon: product?.icon || '📦' };
    save({
      ...data,
      products: product ? data.products.map(item => item.code === code ? updated : item) : [...data.products, updated]
    });
    modal.close();
    query = '';
    render();
    message(storageAvailable ? 'Produto salvo.' : 'Produto salvo apenas nesta sessão.');
  });
}

function saleDetails(sale) {
  showDialog(`<h2 id="dialog-title">Venda #${sale.id}</h2>
    <p class="form-note">${new Date(sale.at).toLocaleString('pt-BR')} · ${sale.method}</p>
    ${sale.items.map(item => `<div class="row cart-item"><span>${item.quantity} × ${escapeHtml(item.name)}</span><b>${currency(item.quantity * item.price)}</b></div>`).join('')}
    <div class="row total"><span>Total</span><strong>${currency(sale.total)}</strong></div>
    ${sale.method === 'Dinheiro' ? `<p class="form-note">Recebido ${currency(sale.received)} · Troco ${currency(sale.change)}</p>` : ''}
    <div class="form-actions"><button class="secondary" data-action="close">Fechar</button></div>`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { page: nextPage, category: nextCategory, add, minus, edit, sale, action } = button.dataset;
  if (nextPage) {
    page = nextPage;
    query = '';
    render();
  } else if (nextCategory !== undefined) {
    category = nextCategory;
    document.querySelectorAll('[data-category]').forEach(chip => {
      const active = chip.dataset.category === category;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active);
    });
    document.querySelector('#results').innerHTML = productTiles();
  } else if (add) updateCart(add, 1);
  else if (minus) updateCart(minus, -1);
  else if (edit) editProduct(findProduct(edit));
  else if (sale) saleDetails(data.sales.find(item => item.id === Number(sale)));
  else if (action === 'checkout') checkout();
  else if (action === 'new') editProduct();
  else if (action === 'close') modal.close();
});

content.addEventListener('input', event => {
  if (event.target.id !== 'search') return;
  query = event.target.value;
  document.querySelector('#results').innerHTML = page === 'caixa' ? productTiles() : inventoryRows(matchingProducts(), true);
});

document.addEventListener('keydown', event => {
  if (page !== 'caixa' || modal.open || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  const search = document.querySelector('#search');
  if (event.target !== search) {
    if (event.key.length !== 1 || event.key === ' ') return;
    query = event.key;
    search.value = query;
    search.focus();
    document.querySelector('#results').innerHTML = productTiles();
    event.preventDefault();
    return;
  }
  if (event.key !== 'Enter') return;
  const term = normalize(search.value);
  if (!term) return;
  event.preventDefault();
  const product = data.products.find(item => [item.code, item.barcode, item.qr]
    .filter(Boolean).some(code => normalize(code) === term));
  if (!product) {
    message('Código não encontrado. Confira a leitura ou busque pelo nome.');
    search.select();
    return;
  }
  if (product.stock <= (cart.get(product.code) || 0)) {
    message('Sem mais unidades desse produto no estoque.');
    search.select();
    return;
  }
  query = '';
  category = '';
  updateCart(product.code, 1);
  render();
  document.querySelector('#search').focus();
  message(product.name + ' adicionado à venda.');
});

render();
