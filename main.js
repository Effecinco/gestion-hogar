// ─── ESTADO GLOBAL ────────────────────────────────────────────
let categoryChart = null;
let isSyncing = false;

let currentData = {
    transactions: JSON.parse(localStorage.getItem('hogar_v1_data')) || [],
    cloudUrl: localStorage.getItem('hogar_v1_cloud_url') || ''
};

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setupEventListeners();
    updateUI();
    document.getElementById('current-date').textContent =
        new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Si hay URL de nube, sincronizar UNA SOLA VEZ al inicio
    if (currentData.cloudUrl) {
        fetchCloudData();
    }
});

// ─── SINCRONIZACIÓN NUBE (solo una vez, sin loops) ────────────
async function fetchCloudData() {
    if (isSyncing) return;
    isSyncing = true;
    try {
        const res = await fetch(currentData.cloudUrl);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            currentData.transactions = data.map(t => ({
                id: t.id || Date.now() + Math.random(),
                type: t.type || t.Tipo || 'gasto',
                monto: parseFloat(t.monto || t.Monto || 0),
                categoria: t.categoria || t.Categoria || 'Varios',
                detalle: t.detalle || t.Detalle || '',
                responsable: t.responsable || t.Responsable || 'Casa',
                fecha: t.fecha || t.Fecha || new Date().toISOString().split('T')[0]
            }));
            localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));
            updateUI();
        }
    } catch (e) {
        console.warn('Sin conexión a la nube. Usando datos locales.');
    } finally {
        isSyncing = false;
    }
}

// ─── EVENT LISTENERS ───────────────────────────────────────────
function setupEventListeners() {
    // Modal nuevo movimiento
    document.getElementById('add-transaction-btn').onclick = () =>
        document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('close-modal').onclick = () =>
        document.getElementById('modal-overlay').classList.add('hidden');

    // Modal nube
    document.getElementById('sync-btn').onclick = () => {
        document.getElementById('cloud-url').value = currentData.cloudUrl;
        document.getElementById('sync-modal').classList.remove('hidden');
    };
    document.getElementById('close-sync-modal').onclick = () =>
        document.getElementById('sync-modal').classList.add('hidden');

    // Guardar URL de nube
    document.getElementById('save-sync').onclick = () => {
        const url = document.getElementById('cloud-url').value.trim();
        currentData.cloudUrl = url;
        localStorage.setItem('hogar_v1_cloud_url', url);
        document.getElementById('sync-modal').classList.add('hidden');
        if (url) fetchCloudData();
        else alert('URL guardada.');
    };

    // Formulario de nuevo movimiento
    document.getElementById('transaction-form').onsubmit = (e) => {
        e.preventDefault();
        const tx = {
            id: Date.now(),
            type: document.querySelector('input[name="type"]:checked').value,
            monto: parseFloat(document.getElementById('monto').value),
            categoria: document.getElementById('categoria').value,
            detalle: document.getElementById('detalle').value,
            responsable: document.getElementById('responsable').value || 'Casa',
            fecha: new Date().toISOString().split('T')[0]
        };
        saveTransaction(tx);
        e.target.reset();
        document.getElementById('modal-overlay').classList.add('hidden');
    };

    // Filtros - solo búsqueda en texto, sin disparar fetchCloudData
    document.getElementById('table-search').oninput = renderFilteredTable;
    document.getElementById('filter-type').onchange = renderFilteredTable;
}

// ─── GUARDAR TRANSACCIÓN ───────────────────────────────────────
function saveTransaction(tx) {
    currentData.transactions.push(tx);
    localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));

    if (currentData.cloudUrl) {
        fetch(currentData.cloudUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(tx)
        }).catch(() => {});
    }
    updateUI();
}

// ─── UPDATE UI (solo una vez por ciclo, sin loop) ──────────────
function updateUI() {
    renderTotals();
    renderFilteredTable();
    renderCategoryChart();
}

