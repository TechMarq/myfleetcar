/**
 * Service Orders Management Logic for MyFleetCar SaaS
 */

let laborServices = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Fetch Service Orders if on the list page
    if (document.getElementById('service-orders-list')) {
        loadServiceOrders();
        setupServiceOrderFilters();
    }

    // 2. Load Order Details if on the details page
    if (document.querySelector('.order-id-display')) {
        loadOrderDetails();
        setupOSItemInventorySearch();
    }

    // 3. Handle New Order Form if on the registration page
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        initNewOrderForm();
        orderForm.addEventListener('submit', handleNewOrder);
    }
});

// State for filtering
window.serviceOrdersState = {
    all: [],
    filtered: []
};


/**
 * Loads and displays the service orders list
 */
async function loadServiceOrders() {
    const listContainer = document.getElementById('service-orders-list');
    if (!listContainer) return;

    try {
        // Fetch service orders with customer and vehicle info
        const { data: orders, error } = await MyFleetCar.DB.select('service_orders', {
            select: '*, customers(full_name, phone), vehicles(brand, model, license_plate)',
            order: { column: 'created_at', ascending: false }
        });

        if (error) throw error;

        // Filter out soft-deleted orders
        window.serviceOrdersState.all = (orders || []).filter(o => o.status !== 'Excluída');
        
        applyServiceOrderFilters();
    } catch (err) {
        console.error('Error loading orders:', err);
        listContainer.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center text-red-500">Erro ao carregar ordens: ${err.message}</td></tr>`;
    }
}

function setupServiceOrderFilters() {
    const searchInput = document.getElementById('service-order-search');
    const statusFilter = document.getElementById('service-order-status-filter');
    const dateStart = document.getElementById('filter-date-start');
    const dateEnd = document.getElementById('filter-date-end');

    if (searchInput) searchInput.addEventListener('input', applyServiceOrderFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyServiceOrderFilters);
    if (dateStart) dateStart.addEventListener('change', applyServiceOrderFilters);
    if (dateEnd) dateEnd.addEventListener('change', applyServiceOrderFilters);
}

function applyServiceOrderFilters() {
    const searchLower = (document.getElementById('service-order-search')?.value || '').toLowerCase();
    const statusValue = document.getElementById('service-order-status-filter')?.value || '';
    const dateStart = document.getElementById('filter-date-start')?.value;
    const dateEnd = document.getElementById('filter-date-end')?.value;

    let filtered = window.serviceOrdersState.all;

    // 1. Filter by Search (Plate, Customer, Services)
    if (searchLower) {
        filtered = filtered.filter(o => {
            const customerName = (o.customers?.full_name || '').toLowerCase();
            const plate = (o.vehicles?.license_plate || '').toLowerCase();
            
            // Search in labor services too
            let servicesMatch = false;
            if (o.labor_services) {
                const services = Array.isArray(o.labor_services) ? o.labor_services : JSON.parse(o.labor_services || '[]');
                servicesMatch = services.some(s => (s.name || s.description || '').toLowerCase().includes(searchLower));
            }

            return customerName.includes(searchLower) || plate.includes(searchLower) || servicesMatch;
        });
    }

    // 2. Filter by Status
    if (statusValue) {
        filtered = filtered.filter(o => o.status === statusValue);
    }

    // 3. Filter by Date Range (Period)
    if (dateStart) {
        filtered = filtered.filter(o => {
            const orderDate = new Date(o.entry_date || o.created_at).toISOString().split('T')[0];
            return orderDate >= dateStart;
        });
    }
    if (dateEnd) {
        filtered = filtered.filter(o => {
            const orderDate = new Date(o.entry_date || o.created_at).toISOString().split('T')[0];
            return orderDate <= dateEnd;
        });
    }

    window.serviceOrdersState.filtered = filtered;
    renderServiceOrdersTable(filtered);
}

