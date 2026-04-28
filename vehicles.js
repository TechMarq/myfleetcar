// window.tempVehicles is now initialized in supabase-config.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check if we are on the Client Profile page
    if (window.location.pathname.includes('perfil-cliente.html')) {
        initClientProfile();
    } 
    // 2. Check if we are on the Client Registration page
    else if (window.location.pathname.includes('cadastro-cliente.html')) {
        initClientRegistration();
    }

    // 3. Setup Modal Event Listeners
    setupModalListeners();
});

/**
 * Initializes the client profile view
 */
async function initClientProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');

    if (!clientId) return;

    loadClientDetails(clientId);
    loadClientVehicles(clientId);
    loadClientHistory(clientId);

    const vehicleForm = document.getElementById('vehicle-form');
    if (vehicleForm) {
        vehicleForm.addEventListener('submit', (e) => handleVehicleSubmit(e, clientId));
    }

    // Setup Create OS button
    const btnCreateOS = document.getElementById('btn-create-os');
    if (btnCreateOS) {
        btnCreateOS.addEventListener('click', () => {
            window.location.href = `nova-ordem.html?customer_id=${clientId}`;
        });
    }
}

/**
 * Initializes the client registration view
 */
function initClientRegistration() {
    const vehicleForm = document.getElementById('vehicle-form');
    if (vehicleForm) {
        vehicleForm.addEventListener('submit', handleTempVehicleSubmit);
    }
    
    // Intercept client form submit to save temp vehicles
    const clientForm = document.getElementById('client-form');
    // Note: clients.js already handles this, we might need to hook into it or just warn user.
}

/**
 * Loads client info from Supabase
 */
async function loadClientDetails(clientId) {
    try {
        const { data, error } = await MyFleetCar.DB.select('customers', {
            match: { id: clientId }
        });

        if (error) throw error;
        if (!data || data.length === 0) return;

        const client = data[0];

        // Update UI
        document.getElementById('client-name-display').textContent = client.full_name;
        
        const infoContainer = document.getElementById('client-personal-info');
        if (infoContainer) {
            infoContainer.innerHTML = `
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">E-mail</p>
                    <p class="text-sm font-medium text-on-surface">${client.email || 'Sem e-mail'}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Telefone</p>
                    <p class="text-sm font-medium text-on-surface">${client.phone || '-'}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CPF / CNPJ</p>
                    <p class="text-sm font-medium text-on-surface">${client.cpf_cnpj || '-'}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Endereço / Obs</p>
                    <p class="text-sm font-medium text-on-surface">${client.address || '-'}</p>
                </div>
            `;
        }

    } catch (err) {
        console.error('Error loading client details:', err);
    }
}

/**
 * Loads vehicles for a specific client
 */
