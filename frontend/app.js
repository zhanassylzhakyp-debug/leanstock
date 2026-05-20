const API = '/api/v1';

const state = {
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showMsg(el, text, ok = true) {
  el.textContent = text;
  el.className = `message ${ok ? 'ok' : 'err'}`;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;

  let res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401 && state.refreshToken) {
    const refreshed = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    if (refreshed.ok) {
      const body = await refreshed.json();
      state.accessToken = body.data.accessToken;
      state.refreshToken = body.data.refreshToken;
      localStorage.setItem('accessToken', state.accessToken);
      localStorage.setItem('refreshToken', state.refreshToken);
      headers.Authorization = `Bearer ${state.accessToken}`;
      res = await fetch(`${API}${path}`, { ...options, headers });
    }
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function updateUI() {
  const loggedIn = !!state.accessToken && !!state.user;
  $('#auth-section').classList.toggle('hidden', loggedIn);
  $('#app-section').classList.toggle('hidden', !loggedIn);
  $('#user-bar').classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    $('#user-info').textContent = `${state.user.username} (${state.user.role}) · ${state.user.email}`;
    const isAdmin = state.user.role === 'ADMIN';
    const isManager = state.user.role === 'MANAGER' || isAdmin;
    $$('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin));
    $$('.manager-only').forEach((el) => el.classList.toggle('hidden', !isManager));
  }
}

async function loadMe() {
  const body = await api('/auth/me');
  state.user = body.data.user;
  localStorage.setItem('user', JSON.stringify(state.user));
  updateUI();
}

// Auth tabs
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    $$('#auth-section .panel').forEach((p) => p.classList.add('hidden'));
    $(`#${tab.dataset.tab}-panel`).classList.remove('hidden');
  });
});

$('#login-btn').addEventListener('click', async () => {
  try {
    const body = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#login-email').value,
        password: $('#login-password').value,
      }),
    });
    state.accessToken = body.data.accessToken;
    state.refreshToken = body.data.refreshToken;
    state.user = body.data.user;
    localStorage.setItem('accessToken', state.accessToken);
    localStorage.setItem('refreshToken', state.refreshToken);
    localStorage.setItem('user', JSON.stringify(state.user));
    showMsg($('#auth-message'), 'Logged in successfully');
    updateUI();
    loadDashboard();
  } catch (e) {
    showMsg($('#auth-message'), e.message, false);
  }
});

$('#register-btn').addEventListener('click', async () => {
  try {
    const body = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#reg-email').value,
        username: $('#reg-username').value,
        password: $('#reg-password').value,
        tenantId: $('#reg-tenant-id').value,
      }),
    });
    showMsg($('#auth-message'), `Registered! ${body.data.message || 'Check email to verify.'}`);
  } catch (e) {
    showMsg($('#auth-message'), e.message, false);
  }
});

$('#forgot-btn').addEventListener('click', async () => {
  try {
    await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: $('#reset-email').value }),
    });
    showMsg($('#auth-message'), 'If email exists, reset link was sent.');
  } catch (e) {
    showMsg($('#auth-message'), e.message, false);
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try {
    await api('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
  } catch (_) {}
  state.accessToken = null;
  state.refreshToken = null;
  state.user = null;
  localStorage.clear();
  updateUI();
});

// Navigation
$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.view').forEach((v) => v.classList.add('hidden'));
    $(`#${btn.dataset.view}-view`).classList.remove('hidden');
    const loaders = {
      dashboard: loadDashboard,
      products: loadProducts,
      inventory: loadInventory,
      reservations: loadReservations,
      suppliers: () => { loadSuppliers(); loadPOs(); },
      forecast: loadForecast,
    };
    loaders[btn.dataset.view]?.();
  });
});

