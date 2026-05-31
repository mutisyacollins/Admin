// ==================== BILLING.JS ====================

let allBills = [];
let allCustomers = [];
let selectedBillCustomer = null;

async function loadBilling() {
  const container = document.getElementById('billing');

  container.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <h3>Billing & Payments</h3>
          <p>Create invoices, track paid bills and monitor outstanding balances.</p>
        </div>
        <div class="card-head-actions">
          <button onclick="exportBills()" class="btn-secondary">⬇ Export CSV</button>
          <button onclick="openBillModal()" class="btn-primary">+ Create Bill</button>
        </div>
      </div>

      <div class="mini-stats">
        <div><span>Total Bills</span><strong id="bill-total">—</strong></div>
        <div><span>Paid</span><strong id="bill-paid" style="color:var(--emerald)">—</strong></div>
        <div><span>Pending</span><strong id="bill-pending" style="color:var(--orange)">—</strong></div>
        <div><span>Revenue</span><strong id="bill-revenue" style="color:var(--cyan)">—</strong></div>
      </div>

      <div class="toolbar triple">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" id="bill-search" placeholder="Search customer, status, date…" oninput="debouncedFilterBills()" />
        </div>
        <select id="bill-status-filter" onchange="filterBills()">
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
        <button onclick="exportBills()" class="btn-ghost" style="border:1px solid var(--border2)">⬇ CSV</button>
      </div>

      <div id="bill-count"></div>

      <div id="billing-content" class="table-wrap">
        <div class="skeleton" style="height:220px"></div>
      </div>
    </div>

    <div id="bill-modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-head">
          <h3 id="bill-modal-title">Create Bill</h3>
          <button onclick="closeBillModal()" class="close-btn">×</button>
        </div>

        <input type="hidden" id="bill-edit-id" />

        <div class="form-grid">
          <div class="full">
            <label>Select Customer *</label>
            <select id="bill-customer-select" onchange="handleBillCustomerSelect()">
              <option value="">Loading customers...</option>
            </select>
          </div>

          <div>
            <label>Customer Name</label>
            <input type="text" id="bill-customerName" readonly placeholder="Selected customer name" />
          </div>

          <div>
            <label>Account Number</label>
            <input type="text" id="bill-accountNumber" readonly placeholder="NXT-000000" />
          </div>

          <div>
            <label>Amount (KES) *</label>
            <input type="number" id="bill-amount" placeholder="2500" min="0" step="1" />
          </div>

          <div>
            <label>Due Date</label>
            <input type="text" id="bill-dueDate" placeholder="30 Jun 2026" />
          </div>

          <div>
            <label>Status</label>
            <select id="bill-status">
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div class="full">
            <label>Description</label>
            <input type="text" id="bill-description" placeholder="Monthly internet subscription — June 2026" />
          </div>
        </div>

        <p id="bill-error" class="error"></p>

        <div class="modal-actions">
          <button class="btn-secondary" onclick="closeBillModal()">Cancel</button>
          <button class="btn-primary" id="save-bill-btn" onclick="saveBill()">Save Bill</button>
        </div>
      </div>
    </div>
  `;

  await fetchCustomersForBilling();
  await fetchBills();
}

async function fetchCustomersForBilling() {
  try {
    const snapshot = await db.collection('users').get();

    allCustomers = [];
    snapshot.forEach(doc => {
      const data = doc.data();

      const firstName = data.firstName || '';
      const lastName = data.lastName || '';
      const fullName = data.name || `${firstName} ${lastName}`.trim() || data.email || 'Unnamed Customer';

      allCustomers.push({
        uid: doc.id,
        id: doc.id,
        name: fullName,
        email: data.email || '',
        phone: data.phone || '',
        accountNumber: data.accountNumber || '',
        plan: data.plan || data.packageName || ''
      });
    });

    allCustomers.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Customer loading error:', error);
    allCustomers = [];
  }
}

function populateCustomerDropdown(selectedUid = '') {
  const select = document.getElementById('bill-customer-select');
  if (!select) return;

  if (!allCustomers.length) {
    select.innerHTML = `<option value="">No customers found</option>`;
    return;
  }

  select.innerHTML = `
    <option value="">Select customer</option>
    ${allCustomers.map(c => `
      <option value="${escapeHtml(c.uid)}" ${c.uid === selectedUid ? 'selected' : ''}>
        ${escapeHtml(c.name)} ${c.accountNumber ? `— ${escapeHtml(c.accountNumber)}` : ''}
      </option>
    `).join('')}
  `;
}

function handleBillCustomerSelect() {
  const uid = document.getElementById('bill-customer-select').value;
  selectedBillCustomer = allCustomers.find(c => c.uid === uid) || null;

  document.getElementById('bill-customerName').value = selectedBillCustomer?.name || '';
  document.getElementById('bill-accountNumber').value = selectedBillCustomer?.accountNumber || '';
}

async function fetchBills() {
  try {
    const snapshot = await db.collection('billing').get();
    allBills = [];

    snapshot.forEach(doc => allBills.push({ id: doc.id, ...doc.data() }));

    allBills.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

    updateBillStats(allBills);
    renderBills(allBills);
  } catch (error) {
    console.error('Billing error:', error);
    document.getElementById('billing-content').innerHTML =
      `<div class="alert-error">Error loading billing data. Check Firestore rules.</div>`;
  }
}

function updateBillStats(bills) {
  let paid = 0, pending = 0, revenue = 0;

  bills.forEach(b => {
    const status = (b.paymentStatus || b.status || 'pending').toLowerCase();
    const amount = Number(b.amount || 0);

    if (status === 'paid') {
      paid++;
      revenue += amount;
    } else {
      pending++;
    }
  });

  document.getElementById('bill-total').textContent = bills.length.toLocaleString();
  document.getElementById('bill-paid').textContent = paid.toLocaleString();
  document.getElementById('bill-pending').textContent = pending.toLocaleString();
  document.getElementById('bill-revenue').textContent = formatMoney(revenue);
}

const debouncedFilterBills = debounce(filterBills, 220);

function filterBills() {
  const term = (document.getElementById('bill-search')?.value || '').toLowerCase();
  const status = (document.getElementById('bill-status-filter')?.value || '').toLowerCase();

  const filtered = allBills.filter(b => {
    const combined = [
      b.customerName,
      b.accountNumber,
      b.amount,
      b.dueDate,
      b.paymentStatus,
      b.status,
      b.description
    ].join(' ').toLowerCase();

    const bStatus = (b.paymentStatus || b.status || 'pending').toLowerCase();
    return combined.includes(term) && (!status || bStatus === status);
  });

  renderBills(filtered);
}

function renderBills(bills) {
  const container = document.getElementById('billing-content');
  const countEl = document.getElementById('bill-count');

  if (countEl) {
    countEl.textContent = `Showing ${bills.length} of ${allBills.length} bill${allBills.length !== 1 ? 's' : ''}`;
  }

  if (!bills.length) {
    container.innerHTML = emptyState('💳', 'No bills found.', 'Create a new bill to get started.');
    return;
  }

  let html = `<table>
    <thead>
      <tr>
        <th>Customer</th>
        <th>Account</th>
        <th>Amount</th>
        <th>Description</th>
        <th>Due Date</th>
        <th>Status</th>
        <th>Created</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>`;

  bills.forEach(b => {
    const status = b.paymentStatus || b.status || 'pending';

    html += `<tr>
      <td><strong>${escapeHtml(b.customerName || 'N/A')}</strong></td>
      <td style="color:var(--muted);font-size:12px">${escapeHtml(b.accountNumber || '—')}</td>
      <td class="td-mono" style="color:var(--text)">${formatMoney(b.amount || 0)}</td>
      <td style="color:var(--muted);font-size:12px">${escapeHtml(b.description || '—')}</td>
      <td style="color:var(--muted);font-size:12px">${escapeHtml(b.dueDate || '—')}</td>
      <td><span class="status ${escapeHtml(status)}">${escapeHtml(status)}</span></td>
      <td style="color:var(--muted);font-size:12px">${formatDate(b.createdAt)}</td>
      <td class="actions">
        ${status !== 'paid' ? `<button class="btn-mini success" onclick="markBillPaid('${b.id}')">✓ Paid</button>` : ''}
        <button class="btn-mini edit" onclick="editBill('${b.id}')">Edit</button>
        <button class="btn-mini delete" onclick="deleteBill('${b.id}')">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function openBillModal(bill = null) {
  document.getElementById('bill-modal').classList.remove('hidden');
  document.getElementById('bill-error').textContent = '';

  populateCustomerDropdown(bill?.uid || bill?.customerId || '');

  if (bill) {
    const uid = bill.uid || bill.customerId || '';
    selectedBillCustomer = allCustomers.find(c => c.uid === uid) || null;

    document.getElementById('bill-modal-title').textContent = 'Edit Bill';
    document.getElementById('bill-edit-id').value = bill.id;
    document.getElementById('bill-customer-select').value = uid;
    document.getElementById('bill-customerName').value = bill.customerName || selectedBillCustomer?.name || '';
    document.getElementById('bill-accountNumber').value = bill.accountNumber || selectedBillCustomer?.accountNumber || '';
    document.getElementById('bill-amount').value = bill.amount || '';
    document.getElementById('bill-dueDate').value = bill.dueDate || '';
    document.getElementById('bill-status').value = bill.paymentStatus || bill.status || 'pending';
    document.getElementById('bill-description').value = bill.description || '';
  } else {
    selectedBillCustomer = null;

    document.getElementById('bill-modal-title').textContent = 'Create Bill';
    document.getElementById('bill-edit-id').value = '';
    document.getElementById('bill-customer-select').value = '';
    document.getElementById('bill-customerName').value = '';
    document.getElementById('bill-accountNumber').value = '';
    document.getElementById('bill-amount').value = '';
    document.getElementById('bill-dueDate').value = '';
    document.getElementById('bill-status').value = 'pending';
    document.getElementById('bill-description').value = 'Monthly internet subscription';
  }
}

function closeBillModal() {
  document.getElementById('bill-modal').classList.add('hidden');
}

function editBill(id) {
  const bill = allBills.find(b => b.id === id);
  if (!bill) {
    showToast('Bill not found.', 'error');
    return;
  }
  openBillModal(bill);
}

async function saveBill() {
  const editId = document.getElementById('bill-edit-id').value;
  const selectedUid = document.getElementById('bill-customer-select').value;
  const amount = Number(document.getElementById('bill-amount').value);
  const dueDate = document.getElementById('bill-dueDate').value.trim();
  const paymentStatus = document.getElementById('bill-status').value;
  const description = document.getElementById('bill-description').value.trim();
  const errorEl = document.getElementById('bill-error');
  const saveBtn = document.getElementById('save-bill-btn');

  errorEl.textContent = '';

  const customer = allCustomers.find(c => c.uid === selectedUid);

  if (!customer) {
    errorEl.textContent = 'Please select a valid customer.';
    return;
  }

  if (!amount || amount <= 0) {
    errorEl.textContent = 'Amount must be greater than 0.';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const data = {
      uid: customer.uid,
      customerId: customer.uid,

      customerName: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      accountNumber: customer.accountNumber || '',
      packageName: customer.plan || '',

      amount,
      dueDate,
      paymentStatus,
      status: paymentStatus,
      description: description || 'Monthly internet subscription',

      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (editId) {
      await db.collection('billing').doc(editId).update(data);
      showToast('Bill updated successfully.', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('billing').add(data);
      showToast('Bill created successfully.', 'success');
    }

    closeBillModal();
    await fetchBills();
  } catch (error) {
    errorEl.textContent = error.message;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Bill';
  }
}

async function markBillPaid(id) {
  if (!confirmAction('Mark this bill as paid?')) return;

  try {
    await db.collection('billing').doc(id).update({
      paymentStatus: 'paid',
      status: 'paid',
      paidAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('Bill marked as paid.', 'success');
    await fetchBills();
  } catch {
    showToast('Failed to update bill.', 'error');
  }
}

async function deleteBill(id) {
  if (!confirmAction('Delete this bill? This cannot be undone.')) return;

  try {
    await db.collection('billing').doc(id).delete();
    showToast('Bill deleted.', 'success');
    await fetchBills();
  } catch {
    showToast('Failed to delete bill.', 'error');
  }
}

function exportBills() {
  const rows = allBills.map(b => ({
    Customer: b.customerName || '',
    AccountNumber: b.accountNumber || '',
    UID: b.uid || b.customerId || '',
    Amount: b.amount || 0,
    Description: b.description || '',
    DueDate: b.dueDate || '',
    Status: b.paymentStatus || b.status || 'pending',
    Created: formatDate(b.createdAt)
  }));

  exportToCSV(rows, 'nextlink-billing.csv');
}

window.loadBilling = loadBilling;
window.openBillModal = openBillModal;
window.closeBillModal = closeBillModal;
window.saveBill = saveBill;
window.editBill = editBill;
window.markBillPaid = markBillPaid;
window.deleteBill = deleteBill;
window.filterBills = filterBills;
window.debouncedFilterBills = debouncedFilterBills;
window.exportBills = exportBills;
window.handleBillCustomerSelect = handleBillCustomerSelect;
