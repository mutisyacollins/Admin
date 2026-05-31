// ==================== DASHBOARD.JS ====================

async function loadDashboard() {
  const dashboardDiv = document.getElementById('dashboard');

  dashboardDiv.innerHTML = `
    <div class="hero-panel dashboard-hero">
      <div>
        <span class="eyebrow">ISP Operations Overview</span>
        <h2>Nextlink Control Center</h2>
        <p>Monitor customers, payments, packages, support, and connection health in real time.</p>
      </div>
      <div class="hero-metrics">
        <div class="hero-metric">
          <small>Network Status</small>
          <strong id="network-status-text">🟢 Operational</strong>
        </div>
        <div class="hero-metric cyan">
          <small>Last Refreshed</small>
          <strong id="last-refresh">—</strong>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <button class="quick-action" onclick="showSection('customers')">+ Add Customer</button>
      <button class="quick-action" onclick="showSection('billing')">+ Create Bill</button>
      <button class="quick-action" onclick="showSection('packages')">+ New Package</button>
      <button class="quick-action" onclick="showSection('support')">+ New Ticket</button>
      <button class="quick-action ghost" onclick="showSection('analytics')">Analytics →</button>
    </div>

    <div class="stats-grid enhanced">
      ${statCard('Total Customers', 'total-customers', '👥', 'Registered accounts', 'cyan')}
      ${statCard('Active', 'active-customers', '✅', 'Connected subscribers', 'green')}
      ${statCard('Online Now', 'online-customers', '🌐', 'Live connections', 'purple')}
      ${statCard('Open Tickets', 'open-tickets', '🎧', 'Pending support', 'orange')}
      ${statCard('Pending Bills', 'pending-bills', '⏳', 'Unpaid invoices', 'pink')}
      ${statCard('Revenue', 'total-revenue', '💰', 'Collected payments', 'green')}
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Recent Customers</h3>
            <p>Latest registered users — click a row to view full profile</p>
          </div>
          <button class="btn-secondary" onclick="showSection('customers')">View All →</button>
        </div>
        <div id="recent-customers"><div class="skeleton" style="height:210px"></div></div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Operations Snapshot</h3><p>Live business health</p></div></div>
        <div id="system-summary" class="summary-list"><div class="skeleton" style="height:200px"></div></div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-head"><div><h3>Package Distribution</h3><p>Customers by service plan</p></div></div>
        <div id="package-distribution"><div class="skeleton" style="height:160px"></div></div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Billing Overview</h3><p>Invoice performance</p></div></div>
        <div id="billing-overview"><div class="skeleton" style="height:160px"></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div><h3>Recent Support Activity</h3><p>Latest customer tickets</p></div>
        <button class="btn-secondary" onclick="showSection('support')">Open Support →</button>
      </div>
      <div id="recent-activity"><div class="skeleton" style="height:150px"></div></div>
    </div>
  `;

  const refreshEl = document.getElementById('last-refresh');
  if (refreshEl) {
    refreshEl.textContent = new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  }

  try {
    const [usersSnapshot, billsSnapshot, ticketsSnapshot, packagesSnapshot, connectionsSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('billing').get(),
      db.collection('supportTickets').get(),
      db.collection('packages').get(),
      safeGetCollection('connections')
    ]);

    const stats = calculateStats(usersSnapshot, billsSnapshot, ticketsSnapshot, packagesSnapshot, connectionsSnapshot);

    animateCount('total-customers', stats.totalCustomers);
    animateCount('active-customers', stats.activeCustomers);
    animateCount('online-customers', stats.onlineCustomers);
    animateCount('open-tickets', stats.openTickets);
    animateCount('pending-bills', stats.pendingBills);
    document.getElementById('total-revenue').textContent = formatMoney(stats.totalRevenue);

    // Update sidebar badge
    updateSidebarTicketBadge(stats.openTickets);

    renderRecentCustomers(usersSnapshot, connectionsSnapshot);
    renderSystemSummary(stats);
    renderPackageDistribution(stats.packageCounts);
    renderBillingOverview(stats);
    renderRecentActivity(ticketsSnapshot);
  } catch (error) {
    console.error('Dashboard error:', error);
    dashboardDiv.insertAdjacentHTML('beforeend',
      `<div class="alert-error" style="margin-top:16px">Failed to load dashboard data. Check Firestore rules and admin access.</div>`
    );
  }
}

