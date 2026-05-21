// ═══════════════════════════════════════════════════════════════
// LEANSTOCK FRONTEND — app.js
// ═══════════════════════════════════════════════════════════════

const API = '/api/v1';

const state = {
  accessToken: localStorage.getItem('ls_access'),
  refreshToken: localStorage.getItem('ls_refresh'),
  user: JSON.parse(localStorage.getItem('ls_user') || 'null'),
};

// ── HELPERS ──────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function fmt(n) {
  if (n === undefined || n === null) return '—';
  if (typeof n === 'number') return n.toLocaleString();
  return n;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function shortId(id) {
  if (!id) return '—';
  return `<span title="${id}" style="cursor:pointer;color:var(--text2)" onclick="navigator.clipboard.writeText('${id}')">
    ${id.slice(0,8)}…
  </span>`;
}

// ── API CLIENT ────────────────────────────────────────────────────

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;

  let res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401 && state.refreshToken) {
    const refreshed = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    if (refreshed.ok) {
      const rb = await refreshed.json();
      state.accessToken = rb.data.accessToken;
      state.refreshToken = rb.data.refreshToken;
      localStorage.setItem('ls_access', state.accessToken);
      localStorage.setItem('ls_refresh', state.refreshToken);
      headers.Authorization = `Bearer ${state.accessToken}`;
      res = await fetch(`${API}${path}`, { ...options, headers });
    } else {
      logout();
      return;
    }
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error?.message || body.message || `HTTP ${res.status}`);
  }
  return body;
}

// ── AUTH UI ───────────────────────────────────────────────────────

function showAuth() {
  $('#sidebar').style.display = 'none';
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    if (v.id === 'auth-view') v.classList.add('active');
  });
  $('#auth-view').style.marginLeft = '0';
  document.querySelector('main').style.marginLeft = '0';
}

function showApp() {
  $('#sidebar').style.display = 'flex';
  document.querySelector('main').style.marginLeft = '220px';
  $('#auth-view').style.marginLeft = '';

  const u = state.user;
  if (!u) return;

  // user badge
  const badge = $('#user-badge');
  badge.style.display = 'flex';
  $('#user-name').textContent = u.username || u.email;
  $('#user-role').textContent = u.role;

  const isAdmin = u.role === 'ADMIN';
  const isManager = u.role === 'MANAGER' || isAdmin;

  $$('.manager-only').forEach(el => {
    el.style.display = isManager ? '' : 'none';
  });

  if (isAdmin) {
    $('#admin-nav-section').style.display = 'block';
  }

  showView('dashboard');
}

function showMsg(id, text, type = 'info') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `msg show ${type}`;
  setTimeout(() => { if (el) el.classList.remove('show'); }, 5000);
}

function setLoading(tbodyId, cols) {
  const el = document.getElementById(tbodyId);
  if (el) el.innerHTML = `<tr><td colspan="${cols}">
    <div class="loading"><div class="spinner"></div> Loading…</div>
  </td></tr>`;
}

// ── AUTH EVENTS ───────────────────────────────────────────────────

$('#login-btn').addEventListener('click', async () => {
  const btn = $('#login-btn');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const body = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#login-email').value.trim(),
        password: $('#login-password').value,
      }),
    });
    state.accessToken = body.data.accessToken;
    state.refreshToken = body.data.refreshToken;
    state.user = body.data.user;
    localStorage.setItem('ls_access', state.accessToken);
    localStorage.setItem('ls_refresh', state.refreshToken);
    localStorage.setItem('ls_user', JSON.stringify(state.user));
    showApp();
  } catch (e) {
    showMsg('auth-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '→ Sign In';
  }
});

$('#register-btn').addEventListener('click', async () => {
  const btn = $('#register-btn');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const body = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#reg-email').value.trim(),
        username: $('#reg-username').value.trim(),
        password: $('#reg-password').value,
        tenantId: $('#reg-tenant-id').value.trim(),
      }),
    });
    showMsg('auth-msg', `✓ ${body.data?.message || 'Registered! Check email to verify.'}`, 'success');
  } catch (e) {
    showMsg('auth-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '→ Create Account';
  }
});

