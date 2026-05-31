// ==================== CUSTOMERS.JS ====================

let allCustomers = [];

async function loadCustomers() {
  const container = document.getElementById('customers');

  container.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <h3>Customer Management</h3>
          <p>View, add, update and manage your ISP subscribers.</p>
        </div>
        <div class="card-head-actions">
          <button onclick="exportCustomers()" class="btn-secondary">⬇ Export CSV</button>
          <button onclick="openCustomerModal()" class="btn-primary">+ Add Customer</button>
        </div>
      </div>

      <div class="toolbar triple">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" id="customer-search" placeholder="Search name, email, phone, account…" oninput="debouncedFilterCustomers()" />
        </div>
        <select id="status-filter" onchange="filterCustomers()">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <select id="plan-filter" onchange="filterCustomers()">
          <option value="">All Plans</option>
        </select>
      </div>

      <div id="customer-count"></div>

      <div id="customers-table" class="table-wrap">
        <div class="skeleton" style="height:220px"></div>
      </div>
    </div>

    <!-- Customer Modal -->
    <div id="customer-modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-head">
          <h3 id="customer-modal-title">Add Customer</h3>
          <button onclick="closeCustomerModal()" class="close-btn">×</button>
        </div>

        <input type="hidden" id="customer-id" />

        <div class="form-grid">
          <div>
            <label>Full Name *</label>
            <input type="text" id="customer-fullName" placeholder="Jane Mwangi" />
          </div>
          <div>
            <label>Email</label>
            <input type="email" id="customer-email" placeholder="jane@example.com" />
          </div>
          <div>
            <label>Phone</label>
            <input type="tel" id="customer-phone" placeholder="+254 7XX XXX XXX" />
          </div>
          <div>
            <label>Location</label>
            <input type="text" id="customer-location" placeholder="Nairobi, Kitengela…" />
          </div>
          <div>
            <label>Plan / Package</label>
            <input type="text" id="customer-plan" placeholder="Home WiFi 10 Mbps" />
          </div>
          <div>
            <label>Status</label>
            <select id="customer-status">
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label>Bill Due Date</label>
            <input type="text" id="customer-billDueDate" placeholder="30 Jun 2026" />
          </div>
          <div>
            <label>Account Number</label>
            <input type="text" id="customer-accountNumber" placeholder="NXT-0001" />
          </div>
          <div class="full">
            <label>Notes</label>
            <input type="text" id="customer-notes" placeholder="Additional notes…" />
          </div>
        </div>

        <p id="customer-form-error" class="error"></p>

        <div class="modal-actions">
          <button class="btn-secondary" onclick="closeCustomerModal()">Cancel</button>
          <button class="btn-primary" id="save-customer-btn" onclick="saveCustomer()">Save Customer</button>
        </div>
      </div>
    </div>
  `;

  await fetchCustomers();
}

async function fetchCustomers() {
  try {
    const snapshot = await db.collection('users').get();
    allCustomers = [];
    snapshot.forEach(doc => allCustomers.push({ id: doc.id, ...doc.data() }));
    allCustomers.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

    // Populate plan filter
    const plans      = [...new Set(allCustomers.map(c => c.plan || c.packageName || c.package).filter(Boolean))];
    const planFilter = document.getElementById('plan-filter');
    if (planFilter) {
      // Keep the "All Plans" option, rebuild the rest
      planFilter.innerHTML = `<option value="">All Plans</option>` +
        plans.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }

    renderCustomers(allCustomers);
  } catch (error) {
    console.error('Customers error:', error);
    document.getElementById('customers-table').innerHTML =
      `<div class="alert-error">Error loading customers. Check Firestore rules.</div>`;
  }
}

function renderCustomers(customers) {
  const tableDiv = document.getElementById('customers-table');
  const countEl  = document.getElementById('customer-count');

  if (countEl) countEl.textContent = `Showing ${customers.length} of ${allCustomers.length} customer${allCustomers.length !== 1 ? 's' : ''}`;

  if (!customers.length) {
    tableDiv.innerHTML = emptyState('👥', 'No customers match your search.', 'Try adjusting the filters above.');
    return;
  }

  let html = `<table>
    <thead><tr>
      <th>Customer</th><th>Contact</th><th>Plan</th><th>Status</th><th>Due Date</th><th>Joined</th><th>Actions</th>
    </tr></thead><tbody>`;

  customers.forEach(c => {
    const name   = getCustomerName(c);
    const initLetter = (name || 'N').charAt(0).toUpperCase();
    html += `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--cyan),var(--emerald));display:grid;place-items:center;font-weight:800;font-size:13px;color:#020d18;flex-shrink:0;font-family:'Syne',sans-serif">${escapeHtml(initLetter)}</div>
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small class="td-mono">${escapeHtml(c.accountNumber || c.id?.slice(0,8) || '')}</small>
          </div>
        </div>
      </td>
      <td>
        ${escapeHtml(c.email || '—')}
        <small>${escapeHtml(c.phone || c.phoneNumber || '')}</small>
      </td>
      <td>${escapeHtml(c.plan || c.packageName || c.package || 'Pending Activation')}</td>
      <td><span class="status ${escapeHtml(c.status || 'pending')}">${escapeHtml(c.status || 'pending')}</span></td>
      <td style="color:var(--muted);font-size:12px">${escapeHtml(c.billDueDate || c.dueDate || '—')}</td>
      <td style="color:var(--muted);font-size:12px">${formatDate(c.createdAt)}</td>
      <td class="actions">
        <button onclick="openCustomerDrawer('${c.id}')" class="btn-mini edit">View</button>
        <button onclick="editCustomer('${c.id}')" class="btn-mini edit">Edit</button>
        <button onclick="suspendToggle('${c.id}','${c.status || 'pending'}')" class="btn-mini warn">
          ${c.status === 'suspended' ? 'Activate' : 'Suspend'}
        </button>
        <button onclick="deleteCustomer('${c.id}')" class="btn-mini delete">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  tableDiv.innerHTML = html;
}