async function safeGetCollection(name) {
  try { return await db.collection(name).get(); }
  catch (e) { console.warn(`Could not read collection: ${name}`, e); return { size: 0, empty: true, forEach: () => {} }; }
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const duration = 700;
  const start    = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function calculateStats(usersSnapshot, billsSnapshot, ticketsSnapshot, packagesSnapshot, connectionsSnapshot) {
  let activeCustomers = 0, suspendedCustomers = 0, pendingCustomers = 0;
  const packageCounts = {};

  usersSnapshot.forEach(doc => {
    const u = doc.data();
    const status = (u.status || 'pending').toLowerCase();
    const plan   = u.plan || u.packageName || u.package || 'No Plan';
    if (status === 'active') activeCustomers++;
    else if (status === 'suspended') suspendedCustomers++;
    else pendingCustomers++;
    packageCounts[plan] = (packageCounts[plan] || 0) + 1;
  });

  let paidBills = 0, pendingBills = 0, totalRevenue = 0, pendingAmount = 0;
  billsSnapshot.forEach(doc => {
    const b      = doc.data();
    const status = (b.paymentStatus || b.status || 'pending').toLowerCase();
    const amount = Number(b.amount || b.total || b.price || 0);
    if (status === 'paid') { paidBills++;   totalRevenue  += amount; }
    else                   { pendingBills++; pendingAmount += amount; }
  });

  let openTickets = 0, closedTickets = 0;
  ticketsSnapshot.forEach(doc => {
    const s = (doc.data().status || 'open').toLowerCase();
    if (s === 'open' || s === 'in-progress') openTickets++;
    else closedTickets++;
  });

  let onlineCustomers = 0;
  connectionsSnapshot.forEach(doc => {
    if ((doc.data().status || '').toLowerCase() === 'online') onlineCustomers++;
  });

  return {
    totalCustomers: usersSnapshot.size,
    activeCustomers, suspendedCustomers, pendingCustomers,
    onlineCustomers,
    packages: packagesSnapshot.size,
    totalBills: billsSnapshot.size, paidBills, pendingBills,
    totalRevenue, pendingAmount,
    totalTickets: ticketsSnapshot.size, openTickets, closedTickets,
    packageCounts
  };
}

function statCard(title, id, icon, subtitle, colorClass) {
  return `
    <div class="stat-card ${colorClass}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-label">${title}</div>
      <h2 id="${id}">—</h2>
      <span class="stat-sub">${subtitle}</span>
    </div>`;
}

function renderRecentCustomers(snapshot, connectionsSnapshot) {
  const container = document.getElementById('recent-customers');
  if (snapshot.empty) { container.innerHTML = emptyState('👥', 'No customers yet.', 'Add your first customer to get started.'); return; }

  const connMap = {};
  connectionsSnapshot.forEach(doc => connMap[doc.id] = doc.data());

  let users = [];
  snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data(), conn: connMap[doc.id] || {} }));
  users = users.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 8);

  let html = `<div class="table-wrap"><table>
    <thead><tr><th>Customer</th><th>Account</th><th>Plan</th><th>Status</th><th>Online</th><th>Joined</th></tr></thead><tbody>`;

  users.forEach(u => {
    const online = (u.conn.status || '').toLowerCase() === 'online';
    html += `<tr class="clickable-row" onclick="openCustomerDrawer('${u.id}')">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,var(--cyan),var(--emerald));display:grid;place-items:center;font-weight:800;font-size:13px;color:#020d18;flex-shrink:0;font-family:'Syne',sans-serif">
            ${escapeHtml((getCustomerName(u)).charAt(0).toUpperCase())}
          </div>
          <div>
            <strong>${escapeHtml(getCustomerName(u))}</strong>
            <small>${escapeHtml(u.email || '—')}</small>
          </div>
        </div>
      </td>
      <td class="td-mono">${escapeHtml(u.accountNumber || '—')}</td>
      <td>${escapeHtml(u.plan || u.packageName || u.package || 'Pending')}</td>
      <td><span class="status ${escapeHtml(u.status || 'pending')}">${escapeHtml(u.status || 'pending')}</span></td>
      <td><span class="connection-pill ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span></td>
      <td style="color:var(--muted);font-size:12px">${formatDate(u.createdAt)}</td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function renderSystemSummary(data) {
  const activationRate = data.totalCustomers ? Math.round((data.activeCustomers / data.totalCustomers) * 100) : 0;
  const collectionRate = data.totalBills ? Math.round((data.paidBills / data.totalBills) * 100) : 0;
  const resolveRate    = data.totalTickets ? Math.round((data.closedTickets / data.totalTickets) * 100) : 0;

  document.getElementById('system-summary').innerHTML = `
    <div class="summary-item"><span>Active packages</span><strong>${data.packages}</strong></div>
    <div class="summary-item"><span>Total bills</span><strong>${data.totalBills}</strong></div>
    <div class="summary-item"><span>Collection rate</span><strong style="color:${collectionRate >= 70 ? 'var(--emerald)' : 'var(--orange)'}">${collectionRate}%</strong></div>
    <div class="summary-item"><span>Pending revenue</span><strong style="color:var(--orange)">${formatMoney(data.pendingAmount)}</strong></div>
    <div class="summary-item"><span>Suspended accounts</span><strong style="color:${data.suspendedCustomers > 0 ? 'var(--pink)' : 'var(--muted)'}">${data.suspendedCustomers}</strong></div>
    <div class="summary-item"><span>Activation rate</span><strong style="color:${activationRate >= 70 ? 'var(--emerald)' : 'var(--orange)'}">${activationRate}%</strong></div>
    <div class="summary-item"><span>Ticket resolve rate</span><strong style="color:${resolveRate >= 70 ? 'var(--emerald)' : 'var(--orange)'}">${resolveRate}%</strong></div>
    <div class="summary-item"><span>Online customers</span><strong style="color:var(--cyan)">${data.onlineCustomers}</strong></div>
  `;
}

function renderPackageDistribution(packageCounts) {
  const container = document.getElementById('package-distribution');
  const entries   = Object.entries(packageCounts);
  if (!entries.length) { container.innerHTML = emptyState('📦', 'No package data yet.'); return; }

  const max = Math.max(...entries.map(([, c]) => c));
  entries.sort((a, b) => b[1] - a[1]);

  container.innerHTML = entries.map(([plan, count]) => {
    const pct = max ? Math.round((count / max) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-info"><span>${escapeHtml(plan)}</span><strong>${count}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:0%" data-target="${pct}"></div></div>
    </div>`;
  }).join('');

  setTimeout(() => container.querySelectorAll('.bar-fill').forEach(b => { b.style.width = b.dataset.target + '%'; }), 80);
}