$('#forgot-btn').addEventListener('click', async () => {
  try {
    await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: $('#reset-email').value.trim() }),
    });
    showMsg('auth-msg', '✓ If email exists, reset link was sent.', 'success');
  } catch (e) {
    showMsg('auth-msg', e.message, 'error');
  }
});

$('#logout-btn').addEventListener('click', logout);

async function logout() {
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
  $('#user-badge').style.display = 'none';
  showAuth();
}

// ── VIEW ROUTER ────────────────────────────────────────────────────

function showView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`${name}-view`);
  if (view) view.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (navItem) navItem.classList.add('active');

  const loaders = {
    dashboard: loadDashboard,
    products: loadProducts,
    inventory: loadInventory,
    reservations: loadReservations,
    suppliers: () => { loadSuppliers(); loadPOs(); },
    forecast: () => {},
  };
  loaders[name]?.();
}

$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => showView(item.dataset.view));
});

// ── DASHBOARD ──────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [products, inventory] = await Promise.all([
      api('/products?limit=1'),
      api('/inventory/report?limit=1'),
    ]);

    const total = products.pagination?.total ?? '—';
    const invRows = inventory.pagination?.total ?? '—';

    $('#stat-products').textContent = total;
    $('#stat-locations').textContent = invRows;

    // Count low stock
    let lowStock = 0;
    let totalValue = 0;
    try {
      const invAll = await api('/inventory/report?limit=100');
      invAll.data.forEach(r => {
        if (r.quantity <= r.minQuantity) lowStock++;
        totalValue += (r.quantity || 0) * (r.product?.costPrice || 0);
      });
    } catch (_) {}

    $('#stat-low-stock').textContent = lowStock;
    $('#stat-low-stock').style.color = lowStock > 0 ? 'var(--red)' : 'var(--green)';
    $('#stat-value').textContent = '₸' + Math.round(totalValue).toLocaleString();

    // Recent inventory as activity
    const recent = await api('/inventory/report?limit=8&sortBy=updatedAt&sortOrder=desc').catch(() => ({ data: [] }));
    const list = document.getElementById('activity-list');
    if (!recent.data.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">◈</div>No activity yet</div>';
      return;
    }
    list.innerHTML = `
      <table>
        <thead><tr><th>Product</th><th>Location</th><th>Qty</th><th>Min</th><th>Status</th></tr></thead>
        <tbody>
          ${recent.data.map(r => {
            const isLow = r.quantity <= r.minQuantity;
            return `<tr class="${isLow ? 'alert-row' : ''}">
              <td><strong>${r.product?.name || '—'}</strong></td>
              <td>${r.location?.name || '—'}</td>
              <td>${fmt(r.quantity)}</td>
              <td>${fmt(r.minQuantity)}</td>
              <td>${isLow
                ? '<span class="badge badge-red">LOW</span>'
                : '<span class="badge badge-green">OK</span>'
              }</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    console.error(e);
  }
}

$('#refresh-dashboard')?.addEventListener('click', loadDashboard);

// ── PRODUCTS ────────────────────────────────────────────────────────

