// ─── ESTADO GLOBAL ────────────────────────────────────────────
let categoryChart = null;
let balanceChart = null;
let isSyncing = false;

let currentData = {
    transactions: JSON.parse(localStorage.getItem('hogar_v1_data')) || [],
    cloudUrl: localStorage.getItem('hogar_v1_cloud_url') || 'https://script.google.com/macros/s/AKfycbysnI2gWZe-Z1Kd7Aj1s6aGLrfvdmhCjunT2WUJyTAhjboh8VdDt031pjuhdAHU32CY/exec'
};

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setupEventListeners();
    
    // Fecha por defecto en el modal (hoy)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-tx').value = today;
    
    updateUI();
    document.getElementById('current-date').textContent =
        new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (currentData.cloudUrl) {
        fetchCloudData();
    }
});

function fetchCloudData() {
    if (isSyncing || !currentData.cloudUrl) return;
    isSyncing = true;
    const syncBtn = document.getElementById('sync-btn');
    const originalText = syncBtn.innerHTML;
    syncBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> ...';
    lucide.createIcons();

    fetch(currentData.cloudUrl)
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                // Sobrescribir lo local con lo de la planilla para unificar
                currentData.transactions = data.map(t => {
                    // Normalización local ultra-segura
                    const keys = Object.keys(t).reduce((acc, k) => {
                        const cleanK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        acc[cleanK] = t[k];
                        return acc;
                    }, {});

                    const type = (keys.tipo || keys.type || 'gasto').toLowerCase();
                    const monto = parseFloat(keys.monto || 0);
                    const categoria = keys.categoria || keys.category || 'Varios';
                    const detalle = keys.detalle || keys.detail || '';
                    const responsable = keys.responsable || keys.user || 'Casa';
                    const fechaRaw = keys.fecha || keys.date || new Date().toISOString();
                    
                    return {
                        id: Math.random(), // Generamos nuevos IDs temporales
                        type: type,
                        monto: monto,
                        categoria: categoria,
                        detalle: detalle,
                        responsable: responsable,
                        fecha: typeof fechaRaw === 'object' ? new Date(fechaRaw).toISOString().split('T')[0] : (typeof fechaRaw === 'string' ? fechaRaw.split('T')[0] : new Date().toISOString().split('T')[0])
                    };
                });
                
                localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));
                updateUI();
                showToast('¡Datos sincronizados!');
            }
        })
        .catch(e => {
            console.error(e);
            showToast('⚠️ Error: Revisa tu URL de la Nube');
        })
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
    document.getElementById('add-transaction-btn').onclick = () =>
        document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('close-modal').onclick = () =>
        document.getElementById('modal-overlay').classList.add('hidden');

    document.getElementById('sync-btn').onclick = async () => {
        if (currentData.cloudUrl) {
            await fetchCloudData();
        } else {
            document.getElementById('cloud-url').value = currentData.cloudUrl;
            document.getElementById('sync-modal').classList.remove('hidden');
        }
    };
    
    document.getElementById('close-sync-modal').onclick = () =>
        document.getElementById('sync-modal').classList.add('hidden');

    document.getElementById('save-sync').onclick = async () => {
        let url = document.getElementById('cloud-url').value.trim();
        
        // Validación: Si el usuario pega la URL de la planilla en vez de la del script
        if (url.includes('docs.google.com/spreadsheets')) {
            alert('¡Atención! Has copiado la planilla, no el Script. Debes seguir los pasos de la guía para obtener la URL que termina en "/exec".');
            return;
        }

        if (url && !url.includes('/macros/s/')) {
            alert('URL inválida. La URL debe ser la del Google Apps Script (termina en /exec)');
            return;
        }

        currentData.cloudUrl = url;
        localStorage.setItem('hogar_v1_cloud_url', url);
        document.getElementById('sync-modal').classList.add('hidden');
        showToast('Conectando...');
        if (url) await fetchCloudData();
        updateUI();
    };

    document.getElementById('transaction-form').onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'GUARDANDO...';

        const tx = {
            id: Date.now(),
            type: document.querySelector('input[name="type"]:checked').value,
            monto: parseFloat(document.getElementById('monto').value),
            categoria: document.getElementById('categoria').value,
            detalle: document.getElementById('detalle').value,
            responsable: document.getElementById('responsable').value || 'Casa',
            fecha: document.getElementById('fecha-tx').value
        };

        try {
            await saveTransaction(tx);
            e.target.reset();
            document.getElementById('fecha-tx').value = new Date().toISOString().split('T')[0];
            document.getElementById('modal-overlay').classList.add('hidden');
        } catch (err) {
            alert('Error al guardar el movimiento.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'GUARDAR';
        }
    };

    document.getElementById('table-search').oninput = updateTable;
    document.getElementById('filter-type').onchange = updateTable;
}

