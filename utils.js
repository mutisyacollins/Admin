// ==================== UTILS.JS — Shared helpers ====================

// ── Toast Notifications ──────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── HTML escaping ─────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// ── Money formatting ──────────────────────────────────────────────
function formatMoney(value) {
  const n = Number(value || 0);
  return 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Date formatting ───────────────────────────────────────────────
function formatDate(timestamp) {
  if (!timestamp) return '—';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '—';
  try {
    const ms   = getMillis(timestamp);
    if (!ms) return '—';
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)   return `${days}d ago`;
    return formatDate(timestamp);
  } catch { return '—'; }
}

// ── Timestamp to ms ───────────────────────────────────────────────
function getMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (timestamp.seconds) return timestamp.seconds * 1000;
  if (typeof timestamp === 'number') return timestamp;
  try {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch { return 0; }
}

// ── Customer name fallback ────────────────────────────────────────
function getCustomerName(c) {
  if (!c) return 'N/A';
  return (
    c.fullName ||
    `${c.firstName || ''} ${c.lastName || ''}`.trim() ||
    c.name ||
    'N/A'
  );
}

// ── Confirm dialog ────────────────────────────────────────────────
function confirmAction(message) {
  return window.confirm(message);
}

// ── CSV export ────────────────────────────────────────────────────
function exportToCSV(rows, filename) {
  if (!rows || !rows.length) {
    showToast('No data to export.', 'error');
    return;
  }
  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '').replace(/"/g, '""');
        return `"${val}"`;
      }).join(',')
    )
  ];
  const blob = new Blob(['\ufeff' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} record${rows.length !== 1 ? 's' : ''}.`, 'success');
}

// ── Mobile sidebar ────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('show');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}

// ── Refresh current section ───────────────────────────────────────
let _currentSection = 'dashboard';

function refreshCurrentSection() {
  const loaders = {
    dashboard: 'loadDashboard',
    customers: 'loadCustomers',
    billing:   'loadBilling',
    packages:  'loadPackages',
    support:   'loadSupport',
    analytics: 'loadAnalytics'
  };

  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.style.transform = 'rotate(360deg)';
    btn.style.transition = 'transform 0.4s ease';
    setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 450);
  }

  const fn = window[loaders[_currentSection]];
  if (typeof fn === 'function') {
    fn();
    showToast('Data refreshed.', 'info', 1500);
  }
}

// ── Empty state HTML ──────────────────────────────────────────────
function emptyState(icon, message, sub = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <p>${escapeHtml(message)}</p>
      ${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
    </div>
  `;
}

// ── Update sidebar open-ticket badge ─────────────────────────────
function updateSidebarTicketBadge(count) {
  const badge = document.getElementById('sidebar-open-tickets');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ── Generate next account number ─────────────────────────────────
function generateAccountNumber() {
  return 'NXT-' + Date.now().toString().slice(-6);
}

// ── Debounce ──────────────────────────────────────────────────────
function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

window.showToast               = showToast;
window.escapeHtml              = escapeHtml;
window.formatMoney             = formatMoney;
window.formatDate              = formatDate;
window.formatDateTime          = formatDateTime;
window.formatRelativeTime      = formatRelativeTime;
window.getMillis               = getMillis;
window.getCustomerName         = getCustomerName;
window.exportToCSV             = exportToCSV;
window.openSidebar             = openSidebar;
window.closeSidebar            = closeSidebar;
window.refreshCurrentSection   = refreshCurrentSection;
window.emptyState              = emptyState;
window.updateSidebarTicketBadge = updateSidebarTicketBadge;
window.generateAccountNumber   = generateAccountNumber;
window.debounce                = debounce;
window._currentSection         = _currentSection;