function renderServiceOrdersTable(orders) {
    const listContainer = document.getElementById('service-orders-list');
    const paginationInfo = document.getElementById('pagination-info');
    if (!listContainer) return;

    if (orders.length === 0) {
        listContainer.innerHTML = '<tr><td colspan="8" class="px-8 py-20 text-center text-slate-400"><div class="flex flex-col items-center gap-2"><span class="material-symbols-outlined text-4xl opacity-20">build_circle</span><p class="text-sm font-medium">Nenhuma ordem de serviço encontrada com estes filtros.</p></div></td></tr>';
        if (paginationInfo) paginationInfo.innerHTML = 'Exibindo <span class="text-on-surface font-bold">0</span> de <span class="text-on-surface font-bold">0</span> ordens';
        return;
    }

    listContainer.innerHTML = orders.map(order => {
        const statusColors = {
            'Aberto': 'bg-blue-100 text-blue-700 font-bold',
            'Em Andamento': 'bg-orange-100 text-orange-700 font-bold',
            'Concluído': 'bg-green-100 text-green-700 font-bold',
            'Cancelado': 'bg-red-100 text-red-700 font-bold',
            'Aguardando Peças': 'bg-purple-100 text-purple-700 font-bold'
        };

        const customerName = order.customers ? order.customers.full_name : 'N/A';
        const vehicleInfo = order.vehicles ? `${order.vehicles.brand} ${order.vehicles.model}` : 'Sem Veículo';
        const vehiclePlate = order.vehicles ? order.vehicles.license_plate : '--';
        const customerPhone = order.customers ? order.customers.phone : '';

        // Services Summary
        let servicesHtml = '';
        if (order.labor_services) {
            const services = Array.isArray(order.labor_services) ? order.labor_services : JSON.parse(order.labor_services || '[]');
            if (services.length > 0) {
                servicesHtml = `
                    <div class="mt-2 flex flex-wrap gap-1">
                        ${services.slice(0, 3).map(s => `<span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded leading-none">${s.name || s.description}</span>`).join('')}
                        ${services.length > 3 ? `<span class="text-[9px] text-slate-400 font-bold">+${services.length - 3}</span>` : ''}
                    </div>
                `;
            }
        }

        const osLabel = order.os_number || '#' + order.id.toString().slice(-6).toUpperCase();
        
        // WhatsApp Share logic - simplified to call a global function
        const shareLink = `javascript:shareOSViaWhatsApp(${JSON.stringify(order).replace(/"/g, '&quot;')})`;

        return `
            <tr class="hover:bg-slate-50/50 transition-all group">
                <td class="px-4 md:px-8 py-4 md:py-6 whitespace-nowrap" data-label="Ordem">
                    <a href="detalhes-ordem.html?id=${order.id}" class="flex flex-col hover:text-orange-600 transition-colors">
                        <span class="text-xs md:text-sm font-black text-slate-900">${osLabel}</span>
                        <span class="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Ver Detalhes</span>
                    </a>
                </td>
                <td class="px-4 py-4 md:py-6" data-label="Veículo / Cliente">
                    <div class="flex flex-col">
                        <div class="flex items-center gap-2">
                            <span class="text-xs md:text-sm font-black text-slate-900 leading-tight uppercase tracking-tight">${vehiclePlate}</span>
                            <span class="h-1 w-1 rounded-full bg-slate-300"></span>
                            <span class="text-xs md:text-sm font-bold text-slate-700 leading-tight truncate max-w-[150px] md:max-w-none">${customerName}</span>
                        </div>
                        <div class="flex items-center gap-1.5 mt-1">
                             <span class="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-wider">${vehicleInfo}</span>
                        </div>
                        <div class="hidden md:block">
                            ${servicesHtml}
                        </div>
                    </div>
                </td>
                <td class="hidden md:table-cell px-4 py-6 whitespace-nowrap" data-label="Responsável">
                    <span class="text-xs font-semibold text-slate-500">${order.mechanic_name || '--'}</span>
                </td>
                <td class="hidden sm:table-cell px-4 py-6 whitespace-nowrap" data-label="Entrada">
                    <span class="text-xs font-medium text-slate-500">${new Date((order.entry_date || order.created_at).includes('T') ? (order.entry_date || order.created_at) : (order.entry_date || order.created_at) + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                </td>
                <td class="px-4 py-4 md:py-6 whitespace-nowrap" data-label="Status">
                    <span onclick='quickStatusUpdate(${JSON.stringify(order).replace(/"/g, "&quot;")})' 
                        class="inline-flex items-center px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[9px] md:text-[10px] ${statusColors[order.status] || 'bg-slate-100 text-slate-600'} uppercase font-black tracking-widest cursor-pointer hover:brightness-110 transition-all">
                        ${order.status}
                    </span>
                    <div class="sm:hidden mt-1 text-[10px] font-black text-slate-900">R$ ${order.total_amount ? order.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</div>
                </td>
                <td class="hidden sm:table-cell px-4 py-6 whitespace-nowrap text-right" data-label="Valor">
                    <span class="text-xs md:text-sm font-black text-slate-900">R$ ${order.total_amount ? order.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</span>
                </td>
                <td class="px-4 md:px-8 py-4 md:py-6 whitespace-nowrap text-right">
                    <div class="flex items-center justify-end gap-1 md:gap-2">
                        <button onclick='shareOSViaWhatsApp(${JSON.stringify(order).replace(/"/g, "&quot;")})' class="p-1.5 md:p-2 text-slate-400 hover:text-green-500 transition-colors" title="Compartilhar via WhatsApp">
                            <span class="material-symbols-outlined text-lg">share</span>
                        </button>
                        <button onclick='downloadPDF("${order.id}")' class="p-1.5 md:p-2 text-slate-400 hover:text-blue-500 transition-colors" title="Gerar PDF">
                            <span class="material-symbols-outlined text-lg">picture_as_pdf</span>
                        </button>
                        <a href="detalhes-ordem.html?id=${order.id}" class="p-1.5 md:p-2 text-slate-400 hover:text-orange-500 transition-colors" title="Visualizar OS">
                            <span class="material-symbols-outlined text-lg">visibility</span>
                        </a>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (paginationInfo) {
        paginationInfo.innerHTML = `Exibindo <span class="text-on-surface font-bold">${orders.length}</span> de <span class="text-on-surface font-bold text-slate-400">${window.serviceOrdersState.all.length}</span> ordens`;
    }
}

/**
 * Handles quick status transitions from the list view
 */
window.quickStatusUpdate = function(order) {
    window.currentOrder = order;
    const status = order.status;

    if (status === 'Aberto') {
        openModal('modal-approve');
    } else if (status === 'Aprovado') {
        if (confirm('Deseja iniciar o serviço desta OS?')) {
            updateOrderStatus(order.id, 'Em Andamento');
        }
    } else if (status === 'Em Andamento') {
        openModal('modal-complete');
    } else if (status === 'Concluído') {
        if (confirm('Deseja reabrir esta ordem de serviço?')) {
            updateOrderStatus(order.id, 'Em Andamento');
        }
    } else {
        alert('Esta OS está com status: ' + status);
    }
};

/**
 * Initializes the New Order form by handling search and vehicle linkage
 */
async function initNewOrderForm() {
    // 0. Set default date to today
    const dateInput = document.getElementById('order-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Check for customer_id in URL to pre-select
    const urlParams = new URLSearchParams(window.location.search);
    const preSelectedCustomerId = urlParams.get('customer_id');
    if (preSelectedCustomerId) {
        setTimeout(async () => {
            try {
                const { data: customers } = await MyFleetCar.DB.select('customers', { match: { id: preSelectedCustomerId } });
                if (customers && customers.length > 0) {
                    window.selectCustomer(customers[0].id, customers[0].full_name);
                }
            } catch (err) { console.error('Error pre-selecting customer:', err); }
        }, 100);
    }

    const searchInput = document.getElementById('customer-search');
    const resultsContainer = document.getElementById('customer-results');
    const vehicleSelect = document.getElementById('order-vehicle');
    const selectedCustomerIdInput = document.getElementById('selected-customer-id');

    if (!searchInput) return;

    let searchTimeout;

    const performSearch = (term) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            try {
                const queryOpts = term ? {
                    or: `full_name.ilike.%${term}%,cpf_cnpj.ilike.%${term}%,phone.ilike.%${term}%`,
                    limit: 10
                } : {
                    order: { column: 'created_at', ascending: false },
                    limit: 5
                };

                const { data: customers, error } = await MyFleetCar.DB.select('customers', queryOpts);

                if (error) throw error;

                if (customers && customers.length > 0) {
                    resultsContainer.innerHTML = customers.map(c => `
                        <div class="p-3 border-b border-slate-50 hover:bg-orange-50 cursor-pointer transition-colors" 
                             onclick="selectCustomer('${c.id}', '${c.full_name.replace(/'/g, "\\'")}')">
                            <div class="text-sm font-bold text-slate-900">${c.full_name}</div>
                            <div class="text-[10px] text-slate-500">📞 ${c.phone || 'N/A'} | 📄 ${c.cpf_cnpj || '-'}</div>
                        </div>
                    `).join('');
                    resultsContainer.classList.remove('hidden');
                } else {
                    resultsContainer.innerHTML = '<div class="p-4 text-[10px] text-slate-400 text-center italic">Nenhum cliente encontrado.</div>';
                    if (term) resultsContainer.classList.remove('hidden');
                    else resultsContainer.classList.add('hidden');
                }
            } catch (err) { console.error(err); }
        }, 200);
    };

    searchInput.addEventListener('input', (e) => performSearch(e.target.value.trim()));
    searchInput.addEventListener('focus', (e) => performSearch(e.target.value.trim()));

    window.selectCustomer = async (id, name) => {
        searchInput.value = name;
        selectedCustomerIdInput.value = id;
        resultsContainer.classList.add('hidden');

        try {
            const { data: vehicles } = await MyFleetCar.DB.select('vehicles', { match: { customer_id: id } });
            if (vehicles && vehicles.length > 0) {
                vehicleSelect.disabled = false;
                vehicleSelect.innerHTML = '<option value="">Selecione o veículo...</option>' +
                    vehicles.map(v => `<option value="${v.id}">${v.license_plate} - ${v.brand} ${v.model}</option>`).join('');
            } else {
                vehicleSelect.disabled = true;
                vehicleSelect.innerHTML = '<option value="">Nenhum veículo cadastrado</option>';
            }
        } catch (err) { console.error(err); }
    };

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });

    // Handle form totals when discount changes
    document.getElementById('order-amount')?.addEventListener('input', calculateTotals);
}

/**
 * Labor Management Functions
 */
window.addQuickService = function (name, suggestedPrice) {
    const nameInput = document.getElementById('manual-service-name');
    const priceInput = document.getElementById('manual-service-price');

    if (nameInput && priceInput) {
        nameInput.value = name;
        priceInput.value = suggestedPrice;
        nameInput.focus();
    }
};

window.addManualService = function () {
    const nameInput = document.getElementById('manual-service-name');
    const priceInput = document.getElementById('manual-service-price');
    const qtyInput = document.getElementById('manual-service-qty') || { value: 1 };

    if (!nameInput.value || !priceInput.value) {
        alert('Por favor, preencha o nome e o preço do serviço.');
        return;
    }

    const service = {
        id: Date.now(),
        name: nameInput.value,
        price: parseFloat(priceInput.value),
        qty: parseInt(qtyInput.value) || 1
    };

    laborServices.push(service);
    nameInput.value = '';
    priceInput.value = '';
    if (qtyInput.id) qtyInput.value = 1;
    renderLaborList();
    calculateTotals();
};

window.removeService = function (id) {
    laborServices = laborServices.filter(s => s.id !== id);
    renderLaborList();
    calculateTotals();
};

function renderLaborList() {
    const list = document.getElementById('labor-items-list');
    if (!list) return;

    if (laborServices.length === 0) {
        list.innerHTML = `
            <div class="py-12 text-center text-slate-400 text-xs italic bg-surface-container-low/30 rounded-xl border border-dashed border-slate-200">
                Nenhum serviço adicionado.
            </div>
        `;
        return;
    }

    list.innerHTML = laborServices.map(s => `
        <div class="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm group">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                    <span class="material-symbols-outlined text-lg">build</span>
                </div>
                <div>
                    <div class="text-sm font-bold text-on-surface">${s.name}</div>
                    <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Qtd: ${s.qty} x R$ ${s.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
            </div>
            <div class="flex items-center gap-6">
                <div class="text-sm font-black text-on-surface">R$ ${(s.price * s.qty).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <button type="button" onclick="removeService(${s.id})" class="p-2 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 outline-none">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

function calculateTotals() {
    const laborTotal = laborServices.reduce((acc, s) => acc + (s.price * s.qty), 0);
    const partsTotal = 0;
    const discountValue = parseFloat(document.getElementById('order-amount')?.value || 0);
    const total = Math.max(0, laborTotal + partsTotal - discountValue);

    const displayTotal = document.querySelector('.text-4xl.font-black');
    if (displayTotal) displayTotal.textContent = `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const subtotalServiceText = document.querySelectorAll('.bg-surface-container-lowest\\/50 .flex.justify-between.items-center span.text-sm.font-bold');
    if (subtotalServiceText.length >= 2) {
        subtotalServiceText[0].textContent = `R$ ${laborTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
}

/**
 * Handles creation of a new service order
 */
async function handleNewOrder(e) {
    e.preventDefault();

    const form = e.target;
    const { data: { user } } = await MyFleetCar.Auth.getUser();
    if (!user) return;

    const customerId = document.getElementById('selected-customer-id').value;
    const vehicleId = document.getElementById('order-vehicle').value;

    if (!customerId) {
        alert('Por favor, busque e selecione um cliente.');
        return;
    }

    if (laborServices.length === 0) {
        alert('Adicione pelo menos um serviço antes de gerar a OS.');
        return;
    }

    const subtotalLabor = laborServices.reduce((acc, s) => acc + (s.price * s.qty), 0);
    const discount = parseFloat(document.getElementById('order-amount')?.value || 0);

    // Generate Sequential OS Number
    const osNumber = await generateOSNumber(user.id);

    const orderData = {
        workshop_id: user.id,
        customer_id: customerId,
        vehicle_id: vehicleId || null,
        os_number: osNumber,
        status: 'Aberto',
        description: document.getElementById('order-description').value,
        total_amount: Math.max(0, subtotalLabor - discount),
        labor_services: laborServices,
        entry_date: document.getElementById('order-date').value,
        mileage: parseInt(document.getElementById('order-km').value) || null
    };

    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Gerando OS...';
    }

    try {
        const { error } = await MyFleetCar.DB.insert('service_orders', orderData);
        if (error) throw error;

        alert('Ordem de Serviço criada com sucesso!');
        window.location.href = 'lista-ordem.html';
    } catch (err) {
        console.error('Error saving order:', err);
        alert('Erro ao salvar ordem: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Gerar Ordem de Serviço';
        }
    }
}

/**
 * Loads order details for the details page
 */
async function loadOrderDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    if (!orderId) return;

    try {
        const { data: order, error } = await MyFleetCar.DB.select('service_orders', {
            select: '*, customers(*), vehicles(*)',
            match: { id: orderId }
        });

        if (error) throw error;
        if (!order || order.length === 0) {
            alert('Ordem de serviço não encontrada.');
            return;
        }

        const o = order[0];

        // Update displays
        document.querySelector('.order-id-display').textContent = o.os_number || `#${o.id.toString().slice(-6).toUpperCase()}`;
        document.querySelector('.order-date-display').textContent = new Date((o.entry_date || o.created_at).includes('T') ? (o.entry_date || o.created_at) : (o.entry_date || o.created_at) + 'T12:00:00').toLocaleDateString('pt-BR');

        const statusBadge = document.getElementById('order-status-badge');
        if (statusBadge) {
            statusBadge.textContent = o.status.toUpperCase();
            // Optional: apply colors based on status
        }

        // Customer Info
        if (o.customers) {
            document.querySelector('.customer-name-display').textContent = o.customers.full_name;
            document.querySelector('.customer-email-display').textContent = o.customers.email || 'N/A';
            document.querySelector('.customer-phone-display').textContent = o.customers.phone || 'N/A';
        }

        // Vehicle Info
        if (o.vehicles) {
            document.querySelector('.vehicle-model-display').textContent = `${o.vehicles.brand} ${o.vehicles.model}`;
            document.querySelector('.vehicle-plate-display').textContent = o.vehicles.license_plate;
            document.querySelector('.vehicle-year-display').textContent = o.vehicles.year || 'N/A';
            document.querySelector('.vehicle-km-display').textContent = o.mileage ? `${o.mileage} KM` : 'N/A';
        }

        // Items List
        const itemsList = document.getElementById('order-items-list');
        if (itemsList && o.labor_services) {
            const labor = Array.isArray(o.labor_services) ? o.labor_services : JSON.parse(o.labor_services || '[]');
            if (labor.length > 0) {
                itemsList.innerHTML = labor.map(s => `
                    <tr class="border-b border-slate-50 last:border-0">
                        <td class="px-6 py-4">
                            <p class="text-sm font-bold text-on-surface">${s.name}</p>
                        </td>
                        <td class="px-6 py-4 text-xs font-bold text-slate-400">SERVIÇO</td>
                        <td class="px-6 py-4 text-sm font-medium text-slate-600">${s.qty}</td>
                        <td class="px-6 py-4 text-sm font-medium text-slate-600">R$ ${s.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td class="px-6 py-4 text-sm font-black text-on-surface text-right">R$ ${(s.price * s.qty).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                `).join('');
            }
        }

        // Totals
        const laborTotal = (o.labor_services || []).reduce((acc, s) => acc + (s.price * s.qty), 0);
        document.getElementById('total-labor').textContent = `R$ ${laborTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        // Populate financial fields
        document.getElementById('financial-additional').value = o.additional_charges || 0;
        document.getElementById('financial-discount').value = o.discount_amount || 0;
        document.getElementById('no-charge-toggle').checked = o.no_charge || false;

        document.getElementById('total-amount').textContent = `R$ ${o.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        // Render Items with per-row mechanic selection
        renderOrderItems(o);

        // Load History
        loadHistory(o.id);

        // Final Actions
        window.currentOrder = o;
        renderStatusActions(o);

        // Setup WhatsApp link
        const waBtn = document.getElementById('wa-btn');
        if (waBtn) {
            waBtn.onclick = () => generateOSPDF(o, 'share');
        }
        
        const downloadBtn = document.querySelector('button[onclick*="downloadPDF"]');
        if (downloadBtn) {
            downloadBtn.onclick = () => generateOSPDF(o, 'download');
        }

        // CRITICAL: Lock if concluded (wait for rendering to finish)
        if (o.status === 'Concluído' || o.status === 'Finalizada') {
            setTimeout(() => applyOrderLock(true), 500);
        }

        // Auto print if requested
        if (urlParams.get('print') === 'true') {
            setTimeout(() => window.print(), 1000);
        }

    } catch (err) {
        console.error('Error loading order details:', err);
    }
}

/**
 * Renders status-based action buttons
 */
function renderStatusActions(order) {
    const container = document.getElementById('status-actions');
    if (!container) return;

    let html = '';
    const status = order.status;

    // Check for delay
    let isDelayed = false;
    if (order.deadline_at && (status === 'Aprovado' || status === 'Em Andamento')) {
        if (new Date() > new Date(order.deadline_at)) {
            isDelayed = true;
            document.getElementById('order-status-badge').className = 'px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full border border-red-200';
            document.getElementById('order-status-badge').textContent = 'ATRASADO';
        }
    }

    if (status === 'Aberto') {
        html = `
            <button onclick="openModal('modal-approve')" class="btn-kinetic px-6 py-2.5 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20">
                Aprovar e Vincular Mecânico
            </button>
            <button onclick="updateOrderStatus('${order.id}', 'Cancelado')" class="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all">
                Cancelar OS
            </button>
        `;
    } else if (status === 'Aprovado') {
        html = `
            <button onclick="updateOrderStatus('${order.id}', 'Em Andamento')" class="btn-kinetic px-6 py-2.5 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20">
                Iniciar Serviço
            </button>
            <button onclick="openModal('modal-approve')" class="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all">
                Alterar Prazo / Mecânico
            </button>
        `;
    } else if (status === 'Em Andamento' || status === 'Atrasado') {
        html = `
            <button onclick="openModal('modal-complete')" class="btn-kinetic px-6 py-2.5 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20">
                Concluir Serviço
            </button>
            <button onclick="openModal('modal-approve')" class="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all">
                Reagendar Entrega
            </button>
        `;
    } else if (status === 'Concluído') {
        html = `
            <div class="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl border border-green-100">
                <span class="material-symbols-outlined text-lg">check_circle</span>
                <span class="text-sm font-bold">Serviço Finalizado</span>
            </div>
            <button onclick="updateOrderStatus('${order.id}', 'Em Andamento')" class="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all flex items-center gap-2">
                <span class="material-symbols-outlined text-sm">settings_backup_restore</span>
                Reabrir Ordem
            </button>
        `;
    }

    container.innerHTML = html;
}

/**
 * Workflow Functions
 */
window.openModal = (id) => {
    // Bloquear modais de edição se a OS estiver concluída
    if (window.currentOrder && (window.currentOrder.status === 'Concluído' || window.currentOrder.status === 'Finalizada')) {
        const protectedModals = ['modal-add-item', 'modal-history', 'modal-delete'];
        if (protectedModals.includes(id)) {
            console.warn('Ação bloqueada: OS Concluída');
            return;
        }
    }

    const modal = document.getElementById(id);
    modal.classList.remove('hidden');

    // If opening approval modal, load mechanics from staff table
    if (id === 'modal-approve') {
        loadMechanics();
    }

    // If opening approval modal for an existing order, populate fields
    if (id === 'modal-approve' && window.currentOrder) {
        if (window.currentOrder.mechanic_name) {
            document.getElementById('approve-mechanic').value = window.currentOrder.mechanic_name;
        }
        if (window.currentOrder.deadline_at) {
            const dt = new Date(window.currentOrder.deadline_at);

            // Fixed timezone handling for display
            const year = dt.getFullYear();
            const month = (dt.getMonth() + 1).toString().padStart(2, '0');
            const day = dt.getDate().toString().padStart(2, '0');
            const hours = dt.getHours().toString().padStart(2, '0');
            const minutes = dt.getMinutes().toString().padStart(2, '0');

            document.getElementById('approve-date').value = `${year}-${month}-${day}`;
            document.getElementById('approve-time').value = `${hours}:${minutes}`;
        }

        // Update title if it's already approved
        const title = modal.querySelector('h3');
        if (window.currentOrder.status !== 'Aberto') {
            title.textContent = 'Reagendar / Alterar Mecânico';
        } else {
            title.textContent = 'Aprovar e Vincular';
        }
    }
};

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

async function updateOrderStatus(id, newStatus, extraData = {}) {
    try {
        const oldStatus = window.currentOrder.status;

        // Separate OS data from Financial data to avoid "column not found" errors
        const osUpdateData = { status: newStatus };
        if (extraData.exit_date) osUpdateData.exit_date = extraData.exit_date;
        if (extraData.mechanic_name) osUpdateData.mechanic_name = extraData.mechanic_name;
        if (extraData.deadline_at) osUpdateData.deadline_at = extraData.deadline_at;

        const { error } = await MyFleetCar.DB.update('service_orders', osUpdateData, { id });

        if (error) throw error;

        // Log Status History
        if (oldStatus !== newStatus) {
            await addHistoryEntry(id, 'Status', `Status alterado de "${oldStatus}" para "${newStatus}"`, oldStatus, newStatus);
        }

        // If completing, also create a financial transaction
        if (newStatus === 'Concluído' && extraData.payment_method) {
            const { data: { user } } = await MyFleetCar.Auth.getUser();

            // Ensure numeric amount (stripping currency symbols and formatting)
            let totalAmount = window.currentOrder.total_amount || 0;
            if (typeof totalAmount === 'string') {
                totalAmount = parseFloat(totalAmount.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
            }

            const transRecord = {
                workshop_id: user.id,
                service_order_id: id,
                type: 'Receita',
                category: 'Serviço Automotivo',
                amount: totalAmount,
                payment_method: extraData.payment_method,
                due_date: extraData.payment_due_date ? new Date(extraData.payment_due_date + 'T12:00:00').toISOString() : new Date().toISOString(),
                status: extraData.payment_status || 'Pendente',
                description: `OS ${window.currentOrder.os_number || id}`
            };

            // IMPROVEMENT: Check if a transaction for this OS already exists to prevent duplicates
            const { data: existingTrans } = await MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: user.id, service_order_id: id }
            });

            let transRes;
            if (existingTrans && existingTrans.length > 0) {
                // Update existing
                transRes = await MyFleetCar.DB.update('financial_transactions', transRecord, { id: existingTrans[0].id });
            } else {
                // Insert new
                transRes = await MyFleetCar.DB.insert('financial_transactions', transRecord);
            }

            if (transRes.error) {
                console.error('Transaction Error:', transRes.error);
                alert('OS Concluída, mas houve um erro ao registrar financeiro: ' + transRes.error.message);
            }
        } 
        // If reopening (moving away from Concluído/Finalizada), remove the financial transaction
        else if ((oldStatus === 'Concluído' || oldStatus === 'Finalizada') && newStatus !== 'Concluído' && newStatus !== 'Finalizada') {
            const { data: { user } } = await MyFleetCar.Auth.getUser();
            await MyFleetCar.DB.delete('financial_transactions', { 
                workshop_id: user.id, 
                service_order_id: id 
            });
        }

        window.location.reload();
    } catch (err) {
        console.error(err);
        alert('Erro ao atualizar status: ' + err.message);
    }
}

window.confirmCompletion = async () => {
    const method = document.getElementById('complete-payment-method').value;
    const dueDate = document.getElementById('complete-due-date').value;
    const paymentStatus = document.getElementById('complete-payment-status').value;

    if (!dueDate) {
        alert('Por favor, informe a data de vencimento ou pagamento.');
        return;
    }

    await updateOrderStatus(window.currentOrder.id, 'Concluído', {
        payment_method: method,
        payment_status: paymentStatus,
        payment_due_date: dueDate,
        exit_date: new Date().toISOString()
    });
};

window.confirmApproval = async () => {
    const mechanic = document.getElementById('approve-mechanic').value;
    const date = document.getElementById('approve-date').value;
    const time = document.getElementById('approve-time').value;

    if (!mechanic || !date || !time) {
        alert('Por favor, preencha todos os campos.');
        return;
    }

    const localDateTime = new Date(`${date}T${time}:00`);
    const deadlineISO = localDateTime.toISOString();

    // Log Deadline/Mechanic Change
    if (window.currentOrder.deadline_at !== deadlineISO) {
        await addHistoryEntry(window.currentOrder.id, 'Prazo', `Entrega reagendada para ${new Date(deadlineISO).toLocaleString('pt-BR')}`);
    }
    if (window.currentOrder.mechanic_name !== mechanic) {
        await addHistoryEntry(window.currentOrder.id, 'Mecânico', `Responsável alterado para: ${mechanic}`);
    }

    // If order has already started, keep current status. Otherwise, set to 'Aprovado'.
    let nextStatus = 'Aprovado';
    if (window.currentOrder.status === 'Em Andamento' || window.currentOrder.status === 'Atrasado' || window.currentOrder.status === 'Concluído') {
        nextStatus = window.currentOrder.status;
    }

    await updateOrderStatus(window.currentOrder.id, nextStatus, {
        mechanic_name: mechanic,
        deadline_at: deadlineISO
    });
};


/**
 * Dynamically loads mechanics into the approval modal
 */
async function loadMechanics() {
    const select = document.getElementById('approve-mechanic');
    if (!select) return;

    try {
        const { data: staff, error } = await MyFleetCar.DB.select('staff', {
            order: { column: 'name', ascending: true }
        });

        if (error) throw error;

        // Keep current selection if any
        const currentVal = select.value;

        let html = '<option value="">Selecione o mecânico...</option>';
        if (staff && staff.length > 0) {
            html += staff.map(s => `<option value="${s.name}">${s.name} (${s.role})</option>`).join('');
        } else {
            html += '<option disabled>Nenhum funcionário cadastrado</option>';
        }

        select.innerHTML = html;
        if (currentVal) select.value = currentVal;

    } catch (err) {
        console.error('Error loading mechanics:', err);
    }
}

/**
 * Downloads/Prints the PDF of an order
 */
window.downloadPDF = function (id) {
    if (!id) return;
    const printUrl = `imprimir-ordem.html?id=${id}&print=true`;
    window.open(printUrl, '_blank');
};

/**
 * Shares OS link via WhatsApp
 */
window.shareOSViaWhatsApp = function (order) {
    if (!order) return;
    
    const customerName = order.customers ? order.customers.full_name : 'Cliente';
    const osLabel = order.os_number || '#' + (order.id.toString().length > 10 ? order.id.toString().slice(-6).toUpperCase() : order.id);
    const customerPhone = order.customers ? order.customers.phone : '';
    
    if (!customerPhone) {
        alert('Este cliente não possui telefone cadastrado.');
        return;
    }

    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
    const docLink = `${baseUrl}/imprimir-ordem.html?id=${order.id}`;
    
    const message = `Olá *${customerName}*!\n\nSou da *Oficina MyFleetCar*. Sua Ordem de Serviço *${osLabel}* está com o status: *${order.status.toUpperCase()}*.\n\nVocê pode visualizar os detalhes e o documento oficial no link abaixo:\n${docLink}\n\nQualquer dúvida, estamos à disposição!`;
    
    const waUrl = `https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
};

/**
 * Renders the items list with per-item mechanic logic
 */
function renderOrderItems(order) {
    const list = document.getElementById('order-items-list');
    if (!list) return;

    // Get all mechanics to populate dropdowns
    MyFleetCar.DB.select('staff', { order: { column: 'name', ascending: true } }).then(({ data: staff }) => {
        if (!order.labor_services || order.labor_services.length === 0) {
            list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">Nenhum item adicionado.</td></tr>';
            return;
        }

        list.innerHTML = order.labor_services.map((item, index) => {
            const subtotal = (item.price || 0) * (item.qty || 1);
            const itemMechanic = item.mechanic_name || order.mechanic_name || 'Nenhum';
            const description = item.name || item.description || 'Sem Descrição';
            const itemTypeLabel = item.type === 'part' ? 'PEÇA' : 'SERVIÇO';
            const itemTypeColor = item.type === 'part' ? 'text-blue-500' : 'text-slate-400';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 md:px-6 py-4">
                        <div class="flex flex-col">
                            <span class="text-xs md:text-sm font-bold text-slate-700 uppercase tracking-tight">${description}</span>
                            ${item.extra_info ? `<span class="text-[9px] text-slate-400 font-medium italic">${item.extra_info.replace('\n', ' ')}</span>` : ''}
                            <div class="sm:hidden flex items-center gap-2 mt-1 text-[9px] font-bold text-slate-400">
                                <span>Qtd: ${item.qty}</span>
                                <span>•</span>
                                <span>UN: R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </td>
                    <td class="hidden md:table-cell px-6 py-4 text-xs font-black ${itemTypeColor} tracking-widest">${itemTypeLabel}</td>
                    <td class="hidden sm:table-cell px-6 py-4 text-center">
                        <span class="text-xs font-bold text-slate-600">${item.qty}</span>
                    </td>
                    <td class="hidden sm:table-cell px-6 py-4">
                        <span class="text-xs text-slate-500">R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </td>
                    <td class="px-4 md:px-6 py-4 text-right">
                        <div class="flex items-center justify-end gap-3">
                            <span class="text-xs md:text-sm font-black text-slate-900">R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            ${order.status === 'Concluído' ? '' : `
                            <button onclick="removeItemFromOS(${index})" class="text-slate-300 hover:text-red-500 transition-colors">
                                <span class="material-symbols-outlined text-sm">delete</span>
                            </button>`}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

/**
 * Logic for adding/updating items
 */
/**
 * Logic for adding/updating items
 */
let currentItemType = 'service';

window.setItemType = function(type) {
    currentItemType = type;
    const btnService = document.getElementById('btn-type-service');
    const btnPart = document.getElementById('btn-type-part');
    const searchContainer = document.getElementById('part-search-container');
    
    if (type === 'service') {
        btnService.classList.add('bg-white', 'shadow-sm', 'text-primary');
        btnService.classList.remove('text-slate-500');
        btnPart.classList.remove('bg-white', 'shadow-sm', 'text-primary');
        btnPart.classList.add('text-slate-500');
        if (searchContainer) searchContainer.classList.add('hidden');
        document.getElementById('item-description').value = '';
        document.getElementById('item-description').readOnly = false;
        document.getElementById('item-price').value = '';
    } else {
        btnPart.classList.add('bg-white', 'shadow-sm', 'text-primary');
        btnPart.classList.remove('text-slate-500');
        btnService.classList.remove('bg-white', 'shadow-sm', 'text-primary');
        btnService.classList.add('text-slate-500');
        if (searchContainer) searchContainer.classList.remove('hidden');
        document.getElementById('item-description').readOnly = true;
    }
};

async function setupOSItemInventorySearch() {
    const searchInput = document.getElementById('os-item-inventory-search');
    const resultsContainer = document.getElementById('os-item-inventory-results');
    if (!searchInput) return;

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        clearTimeout(searchTimeout);
        if (!term) {
            resultsContainer.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                const { data: products } = await MyFleetCar.DB.select('inventory', {
                    or: `name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`,
                    limit: 5
                });

                if (products && products.length > 0) {
                    resultsContainer.innerHTML = products.map(p => `
                        <div class="p-3 border-b border-slate-50 hover:bg-orange-50 cursor-pointer transition-colors" 
                             onclick="selectOSProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${p.sale_price}, ${p.quantity}, '${p.reference_code || ''}', '${(p.vehicle_models || '').replace(/'/g, "\\'")}')">
                            <div class="flex justify-between items-center">
                                <div class="text-sm font-bold text-on-surface">${p.name}</div>
                                <div class="text-[10px] px-1.5 py-0.5 rounded ${p.quantity <= 0 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}">Estoque: ${p.quantity}</div>
                            </div>
                            <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                <span class="bg-slate-100 px-1 rounded">REF: ${p.reference_code || 'S/ REF'}</span>
                                <span class="ml-2 text-slate-400">APL: ${p.vehicle_models || 'Universal'}</span>
                            </div>
                            <div class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">${p.brand || 'Sem Marca'} | R$ ${p.sale_price.toLocaleString('pt-BR')}</div>
                        </div>
                    `).join('');
                    resultsContainer.classList.remove('hidden');
                } else {
                    resultsContainer.innerHTML = '<div class="p-4 text-xs text-slate-400 text-center italic">Produto não encontrado.</div>';
                    resultsContainer.classList.remove('hidden');
                }
            } catch (err) { console.error(err); }
        }, 300);
    });

    window.selectOSProduct = (id, name, price, stock, refCode, application) => {
        if (stock <= 0) {
            if (!confirm('Este produto está sem estoque. Deseja continuar assim mesmo?')) return;
        }
        document.getElementById('item-description').value = name + (refCode ? ` [${refCode}]` : '');
        // We can also store refCode/app in hidden fields if we want to save them separately in the JSON
        const extraInfo = application ? `\nAPL: ${application}` : '';
        document.getElementById('item-description').dataset.extra = extraInfo;
        
        document.getElementById('item-price').value = price;
        document.getElementById('selected-product-id').value = id;
        document.getElementById('os-item-inventory-search').value = name;
        resultsContainer.classList.add('hidden');
    };

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });
}

window.addNewItem = async function () {
    if (window.currentOrder.status === 'Concluído') return;
    const desc = document.getElementById('item-description').value;
    const qty = parseFloat(document.getElementById('item-qty').value);
    const price = parseFloat(document.getElementById('item-price').value);
    const mech = document.getElementById('item-mechanic').value;
    const productId = document.getElementById('selected-product-id')?.value;

    if (!desc || isNaN(qty) || isNaN(price)) return;

    const newItem = { 
        name: desc, 
        qty, 
        price, 
        mechanic_name: mech || null,
        type: currentItemType,
        product_id: currentItemType === 'part' ? productId : null,
        extra_info: document.getElementById('item-description').dataset.extra || ''
    };

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        
        // If it's a part, handle inventory deduction
        if (currentItemType === 'part' && productId) {
            // 1. Get current stock
            const { data: inv } = await MyFleetCar.DB.select('inventory', { match: { id: productId } });
            if (inv && inv[0]) {
                const currentQty = inv[0].quantity || 0;
                const newQty = currentQty - qty;

                // 2. Generate Batch ID
                const batchId = `OS-${window.currentOrder.os_number || window.currentOrder.id}-${Date.now().toString().slice(-6)}`;

                // 3. Record Movement (Saída)
                await MyFleetCar.DB.insert('inventory_movements', {
                    workshop_id: user.id,
                    product_id: productId,
                    type: 'Saída',
                    quantity: qty,
                    unit_cost: inv[0].purchase_price || 0,
                    unit_sale: price,
                    batch_id: batchId,
                    reason: `Consumo na OS ${window.currentOrder.os_number || window.currentOrder.id}`,
                    service_order_id: window.currentOrder.id,
                    created_at: new Date().toISOString()
                });

                // 4. Update Inventory
                await MyFleetCar.DB.update('inventory', { quantity: newQty }, { id: productId });
            }
        }

        const updatedServices = [...(window.currentOrder.labor_services || []), newItem];
        
        // Recalculate Total
        const additional = window.currentOrder.additional_charges || 0;
        const discount = window.currentOrder.discount_amount || 0;
        const noCharge = window.currentOrder.no_charge || false;
        const baseTotal = updatedServices.reduce((acc, s) => acc + (s.price * s.qty), 0);
        let finalTotal = noCharge ? 0 : Math.max(0, baseTotal + additional - discount);

        await MyFleetCar.DB.update('service_orders', { 
            labor_services: updatedServices,
            total_amount: finalTotal
        }, { id: window.currentOrder.id });
        
        await addHistoryEntry(window.currentOrder.id, 'Item', `Adicionado ${currentItemType === 'part' ? 'peça' : 'serviço'}: ${desc}`);
        window.location.reload();
    } catch (err) {
        console.error(err);
        alert('Erro ao adicionar item.');
    }
};

window.removeItemFromOS = async function (index) {
    if (window.currentOrder.status === 'Concluído') return;
    if (!confirm('Excluir este item?')) return;
    const updated = [...window.currentOrder.labor_services];
    const removedItem = updated.splice(index, 1)[0];
    const itemDesc = removedItem.name || removedItem.description;

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();

        // If it was a part, return stock
        if (removedItem.type === 'part' && removedItem.product_id) {
            const { data: inv } = await MyFleetCar.DB.select('inventory', { match: { id: removedItem.product_id } });
            if (inv && inv[0]) {
                const currentQty = inv[0].quantity || 0;
                const newQty = currentQty + (removedItem.qty || 1);

                // 2. Generate Batch ID for Estorno
                const batchId = `EST-${window.currentOrder.os_number || window.currentOrder.id}-${Date.now().toString().slice(-6)}`;

                // 3. Record Movement (Estorno)
                await MyFleetCar.DB.insert('inventory_movements', {
                    workshop_id: user.id,
                    product_id: removedItem.product_id,
                    type: 'Estorno',
                    quantity: removedItem.qty || 1,
                    unit_cost: inv[0].purchase_price || 0,
                    batch_id: batchId,
                    reason: `Remoção do item da OS ${window.currentOrder.os_number || window.currentOrder.id}`,
                    service_order_id: window.currentOrder.id,
                    created_at: new Date().toISOString()
                });

                // 4. Update Inventory
                await MyFleetCar.DB.update('inventory', { quantity: newQty }, { id: removedItem.product_id });
            }
        }

        // Recalculate Total
        const additional = window.currentOrder.additional_charges || 0;
        const discount = window.currentOrder.discount_amount || 0;
        const noCharge = window.currentOrder.no_charge || false;
        const baseTotal = updated.reduce((acc, s) => acc + (s.price * s.qty), 0);
        let finalTotal = noCharge ? 0 : Math.max(0, baseTotal + additional - discount);

        await MyFleetCar.DB.update('service_orders', { 
            labor_services: updated,
            total_amount: finalTotal
        }, { id: window.currentOrder.id });
        
        await addHistoryEntry(window.currentOrder.id, 'Item', `Removido item: ${itemDesc}`);
        window.location.reload();
    } catch (err) {
        console.error(err);
    }
};

window.updateItemMechanic = async function (index, mechanicName) {
    if (window.currentOrder.status === 'Concluído') return;
    const updated = [...window.currentOrder.labor_services];
    updated[index].mechanic_name = mechanicName || null;
    const itemDesc = updated[index].name || updated[index].description;

    try {
        await MyFleetCar.DB.update('service_orders', { labor_services: updated }, { id: window.currentOrder.id });
        await addHistoryEntry(window.currentOrder.id, 'Mecânico', `Item "${itemDesc}" vinculado a ${mechanicName || 'Padrão'}`);
    } catch (err) {
        console.error(err);
    }
};

/**
 * Financial Recalculation
 */
window.recalculateAndSave = async function () {
    if (window.currentOrder.status === 'Concluído') return;
    const additional = parseFloat(document.getElementById('financial-additional').value) || 0;
    const discount = parseFloat(document.getElementById('financial-discount').value) || 0;
    const noCharge = document.getElementById('no-charge-toggle').checked;

    const baseTotal = (window.currentOrder.labor_services || []).reduce((acc, s) => acc + (s.price * s.qty), 0);
    let finalTotal = baseTotal + additional - discount;
    if (noCharge) finalTotal = 0;

    try {
        await MyFleetCar.DB.update('service_orders', {
            additional_charges: additional,
            discount_amount: discount,
            no_charge: noCharge,
            total_amount: Math.max(0, finalTotal)
        }, { id: window.currentOrder.id });

        document.getElementById('total-amount').textContent = `R$ ${finalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    } catch (err) {
        console.error(err);
    }
};

/**
 * History Management
 */
async function loadHistory(osId) {
    const timeline = document.getElementById('order-timeline');
    if (!timeline) return;

    try {
        const { data: history, error } = await MyFleetCar.DB.select('service_order_history', {
            match: { service_order_id: osId },
            order: { column: 'created_at', ascending: false }
        });

        if (error) throw error;

        if (!history || history.length === 0) {
            timeline.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">Nenhum evento registrado no histórico.</p>';
            return;
        }

        timeline.innerHTML = history.map(h => {
            const date = new Date(h.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `
                <div class="pl-8 relative">
                    <div class="absolute left-0 top-1 w-[24px] h-[24px] rounded-full bg-white border-2 border-slate-200 flex items-center justify-center -ml-[11px] z-10">
                        <span class="material-symbols-outlined text-[10px] text-slate-400">
                            ${h.type === 'Status' ? 'sync' : h.type === 'Manual' ? 'chat' : 'edit'}
                        </span>
                    </div>
                    <div class="text-[10px] text-slate-400 font-bold mb-1">${date} • ${h.type}</div>
                    <div class="text-xs text-slate-700 bg-white p-3 rounded-xl border border-slate-50 shadow-sm">${h.description}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading history:', err);
    }
}

async function addHistoryEntry(osId, type, description, oldValue = null, newValue = null) {
    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        await MyFleetCar.DB.insert('service_order_history', {
            service_order_id: osId,
            workshop_id: user.id,
            type,
            description,
            old_value: oldValue ? String(oldValue) : null,
            new_value: newValue ? String(newValue) : null
        });
    } catch (err) { console.error('Error logging history:', err); }
}

window.saveManualHistory = async function () {
    const text = document.getElementById('history-manual-text').value;
    if (!text) return;

    try {
        await addHistoryEntry(window.currentOrder.id, 'Manual', text);
        closeModal('modal-history');
        document.getElementById('history-manual-text').value = '';
        loadHistory(window.currentOrder.id);
    } catch (err) {
        console.error(err);
    }
};

/**
 * Generates the next sequential OS number (YY/NNNN)
 */
async function generateOSNumber(workshopId) {
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = `${year}/`;

    try {
        // Fetch the highest OS number for this workshop and year
        const { data, error } = await MyFleetCar.DB.select('service_orders', {
            select: 'os_number',
            match: { workshop_id: workshopId },
            ilike: { os_number: `${prefix}%` },
            order: { column: 'os_number', ascending: false },
            limit: 1
        });

        if (error) throw error;

        let nextSeq = 1;

        if (data && data.length > 0 && data[0].os_number) {
            const lastNumStr = data[0].os_number.split('/')[1];
            nextSeq = parseInt(lastNumStr) + 1;
        }

        return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    } catch (err) {
        console.error('Error generating OS number:', err);
        // Fallback to timestamp if something goes wrong
        return `${prefix}${Date.now().toString().slice(-4)}`;
    }
}

// --- Secure Deletion Logic ---
let generatedDeleteCode = '';

window.requestOrderDeletion = () => {
    if (window.currentOrder.status === 'Concluído') return;
    // Generate a 6-char random code (uppercase letters and numbers)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    generatedDeleteCode = '';
    for (let i = 0; i < 6; i++) {
        generatedDeleteCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    document.getElementById('delete-code-display').textContent = generatedDeleteCode;
    document.getElementById('delete-confirm-input').value = '';
    openModal('modal-delete');
};

window.confirmDeletion = async () => {
    const inputCode = document.getElementById('delete-confirm-input').value.trim().toUpperCase();

    if (inputCode !== generatedDeleteCode) {
        alert('Código incorreto. A exclusão foi cancelada por segurança.');
        return;
    }

    if (!window.currentOrder) return;

    try {
        const orderId = window.currentOrder.id;

        // 1. Delete History
        await MyFleetCar.DB.delete('service_order_history', { service_order_id: orderId });

        // 2. Delete Financial Transactions (to keep clean metrics)
        await MyFleetCar.DB.delete('financial_transactions', { service_order_id: orderId });

        // 3. SOFT DELETE: Instead of deleting the record, we change status to 'Excluída'
        // This keeps the sequential OS number integrity intact.
        await MyFleetCar.DB.update('service_orders', { status: 'Excluída' }, { id: orderId });

        alert('Ordem de Serviço excluída com sucesso.');
        window.location.href = 'lista-ordem.html';
    } catch (err) {
        console.error('Delete Error:', err);
        alert('Erro ao excluir ordem: ' + err.message);
    }
};

/**
 * PDF Generation & SHARING
 */
window.generateOSPDF = function (order, action = 'download') {
    const id = order.id;
    if (action === 'share') {
        const osNum = order.os_number || 'OS';
        const text = encodeURIComponent(`Olá! Segue o link para visualizar sua Ordem de Serviço (${osNum}) na MyFleetCar: ${window.location.origin}/imprimir-ordem.html?id=${id}`);
        const phone = order.customers?.phone ? order.customers.phone.replace(/\D/g, '') : '';
        
        // Ensure brazilian country code if missing and length is local
        let finalPhone = phone;
        if (phone.length === 11 || phone.length === 10) finalPhone = '55' + phone;

        window.open(`https://wa.me/${finalPhone}?text=${text}`, '_blank');
    } else {
        // Download approach: Open the print page with download=true flag
        window.open(`imprimir-ordem.html?id=${id}&download=true`, '_blank');
    }
};

window.downloadPDF = function(id) {
    const orderId = id || (window.currentOrder ? window.currentOrder.id : null);
    if (!orderId) {
        alert('ID da ordem não encontrado.');
        return;
    }
    window.open(`imprimir-ordem.html?id=${orderId}&download=true`, '_blank');
};

/**
 * UI Logic: Lock concluded orders
 */
function applyOrderLock(isLocked) {
    if (!isLocked) return;
    console.log('--- APLICANDO BLOQUEIO DE OS CONCLUÍDA ---');

    // 1. Hide "Add Item" and "Add Note" buttons
    const addBtn = document.querySelector('button[onclick*="modal-add-item"]');
    if (addBtn) {
        addBtn.classList.add('hidden');
        addBtn.style.display = 'none';
    }

    const addNoteBtn = document.querySelector('button[onclick*="modal-history"]');
    if (addNoteBtn) {
        addNoteBtn.classList.add('hidden');
        addNoteBtn.style.display = 'none';
    }

    // 2. Disable financial inputs
    const inputs = [
        'financial-additional',
        'financial-discount',
        'no-charge-toggle'
    ];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = true;
            el.classList.add('bg-slate-50', 'cursor-not-allowed', 'opacity-60');
            el.onclick = (e) => { e.preventDefault(); return false; };
            el.onchange = null;
        }
    });

    // 3. Prevent general deletion
    const deleteBtn = document.querySelector('button[onclick*="requestOrderDeletion"]');
    if (deleteBtn) {
        deleteBtn.classList.add('hidden');
        deleteBtn.style.display = 'none';
    }

    // 4. Add a visual indicator
    const financialCard = document.querySelector('.bg-surface-container-low.p-8');
    if (financialCard && !document.getElementById('lock-notice')) {
        const lockNotice = document.createElement('div');
        lockNotice.id = 'lock-notice';
        lockNotice.className = 'mt-4 p-3 bg-orange-50 border border-orange-100 rounded-xl text-[10px] font-bold text-orange-600 uppercase flex items-center gap-2';
        lockNotice.innerHTML = `<span class="material-symbols-outlined text-sm">lock</span> OS Bloqueada para alterações`;
        financialCard.appendChild(lockNotice);
    }

    // 5. Hide delete buttons in rows
    document.querySelectorAll('#order-items-list button[onclick*="removeItemFromOS"]').forEach(btn => {
        btn.classList.add('hidden');
        btn.style.display = 'none';
    });
    
    document.querySelectorAll('#order-items-list select').forEach(sel => {
        sel.disabled = true;
        sel.classList.add('cursor-not-allowed', 'opacity-60');
    });
}