async function loadProducts() {
  setLoading('products-tbody', 6);
  try {
    const body = await api('/products?limit=50');
    const tbody = $('#products-tbody');
    if (!body.data.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">⬡</div>No products yet</div></td></tr>`;
      return;
    }
    tbody.innerHTML = body.data.map(p => `
      <tr>
        <td><span class="badge badge-blue">${p.sku}</span></td>
        <td><strong>${p.name}</strong></td>
        <td>₸${fmt(p.price)}</td>
        <td>₸${fmt(p.costPrice)}</td>
        <td>${fmt(p.minStockLevel)}</td>
        <td>${p.isActive !== false
          ? '<span class="badge badge-green">Active</span>'
          : '<span class="badge badge-red">Inactive</span>'
        }</td>
      </tr>`).join('');
  } catch (e) {
    $('#products-tbody').innerHTML = `<tr><td colspan="6" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
  }
}

$('#refresh-products')?.addEventListener('click', loadProducts);

$('#create-product-btn')?.addEventListener('click', async () => {
  const btn = $('#create-product-btn');
  btn.disabled = true;
  try {
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({
        sku: $('#new-sku').value.trim(),
        name: $('#new-name').value.trim(),
        price: Number($('#new-price').value),
        costPrice: Number($('#new-cost').value),
        minStockLevel: Number($('#new-min-stock').value) || 10,
      }),
    });
    showMsg('product-msg', '✓ Product created', 'success');
    $('#new-sku').value = '';
    $('#new-name').value = '';
    $('#new-price').value = '';
    $('#new-cost').value = '';
    document.getElementById('create-product-card').style.display = 'none';
    loadProducts();
  } catch (e) {
    showMsg('product-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ── INVENTORY ────────────────────────────────────────────────────────

async function loadInventory() {
  setLoading('inventory-tbody', 7);
  try {
    const body = await api('/inventory/report?limit=50');
    const tbody = $('#inventory-tbody');
    if (!body.data.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">≡</div>No inventory data</div></td></tr>`;
      return;
    }
    tbody.innerHTML = body.data.map(r => {
      const avail = (r.quantity || 0) - (r.reservedQty || 0);
      const isLow = r.quantity <= r.minQuantity;
      return `<tr class="${isLow ? 'alert-row' : ''}">
        <td><strong>${r.product?.name || '—'}</strong></td>
        <td><span class="badge badge-blue">${r.product?.sku || '—'}</span></td>
        <td>${r.location?.name || '—'}</td>
        <td><strong>${fmt(r.quantity)}</strong></td>
        <td style="color:var(--text2)">${fmt(r.reservedQty || 0)}</td>
        <td>${avail}</td>
        <td>${isLow
          ? '<span class="badge badge-red">⚠ LOW</span>'
          : '<span class="badge badge-green">OK</span>'
        }</td>
      </tr>`;
    }).join('');
  } catch (e) {
    $('#inventory-tbody').innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
  }
}

$('#refresh-inventory')?.addEventListener('click', loadInventory);

// ── TRANSFER ─────────────────────────────────────────────────────────

