// ==================== CUSTOMER PROFILE DRAWER ====================

async function openCustomerDrawer(customerId) {
  if (!customerId) return;
  ensureCustomerDrawer();

  const drawer = document.getElementById('customer-drawer');
  const body   = document.getElementById('customer-drawer-body');
  drawer.classList.add('open');
  body.innerHTML = `<div class="skeleton" style="height:260px;border-radius:14px"></div>`;

  try {
    const [userDoc, billsSnap, ticketsSnap, connDoc] = await Promise.all([
      db.collection('users').doc(customerId).get(),
      db.collection('billing')
        .where('customerId', '==', customerId).get()
        .catch(() => db.collection('billing').where('uid', '==', customerId).get()),
      db.collection('supportTickets')
        .where('customerId', '==', customerId).get()
        .catch(() => ({ size: 0, forEach: () => {} })),
      db.collection('connections').doc(customerId).get()
        .catch(() => ({ exists: false, data: () => ({}) }))
    ]);

    if (!userDoc.exists) {
      body.innerHTML = `<div class="alert-error">Customer profile not found.</div>`;
      return;
    }

    const u  = { id: userDoc.id, ...userDoc.data() };
    const c  = connDoc.exists ? connDoc.data() : {};
    let totalBills = 0, paidBills = 0, pendingBills = 0, openTickets = 0;

    billsSnap.forEach(doc => {
      const b      = doc.data();
      const amount = Number(b.amount || b.total || b.price || 0);
      totalBills  += amount;
      const status = (b.status || b.paymentStatus || 'pending').toLowerCase();
      if (status === 'paid') paidBills += amount; else pendingBills += amount;
    });

    ticketsSnap.forEach(doc => {
      const s = (doc.data().status || 'open').toLowerCase();
      if (s === 'open' || s === 'in-progress') openTickets++;
    });

    const online     = (c.status || '').toLowerCase() === 'online';
    const name       = getCustomerName(u);
    const initLetter = (name || 'N').charAt(0).toUpperCase();

    body.innerHTML = `
      <div class="drawer-profile-head">
        <div class="avatar-circle">${escapeHtml(initLetter)}</div>
        <div style="flex:1;min-width:0">
          <h3>${escapeHtml(name)}</h3>
          <p>${escapeHtml(u.email || 'No email')}</p>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="connection-pill ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span>
            <span class="status ${escapeHtml(u.status || 'pending')}">${escapeHtml(u.status || 'pending')}</span>
          </div>
        </div>
      </div>

      <div class="drawer-grid">
        ${drawerItem('Account No.', u.accountNumber || '—')}
        ${drawerItem('Phone', u.phone || u.phoneNumber || '—')}
        ${drawerItem('Location', u.location || '—')}
        ${drawerItem('Package', u.plan || u.packageName || u.package || 'Pending')}
        ${drawerItem('Due Date', u.billDueDate || u.dueDate || '—')}
        ${drawerItem('Joined', formatDate(u.createdAt || u.joinDate || u.registeredAt))}
      </div>

      ${u.notes ? `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px;margin-bottom:16px;font-size:12px;color:var(--muted)">
          📝 ${escapeHtml(u.notes)}
        </div>` : ''}

      <div class="mini-stats drawer-mini">
        <div><span>Total Bills</span><strong>${formatMoney(totalBills)}</strong></div>
        <div><span>Paid</span><strong style="color:var(--emerald)">${formatMoney(paidBills)}</strong></div>
        <div><span>Outstanding</span><strong style="color:var(--orange)">${formatMoney(pendingBills)}</strong></div>
        <div><span>Open Tickets</span><strong style="color:${openTickets > 0 ? 'var(--pink)' : 'var(--emerald)'}">${openTickets}</strong></div>
      </div>

      ${c.downloadMbps != null ? `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:14px;margin-bottom:16px">
          <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">Connection Info</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center">
            <div><div style="font-size:18px;font-weight:700;color:var(--cyan);font-family:'JetBrains Mono',monospace">${(c.downloadMbps || 0).toFixed(1)}</div><div style="font-size:11px;color:var(--muted)">↓ Mbps</div></div>
            <div><div style="font-size:18px;font-weight:700;color:var(--emerald);font-family:'JetBrains Mono',monospace">${(c.uploadMbps || 0).toFixed(1)}</div><div style="font-size:11px;color:var(--muted)">↑ Mbps</div></div>
            <div><div style="font-size:18px;font-weight:700;color:var(--orange);font-family:'JetBrains Mono',monospace">${c.pingMs || 0}</div><div style="font-size:11px;color:var(--muted)">Ping ms</div></div>
          </div>
        </div>` : ''}

      <div class="drawer-actions">
        <button class="btn-primary" onclick="editCustomerFromDrawer('${u.id}')">Edit Profile</button>
        <button class="btn-secondary" onclick="showSection('billing'); closeCustomerDrawer();">Billing</button>
        <button class="btn-secondary" onclick="showSection('support'); closeCustomerDrawer();">Tickets</button>
      </div>
    `;
  } catch (error) {
    console.error('Drawer error:', error);
    body.innerHTML = `<div class="alert-error">Could not load customer profile.</div>`;
  }
}

function editCustomerFromDrawer(customerId) {
  closeCustomerDrawer();
  // Switch to customers section and open the edit modal
  if (window._currentSection !== 'customers') {
    showSection('customers');
    // Wait for customers to load then open modal
    setTimeout(() => {
      const customer = (window.allCustomers || []).find(c => c.id === customerId);
      if (customer && typeof openCustomerModal === 'function') openCustomerModal(customer);
    }, 800);
  } else {
    const customer = (window.allCustomers || []).find(c => c.id === customerId);
    if (customer && typeof openCustomerModal === 'function') openCustomerModal(customer);
  }
}

function drawerItem(label, value) {
  return `<div class="drawer-item">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(String(value || '—'))}</strong>
  </div>`;
}

function ensureCustomerDrawer() {
  if (document.getElementById('customer-drawer')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="customer-drawer-backdrop" class="drawer-backdrop" onclick="closeCustomerDrawer()"></div>
    <aside id="customer-drawer" class="customer-drawer">
      <div class="drawer-top">
        <div>
          <span class="eyebrow">Customer Profile</span>
          <h2>Account Details</h2>
        </div>
        <button class="close-btn" onclick="closeCustomerDrawer()">×</button>
      </div>
      <div id="customer-drawer-body"></div>
    </aside>`);
}

function closeCustomerDrawer() {
  const drawer   = document.getElementById('customer-drawer');
  const backdrop = document.getElementById('customer-drawer-backdrop');
  if (drawer)   drawer.classList.remove('open');
  if (backdrop) backdrop.remove();
  // Ensure next open re-creates backdrop
  const next = document.getElementById('customer-drawer');
  if (next) next.insertAdjacentHTML('beforebegin', ''); // no-op; backdrop re-created by ensureCustomerDrawer
}

window.openCustomerDrawer     = openCustomerDrawer;
window.closeCustomerDrawer    = closeCustomerDrawer;
window.editCustomerFromDrawer = editCustomerFromDrawer;
