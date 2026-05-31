// ==================== DASHBOARD.JS ====================

async function loadDashboard() {
  const dashboardDiv = document.getElementById('dashboard');

  dashboardDiv.innerHTML = `
    <div class="dash-header">
      <div>
        <h2 class="dash-title">Overview</h2>
        <p class="dash-sub">Last refreshed at <span id="last-refresh">—</span></p>
      </div>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:22px">
      ${statCard('Customers',    'total-customers', 'cyan')}
      ${statCard('Active',       'active-customers','green')}
      ${statCard('Open Tickets', 'open-tickets',    'orange')}
      ${statCard('Revenue',      'total-revenue',   'green')}
    </div>

    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:18px">
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Recent Customers</h3>
            <p>Last 6 registered accounts</p>
          </div>
          <button class="btn-secondary" onclick="showSection('customers')">View All →</button>
        </div>
        <div id="recent-customers"><div class="skeleton" style="height:200px"></div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Open Tickets</h3>
            <p>Unresolved support cases</p>
          </div>
          <button class="btn-secondary" onclick="showSection('support')">View All →</button>
        </div>
        <div id="recent-tickets"><div class="skeleton" style="height:200px"></div></div>
      </div>
    </div>
  `;

  document.getElementById('last-refresh').textContent =
    new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

  try {
    const [usersSnap, billsSnap, ticketsSnap, connectionsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('billing').get(),
      db.collection('supportTickets').get(),
      safeGetCollection('connections')
    ]);

    const stats = calculateStats(usersSnap, billsSnap, ticketsSnap, connectionsSnap);

    animateCount('total-customers',  stats.totalCustomers);
    animateCount('active-customers', stats.activeCustomers);
    animateCount('open-tickets',     stats.openTickets);
    document.getElementById('total-revenue').textContent = formatMoney(stats.totalRevenue);

    updateSidebarTicketBadge(stats.openTickets);
    renderRecentCustomers(usersSnap, connectionsSnap);
    renderRecentTickets(ticketsSnap);

  } catch (error) {
    console.error('Dashboard error:', error);
    dashboardDiv.insertAdjacentHTML('beforeend',
      `<div class="alert-error" style="margin-top:16px">Failed to load dashboard. Check Firestore rules.</div>`
    );
  }
}

async function safeGetCollection(name) {
  try { return await db.collection(name).get(); }
  catch { return { size: 0, empty: true, forEach: () => {} }; }
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  (function step(now) {
    const p = Math.min((now - start) / 700, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

function calculateStats(usersSnap, billsSnap, ticketsSnap, connectionsSnap) {
  let activeCustomers = 0;
  usersSnap.forEach(doc => {
    if ((doc.data().status || '').toLowerCase() === 'active') activeCustomers++;
  });

  let totalRevenue = 0, pendingBills = 0;
  billsSnap.forEach(doc => {
    const b = doc.data();
    if ((b.paymentStatus || b.status || '').toLowerCase() === 'paid')
      totalRevenue += Number(b.amount || 0);
    else
      pendingBills++;
  });

  let openTickets = 0;
  ticketsSnap.forEach(doc => {
    const s = (doc.data().status || 'open').toLowerCase();
    if (s === 'open' || s === 'in-progress') openTickets++;
  });

  return { totalCustomers: usersSnap.size, activeCustomers, openTickets, totalRevenue, pendingBills };
}

function statCard(title, id, colorClass) {
  return `
    <div class="stat-card ${colorClass}">
      <div class="stat-label">${title}</div>
      <h2 id="${id}">—</h2>
    </div>`;
}

function renderRecentCustomers(snapshot, connectionsSnap) {
  const el = document.getElementById('recent-customers');
  if (snapshot.empty) { el.innerHTML = emptyState('👥', 'No customers yet.'); return; }

  const connMap = {};
  connectionsSnap.forEach(doc => connMap[doc.id] = doc.data());

  let users = [];
  snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data(), conn: connMap[doc.id] || {} }));
  users = users.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 6);

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Plan</th><th>Status</th><th>Connection</th></tr></thead>
    <tbody>
    ${users.map(u => {
      const online = (u.conn.status || '').toLowerCase() === 'online';
      return `<tr class="clickable-row" onclick="openCustomerDrawer('${u.id}')">
        <td>
          <div style="display:flex;align-items:center;gap:9px">
            <div style="width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--cyan),var(--emerald));display:grid;place-items:center;font-weight:800;font-size:12px;color:#020d18;flex-shrink:0;font-family:'Syne',sans-serif">${escapeHtml(getCustomerName(u).charAt(0).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(getCustomerName(u))}</strong>
              <small>${escapeHtml(u.email || '—')}</small>
            </div>
          </div>
        </td>
        <td style="color:var(--muted);font-size:12px">${escapeHtml(u.plan || u.packageName || 'Pending')}</td>
        <td><span class="status ${escapeHtml(u.status || 'pending')}">${escapeHtml(u.status || 'pending')}</span></td>
        <td><span class="connection-pill ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span></td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

function renderRecentTickets(ticketsSnap) {
  const el = document.getElementById('recent-tickets');
  let tickets = [];
  ticketsSnap.forEach(doc => tickets.push({ id: doc.id, ...doc.data() }));
  tickets = tickets
    .filter(t => ['open','in-progress'].includes((t.status || 'open').toLowerCase()))
    .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
    .slice(0, 6);

  if (!tickets.length) {
    el.innerHTML = emptyState('✅', 'No open tickets.', 'All issues resolved.');
    return;
  }

  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
    ${tickets.map(t => `
      <div class="summary-item" style="cursor:pointer" ${t.customerId ? `onclick="openCustomerDrawer('${t.customerId}')"` : ''}>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.customerName || t.name || 'Unknown')}</div>
          <div style="color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.issue || t.subject || 'No subject')}</div>
        </div>
        <span class="status ${escapeHtml(t.status || 'open')}" style="flex-shrink:0">${escapeHtml(t.status || 'open')}</span>
      </div>`).join('')}
  </div>`;
}

window.loadDashboard = loadDashboard;
