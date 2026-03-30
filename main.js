// ─── ESTADO GLOBAL ────────────────────────────────────────────
let categoryChart = null;
let balanceChart = null;
let isSyncing = false;
let currentCurrency = 'ARS';
let currentPeriod = 'month';
let editingId = null;

let currentData = {
    transactions: JSON.parse(localStorage.getItem('hogar_v1_data')) || [],
    fixedExpenses: JSON.parse(localStorage.getItem('hogar_v1_fixed')) || [
        { id: 1, categoria: 'Alquiler/Expensas', detalle: 'Alquiler mensual', monto: 0 },
        { id: 2, categoria: 'Servicios/Impuestos', detalle: 'Luz/Gas/Agua', monto: 0 }
    ],
    cloudUrl: localStorage.getItem('hogar_v1_cloud_url') || 'https://script.google.com/macros/s/AKfycbxnUr7xSJTQd8ZAngmH44o-vH54tUdS-lnTNVb3J9sO140AcJhwVi5qPP-mTwupnQFL/exec'
};

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setupEventListeners();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-tx').value = today;
    updateUI();
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (currentData.cloudUrl) fetchCloudData();
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    const btn = [...document.querySelectorAll('.nav-item')].find(b => b.onclick.toString().includes(tabId));
    if(btn) btn.classList.add('active');
    updateUI();
}

function fetchCloudData() {
    if (isSyncing || !currentData.cloudUrl) return;
    isSyncing = true;
    const syncBtn = document.getElementById('sync-btn');
    const originalText = syncBtn.innerHTML;
    syncBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i>';
    lucide.createIcons();

    fetch(currentData.cloudUrl.trim())
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                currentData.transactions = data.map(t => {
                    const k = Object.keys(t).reduce((acc, c) => {
                        acc[c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] = t[c];
                        return acc;
                    }, {});
                    return {
                        id: k.id || Math.random(),
                        type: (k.tipo || k.type || 'gasto').toLowerCase(),
                        monto: parseFloat(k.monto || 0),
                        categoria: k.categoria || k.category || 'Varios',
                        detalle: k.detalle || k.detail || '',
                        responsable: k.responsable || 'Casa',
                        fecha: k.fecha ? (typeof k.fecha === 'string' ? k.fecha.split('T')[0] : new Date(k.fecha).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]
                    };
                });
                localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));
                updateUI();
                showToast('¡Datos actualizados!');
            }
        })
        .catch(() => showToast('⚠️ Error de conexión'))
        .finally(() => {
            isSyncing = false;
            syncBtn.innerHTML = originalText;
            lucide.createIcons();
        });
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

function setupEventListeners() {
    document.getElementById('add-transaction-btn').onclick = () => {
        editingId = null;
        document.getElementById('transaction-form').reset();
        document.querySelector('.modal-header h3').textContent = 'NUEVO MOVIMIENTO';
        document.getElementById('modal-overlay').classList.remove('hidden');
    };
    document.getElementById('close-modal').onclick = () => document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('sync-btn').onclick = () => fetchCloudData();
    document.getElementById('close-sync-modal').onclick = () => document.getElementById('sync-modal').classList.add('hidden');

    document.getElementById('select-period').onchange = (e) => {
        currentPeriod = e.target.value;
        updateUI();
    };

    document.getElementById('save-sync').onclick = () => {
        const url = document.getElementById('cloud-url').value.trim();
        if (url.includes('docs.google.com/spreadsheets')) return alert('Usa la URL del Script (/exec)');
        currentData.cloudUrl = url;
        localStorage.setItem('hogar_v1_cloud_url', url);
        document.getElementById('sync-modal').classList.add('hidden');
        fetchCloudData();
    };

    document.getElementById('transaction-form').onsubmit = (e) => {
        e.preventDefault();
        const tx = {
            id: editingId || Date.now(),
            type: document.querySelector('input[name="type"]:checked').value,
            monto: parseFloat(document.getElementById('monto').value),
            categoria: document.getElementById('categoria').value,
            detalle: document.getElementById('detalle').value,
            responsable: document.getElementById('responsable').value || 'Casa',
            fecha: document.getElementById('fecha-tx').value
        };
        saveTransaction(tx);
        document.getElementById('modal-overlay').classList.add('hidden');
    };

    document.getElementById('table-search').oninput = updateTable;
    document.getElementById('filter-type').onchange = updateTable;
}

async function saveTransaction(tx) {
    if (editingId) {
        currentData.transactions = currentData.transactions.map(t => t.id === editingId ? tx : t);
    } else {
        currentData.transactions.push(tx);
    }
    localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));
    updateUI();

    if (currentData.cloudUrl) {
        fetch(currentData.cloudUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(tx) });
        setTimeout(fetchCloudData, 2000);
    }
}

function updateUI() {
    const data = filterDataByPeriod(currentData.transactions);
    renderTotals(data);
    updateTable(data);
    renderCharts(data);
    renderBudget(data);
    renderFixedExpenses();
    renderSavings();
}