// ─── TOTALES ───────────────────────────────────────────────────
function renderTotals() {
    const data = currentData.transactions;
    const income = data.filter(t => t.type === 'ingreso').reduce((s,t) => s + parseFloat(t.monto || 0), 0);
    const expenses = data.filter(t => t.type === 'gasto').reduce((s,t) => s + parseFloat(t.monto || 0), 0);

    document.getElementById('total-balance').textContent = `$ ${Math.round(income - expenses).toLocaleString('es-AR')}`;
    document.getElementById('total-income').textContent = `$ ${Math.round(income).toLocaleString('es-AR')}`;
    document.getElementById('total-expenses').textContent = `$ ${Math.round(expenses).toLocaleString('es-AR')}`;

    const rate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;
    document.getElementById('savings-rate').textContent = `${rate}%`;
}

// ─── TABLA (solo se dispara por filtros o updateUI) ────────────
function renderFilteredTable() {
    const search = document.getElementById('table-search').value.toLowerCase();
    const typeFilter = document.getElementById('filter-type').value;

    const filtered = currentData.transactions.filter(t => {
        const match = (t.detalle || '').toLowerCase().includes(search) ||
                      (t.categoria || '').toLowerCase().includes(search);
        const typeOk = typeFilter === 'all' || t.type === typeFilter;
        return match && typeOk;
    });

    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:3rem;">
            Sin movimientos. Cargá el primero con el botón de arriba.
        </td></tr>`;
        return;
    }

    [...filtered].reverse().forEach(t => {
        const fecha = String(t.fecha || '').split('T')[0];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color:var(--text-dim);font-size:0.7rem;">${fecha}</td>
            <td style="font-weight:700;">${t.categoria || ''}</td>
            <td>${t.detalle || ''}</td>
            <td style="color:var(--text-dim);">${t.responsable || ''}</td>
            <td class="text-right price-cell ${t.type === 'ingreso' ? 'income-text' : 'expense-text'}">
                ${t.type === 'ingreso' ? '+' : '-'} $ ${Math.round(parseFloat(t.monto || 0)).toLocaleString('es-AR')}
            </td>
            <td><span class="status-tag status-paid">${(t.type || '').toUpperCase()}</span></td>
            <td class="text-right">
                <button onclick="deleteTx(${t.id})" style="background:transparent;border:none;color:rgba(255,255,255,0.15);cursor:pointer;">
                    <i data-lucide="trash-2" style="width:14px;"></i>
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

// ─── BORRAR MOVIMIENTO ─────────────────────────────────────────
function deleteTx(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    currentData.transactions = currentData.transactions.filter(t => t.id !== id);
    localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));
    updateUI();
}

// ─── GRÁFICO DONA (solo categorías de gastos) ──────────────────
function renderCategoryChart() {
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }

    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;

    const gastos = currentData.transactions.filter(t => t.type === 'gasto');
    const cats = {};
    gastos.forEach(t => {
        const cat = t.categoria || 'Varios';
        cats[cat] = (cats[cat] || 0) + parseFloat(t.monto || 0);
    });

    const hasData = Object.keys(cats).length > 0;
    categoryChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: hasData ? Object.keys(cats) : ['Sin gastos'],
            datasets: [{
                data: hasData ? Object.values(cats) : [1],
                backgroundColor: hasData
                    ? ['#6366f1','#10b981','#ef4444','#f59e0b','#ec4899','#8b5cf6','#06b6d4']
                    : ['#27272a'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { position: 'bottom', labels: { color: '#71717a', font: { size: 9 } } } }
        }
    });
}

// ─── EXPORTAR CSV ──────────────────────────────────────────────
function exportToCSV() {
    let csv = 'Fecha,Tipo,Monto,Categoria,Detalle,Responsable\n';
    currentData.transactions.forEach(t => {
        csv += `${t.fecha},${t.type},${t.monto},${t.categoria},"${t.detalle}",${t.responsable}\n`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `gestion_hogar_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}