$('#transfer-btn')?.addEventListener('click', async () => {
  const btn = $('#transfer-btn');
  btn.disabled = true;
  try {
    const body = await api('/inventory/transfer', {
      method: 'POST',
      body: JSON.stringify({
        productId: $('#tr-product-id').value.trim(),
        fromLocationId: $('#tr-from-loc').value.trim(),
        toLocationId: $('#tr-to-loc').value.trim(),
        quantity: Number($('#tr-qty').value),
      }),
    });
    showMsg('transfer-msg', `✓ Transfer complete — moved ${body.data?.quantity || ''} units`, 'success');
  } catch (e) {
    showMsg('transfer-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#sale-btn')?.addEventListener('click', async () => {
  const btn = $('#sale-btn');
  btn.disabled = true;
  try {
    await api('/inventory/sale', {
      method: 'POST',
      body: JSON.stringify({
        productId: $('#sale-product-id').value.trim(),
        locationId: $('#sale-location-id').value.trim(),
        quantity: Number($('#sale-qty').value),
      }),
    });
    showMsg('transfer-msg', '✓ Sale recorded', 'success');
    loadDashboard();
  } catch (e) {
    showMsg('transfer-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ── RESERVATIONS ──────────────────────────────────────────────────────

$('#reserve-btn')?.addEventListener('click', async () => {
  const btn = $('#reserve-btn');
  btn.disabled = true;
  try {
    await api('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        productId: $('#res-product-id').value.trim(),
        locationId: $('#res-location-id').value.trim(),
        quantity: Number($('#res-qty').value),
        ttlSeconds: Number($('#res-ttl').value) || 900,
      }),
    });
    showMsg('reservation-msg', '✓ Reserved — Redis lock acquired', 'success');
    loadReservations();
  } catch (e) {
    showMsg('reservation-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#refresh-reservations')?.addEventListener('click', loadReservations);

async function loadReservations() {
  setLoading('reservations-tbody', 7);
  try {
    const body = await api('/reservations?limit=20');
    const tbody = $('#reservations-tbody');
    if (!body.data.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">◉</div>No active reservations</div></td></tr>`;
      return;
    }
    tbody.innerHTML = body.data.map(r => `
      <tr>
        <td>${shortId(r.id)}</td>
        <td>${shortId(r.productId)}</td>
        <td>${shortId(r.locationId)}</td>
        <td><strong>${r.quantity}</strong></td>
        <td style="font-size:11px">${fmtDate(r.expiresAt)}</td>
        <td>${r.status === 'PENDING'
          ? '<span class="badge badge-yellow">PENDING</span>'
          : r.status === 'CONFIRMED'
          ? '<span class="badge badge-green">CONFIRMED</span>'
          : '<span class="badge badge-red">RELEASED</span>'
        }</td>
        <td style="display:flex;gap:6px">
          ${r.status === 'PENDING' ? `
            <button class="btn btn-primary btn-sm" data-confirm="${r.id}">✓</button>
            <button class="btn btn-danger btn-sm" data-release="${r.id}">✕</button>
          ` : '—'}
        </td>
      </tr>`).join('');

    $$('[data-confirm]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      await api(`/reservations/${b.dataset.confirm}/confirm`, { method: 'POST' }).catch(e => showMsg('reservation-msg', e.message, 'error'));
      loadReservations();
    }));
    $$('[data-release]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      await api(`/reservations/${b.dataset.release}`, { method: 'DELETE' }).catch(e => showMsg('reservation-msg', e.message, 'error'));
      loadReservations();
    }));
  } catch (e) {
    $('#reservations-tbody').innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
  }
}

// ── FORECAST ─────────────────────────────────────────────────────────

$('#load-forecast')?.addEventListener('click', async () => {
  const btn = $('#load-forecast');
  btn.disabled = true;
  btn.textContent = '…';
  setLoading('forecast-tbody', 6);
  try {
    const body = await api('/inventory/forecast?limit=30');
    const tbody = $('#forecast-tbody');
    if (!body.data?.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">△</div>No forecast data</div></td></tr>`;
      return;
    }
    tbody.innerHTML = body.data.map(f => `
      <tr>
        <td><strong>${f.product?.name || f.productName || '—'}</strong></td>
        <td>${fmt(f.currentQty ?? f.currentStock)}</td>
        <td>${(f.avgDailyUsage || 0).toFixed(2)}</td>
        <td>${fmt(f.forecastedDemand || f.forecastedQty)}</td>
        <td><strong>${fmt(f.suggestedOrderQty ?? f.reorderQty)}</strong></td>
        <td>${(f.reorderSuggested || f.needsReorder)
          ? '<span class="badge badge-red">⚠ REORDER</span>'
          : '<span class="badge badge-green">OK</span>'
        }</td>
      </tr>`).join('');
  } catch (e) {
    $('#forecast-tbody').innerHTML = `<tr><td colspan="6" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '△ Calculate Forecast';
  }
});

// ── SUPPLIERS ────────────────────────────────────────────────────────

$('#create-supplier-btn')?.addEventListener('click', async () => {
  const btn = $('#create-supplier-btn');
  btn.disabled = true;
  try {
    await api('/suppliers', {
      method: 'POST',
      body: JSON.stringify({
        name: $('#sup-name').value.trim(),
        contactEmail: $('#sup-email').value.trim(),
        leadTimeDays: Number($('#sup-lead').value) || 5,
      }),
    });
    showMsg('supplier-msg', '✓ Supplier added', 'success');
    $('#sup-name').value = '';
    $('#sup-email').value = '';
    loadSuppliers();
  } catch (e) {
    showMsg('supplier-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#refresh-suppliers')?.addEventListener('click', loadSuppliers);

async function loadSuppliers() {
  setLoading('suppliers-tbody', 4);
  try {
    const body = await api('/suppliers?limit=20');
    const tbody = $('#suppliers-tbody');
    if (!body.data.length) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="empty-icon">◎</div>No suppliers yet</div></td></tr>`;
      return;
    }
    tbody.innerHTML = body.data.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.contactEmail || s.email || '—'}</td>
        <td>${s.leadTimeDays || '—'} days</td>
        <td>${fmtDate(s.createdAt)}</td>
      </tr>`).join('');
  } catch (e) {
    $('#suppliers-tbody').innerHTML = `<tr><td colspan="4" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
  }
}

$('#create-po-btn')?.addEventListener('click', async () => {
  const btn = $('#create-po-btn');
  btn.disabled = true;
  try {
    await api('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        supplierId: $('#po-supplier-id').value.trim(),
        items: [{
          productId: $('#po-product-id').value.trim(),
          quantity: Number($('#po-qty').value),
          unitPrice: Number($('#po-cost').value),
        }],
      }),
    });
    showMsg('po-msg', '✓ PO created (DRAFT)', 'success');
    loadPOs();
  } catch (e) {
    showMsg('po-msg', e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#refresh-pos')?.addEventListener('click', loadPOs);

async function loadPOs() {
  setLoading('po-tbody', 6);
  try {
    const body = await api('/purchase-orders?limit=20');
    const tbody = $('#po-tbody');
    if (!body.data.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">◎</div>No purchase orders</div></td></tr>`;
      return;
    }
    tbody.innerHTML = body.data.map(po => `
      <tr>
        <td><strong>${po.poNumber || shortId(po.id)}</strong></td>
        <td>${po.supplier?.name || '—'}</td>
        <td>${po.items?.length || po._count?.items || '—'} items</td>
        <td>${
          po.status === 'DRAFT' ? '<span class="badge badge-yellow">DRAFT</span>' :
          po.status === 'SENT' ? '<span class="badge badge-blue">SENT</span>' :
          po.status === 'RECEIVED' ? '<span class="badge badge-green">RECEIVED</span>' :
          '<span class="badge badge-red">CANCELLED</span>'
        }</td>
        <td>${po.expectedAt ? fmtDate(po.expectedAt) : '—'}</td>
        <td style="display:flex;gap:6px">
          ${po.status === 'DRAFT' ? `<button class="btn btn-secondary btn-sm" data-send-po="${po.id}">Send →</button>` : ''}
          ${po.status === 'SENT' ? `<button class="btn btn-primary btn-sm" data-receive-po="${po.id}">Receive ✓</button>` : ''}
        </td>
      </tr>`).join('');

    $$('[data-send-po]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api(`/purchase-orders/${b.dataset.sendPo}/send`, { method: 'POST' });
        showMsg('po-msg', '✓ PO sent — confirmation email queued', 'success');
        loadPOs();
      } catch (e) {
        showMsg('po-msg', e.message, 'error');
      }
    }));
    $$('[data-receive-po]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api(`/purchase-orders/${b.dataset.receivePo}/receive`, { method: 'POST' });
        showMsg('po-msg', '✓ Received — inventory updated', 'success');
        loadPOs();
      } catch (e) {
        showMsg('po-msg', e.message, 'error');
      }
    }));
  } catch (e) {
    $('#po-tbody').innerHTML = `<tr><td colspan="6" style="color:var(--red);padding:16px">${e.message}</td></tr>`;
  }
}