function filterDataByPeriod(allData) {
    const now = new Date();
    if (currentPeriod === 'history') return allData;
    
    return allData.filter(t => {
        const d = new Date(t.fecha);
        if (currentPeriod === 'month') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        if (currentPeriod === 'year') {
            return d.getFullYear() === now.getFullYear();
        }
        return true;
    });
}

function renderTotals(data) {
    const income = data.filter(t => t.type === 'ingreso' && !t.categoria.includes('Ahorro')).reduce((s,t) => s + t.monto, 0);
    const expenses = data.filter(t => t.type === 'gasto').reduce((s,t) => s + t.monto, 0);
    
    document.getElementById('total-balance').textContent = `$ ${Math.round(income - expenses).toLocaleString('es-AR')}`;
    document.getElementById('home-income').textContent = `$ ${Math.round(income).toLocaleString('es-AR')}`;
    document.getElementById('home-expenses').textContent = `$ ${Math.round(expenses).toLocaleString('es-AR')}`;
    
    const rate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;
    document.getElementById('savings-rate').textContent = `${rate}% ahorro`;
    
    const periodNames = { month: 'ESTE MES', year: 'ESTE AÑO', history: 'TODO EL HISTORIAL' };
    document.getElementById('period-label').textContent = periodNames[currentPeriod];
}

function addFixedExpense() {
    const cat = prompt('Categoría (ej: Alquiler, Internet):', 'Varios');
    const det = prompt('Detalle:', 'Gasto mensual');
    const monto = parseFloat(prompt('Monto sugerido:', '0'));
    if (!cat) return;
    
    const newFixed = { id: Date.now(), categoria: cat, detalle: det, monto: monto };
    currentData.fixedExpenses.push(newFixed);
    localStorage.setItem('hogar_v1_fixed', JSON.stringify(currentData.fixedExpenses));
    renderFixedExpenses();
}

function deleteFixed(id) {
    if(confirm('¿Eliminar gasto fijo?')) {
        currentData.fixedExpenses = currentData.fixedExpenses.filter(f => f.id !== id);
        localStorage.setItem('hogar_v1_fixed', JSON.stringify(currentData.fixedExpenses));
        renderFixedExpenses();
    }
}

function payFixed(id) {
    const f = currentData.fixedExpenses.find(x => x.id === id);
    const monto = parseFloat(prompt(`Monto a pagar para ${f.categoria}:`, f.monto));
    if (isNaN(monto)) return;
    
    const tx = {
        id: Date.now(),
        type: 'gasto',
        monto: monto,
        categoria: f.categoria,
        detalle: f.detalle,
        responsable: 'Casa',
        fecha: new Date().toISOString().split('T')[0]
    };
    saveTransaction(tx);
    showToast('¡Pago registrado!');
}