const debouncedFilterCustomers = debounce(filterCustomers, 220);

function filterCustomers() {
  const term   = (document.getElementById('customer-search')?.value || '').toLowerCase();
  const status = (document.getElementById('status-filter')?.value || '').toLowerCase();
  const plan   = (document.getElementById('plan-filter')?.value || '').toLowerCase();

  const filtered = allCustomers.filter(c => {
    const combined = [
      getCustomerName(c), c.email, c.phone, c.phoneNumber,
      c.location, c.plan, c.packageName, c.package, c.status, c.accountNumber
    ].join(' ').toLowerCase();

    return combined.includes(term)
      && (!status || (c.status || '').toLowerCase() === status)
      && (!plan   || (c.plan || c.packageName || c.package || '').toLowerCase() === plan);
  });

  renderCustomers(filtered);
}

function openCustomerModal(customer = null) {
  document.getElementById('customer-modal').classList.remove('hidden');
  document.getElementById('customer-form-error').textContent = '';

  if (customer) {
    document.getElementById('customer-modal-title').textContent = 'Edit Customer';
    document.getElementById('customer-id').value            = customer.id;
    document.getElementById('customer-fullName').value      = getCustomerName(customer);
    document.getElementById('customer-email').value         = customer.email || '';
    document.getElementById('customer-phone').value         = customer.phone || customer.phoneNumber || '';
    document.getElementById('customer-location').value      = customer.location || '';
    document.getElementById('customer-plan').value          = customer.plan || customer.packageName || customer.package || '';
    document.getElementById('customer-status').value        = customer.status || 'pending';
    document.getElementById('customer-billDueDate').value   = customer.billDueDate || customer.dueDate || '';
    document.getElementById('customer-accountNumber').value = customer.accountNumber || '';
    document.getElementById('customer-notes').value         = customer.notes || '';
  } else {
    document.getElementById('customer-modal-title').textContent = 'Add Customer';
    clearCustomerForm();
    // Auto-generate account number
    document.getElementById('customer-accountNumber').value = generateAccountNumber();
  }
}

function closeCustomerModal() {
  document.getElementById('customer-modal').classList.add('hidden');
}