// ── ADMIN ─────────────────────────────────────────────────────────────

function adminLog(data) {
  const out = $('#admin-output');
  out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

$('#trigger-decay')?.addEventListener('click', async () => {
  adminLog('Running dead stock decay…');
  try {
    const body = await api('/admin/jobs/dead-stock-decay', { method: 'POST' });
    adminLog(body.data);
  } catch (e) {
    adminLog('Error: ' + e.message);
  }
});

$('#trigger-low-stock')?.addEventListener('click', async () => {
  adminLog('Running low stock scan…');
  try {
    const body = await api('/admin/jobs/low-stock-scan', { method: 'POST' });
    adminLog(body.data);
  } catch (e) {
    adminLog('Error: ' + e.message);
  }
});

$('#load-queue-stats')?.addEventListener('click', async () => {
  adminLog('Loading queue stats…');
  try {
    const body = await api('/admin/jobs/queue-stats');
    adminLog(body.data);
  } catch (e) {
    adminLog('Error: ' + e.message);
  }
});

// ── ENTER KEY SUPPORT ──────────────────────────────────────────────

$('#login-password')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') $('#login-btn').click();
});

// ── BOOT ──────────────────────────────────────────────────────────────

async function boot() {
  if (state.accessToken && state.user) {
    try {
      const body = await api('/auth/me');
      state.user = body.data.user;
      localStorage.setItem('ls_user', JSON.stringify(state.user));
      showApp();
    } catch (_) {
      localStorage.clear();
      showAuth();
    }
  } else {
    showAuth();
  }
}

boot();
