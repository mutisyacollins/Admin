// ==================== ANALYTICS.JS ====================

let revenueChartInstance  = null;
let customerChartInstance = null;
let statusChartInstance   = null;

// Shared Chart.js defaults for the dark theme
const CHART_COLORS = {
  cyan:    'rgba(0,212,255,0.85)',
  emerald: 'rgba(0,229,160,0.85)',
  orange:  'rgba(255,159,67,0.85)',
  pink:    'rgba(255,107,157,0.85)',
  purple:  'rgba(167,139,250,0.85)',
  cyanFill:    'rgba(0,212,255,0.12)',
  emeraldFill: 'rgba(0,229,160,0.12)'
};

async function loadAnalytics() {
  const container = document.getElementById('analytics');
  container.innerHTML = `
    <div class="hero-panel analytics-hero">
      <div>
        <span class="eyebrow">Business Intelligence</span>
        <h2>Nextlink Analytics</h2>
        <p>Revenue trends, customer growth, billing performance, and connection health — all in one view.</p>
      </div>
      <div class="hero-metrics">
        <div class="hero-metric cyan"><small>Period</small><strong>Last 6 Months</strong></div>
      </div>
    </div>

    <div class="stats-grid enhanced">
      ${analyticsCard('Revenue',   'analytics-revenue',   'green',  '💰', 'Collected payments')}
      ${analyticsCard('Pending',   'analytics-pending',   'orange', '⏳', 'Outstanding bills')}
      ${analyticsCard('Customers', 'analytics-customers', 'cyan',   '👥', 'Registered accounts')}
      ${analyticsCard('Active',    'analytics-active',    'green',  '✅', 'Active accounts')}
      ${analyticsCard('Online',    'analytics-online',    'purple', '🌐', 'Currently online')}
      ${analyticsCard('Tickets',   'analytics-tickets',   'pink',   '🎧', 'Open support cases')}
    </div>

    <div class="dashboard-grid">
      <div class="card chart-card">
        <div class="card-head"><div><h3>Revenue Trend</h3><p>Monthly paid bill totals (KES)</p></div></div>
        <canvas id="revenueChart" height="110"></canvas>
      </div>
      <div class="card chart-card">
        <div class="card-head"><div><h3>Customer Status</h3><p>Active, pending and suspended</p></div></div>
        <canvas id="statusChart" height="160"></canvas>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card chart-card">
        <div class="card-head"><div><h3>Customer Growth</h3><p>New registrations by month</p></div></div>
        <canvas id="customerChart" height="110"></canvas>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Performance Summary</h3><p>Key operational metrics</p></div></div>
        <div id="analytics-summary" class="summary-list"><div class="skeleton" style="height:200px"></div></div>
      </div>
    </div>
  `;

  try {
    const [usersSnapshot, billsSnapshot, ticketsSnapshot, connectionsSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('billing').get(),
      db.collection('supportTickets').get(),
      safeGetAnalyticsCollection('connections')
    ]);

    const analytics = buildAnalytics(usersSnapshot, billsSnapshot, ticketsSnapshot, connectionsSnapshot);
    renderAnalyticsNumbers(analytics);
    renderAnalyticsSummary(analytics);
    renderRevenueChart(analytics.monthLabels, analytics.revenueByMonth);
    renderCustomerGrowthChart(analytics.monthLabels, analytics.customersByMonth);
    renderStatusChart(analytics.statusCounts);
  } catch (error) {
    console.error('Analytics error:', error);
    container.insertAdjacentHTML('beforeend',
      `<div class="alert-error" style="margin-top:16px">Could not load analytics. Check Firestore rules.</div>`
    );
  }
}

async function safeGetAnalyticsCollection(name) {
  try { return await db.collection(name).get(); }
  catch { return { size: 0, empty: true, forEach: () => {} }; }
}

function analyticsCard(title, id, colorClass, icon, subtitle) {
  return `<div class="stat-card ${colorClass}">
    <div class="stat-icon">${icon}</div>
    <div class="stat-label">${title}</div>
    <h2 id="${id}">—</h2>
    <span class="stat-sub">${subtitle}</span>
  </div>`;
}