async function loadClientVehicles(clientId) {
    const listContainer = document.getElementById('client-vehicles-list');
    const countBadge = document.getElementById('vehicle-count');
    
    if (!listContainer) return;

    try {
        const { data: vehicles, error } = await MyFleetCar.DB.select('vehicles', {
            match: { customer_id: clientId },
            order: { column: 'created_at', ascending: false }
        });

        if (error) throw error;
        console.log(`Loaded ${vehicles ? vehicles.length : 0} vehicles for profile:`, vehicles);

        if (countBadge) countBadge.textContent = vehicles ? vehicles.length : 0;

        if (!vehicles || vehicles.length === 0) {
            listContainer.innerHTML = `
                <div class="py-10 text-center text-slate-400 text-xs italic bg-white rounded-xl border border-dashed border-slate-200">
                    Nenhum veículo cadastrado.
                </div>
            `;
            return;
        }

        listContainer.innerHTML = vehicles.map(v => `
            <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-orange-200 transition-all">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                        <span class="material-symbols-outlined">directions_car</span>
                    </div>
                    <div>
                        <div class="text-sm font-black text-on-surface tracking-wider uppercase">${v.license_plate}</div>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-[10px] text-slate-500 font-bold uppercase">${v.brand} ${v.model}</span>
                            ${v.year ? `<span class="text-[10px] text-slate-400 font-medium">• ${v.year}</span>` : ''}
                            ${v.color ? `<span class="text-[10px] text-slate-400 font-medium">• ${v.color}</span>` : ''}
                        </div>
                    </div>
                </div>
                <button onclick="deleteVehicle('${v.id}', '${clientId}')" class="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error loading vehicles:', err);
        listContainer.innerHTML = `<p class="text-xs text-red-500 p-4">Erro ao carregar veículos.</p>`;
    }
}

/**
 * Deletes a vehicle
 */
window.deleteVehicle = async (vehicleId, clientId) => {
    if (!confirm('Tem certeza que deseja excluir este veículo?')) return;

    try {
        const { error } = await MyFleetCar.DB.delete('vehicles', { id: vehicleId });
        if (error) throw error;

        loadClientVehicles(clientId);
    } catch (err) {
        console.error('Error deleting vehicle:', err);
        alert('Erro ao excluir veículo: ' + err.message);
    }
};

/**
 * Setup modal opening/closing
 */
function setupModalListeners() {
    const modal = document.getElementById('vehicle-modal');
    const btnAdd = document.getElementById('btn-add-vehicle');
    const btnClose = document.getElementById('close-vehicle-modal');
    const btnCancel = document.getElementById('cancel-vehicle');

    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    }

    const closeModal = () => {
        modal.classList.add('hidden');
        document.getElementById('vehicle-form').reset();
    };

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    // Close on backdrop click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

/**
 * Handle vehicle form submission
 */
async function handleVehicleSubmit(e, clientId) {
    e.preventDefault();
    
    const { data: { user } } = await MyFleetCar.Auth.getUser();
    if (!user) {
        alert('Sessão expirada.');
        return;
    }

    const vehicleData = {
        workshop_id: user.id,
        customer_id: clientId,
        license_plate: document.getElementById('v-plate').value.toUpperCase(),
        brand: document.getElementById('v-brand').value,
        model: document.getElementById('v-model').value,
        year: parseInt(document.getElementById('v-year').value) || null,
        color: document.getElementById('v-color').value,
        vin: document.getElementById('v-vin').value
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SALVANDO...';

    try {
        const { error } = await MyFleetCar.DB.insert('vehicles', vehicleData);
        if (error) throw error;

        // Success
        document.getElementById('vehicle-modal').classList.add('hidden');
        e.target.reset();
        loadClientVehicles(clientId);
        
        // Show notification (if toast exists)
        const toast = document.getElementById('toast');
        if (toast) {
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 3000);
        }

    } catch (err) {
        console.error('Error saving vehicle:', err);
        alert('Erro ao salvar veículo: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'SALVAR VEÍCULO';
    }
}

/**
 * Handle vehicle submission during client registration (In-Memory)
 */
function handleTempVehicleSubmit(e) {
    e.preventDefault();

    const vehicle = {
        id: Date.now().toString(), // Temp ID
        license_plate: document.getElementById('v-plate').value.toUpperCase(),
        brand: document.getElementById('v-brand').value,
        model: document.getElementById('v-model').value,
        year: parseInt(document.getElementById('v-year').value) || null,
        color: document.getElementById('v-color').value,
        vin: document.getElementById('v-vin').value
    };

    tempVehicles.push(vehicle);
    document.getElementById('vehicle-modal').classList.add('hidden');
    e.target.reset();
    window.renderVehicles();
}

/**
 * Renders vehicles list (handles both temp and real vehicles for display)
 */
window.renderVehicles = function(vehiclesToRender) {
    const listContainer = document.getElementById('client-vehicles-list');
    if (!listContainer) return;

    const list = vehiclesToRender || tempVehicles;

    if (list.length === 0) {
        listContainer.innerHTML = `
            <div class="border-2 border-dashed border-outline-variant/20 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
                <div class="h-12 w-12 rounded-full bg-surface-container-high flex items-center justify-center text-slate-400">
                    <span class="material-symbols-outlined text-2xl">directions_car</span>
                </div>
                <div class="text-center">
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum veículo adicionado</span>
                </div>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = list.map(v => `
        <div class="p-4 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-orange-200 transition-all">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <span class="material-symbols-outlined">directions_car</span>
                </div>
                <div>
                    <div class="text-sm font-black text-on-surface tracking-wider uppercase">${v.license_plate}</div>
                    <div class="text-[10px] text-slate-500 font-bold uppercase">${v.brand} ${v.model}</div>
                </div>
            </div>
            ${v.customer_id ? `
                <button onclick="deleteVehicle('${v.id}', '${v.customer_id}')" class="p-2 text-slate-300 hover:text-red-500 transition-all" title="Excluir do Banco">
                    <span class="material-symbols-outlined text-sm">delete</span>
                </button>
            ` : `
                <button onclick="removeTempVehicle('${v.id}')" class="p-2 text-slate-300 hover:text-red-500 transition-all" title="Remover da Lista">
                    <span class="material-symbols-outlined text-sm">remove_circle</span>
                </button>
            `}
        </div>
    `).join('');
}

window.removeTempVehicle = (id) => {
    tempVehicles = tempVehicles.filter(v => v.id !== id);
    window.renderVehicles();
};

/**
 * Loads the client's service order history and updates performance indicators
 */
async function loadClientHistory(clientId) {
    const tableBody = document.getElementById('client-orders-history');
    if (!tableBody) return;

    try {
        const { data: orders, error } = await MyFleetCar.DB.select('service_orders', {
            match: { customer_id: clientId },
            select: '*, vehicles(brand, model, license_plate)',
            order: { column: 'created_at', ascending: false }
        });

        if (error) throw error;

        if (!orders || orders.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-20 text-center text-slate-400 text-xs italic">Nenhuma ordem de serviço encontrada.</td></tr>';
            updateIndicators(0, 0, 0);
            return;
        }

        // Calculate Indicators
        // We consider "Spent" only for Completed orders.
        // We consider "Visits" for all orders except Cancelled.
        const completedOrders = orders.filter(o => ['Concluído', 'Finalizada', 'Completed'].includes(o.status));
        const activeOrders = orders.filter(o => !['Cancelado', 'Cancelled', 'Excluída'].includes(o.status));

        const totalSpent = completedOrders.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);
        const totalVisits = activeOrders.length;
        const avgTicket = totalVisits > 0 ? totalSpent / totalVisits : 0;

        updateIndicators(totalSpent, totalVisits, avgTicket);

        // Render Table
        tableBody.innerHTML = orders.map(o => {
            const date = new Date(o.created_at).toLocaleDateString('pt-BR');
            const vehicle = o.vehicles ? `${o.vehicles.brand} ${o.vehicles.model} (${o.vehicles.license_plate})` : 'N/A';
            const statusColor = o.status === 'Concluído' ? 'text-green-600 bg-green-50' : 
                               o.status === 'Em Andamento' ? 'text-blue-600 bg-blue-50' : 
                               o.status === 'Cancelado' ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-100';

            return `
                <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="window.location.href='detalhes-ordem.html?id=${o.id}'">
                    <td class="px-6 py-4 text-xs font-medium text-slate-500">${date}</td>
                    <td class="px-6 py-4">
                        <div class="text-[10px] font-bold text-on-surface uppercase">${vehicle}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-xs text-slate-600 line-clamp-1">${o.description || 'Manutenção'}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${statusColor}">${o.status}</span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <div class="text-sm font-black text-on-surface">R$ ${(o.total_amount || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <span class="material-symbols-outlined text-slate-300">chevron_right</span>
                    </td>
                </tr>
            `;
        }).join('');

        // Update pagination info if applicable
        const pagInfo = document.getElementById('pagination-info');
        if (pagInfo) pagInfo.textContent = `Mostrando ${orders.length} de ${orders.length} registros`;

    } catch (err) {
        console.error('Error loading client history:', err);
    }
}

function updateIndicators(total, visits, avg) {
    const spentHeader = document.getElementById('client-total-spent');
    const spentCard = document.getElementById('card-total-spent');
    const visitsCard = document.getElementById('card-visits');
    const avgCard = document.getElementById('card-avg-ticket');

    const barSpent = document.getElementById('bar-total-spent');
    const barVisits = document.getElementById('bar-visits');
    const barAvg = document.getElementById('bar-avg-ticket');

    if (spentHeader) spentHeader.textContent = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits: 2});
    if (spentCard) spentCard.textContent = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits: 0});
    if (visitsCard) visitsCard.innerHTML = `${visits} <span class="text-sm font-medium text-slate-400">Ordens</span>`;
    if (avgCard) avgCard.textContent = 'R$ ' + avg.toLocaleString('pt-BR', {minimumFractionDigits: 0});

    // Update Progress Bars (Relative scales)
    if (barSpent) barSpent.style.width = total > 0 ? '80%' : '0%';
    if (barVisits) barVisits.style.width = visits > 0 ? '60%' : '0%';
    if (barAvg) barAvg.style.width = avg > 0 ? '70%' : '0%';
}