async function loadDashboard() {
  try {
    const [products, inventory, queues] = await Promise.all([
      api('/products?limit=1'),
      api('/inventory/report?limit=1'),
      state.user.role === 'ADMIN' ? api('/admin/jobs/queue-stats').catch(() => null) : null,
    ]);
    $('#stats').innerHTML = `
      <div class="stat">Products<strong>${products.pagination?.total ?? '—'}</strong></div>
      <div class="stat">Inventory rows<strong>${inventory.pagination?.total ?? '—'}</strong></div>
      <div class="stat">Role<strong>${state.user.role}</strong></div>
      <div class="stat">Email verified<strong>${state.user.emailVerifiedAt ? 'Yes' : 'No'}</strong></div>
      ${queues ? `<div class="stat">Email queue waiting<strong>${queues.data.queues.email?.waiting ?? 0}</strong></div>` : ''}
    `;
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
}

async function loadProducts() {
  try {
    const body = await api('/products?limit=20');
    $('#products-list').innerHTML = `<table><thead><tr><th>SKU</th><th>Name</th><th>Price</th><th>ID</th></tr></thead><tbody>
      ${body.data.map((p) => `<tr><td>${p.sku}</td><td>${p.name}</td><td>${p.price}</td><td><code>${p.id}</code></td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
}

$('#create-product-btn')?.addEventListener('click', async () => {
  try {
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({
        sku: $('#new-sku').value,
        name: $('#new-name').value,
        price: Number($('#new-price').value),
        costPrice: Number($('#new-cost').value),
      }),
    });
    showMsg($('#app-message'), 'Product created');
    loadProducts();
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
});

async function loadInventory() {
  try {
    const body = await api('/inventory/report?limit=30');
    $('#inventory-list').innerHTML = `<table><thead><tr><th>Product</th><th>Location</th><th>Qty</th><th>Min</th><th>Discount</th></tr></thead><tbody>
      ${body.data.map((r) => `<tr><td>${r.product.name}</td><td>${r.location.name}</td><td>${r.quantity}</td><td>${r.minQuantity}</td><td>${r.discountPct}%</td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
}
$('#refresh-inventory').addEventListener('click', loadInventory);

$('#transfer-btn').addEventListener('click', async () => {
  try {
    const body = await api('/inventory/transfer', {
      method: 'POST',
      body: JSON.stringify({
        productId: $('#tr-product-id').value,
        fromLocationId: $('#tr-from-loc').value,
        toLocationId: $('#tr-to-loc').value,
        quantity: Number($('#tr-qty').value),
      }),
    });
    showMsg($('#transfer-result'), JSON.stringify(body.data, null, 2));
  } catch (e) {
    showMsg($('#transfer-result'), e.message, false);
  }
});

$('#sale-btn').addEventListener('click', async () => {
  try {
    const body = await api('/inventory/sale', {
      method: 'POST',
      body: JSON.stringify({
        productId: $('#tr-product-id').value,
        locationId: $('#tr-from-loc').value,
        quantity: Number($('#tr-qty').value),
      }),
    });
    showMsg($('#transfer-result'), JSON.stringify(body.data, null, 2));
  } catch (e) {
    showMsg($('#transfer-result'), e.message, false);
  }
});

$('#reserve-btn').addEventListener('click', async () => {
  try {
    await api('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        productId: $('#res-product-id').value,
        locationId: $('#res-location-id').value,
        quantity: Number($('#res-qty').value),
      }),
    });
    showMsg($('#app-message'), 'Reservation created (Redis lock + stock held)');
    loadReservations();
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
});