function buildAnalytics(usersSnapshot, billsSnapshot, ticketsSnapshot, connectionsSnapshot) {
  const monthLabels    = getLastSixMonthLabels();
  const monthKeys      = getLastSixMonthKeys();
  const revenueByMonth  = Object.fromEntries(monthKeys.map(k => [k, 0]));
  const customersByMonth = Object.fromEntries(monthKeys.map(k => [k, 0]));

  let totalRevenue = 0, pendingAmount = 0, paidBills = 0, pendingBills = 0;
  billsSnapshot.forEach(doc => {
    const bill   = doc.data();
    const amount = Number(bill.amount || bill.total || bill.price || 0);
    const status = (bill.paymentStatus || bill.status || 'pending').toLowerCase();
    const key    = monthKeyFromAnyDate(bill.paidAt || bill.createdAt || bill.date || bill.dueDate);
    if (status === 'paid') {
      totalRevenue += amount; paidBills++;
      if (key && revenueByMonth[key] !== undefined) revenueByMonth[key] += amount;
    } else {
      pendingAmount += amount; pendingBills++;
    }
  });

  const statusCounts = { active: 0, pending: 0, suspended: 0, inactive: 0 };
  usersSnapshot.forEach(doc => {
    const user   = doc.data();
    const status = (user.status || 'pending').toLowerCase();
    if (statusCounts[status] !== undefined) statusCounts[status]++;
    else statusCounts.inactive++;
    const key = monthKeyFromAnyDate(user.createdAt || user.joinDate || user.registeredAt);
    if (key && customersByMonth[key] !== undefined) customersByMonth[key]++;
  });

  let openTickets = 0, closedTickets = 0;
  ticketsSnapshot.forEach(doc => {
    const s = ((doc.data().status) || 'open').toLowerCase();
    if (s === 'closed' || s === 'resolved') closedTickets++;
    else openTickets++;
  });

  let onlineCustomers = 0;
  connectionsSnapshot.forEach(doc => {
    if (((doc.data().status) || '').toLowerCase() === 'online') onlineCustomers++;
  });

  return {
    monthLabels,
    revenueByMonth:   monthKeys.map(k => revenueByMonth[k]),
    customersByMonth: monthKeys.map(k => customersByMonth[k]),
    totalRevenue, pendingAmount, paidBills, pendingBills,
    totalCustomers:  usersSnapshot.size,
    activeCustomers: statusCounts.active,
    onlineCustomers,
    openTickets, closedTickets,
    totalTickets: ticketsSnapshot.size,
    statusCounts
  };
}

function renderAnalyticsNumbers(a) {
  document.getElementById('analytics-revenue').textContent   = formatMoney(a.totalRevenue);
  document.getElementById('analytics-pending').textContent   = formatMoney(a.pendingAmount);
  document.getElementById('analytics-customers').textContent = a.totalCustomers;
  document.getElementById('analytics-active').textContent    = a.activeCustomers;
  document.getElementById('analytics-online').textContent    = a.onlineCustomers;
  document.getElementById('analytics-tickets').textContent   = a.openTickets;
}