function renderBillingOverview(data) {
  const total      = data.paidBills + data.pendingBills;
  const paidPct    = total ? Math.round((data.paidBills / total) * 100) : 0;

  document.getElementById('billing-overview').innerHTML = `
    <div class="billing-ring" style="--pct:${paidPct}%">
      <div><strong>${paidPct}%</strong><span>Paid</span></div>
    </div>
    <div class="summary-list">
      <div class="summary-item"><span>Revenue collected</span><strong style="color:var(--emerald)">${formatMoney(data.totalRevenue)}</strong></div>
      <div class="summary-item"><span>Pending amount</span><strong style="color:var(--orange)">${formatMoney(data.pendingAmount)}</strong></div>
      <div class="summary-item"><span>Paid invoices</span><strong>${data.paidBills}</strong></div>
      <div class="summary-item"><span>Pending invoices</span><strong>${data.pendingBills}</strong></div>
    </div>`;
}

function renderRecentActivity(ticketsSnapshot) {
  const container = document.getElementById('recent-activity');
  let tickets = [];
  ticketsSnapshot.forEach(doc => tickets.push({ id: doc.id, ...doc.data() }));
  tickets = tickets.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 6);

  if (!tickets.length) { container.innerHTML = emptyState('🎧', 'No support activity yet.'); return; }

  let html = `<div class="table-wrap"><table>
    <thead><tr><th>Customer</th><th>Issue</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead><tbody>`;

  tickets.forEach(t => {
    html += `<tr ${t.customerId ? `class="clickable-row" onclick="openCustomerDrawer('${t.customerId}')"` : ''}>
      <td>
        <strong>${escapeHtml(t.customerName || t.name || 'Unknown')}</strong>
        <small>${escapeHtml(t.accountNumber || t.phone || '')}</small>
      </td>
      <td>${escapeHtml(t.issue || t.subject || 'No subject')}</td>
      <td><span class="ticket-priority priority-${escapeHtml(t.priority || 'medium')}">${escapeHtml(t.priority || 'medium')}</span></td>
      <td><span class="status ${escapeHtml(t.status || 'open')}">${escapeHtml(t.status || 'open')}</span></td>
      <td style="color:var(--muted);font-size:12px">${formatRelativeTime(t.createdAt)}</td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

window.loadDashboard = loadDashboard;