async function loadReservations() {
  try {
    const body = await api('/reservations?limit=20');
    $('#reservations-list').innerHTML = `<table><thead><tr><th>Status</th><th>Qty</th><th>Expires</th><th>Actions</th></tr></thead><tbody>
      ${body.data.map((r) => `<tr><td>${r.status}</td><td>${r.quantity}</td><td>${new Date(r.expiresAt).toLocaleString()}</td>
        <td>${r.status === 'PENDING' ? `<button data-confirm="${r.id}">Confirm</button> <button data-release="${r.id}" class="secondary">Release</button>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
    $$('[data-confirm]').forEach((b) => b.addEventListener('click', async () => {
      await api(`/reservations/${b.dataset.confirm}/confirm`, { method: 'POST' });
      loadReservations();
    }));
    $$('[data-release]').forEach((b) => b.addEventListener('click', async () => {
      await api(`/reservations/${b.dataset.release}`, { method: 'DELETE' });
      loadReservations();
    }));
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
}

async function loadSuppliers() {
  try {
    const body = await api('/suppliers?limit=20');
    $('#suppliers-list').innerHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>ID</th></tr></thead><tbody>
      ${body.data.map((s) => `<tr><td>${s.name}</td><td>${s.email || '—'}</td><td><code>${s.id}</code></td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
}

$('#create-supplier-btn')?.addEventListener('click', async () => {
  try {
    await api('/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: $('#sup-name').value, email: $('#sup-email').value || undefined }),
    });
    showMsg($('#app-message'), 'Supplier created');
    loadSuppliers();
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
});

async function loadPOs() {
  try {
    const body = await api('/purchase-orders?limit=20');
    $('#po-list').innerHTML = `<table><thead><tr><th>PO#</th><th>Status</th><th>Supplier</th><th>Actions</th></tr></thead><tbody>
      ${body.data.map((po) => `<tr><td>${po.poNumber}</td><td>${po.status}</td><td>${po.supplier.name}</td>
        <td>${po.status === 'DRAFT' ? `<button data-send-po="${po.id}">Send</button>` : ''}
            ${po.status === 'SENT' ? `<button data-receive-po="${po.id}">Receive</button>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
    $$('[data-send-po]').forEach((b) => b.addEventListener('click', async () => {
      await api(`/purchase-orders/${b.dataset.sendPo}/send`, { method: 'POST' });
      showMsg($('#app-message'), 'PO sent — confirmation email queued');
      loadPOs();
    }));
    $$('[data-receive-po]').forEach((b) => b.addEventListener('click', async () => {
      await api(`/purchase-orders/${b.dataset.receivePo}/receive`, { method: 'POST' });
      showMsg($('#app-message'), 'PO received — inventory updated');
      loadPOs();
    }));
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
}

$('#create-po-btn')?.addEventListener('click', async () => {
  try {
    await api('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        supplierId: $('#po-supplier-id').value,
        locationId: $('#po-location-id').value,
        lines: [{
          productId: $('#po-product-id').value,
          quantity: Number($('#po-qty').value),
          unitCost: Number($('#po-cost').value),
        }],
      }),
    });
    showMsg($('#app-message'), 'Purchase order created (DRAFT)');
    loadPOs();
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
});

async function loadForecast() {
  try {
    const body = await api('/inventory/forecast?limit=20');
    $('#forecast-list').innerHTML = body.data.map((f) => `
      <div class="stat" style="margin-bottom:0.75rem">
        <strong>${f.product.name}</strong> (${f.product.sku})<br/>
        Stock: ${f.currentStock} · Avg daily: ${f.avgDailyUsage} · Reorder: <b>${f.reorderQty}</b>
      </div>`).join('');
  } catch (e) {
    showMsg($('#app-message'), e.message, false);
  }
}
$('#load-forecast').addEventListener('click', loadForecast);

$('#trigger-decay')?.addEventListener('click', async () => {
  const body = await api('/admin/jobs/dead-stock-decay', { method: 'POST' });
  $('#admin-output').textContent = JSON.stringify(body.data, null, 2);
});
$('#trigger-low-stock')?.addEventListener('click', async () => {
  const body = await api('/admin/jobs/low-stock-scan', { method: 'POST' });
  $('#admin-output').textContent = JSON.stringify(body.data, null, 2);
});
$('#load-queue-stats')?.addEventListener('click', async () => {
  const body = await api('/admin/jobs/queue-stats');
  $('#admin-output').textContent = JSON.stringify(body.data, null, 2);
});

// Boot
updateUI();
if (state.accessToken) {
  loadMe().then(loadDashboard).catch(() => {
    localStorage.clear();
    updateUI();
  });
}