function renderAnalyticsSummary(a) {
  const collectionRate = (a.paidBills + a.pendingBills)
    ? Math.round((a.paidBills / (a.paidBills + a.pendingBills)) * 100) : 0;
  const activeRate     = a.totalCustomers
    ? Math.round((a.activeCustomers / a.totalCustomers) * 100) : 0;
  const resolveRate    = a.totalTickets
    ? Math.round((a.closedTickets / a.totalTickets) * 100) : 0;

  const rateColor = pct => pct >= 70 ? 'var(--emerald)' : pct >= 40 ? 'var(--orange)' : 'var(--pink)';

  document.getElementById('analytics-summary').innerHTML = `
    <div class="summary-item"><span>Bill collection rate</span><strong style="color:${rateColor(collectionRate)}">${collectionRate}%</strong></div>
    <div class="summary-item"><span>Customer active rate</span><strong style="color:${rateColor(activeRate)}">${activeRate}%</strong></div>
    <div class="summary-item"><span>Ticket resolve rate</span><strong style="color:${rateColor(resolveRate)}">${resolveRate}%</strong></div>
    <div class="summary-item"><span>Paid invoices</span><strong>${a.paidBills}</strong></div>
    <div class="summary-item"><span>Pending invoices</span><strong style="color:var(--orange)">${a.pendingBills}</strong></div>
    <div class="summary-item"><span>Online right now</span><strong style="color:var(--cyan)">${a.onlineCustomers}</strong></div>
    <div class="summary-item"><span>Total revenue</span><strong style="color:var(--emerald)">${formatMoney(a.totalRevenue)}</strong></div>
    <div class="summary-item"><span>Pending revenue</span><strong style="color:var(--orange)">${formatMoney(a.pendingAmount)}</strong></div>
  `;
}

function renderRevenueChart(labels, data) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx || !window.Chart) return;
  if (revenueChartInstance) revenueChartInstance.destroy();

  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (KES)',
        data,
        tension: 0.4,
        fill: true,
        borderColor: CHART_COLORS.cyan,
        backgroundColor: CHART_COLORS.cyanFill,
        pointBackgroundColor: CHART_COLORS.cyan,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
      }]
    },
    options: defaultLineOptions('KES')
  });
}

function renderCustomerGrowthChart(labels, data) {
  const ctx = document.getElementById('customerChart');
  if (!ctx || !window.Chart) return;
  if (customerChartInstance) customerChartInstance.destroy();

  customerChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'New Customers',
        data,
        backgroundColor: CHART_COLORS.emeraldFill,
        borderColor: CHART_COLORS.emerald,
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: defaultBarOptions('')
  });
}

function renderStatusChart(statusCounts) {
  const ctx = document.getElementById('statusChart');
  if (!ctx || !window.Chart) return;
  if (statusChartInstance) statusChartInstance.destroy();

  statusChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Active', 'Pending', 'Suspended', 'Inactive'],
      datasets: [{
        data: [statusCounts.active, statusCounts.pending, statusCounts.suspended, statusCounts.inactive],
        backgroundColor: [
          CHART_COLORS.emeraldFill,
          'rgba(255,159,67,0.25)',
          'rgba(255,107,157,0.25)',
          'rgba(148,163,184,0.15)'
        ],
        borderColor: [
          CHART_COLORS.emerald,
          CHART_COLORS.orange,
          CHART_COLORS.pink,
          'rgba(148,163,184,0.5)'
        ],
        borderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: { labels: { color: '#7a99c0', font: { family: 'Inter', size: 12 }, padding: 16 } },
        tooltip: {
          backgroundColor: '#0e1d35',
          borderColor: '#1f3a5c',
          borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} customers`
          }
        }
      }
    }
  });
}

function defaultLineOptions(prefix) {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0e1d35',
        borderColor: '#1f3a5c',
        borderWidth: 1,
        callbacks: {
          label: ctx => ` ${prefix ? prefix + ' ' : ''}${Number(ctx.raw || 0).toLocaleString('en-KE')}`
        }
      }
    },
    scales: {
      x: { ticks: { color: '#6b8caf', font: { size: 11 } }, grid: { color: 'rgba(30,50,85,0.5)' } },
      y: { ticks: { color: '#6b8caf', font: { size: 11 } }, grid: { color: 'rgba(30,50,85,0.5)' }, beginAtZero: true }
    }
  };
}

function defaultBarOptions(prefix) {
  return {
    ...defaultLineOptions(prefix),
    plugins: {
      ...defaultLineOptions(prefix).plugins,
      legend: { display: false }
    }
  };
}

function getLastSixMonthKeys() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

function getLastSixMonthLabels() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d.toLocaleString('en-KE', { month: 'short' });
  });
}

function monthKeyFromAnyDate(value) {
  const ms = getMillis(value);
  if (!ms) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

window.loadAnalytics = loadAnalytics;