async function saveCustomer() {
  const id            = document.getElementById('customer-id').value;
  const fullName      = document.getElementById('customer-fullName').value.trim();
  const email         = document.getElementById('customer-email').value.trim();
  const phone         = document.getElementById('customer-phone').value.trim();
  const location      = document.getElementById('customer-location').value.trim();
  const plan          = document.getElementById('customer-plan').value.trim() || 'Pending Activation';
  const status        = document.getElementById('customer-status').value;
  const billDueDate   = document.getElementById('customer-billDueDate').value.trim();
  const accountNumber = document.getElementById('customer-accountNumber').value.trim();
  const notes         = document.getElementById('customer-notes').value.trim();
  const errorEl       = document.getElementById('customer-form-error');
  const saveBtn       = document.getElementById('save-customer-btn');

  errorEl.textContent = '';
  if (!fullName) { errorEl.textContent = 'Customer name is required.'; return; }

  saveBtn.disabled     = true;
  saveBtn.textContent  = 'Saving…';

  const nameParts = fullName.split(' ');
  const data = {
    fullName,
    firstName: nameParts[0] || '',
    lastName:  nameParts.slice(1).join(' ') || '',
    email, phone, location, plan, status,
    billDueDate, accountNumber, notes,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await db.collection('users').doc(id).update(data);
      showToast('Customer updated successfully.', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('users').add(data);
      showToast('Customer added successfully.', 'success');
    }
    closeCustomerModal();
    await fetchCustomers();
    if (typeof loadDashboard === 'function' && window._currentSection === 'dashboard') loadDashboard();
  } catch (error) {
    console.error('Save customer error:', error);
    errorEl.textContent = error.message;
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Customer';
  }
}

function editCustomer(id) {
  const customer = allCustomers.find(c => c.id === id);
  if (!customer) { showToast('Customer not found.', 'error'); return; }
  openCustomerModal(customer);
}

async function suspendToggle(id, currentStatus) {
  const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  const label     = newStatus === 'suspended' ? 'Suspend' : 'Activate';
  if (!confirmAction(`${label} this customer?`)) return;

  try {
    await db.collection('users').doc(id).update({
      status:    newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`Customer ${newStatus}.`, 'success');
    await fetchCustomers();
  } catch { showToast('Failed to update status.', 'error'); }
}

async function deleteCustomer(id) {
  const customer = allCustomers.find(c => c.id === id);
  const name     = customer ? getCustomerName(customer) : 'this customer';
  if (!confirmAction(`Delete ${name}? This cannot be undone.`)) return;

  try {
    await db.collection('users').doc(id).delete();
    showToast('Customer deleted.', 'success');
    await fetchCustomers();
  } catch (error) { showToast('Failed to delete: ' + error.message, 'error'); }
}

function exportCustomers() {
  const rows = allCustomers.map(c => ({
    Name:          getCustomerName(c),
    Email:         c.email || '',
    Phone:         c.phone || c.phoneNumber || '',
    Location:      c.location || '',
    Plan:          c.plan || c.packageName || c.package || '',
    Status:        c.status || 'pending',
    DueDate:       c.billDueDate || c.dueDate || '',
    AccountNumber: c.accountNumber || '',
    Joined:        formatDate(c.createdAt)
  }));
  exportToCSV(rows, 'nextlink-customers.csv');
}

function clearCustomerForm() {
  ['customer-id','customer-fullName','customer-email','customer-phone',
   'customer-location','customer-plan','customer-billDueDate','customer-accountNumber','customer-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const status = document.getElementById('customer-status');
  if (status) status.value = 'pending';
}

window.loadCustomers          = loadCustomers;
window.filterCustomers        = filterCustomers;
window.debouncedFilterCustomers = debouncedFilterCustomers;
window.openCustomerModal      = openCustomerModal;
window.closeCustomerModal     = closeCustomerModal;
window.saveCustomer           = saveCustomer;
window.editCustomer           = editCustomer;
window.deleteCustomer         = deleteCustomer;
window.suspendToggle          = suspendToggle;
window.exportCustomers        = exportCustomers;