function renderFixedExpenses() {
    const list = document.getElementById('fixed-expenses-list');
    list.innerHTML = '';
    
    currentData.fixedExpenses.forEach(f => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '0.8rem';
        div.style.background = 'rgba(255,255,255,0.02)';
        div.style.border = '1px solid rgba(255,255,255,0.05)';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div onclick="payFixed(${f.id})" style="cursor:pointer; flex: 1;">
                    <h4 style="font-size:0.8rem; color:var(--primary);">${f.categoria}</h4>
                    <p style="font-size:0.6rem; opacity:0.6;">${f.detalle}</p>
                    <div style="font-weight:700; font-size:0.9rem; margin-top:0.2rem;">$ ${f.monto.toLocaleString('es-AR')}</div>
                </div>
                <div style="display:flex; gap: 0.5rem;">
                    <button onclick="deleteFixed(${f.id})" style="background:none; border:none; color:#ef4444; opacity:0.5; padding:0.5rem;"><i data-lucide="trash-2" style="width:16px;"></i></button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
    lucide.createIcons();
}

function renderFixedExpenses() {
    const list = document.getElementById('fixed-expenses-list');
    const fixed = currentData.transactions.filter(t => t.categoria.includes('Alquiler') || t.categoria.includes('Servicios'));
    list.innerHTML = fixed.length ? '' : '<p style="color:var(--text-dim); font-size:0.8rem;">No hay gastos fijos detectados.</p>';
    
    const uniqueFixed = Array.from(new Set(fixed.map(t => t.categoria)));
    uniqueFixed.forEach(cat => {
        const last = fixed.filter(t => t.categoria === cat).sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const div = document.createElement('div');
        div.className = 'card';
        div.style.padding = '1rem';
        div.style.background = 'rgba(255,255,255,0.02)';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div><h4 style="font-size:0.8rem;">${cat}</h4><small style="color:var(--text-dim)">Último: ${last.fecha}</small></div>
                <div style="font-weight:700;">$ ${last.monto.toLocaleString('es-AR')}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

function setCurrency(curr) {
    currentCurrency = curr;
    document.querySelectorAll('.currency-btn').forEach(b => b.classList.toggle('active', b.textContent === curr));
    renderSavings();
}

function renderSavings() {
    const data = currentData.transactions;
    const ars = data.filter(t => t.categoria.includes('Sueldo') || t.categoria === 'Ahorro ARS').reduce((s,t) => s + (t.type === 'ingreso' ? t.monto : -t.monto), 0);
    const usd = data.filter(t => t.categoria === 'Ahorro USD').reduce((s,t) => s + (t.type === 'ingreso' ? t.monto : -t.monto), 0);

    document.getElementById('savings-ars').textContent = `$ ${Math.round(ars).toLocaleString('es-AR')}`;
    document.getElementById('savings-usd').textContent = `u$s ${Math.round(usd).toLocaleString('es-AR')}`;
    document.getElementById('savings-display').textContent = currentCurrency === 'ARS' ? `$ ${Math.round(ars).toLocaleString('es-AR')}` : `u$s ${Math.round(usd).toLocaleString('es-AR')}`;
}

function updateTable() {
    const search = document.getElementById('table-search').value.toLowerCase();
    const typeFilter = document.getElementById('filter-type').value;
    const filtered = currentData.transactions.filter(t => {
        const match = (t.detalle || '').toLowerCase().includes(search) || (t.categoria || '').toLowerCase().includes(search);
        return match && (typeFilter === 'all' || t.type === typeFilter);
    });
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';
    [...filtered].sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.fecha.split('-').slice(1).reverse().join('/')}</td>
            <td style="font-weight:700;">${t.categoria.substring(0,8)}..</td>
            <td>${t.detalle}</td>
            <td class="text-right ${t.type === 'ingreso' ? 'income-text' : 'expense-text'}">$${Math.round(t.monto).toLocaleString('es-AR')}</td>
            <td><button onclick="editTx(${t.id})" style="background:none; border:none; color:var(--text-dim);"><i data-lucide="edit-2" style="width:14px;"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function editTx(id) {
    const tx = currentData.transactions.find(t => t.id === id);
    if (!tx) return;
    editingId = id;
    document.getElementById('monto').value = tx.monto;
    document.getElementById('categoria').value = tx.categoria;
    document.getElementById('detalle').value = tx.detalle;
    document.getElementById('fecha-tx').value = tx.fecha;
    document.getElementById('responsable').value = tx.responsable;
    document.getElementById(`type-${tx.type}`).checked = true;
    document.querySelector('.modal-header h3').textContent = 'EDITAR MOVIMIENTO';
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function renderCharts() {
    if (categoryChart) categoryChart.destroy();
    if (balanceChart) balanceChart.destroy();
    const ctxD = document.getElementById('categoryChart').getContext('2d');
    const expensesOnly = currentData.transactions.filter(t => t.type === 'gasto');
    const cats = {};
    expensesOnly.forEach(t => cats[t.categoria] = (cats[t.categoria] || 0) + t.monto);

    categoryChart = new Chart(ctxD, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats),
            datasets: [{ data: Object.values(cats), backgroundColor: ['#6366f1','#10b981','#ef4444','#f59e0b','#ec4899','#8b5cf6'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    });

    const ctxB = document.getElementById('balanceChart').getContext('2d');
    const labels = [];
    const incomes = [];
    const exps = [];
    const now = new Date();
    for(let i=3; i>=0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
        labels.push(d.toLocaleString('es-AR', {month: 'short'}).toUpperCase());
        const monthly = currentData.transactions.filter(t => {
            const dt = new Date(t.fecha);
            return dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear();
        });
        incomes.push(monthly.filter(t => t.type === 'ingreso').reduce((s,t) => s + t.monto, 0));
        exps.push(monthly.filter(t => t.type === 'gasto').reduce((s,t) => s + t.monto, 0));
    }
    balanceChart = new Chart(ctxB, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'INC', data: incomes, backgroundColor: '#10b981', borderRadius: 4 }, { label: 'EXP', data: exps, backgroundColor: '#ef4444', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { ticks: { font: { size: 9 } } } } }
    });
}

function renderBudget() {
    const data = currentData.transactions;
    const now = new Date();
    const currentMonth = data.filter(t => {
        const d = new Date(t.fecha);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const income = currentMonth.filter(t => t.type === 'ingreso').reduce((s,t) => s + t.monto, 0);
    const expenses = currentMonth.filter(t => t.type === 'gasto').reduce((s,t) => s + t.monto, 0);
    const percent = income > 0 ? (expenses / income) * 100 : 0;
    const bar = document.getElementById('budget-progress');
    if(bar) bar.style.width = `${Math.min(percent, 100)}%`;
}

function exportToCSV() {
    let csv = 'Fecha,Tipo,Monto,Categoria,Detalle,Responsable\n';
    currentData.transactions.forEach(t => {
        csv += `${t.fecha},${t.type},${t.monto},${t.categoria},"${t.detalle}",${t.responsable}\n`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `finanzas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}