async function saveTransaction(tx) {
    // Guardar localmente primero para UX rápida
    currentData.transactions.push(tx);
    localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));
    updateUI();

    // Intentar subir a la nube
    if (currentData.cloudUrl) {
        try {
            // Usamos POST con formato que Google Apps Script digiere bien
            await fetch(currentData.cloudUrl, {
                method: 'POST',
                mode: 'no-cors', // Mantenemos no-cors por facilidad con GAS, pero alertamos si falla el fetch inicial
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tx)
            });
            // Refrescamos después de un breve delay para asegurar que el server procesó
            setTimeout(fetchCloudData, 1500);
        } catch (e) {
            console.warn('Error subiendo a la nube, quedó guardado localmente.', e);
        }
    }
}

function updateUI() {
    renderTotals();
    updateTable();
    renderCharts();
    renderBudget();
}

function renderTotals() {
    const data = currentData.transactions;
    const now = new Date();
    const currentMonthData = data.filter(t => {
        const d = new Date(t.fecha);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const income = currentMonthData.filter(t => t.type === 'ingreso').reduce((s,t) => s + t.monto, 0);
    const expenses = currentMonthData.filter(t => t.type === 'gasto').reduce((s,t) => s + t.monto, 0);

    // Balance total histórico
    const totalInc = data.filter(t => t.type === 'ingreso').reduce((s,t) => s + t.monto, 0);
    const totalExp = data.filter(t => t.type === 'gasto').reduce((s,t) => s + t.monto, 0);

    document.getElementById('total-balance').textContent = `$ ${Math.round(totalInc - totalExp).toLocaleString('es-AR')}`;
    document.getElementById('total-income').textContent = `$ ${Math.round(income).toLocaleString('es-AR')}`;
    document.getElementById('total-expenses').textContent = `$ ${Math.round(expenses).toLocaleString('es-AR')}`;
    
    const rate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;
    document.getElementById('savings-rate').textContent = `${rate}%`;
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
    bar.style.width = `${Math.min(percent, 100)}%`;
    
    if (percent > 90) bar.style.background = '#ef4444';
    else if (percent > 70) bar.style.background = '#f59e0b';
    else bar.style.background = 'linear-gradient(90deg, #6366f1, #a855f7)';

    document.getElementById('budget-info').textContent = 
        income > 0 ? `Gastado: ${percent.toFixed(1)}% de tus ingresos mes` : 'Sin ingresos este mes';
}

function updateTable() {
    const search = document.getElementById('table-search').value.toLowerCase();
    const typeFilter = document.getElementById('filter-type').value;

    const filtered = currentData.transactions.filter(t => {
        const match = (t.detalle || '').toLowerCase().includes(search) || (t.categoria || '').toLowerCase().includes(search);
        const typeOk = typeFilter === 'all' || t.type === typeFilter;
        return match && typeOk;
    });

    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = filtered.length ? '' : '<tr><td colspan="7" style="text-align:center;padding:2rem;">Sin datos.</td></tr>';

    [...filtered].sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.fecha}</td>
            <td style="font-weight:700;">${t.categoria}</td>
            <td>${t.detalle}</td>
            <td>${t.responsable}</td>
            <td class="text-right ${t.type === 'ingreso' ? 'income-text' : 'expense-text'}">
                $ ${Math.round(t.monto).toLocaleString('es-AR')}
            </td>
            <td><span class="status-tag">${t.type.toUpperCase()}</span></td>
            <td class="text-right"><button onclick="deleteTx(${t.id})" style="opacity:0.2;background:none;border:none;cursor:pointer;color:white;"><i data-lucide="trash-2" style="width:14px;"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function deleteTx(id) {
    if (confirm('¿Eliminar?')) {
        currentData.transactions = currentData.transactions.filter(t => t.id !== id);
        localStorage.setItem('hogar_v1_data', JSON.stringify(currentData.transactions));
        updateUI();
    }
}

function renderCharts() {
    if (categoryChart) categoryChart.destroy();
    if (balanceChart) balanceChart.destroy();

    // DONA
    const ctxD = document.getElementById('categoryChart').getContext('2d');
    const expensesOnly = currentData.transactions.filter(t => t.type === 'gasto');
    const cats = {};
    expensesOnly.forEach(t => cats[t.categoria] = (cats[t.categoria] || 0) + t.monto);

    categoryChart = new Chart(ctxD, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats).length ? Object.keys(cats) : ['Sin gastos'],
            datasets: [{
                data: Object.keys(cats).length ? Object.values(cats) : [1],
                backgroundColor: ['#6366f1','#10b981','#ef4444','#f59e0b','#ec4899','#8b5cf6'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    });

    // BARRAS EVOLUCIÓN
    const ctxB = document.getElementById('balanceChart').getContext('2d');
    const labels = [];
    const incomes = [];
    const exps = [];
    const now = new Date();

    for(let i=5; i>=0; i--) {
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
        data: {
            labels: labels,
            datasets: [
                { label: 'INGRESOS', data: incomes, backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'GASTOS', data: exps, backgroundColor: '#ef4444', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { font: { size: 9 } } }, x: { ticks: { font: { size: 9 } } } },
            plugins: { legend: { display: false } }
        }
    });
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
