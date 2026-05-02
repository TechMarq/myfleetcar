/**
 * Inventory Management Logic for MyFleetCar SaaS
 */

// Global state for filtering
let allProducts = [];
let allMovements = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Priority: Load dynamic data for the product registration form
    await new Promise(r => setTimeout(r, 500)); 
    await loadDynamicAuxData();

    // 1. Fetch Inventory if on the list page
    if (document.getElementById('inventory-list')) {
        loadInventory();
        setupFilters();
    }

    // 2. Fetch Movements if on the movements page
    if (document.getElementById('movements-list')) {
        loadMovements();
        loadProductOptions(); // For the modal
    }

    // 3. Handle New Product Form
    const productForm = document.getElementById('product-form');
    if (productForm) {
        await loadProductForEdit();
        productForm.addEventListener('submit', handleNewProduct);
        
        // Handle Multi-vehicle Selection
        const vehSelect = document.getElementById('prod-vehicles');
        if (vehSelect) {
            vehSelect.addEventListener('change', (e) => {
                const value = e.target.value;
                if (value) {
                    addVehicleTag(value);
                    e.target.value = ''; // Reset select
                }
            });
        }
    }

    // 4. Handle New Movement Form
    const movementForm = document.getElementById('movement-form');
    if (movementForm) {
        movementForm.addEventListener('submit', handleNewMovement);
    }
});

/**
 * Loads dynamic categories, vehicles and units from DB
 */
async function loadDynamicAuxData() {
    const catSelect = document.getElementById('prod-category');
    const vehSelect = document.getElementById('prod-vehicles');
    const unitSelect = document.getElementById('prod-unit');

    if (!catSelect && !vehSelect && !unitSelect) return;

    try {
        // Load Categories
        const { data: cats } = await MyFleetCar.DB.select('inventory_categories', { order: { column: 'name', ascending: true } });
        if (catSelect) {
            catSelect.innerHTML = '<option value="">Selecione...</option>' + 
                (cats || []).map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }

        // Load Vehicles
        const { data: vehs } = await MyFleetCar.DB.select('vehicle_models', { order: { column: 'name', ascending: true } });
        if (vehSelect) {
            vehSelect.innerHTML = '<option value="">Selecione o modelo...</option>' + 
                (vehs || []).map(v => `<option value="${v.name}">${v.name}</option>`).join('');
        }

        // Load Units
        const { data: units } = await MyFleetCar.DB.select('inventory_units', { order: { column: 'name', ascending: true } });
        if (unitSelect) {
            unitSelect.innerHTML = '<option value="">Selecione...</option>' + 
                (units || []).map(u => `<option value="${u.name}">${u.name}</option>`).join('');
        }

    } catch (err) {
        console.error('Erro no carregamento dinâmico:', err);
    }
}

/**
 * Inventory List Loading
 */
async function loadInventory() {
    const list = document.getElementById('inventory-list');
    if (!list) return;

    try {
        const { data: products, error } = await MyFleetCar.DB.select('inventory', {
            order: { column: 'name', ascending: true }
        });

        if (error) throw error;

        allProducts = products || [];
        renderInventory(allProducts);

    } catch (err) {
        console.error('Erro ao carregar estoque:', err);
        list.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-red-500 font-bold">Erro ao carregar dados. Verifique sua conexão.</td></tr>';
    }
}

/**
 * Render Inventory Table
 */
function renderInventory(products) {
    const list = document.getElementById('inventory-list');
    if (!list) return;

    list.innerHTML = '';
    let totalValue = 0;
    let lowStockCount = 0;

    if (!products || products.length === 0) {
        list.innerHTML = '<tr><td colspan="6" class="px-6 py-20 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhum item encontrado.</td></tr>';
        updateStats(0, 0, 0);
        return;
    }

    products.forEach(p => {
        const isLowStock = (p.quantity || 0) <= (p.min_quantity || 5);
        if (isLowStock) lowStockCount++;
        totalValue += (p.quantity || 0) * (p.purchase_price || 0);

        const row = document.createElement('tr');
        row.className = 'border-b border-slate-50 hover:bg-slate-50/50 transition-colors group cursor-pointer';
        row.onclick = () => openProductDetailModal(p.id);
        row.innerHTML = `
            <td class="px-6 py-4" data-label="Produto & Marca">
                <div class="flex flex-col hover:translate-x-1 transition-transform">
                    <span class="text-sm font-bold text-on-surface line-clamp-1 group-hover:text-primary transition-colors">${p.name}</span>
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">${p.brand || 'S/ Marca'} - Ref: ${p.reference_code || '---'}</span>
                </div>
            </td>
            <td class="px-6 py-4" data-label="Aplicação">
                <span class="text-xs font-medium text-slate-500 line-clamp-1">${p.vehicle_models || 'Universal'}</span>
            </td>
            <td class="px-6 py-4 text-center" data-label="Estoque">
                <div class="flex flex-col items-center">
                    <span class="text-sm font-black ${isLowStock ? 'text-red-600' : 'text-on-surface'}">${p.quantity || 0} ${p.unit_of_measure || 'UN'}</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase">Mín: ${p.min_quantity || 0}</span>
                </div>
            </td>
            <td class="px-6 py-4 text-right" data-label="Vlr. Custo">
                <span class="text-[11px] font-bold text-slate-400 italic">R$ ${(p.purchase_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </td>
            <td class="px-6 py-4 text-right" data-label="Vlr. Venda">
                <span class="text-sm font-black text-on-surface">R$ ${(p.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </td>
        `;
        list.appendChild(row);
    });

    updateStats(products.length, lowStockCount, totalValue);
}

/**
 * Update Stats in the UI
 */
function updateStats(totalSku, lowStock, totalValue) {
    const skuEl = document.getElementById('total-sku-count');
    const lowEl = document.getElementById('low-stock-count');
    const valEl = document.getElementById('inventory-total-value');
    const valBentoEl = document.getElementById('inventory-total-value-bento');
    const pagInfo = document.getElementById('pagination-info');

    if (skuEl) skuEl.textContent = totalSku;
    if (lowEl) lowEl.textContent = lowStock;
    if (valEl) valEl.textContent = totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (valBentoEl) valBentoEl.textContent = totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (pagInfo) pagInfo.textContent = `Mostrando ${totalSku} produto(s)`;
}

/**
 * Setup Filters and Search
 */
function setupFilters() {
    const searchInput = document.getElementById('inventory-search');
    const categorySelect = document.getElementById('filter-category');
    const statusSelect = document.getElementById('filter-status');
    const lowStockBtn = document.getElementById('filter-low-stock');

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (categorySelect) categorySelect.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);

    if (categorySelect) {
        MyFleetCar.DB.select('inventory_categories', { order: { column: 'name', ascending: true } })
            .then(({ data }) => {
                if (data) {
                    categorySelect.innerHTML = '<option value="Todas">Todas</option>' + 
                        data.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
                }
            });
    }

    if (lowStockBtn) {
        lowStockBtn.addEventListener('click', () => {
            const isActive = lowStockBtn.classList.toggle('bg-orange-600');
            lowStockBtn.classList.toggle('text-white');
            if (isActive) {
                lowStockBtn.classList.remove('bg-orange-50', 'text-orange-600');
            } else {
                lowStockBtn.classList.add('bg-orange-50', 'text-orange-600');
            }
            applyFilters();
        });
    }
}

/**
 * Apply Search and Filter logic
 */
function applyFilters() {
    const query = document.getElementById('inventory-search')?.value.toLowerCase() || '';
    const category = document.getElementById('filter-category')?.value || 'Todas';
    const lowStockBtn = document.getElementById('filter-low-stock');
    const showLowStock = lowStockBtn?.classList.contains('bg-orange-600');

    let filtered = allProducts.filter(p => {
        const matchesQuery = p.name.toLowerCase().includes(query) || 
                           (p.brand || '').toLowerCase().includes(query) || 
                           (p.reference_code || '').toLowerCase().includes(query);
        
        const matchesCategory = category === 'Todas' || p.category === category;
        
        const isLow = (p.quantity || 0) <= (p.min_quantity || 5);
        const matchesLowStock = !showLowStock || isLow;

        return matchesQuery && matchesCategory && matchesLowStock;
    });

    renderInventory(filtered);
}

/**
 * Movement History Loading
 */
async function loadMovements() {
    const listContainer = document.getElementById('movements-list');
    if (!listContainer) return;

    try {
        const { data: movements, error } = await MyFleetCar.DB.select('inventory_movements', {
            select: '*, inventory(name, sku)',
            order: { column: 'created_at', ascending: false }
        });

        allMovements = movements || [];
        renderMovements(allMovements);

    } catch (err) {
        console.error('Error loading movements:', err);
    }
}

/**
 * Render Movements Table
 */
function renderMovements(movements) {
    const listContainer = document.getElementById('movements-list');
    if (!listContainer) return;

    if (!movements || movements.length === 0) {
        listContainer.innerHTML = '<tr><td colspan="6" class="px-8 py-20 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest italic">Nenhuma movimentação encontrada.</td></tr>';
        return;
    }

    listContainer.innerHTML = movements.map(mv => {
        const isAdjustment = mv.batch_id && mv.batch_id.includes('AJUSTE');
        const displayType = isAdjustment ? 'AJUSTE' : mv.type;
        
        let typeClass = 'bg-slate-50 text-slate-600';
        if (isAdjustment) {
            typeClass = 'bg-orange-50 text-orange-600';
        } else if (mv.type === 'Entrada') {
            typeClass = 'bg-green-50 text-green-600';
        } else if (mv.type === 'Saída') {
            typeClass = 'bg-red-50 text-red-600';
        } else if (mv.type === 'Estorno') {
            typeClass = 'bg-blue-50 text-blue-600';
        }
        
        const profit = mv.type === 'Saída' ? (mv.quantity * ((mv.unit_sale || 0) - (mv.unit_cost || 0))) : 0;
        return `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-4 text-xs font-medium text-slate-500" data-label="Data">
                ${new Date(mv.created_at.includes('T') ? mv.created_at : mv.created_at + 'T12:00:00').toLocaleDateString('pt-BR')}
            </td>
            <td class="px-6 py-4" data-label="Produto">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-900">${mv.inventory?.name || 'Item Excluído'}</span>
                    <span class="text-[9px] font-mono text-slate-400 uppercase tracking-widest">${mv.inventory?.sku || '---'}</span>
                </div>
            </td>
            <td class="px-6 py-4" data-label="Lote / Ref">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    ${mv.batch_id || mv.invoice_number || '---'}
                </span>
            </td>
            <td class="px-6 py-4" data-label="Tipo">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${typeClass}">
                    ${displayType}
                </span>
            </td>
            <td class="px-6 py-4 text-right text-sm font-black text-slate-900" data-label="Quantidade">
                ${mv.quantity}
            </td>
            <td class="px-6 py-4 text-right text-xs font-bold text-slate-600" data-label="Vlr. Unitário">
                R$ ${(mv.type === 'Saída' ? (mv.unit_sale || 0) : (mv.unit_cost || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </td>
            <td class="px-6 py-4 text-right text-xs font-bold ${profit > 0 ? 'text-green-600' : 'text-slate-400'}" data-label="Lucro">
                ${profit > 0 ? `R$ ${profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '---'}
            </td>
            <td class="px-6 py-4 text-xs text-slate-500 italic max-w-xs truncate" data-label="Motivo">
                ${mv.supplier ? `[${mv.supplier}] ` : ''}${mv.reason || ''}
            </td>
            <td class="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-tighter" data-label="Responsável">
                Sistema
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="deleteMovement('${mv.id}', '${mv.product_id}')" class="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </td>
        </tr>
    `; }).join('');
}

/**
 * Apply Filters for Movements
 */
function applyMovementFilters() {
    const query = document.getElementById('movement-search')?.value.toLowerCase() || '';
    const type = document.getElementById('filter-type')?.value || 'all';
    const period = document.getElementById('filter-period')?.value || 'all';

    let filtered = allMovements.filter(mv => {
        const prodName = (mv.inventory?.name || '').toLowerCase();
        const sku = (mv.inventory?.sku || '').toLowerCase();
        const reason = (mv.reason || '').toLowerCase();
        const isAdjustment = mv.batch_id && mv.batch_id.includes('AJUSTE');

        const matchesQuery = prodName.includes(query) || sku.includes(query) || reason.includes(query);
        
        let matchesType = true;
        if (type === 'Ajuste') {
            matchesType = isAdjustment;
        } else if (type !== 'all') {
            // If filtering for Entrada/Saída, ensure it's NOT an adjustment
            matchesType = mv.type === type && !isAdjustment;
        }

        let matchesDate = true;
        const mvDate = new Date(mv.created_at);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (period === '7days') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);
            sevenDaysAgo.setHours(0, 0, 0, 0);
            matchesDate = mvDate >= sevenDaysAgo && mvDate <= today;
        } else if (period === '15days') {
            const fifteenDaysAgo = new Date();
            fifteenDaysAgo.setDate(today.getDate() - 15);
            fifteenDaysAgo.setHours(0, 0, 0, 0);
            matchesDate = mvDate >= fifteenDaysAgo && mvDate <= today;
        } else if (period === 'prevMonth') {
            const firstDayPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            lastDayPrevMonth.setHours(23, 59, 59, 999);
            matchesDate = mvDate >= firstDayPrevMonth && mvDate <= lastDayPrevMonth;
        } else if (period === 'custom') {
            const startStr = document.getElementById('filter-date-start')?.value;
            const endStr = document.getElementById('filter-date-end')?.value;
            if (startStr) {
                const start = new Date(startStr);
                start.setHours(0, 0, 0, 0);
                matchesDate = matchesDate && mvDate >= start;
            }
            if (endStr) {
                const end = new Date(endStr);
                end.setHours(23, 59, 59, 999);
                matchesDate = matchesDate && mvDate <= end;
            }
        }

        return matchesQuery && matchesType && matchesDate;
    });

    renderMovements(filtered);
    updateMovementStats(filtered);
}

function updateMovementStats(movements) {
    const elEntries = document.getElementById('stat-entries');
    const elExits = document.getElementById('stat-exits');
    const elProfit = document.getElementById('stat-profit');

    if (!elEntries && !elExits && !elProfit) return;

    let entries = 0;
    let exits = 0;
    let profit = 0;

    movements.forEach(m => {
        if (m.type === 'Entrada') entries += (m.quantity || 0);
        else if (m.type === 'Saída') {
            exits += (m.quantity || 0);
            profit += (m.quantity || 0) * ((m.unit_sale || 0) - (m.unit_cost || 0));
        }
    });

    if (elEntries) elEntries.textContent = `${entries} itens`;
    if (elExits) elExits.textContent = `${exits} itens`;
    if (elProfit) elProfit.textContent = profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toggleDateRangeDisplay() {
    const period = document.getElementById('filter-period')?.value;
    const customRange = document.getElementById('custom-date-range');
    if (!customRange) return;
    
    if (period === 'custom') {
        customRange.classList.remove('hidden');
    } else {
        customRange.classList.add('hidden');
    }
}

/**
 * Product Options for Modal
 */
async function loadProductOptions() {
    const select = document.getElementById('picker-product') || document.getElementById('mv-product');
    if (!select) return;

    try {
        const { data: products } = await MyFleetCar.DB.select('inventory', { order: { column: 'name', ascending: true } });
        if (!products) return;

        select.innerHTML = '<option value="">Selecione o produto...</option>' + 
            products.map(p => `<option value="${p.id}">${p.name} (${p.brand || 'S/ Marca'})</option>`).join('');
    } catch (err) {
        console.error(err);
    }
}

/**
 * Form Handlers
 */
async function handleNewProduct(e) {
    if (e) e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        if (!user) throw new Error('Usuário não autenticado.');

        const productData = {
            workshop_id: user.id,
            name: document.getElementById('prod-name').value,
            brand: document.getElementById('prod-brand').value,
            reference_code: document.getElementById('prod-ref').value,
            sku: document.getElementById('prod-sku').value,
            barcode: document.getElementById('prod-barcode').value,
            description: document.getElementById('prod-description').value,
            unit_of_measure: document.getElementById('prod-unit').value,
            category: document.getElementById('prod-category').value,
            vehicle_models: getSelectedVehicleTags().join(', '),
            quantity: parseInt(document.getElementById('prod-qty').value) || 0,
            min_quantity: parseInt(document.getElementById('prod-min-qty').value) || 0,
            purchase_price: parseFloat(document.getElementById('prod-buy-price').value.replace(',', '.')) || 0,
            sale_price: parseFloat(document.getElementById('prod-sell-price').value.replace(',', '.')) || 0
        };

        const editId = form.dataset.editId;

        if (editId) {
            const { error } = await MyFleetCar.DB.update('inventory', productData, { id: editId });
            if (error) throw error;
            alert('Produto atualizado com sucesso!');
        } else {
            productData.created_at = new Date().toISOString();
            const { error } = await MyFleetCar.DB.insert('inventory', productData);
            if (error) throw error;
            alert('Produto cadastrado com sucesso!');
        }

        window.location.href = 'lista-estoque.html';

    } catch (err) {
        alert('Erro ao cadastrar: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar Produto'; }
    }
}

/**
 * Batch Movement Logic
 */
let movementBatch = [];
let currentBatchId = '';

function openMovementModal() {
    const modal = document.getElementById('movement-modal');
    const overlay = document.getElementById('modal-overlay');
    if (modal) modal.classList.remove('hidden');
    if (overlay) overlay.classList.remove('hidden');

    // Reset Modal State
    movementBatch = [];
    currentBatchId = 'BAT-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    const batchDisplay = document.getElementById('mv-batch-display');
    const dateInput = document.getElementById('mv-date');
    const listContainer = document.getElementById('batch-items-list');
    const totalEl = document.getElementById('batch-total-value');

    if (batchDisplay) batchDisplay.textContent = `LOTE: #${currentBatchId}`;
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (listContainer) listContainer.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">Nenhum produto adicionado ao lote.</td></tr>';
    if (totalEl) totalEl.textContent = 'R$ 0,00';
    
    loadProductOptions();
    loadActiveOS();
    loadSupplierOptions();
    if (typeof toggleMovementFields === 'function') toggleMovementFields();
}

function closeMovementModal() {
    const modal = document.getElementById('movement-modal');
    const overlay = document.getElementById('modal-overlay');
    if (modal) modal.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
}

window.toggleMovementFields = function() {
    const typeEl = document.getElementById('mv-type');
    if (!typeEl) return;
    
    const type = typeEl.value;
    const entryGroup = document.getElementById('mv-entry-group');
    const exitGroup = document.getElementById('mv-exit-group');
    const saleGroup = document.getElementById('picker-sale-group');
    const priceLabel = document.getElementById('picker-price-label');

    if (type === 'Entrada') {
        if (entryGroup) entryGroup.classList.remove('hidden');
        if (exitGroup) exitGroup.classList.add('hidden');
        if (saleGroup) saleGroup.classList.remove('hidden');
        if (priceLabel) priceLabel.textContent = 'Vlr. Custo UN';
    } else {
        if (entryGroup) entryGroup.classList.add('hidden');
        if (exitGroup) exitGroup.classList.remove('hidden');
        if (saleGroup) saleGroup.classList.add('hidden');
        if (priceLabel) priceLabel.textContent = 'Vlr. Saída UN';
    }
    
    // Reset picker prices
    const priceInput = document.getElementById('picker-price');
    const saleInput = document.getElementById('picker-sale');
    if (priceInput) priceInput.value = '';
    if (saleInput) saleInput.value = '';
};

window.toggleOSSelection = function() {
    const linkEl = document.getElementById('mv-link-os');
    const container = document.getElementById('mv-os-select-container');
    if (!linkEl || !container) return;
    
    if (linkEl.value === 'sim') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
};

async function loadActiveOS() {
    const select = document.getElementById('mv-os-id');
    if (!select) return;

    try {
        const { data: osList } = await MyFleetCar.DB.select('service_orders', {
            select: 'id, os_number, customers(full_name)',
            filter: { status: { neq: 'Concluído' } },
            order: { column: 'os_number', ascending: false }
        });

        if (osList && osList.length > 0) {
            select.innerHTML = '<option value="">Selecione a OS...</option>' + 
                osList.map(os => `<option value="${os.id}">${os.os_number} - ${os.customers?.full_name || 'S/ Cliente'}</option>`).join('');
        } else {
            select.innerHTML = '<option disabled>Nenhuma OS aberta</option>';
        }
    } catch (err) {
        console.error('Error loading active OS:', err);
    }
}

async function loadSupplierOptions() {
    const select = document.getElementById('mv-supplier');
    if (!select) return;

    try {
        const { data: sups } = await MyFleetCar.DB.select('suppliers', { order: { column: 'name', ascending: true } });
        if (sups) {
            select.innerHTML = '<option value="">Selecione o fornecedor...</option>' + 
                sups.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
        }
    } catch (err) {
        console.error('Error loading supplier options:', err);
    }
}

window.quickAddSupplier = async function() {
    const name = prompt('Digite o nome do novo fornecedor:');
    if (!name || name.trim() === '') return;

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        if (!user) return;

        const { error } = await MyFleetCar.DB.insert('suppliers', { 
            workshop_id: user.id, 
            name: name.trim().toUpperCase() 
        });
        if (error) throw error;

        await loadSupplierOptions();
        const select = document.getElementById('mv-supplier');
        if (select) select.value = name.trim().toUpperCase();

    } catch (err) {
        alert('Erro ao cadastrar fornecedor: ' + err.message);
    }
};

window.updatePickerStock = async function() {
    const productId = document.getElementById('picker-product').value;
    const info = document.getElementById('picker-stock-info');
    const priceInput = document.getElementById('picker-price');
    const saleInput = document.getElementById('picker-sale');

    if (!productId) {
        if (info) info.textContent = 'Estoque: 0';
        return;
    }

    try {
        const { data: products } = await MyFleetCar.DB.select('inventory', { match: { id: productId } });
        if (products && products[0]) {
            const p = products[0];
            if (info) info.textContent = `Estoque: ${p.quantity || 0}`;
            
            const type = document.getElementById('mv-type').value;
            if (type === 'Entrada') {
                if (priceInput) priceInput.value = (p.purchase_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                if (saleInput) saleInput.value = (p.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            } else {
                if (priceInput) priceInput.value = (p.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            }
        }
    } catch (err) { console.error('Error updating picker stock:', err); }
};

window.addProductToBatch = function() {
    const prodEl = document.getElementById('picker-product');
    const productId = prodEl.value;
    const productName = prodEl.options[prodEl.selectedIndex].text;
    const qty = parseInt(document.getElementById('picker-qty').value);
    const priceStr = document.getElementById('picker-price').value.replace(/\./g, '').replace(',', '.');
    const saleStr = document.getElementById('picker-sale').value.replace(/\./g, '').replace(',', '.');
    
    const price = parseFloat(priceStr) || 0;
    const sale = parseFloat(saleStr) || 0;

    if (!productId || qty <= 0) {
        alert('Selecione um produto e uma quantidade válida.');
        return;
    }

    // Check duplicate
    const existing = movementBatch.find(i => i.product_id === productId);
    if (existing) {
        existing.quantity += qty;
        existing.price = price; // Update to latest price in batch
        existing.sale_price = sale;
    } else {
        movementBatch.push({
            product_id: productId,
            name: productName,
            quantity: qty,
            price: price,
            sale_price: sale
        });
    }

    renderBatchTable();
};

function renderBatchTable() {
    const list = document.getElementById('batch-items-list');
    const totalEl = document.getElementById('batch-total-value');
    if (!list || !totalEl) return;
    
    if (movementBatch.length === 0) {
        list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">Nenhum produto adicionado ao lote.</td></tr>';
        totalEl.textContent = 'R$ 0,00';
        return;
    }

    let totalBatchValue = 0;
    list.innerHTML = movementBatch.map((item, index) => {
        const subtotal = item.quantity * item.price;
        totalBatchValue += subtotal;
        return `
            <tr class="border-b border-slate-50 hover:bg-slate-50">
                <td class="px-6 py-4 font-bold text-slate-700">${item.name}</td>
                <td class="px-6 py-4 text-center">${item.quantity}</td>
                <td class="px-6 py-4 text-right">R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td class="px-6 py-4 text-right font-black">R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td class="px-6 py-4 text-center">
                    <button onclick="removeProductFromBatch(${index})" class="text-red-400 hover:text-red-600">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    totalEl.textContent = totalBatchValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

window.removeProductFromBatch = function(index) {
    movementBatch.splice(index, 1);
    renderBatchTable();
};

window.submitBatchMovements = async function() {
    if (movementBatch.length === 0) {
        alert('Adicione pelo menos um produto ao lote.');
        return;
    }

    const btn = document.getElementById('submit-batch-btn');
    btn.disabled = true;
    btn.textContent = 'Processando...';

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const type = document.getElementById('mv-type').value;
        const date = document.getElementById('mv-date').value;
        const invoice = document.getElementById('mv-invoice').value;
        const supplier = document.getElementById('mv-supplier').value;
        const osId = document.getElementById('mv-os-id').value;
        const linkOs = document.getElementById('mv-link-os').value === 'sim';

        for (const item of movementBatch) {
            // 1. Get current product state
            const { data: products } = await MyFleetCar.DB.select('inventory', { match: { id: item.product_id } });
            if (!products || !products[0]) continue;
            
            const p = products[0];
            const currentQty = p.quantity || 0;
            const currentCost = p.purchase_price || 0;
            
            let newQty = currentQty;
            let finalCost = currentCost;
            let finalSale = p.sale_price || 0;

            if (type === 'Entrada') {
                newQty = currentQty + item.quantity;
                // Weighted Average Cost
                finalCost = newQty > 0 ? ((currentQty * currentCost) + (item.quantity * item.price)) / newQty : item.price;
                if (item.sale_price > 0) finalSale = item.sale_price;
            } else {
                newQty = currentQty - item.quantity;
                if (newQty < 0) throw new Error(`Saldo insuficiente para o produto: ${item.name}`);
            }

            // 2. Insert Movement
            const mvData = {
                workshop_id: user.id,
                product_id: item.product_id,
                type: type,
                quantity: item.quantity,
                unit_cost: item.price,
                unit_sale: item.sale_price || finalSale,
                batch_id: currentBatchId,
                invoice_number: invoice || null,
                supplier: supplier || null,
                service_order_id: (type === 'Saída' && linkOs && osId) ? osId : null,
                created_at: new Date(date + 'T12:00:00').toISOString()
            };

            const { error: mvError } = await MyFleetCar.DB.insert('inventory_movements', mvData);
            if (mvError) throw mvError;

            // 3. Update Inventory
            const { error: invError } = await MyFleetCar.DB.update('inventory', {
                quantity: newQty,
                purchase_price: finalCost,
                sale_price: finalSale
            }, { id: item.product_id });
            
            if (invError) throw invError;
        }

        alert('Movimentação em lote finalizada com sucesso!');
        closeMovementModal();
        loadMovements();
        loadInventory();

    } catch (err) {
        alert('Erro ao processar lote: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Finalizar Lote';
    }
};

async function generateInternalCode() {
    const prefix = 'INT-';
    const timestamp = new Date().getTime().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const code = `${prefix}${timestamp}${random}`;
    const input = document.getElementById('prod-sku');
    if (input) input.value = code;
}

async function deleteProduct(id, name) {
    if (!confirm(`Deseja realmente excluir o produto "${name}"?\nEsta ação não poderá ser desfeita.`)) return false;

    try {
        // Check for any movements to preserve audit trail
        let hasMovements = false;
        try {
            const { data: movements, error: mvError } = await MyFleetCar.DB.select('inventory_movements', {
                match: { product_id: id },
                limit: 1
            });

            if (!mvError && movements && movements.length > 0) {
                hasMovements = true;
            }
        } catch (e) {
            console.warn('Erro ao verificar histórico:', e);
        }

        if (hasMovements) {
            alert('Não é possível excluir este produto pois ele já possui histórico de movimentação vinculado (entradas ou saídas).');
            return false;
        }

        const { error } = await MyFleetCar.DB.delete('inventory', { id: id });
        if (error) throw error;

        alert('Produto excluído com sucesso!');
        loadInventory();
        return true;

    } catch (err) {
        alert('Erro ao excluir: ' + err.message);
        return false;
    }
}

// Global exposure
/**
 * Product Detail Modal Logic
 */
window.currentViewedProductId = '';

window.openProductDetailModal = async function(productId) {
    const modal = document.getElementById('product-detail-modal');
    if (!modal) return;
    
    currentViewedProductId = productId;
    modal.classList.remove('hidden');

    try {
        // 1. Fetch Product Data
        const { data: products } = await MyFleetCar.DB.select('inventory', { match: { id: productId } });
        if (!products || !products[0]) throw new Error('Produto não encontrado');
        const p = products[0];

        // 2. Populate General Info
        document.getElementById('pd-name').textContent = p.name;
        document.getElementById('pd-sku').textContent = `SKU: ${p.sku || '---'}`;
        document.getElementById('pd-category').textContent = p.category || 'SEM CATEGORIA';
        document.getElementById('pd-brand').textContent = p.brand || '---';
        document.getElementById('pd-vehicles').textContent = p.vehicle_models || 'Universal';
        document.getElementById('pd-ref').textContent = p.reference_code || '---';
        document.getElementById('pd-created').textContent = new Date(p.created_at).toLocaleDateString('pt-BR');
        document.getElementById('pd-cost').textContent = (p.purchase_price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('pd-sale').textContent = (p.sale_price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('pd-current-stock').textContent = `SALDO ATUAL: ${p.quantity || 0}`;
        document.getElementById('pd-unit-display').textContent = p.unit_of_measure || 'UN';
        
        // Reset Adjustment Form
        document.getElementById('adj-qty').value = p.quantity || 0;
        document.getElementById('adj-reason').value = '';

        // 3. Fetch Movement History for this product
        const { data: movements } = await MyFleetCar.DB.select('inventory_movements', {
            match: { product_id: productId },
            order: { column: 'created_at', ascending: false },
            limit: 50
        });

        const list = document.getElementById('pd-movements-list');
        const emptyState = document.getElementById('pd-history-empty');
        
        if (!movements || movements.length === 0) {
            list.innerHTML = '';
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            list.innerHTML = movements.map(mv => {
                const isAdjustment = mv.batch_id && mv.batch_id.includes('AJUSTE');
                const displayType = isAdjustment ? 'AJUSTE' : mv.type;
                
                let typeClass = 'bg-slate-50 text-slate-600';
                if (isAdjustment) {
                    typeClass = 'bg-orange-50 text-orange-600';
                } else if (mv.type === 'Entrada') {
                    typeClass = 'bg-green-50 text-green-600';
                } else if (mv.type === 'Saída') {
                    typeClass = 'bg-red-50 text-red-600';
                } else if (mv.type === 'Estorno') {
                    typeClass = 'bg-blue-50 text-blue-600';
                }
                
                return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 text-[10px] text-slate-500">${new Date(mv.created_at).toLocaleDateString('pt-BR')}</td>
                    <td class="px-6 py-3">
                        <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${typeClass}">
                            ${displayType}
                        </span>
                    </td>
                    <td class="px-6 py-3 text-center font-bold text-slate-700">${mv.quantity}</td>
                    <td class="px-6 py-3 text-right text-[10px] font-bold text-slate-500">R$ ${(mv.type === 'Saída' ? (mv.unit_sale || 0) : (mv.unit_cost || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td class="px-6 py-3 text-[10px] text-slate-400 font-mono">${mv.batch_id || mv.invoice_number || '---'}</td>
                </tr>
            `; }).join('');
        }

    } catch (err) {
        alert('Erro ao carregar detalhes: ' + err.message);
        closeProductDetailModal();
    }
};

window.closeProductDetailModal = function() {
    const modal = document.getElementById('product-detail-modal');
    if (modal) modal.classList.add('hidden');
    currentViewedProductId = '';
};

window.submitStockAdjustment = async function() {
    const newQty = parseInt(document.getElementById('adj-qty').value);
    const reason = document.getElementById('adj-reason').value.trim();
    
    if (isNaN(newQty)) { alert('Informe uma quantidade válida.'); return; }
    if (!reason) { alert('Informe o motivo do reajuste (Ex: Inventário de final de mês).'); return; }

    const btn = document.getElementById('btn-adj');
    btn.disabled = true;
    btn.textContent = 'Processando...';

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        if (!user) return;

        // 1. Get current state to calculate difference
        const { data: products } = await MyFleetCar.DB.select('inventory', { match: { id: currentViewedProductId } });
        const p = products[0];
        const oldQty = p.quantity || 0;
        const diff = newQty - oldQty;

        if (diff === 0) {
            alert('A nova quantidade é igual à atual. Nenhuma alteração necessária.');
            return;
        }

        // 2. Insert Adjustment Movement
        const mvData = {
            workshop_id: user.id,
            product_id: currentViewedProductId,
            type: diff > 0 ? 'Entrada' : 'Saída',
            quantity: Math.abs(diff),
            unit_cost: p.purchase_price || 0,
            unit_sale: p.sale_price || 0,
            batch_id: 'AJUSTE-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
            reason: `[REAJUSTE MANUAL] ${reason}`,
            created_at: new Date().toISOString()
        };

        const { error: mvError } = await MyFleetCar.DB.insert('inventory_movements', mvData);
        if (mvError) throw mvError;

        // 3. Update Inventory
        const { error: invError } = await MyFleetCar.DB.update('inventory', { quantity: newQty }, { id: currentViewedProductId });
        if (invError) throw invError;

        alert('Estoque reajustado com sucesso!');
        openProductDetailModal(currentViewedProductId); // Refresh modal
        loadInventory(); // Refresh main list

    } catch (err) {
        alert('Erro ao reajustar: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Reajuste';
    }
};

window.deleteMovement = async function(id, productId) {
    if (!confirm('Deseja realmente excluir esta movimentação?\nO estoque será ajustado automaticamente.')) return;

    try {
        // 1. Get movement details
        const { data: mvs } = await MyFleetCar.DB.select('inventory_movements', { match: { id } });
        if (!mvs || !mvs[0]) return;
        const mv = mvs[0];

        // 2. Double check if it's really the last movement (extra safety)
        const { data: latest } = await MyFleetCar.DB.select('inventory_movements', {
            match: { product_id: productId },
            order: { column: 'created_at', ascending: false },
            limit: 1
        });

        if (latest && latest[0] && latest[0].id !== id) {
            alert('Não é possível excluir esta movimentação pois já existem registros mais recentes para este produto.');
            return;
        }

        // 3. Get current product quantity
        const { data: products } = await MyFleetCar.DB.select('inventory', { match: { id: productId } });
        if (!products || !products[0]) return;
        const p = products[0];

        // 4. Calculate new quantity
        // If we delete an Entrance, we deduct. If we delete an Exit, we add back.
        let newQty = p.quantity || 0;
        if (mv.type === 'Entrada' || mv.type === 'Estorno') {
            newQty -= mv.quantity;
        } else if (mv.type === 'Saída') {
            newQty += mv.quantity;
        }
        
        if (newQty < 0) {
            alert('Não é possível excluir esta entrada pois o saldo atual ficaria negativo.');
            return;
        }

        // 5. Update Inventory and Delete Movement
        const { error: invError } = await MyFleetCar.DB.update('inventory', { quantity: newQty }, { id: productId });
        if (invError) throw invError;

        const { error: delError } = await MyFleetCar.DB.delete('inventory_movements', { id });
        if (delError) throw delError;

        alert('Movimentação excluída e estoque ajustado!');
        openProductDetailModal(productId);
        loadInventory();

    } catch (err) {
        alert('Erro ao excluir movimentação: ' + err.message);
    }
};

window.submitBatchMovements = submitBatchMovements;
window.handleNewProduct = handleNewProduct;
window.generateInternalCode = generateInternalCode;
window.deleteProduct = deleteProduct;
window.editProduct = (id) => { window.location.href = `cadastro-produto-estoque.html?id=${id}`; };
window.loadInventory = loadInventory;
window.loadMovements = loadMovements;
window.loadProductOptions = loadProductOptions;
window.quickAddAux = quickAddAux;
window.loadDynamicAuxData = loadDynamicAuxData;
window.applyMovementFilters = applyMovementFilters;
window.toggleDateRangeDisplay = function() {
    const period = document.getElementById('filter-period')?.value;
    const customRange = document.getElementById('custom-date-range');
    if (customRange) {
        if (period === 'custom') {
            customRange.classList.remove('hidden');
        } else {
            customRange.classList.add('hidden');
        }
    }
};
window.openMovementModal = openMovementModal;
window.closeMovementModal = closeMovementModal;
window.closeProductDetailModal = closeProductDetailModal;
window.deleteProductFromModal = async function() {
    if (!currentViewedProductId) return;
    const name = document.getElementById('pd-name').textContent;
    if (await deleteProduct(currentViewedProductId, name)) {
        closeProductDetailModal();
    }
};

/**
 * Load product data for editing if ID is present
 */
async function loadProductForEdit() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const form = document.getElementById('product-form');
    if (!productId || !form) return;

    try {
        const { data: products, error } = await MyFleetCar.DB.select('inventory', {
            match: { id: productId }
        });

        if (error) throw error;
        if (!products || products.length === 0) return;

        const p = products[0];
        
        // Change title and button text
        const title = document.querySelector('h2');
        if (title) title.textContent = 'Editar Produto';
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Atualizar Produto';

        // Fill form fields
        if (document.getElementById('prod-name')) document.getElementById('prod-name').value = p.name || '';
        
        // Fields that cannot be edited
        const disabledFields = ['prod-brand', 'prod-sku', 'prod-barcode', 'prod-qty', 'prod-buy-price'];
        disabledFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = true;
                el.classList.add('bg-slate-50', 'cursor-not-allowed', 'opacity-70');
            }
        });

        if (document.getElementById('prod-brand')) document.getElementById('prod-brand').value = p.brand || '';
        if (document.getElementById('prod-ref')) document.getElementById('prod-ref').value = p.reference_code || '';
        if (document.getElementById('prod-sku')) document.getElementById('prod-sku').value = p.sku || '';
        if (document.getElementById('prod-barcode')) document.getElementById('prod-barcode').value = p.barcode || '';
        if (document.getElementById('prod-description')) document.getElementById('prod-description').value = p.description || '';
        
        // Ensure options are loaded before setting values for selects
        // Small delay to ensure browser has rendered the options from loadDynamicAuxData
        setTimeout(() => {
            if (document.getElementById('prod-unit')) document.getElementById('prod-unit').value = p.unit_of_measure || '';
            if (document.getElementById('prod-category')) document.getElementById('prod-category').value = p.category || '';
        }, 100);
        
        // Handle Multiple Vehicles
        if (p.vehicle_models) {
            const models = p.vehicle_models.split(',').map(m => m.trim()).filter(m => m !== '');
            models.forEach(m => addVehicleTag(m));
        }

        if (document.getElementById('prod-qty')) document.getElementById('prod-qty').value = p.quantity || 0;
        if (document.getElementById('prod-min-qty')) document.getElementById('prod-min-qty').value = p.min_quantity || 0;
        
        if (document.getElementById('prod-buy-price')) {
            document.getElementById('prod-buy-price').value = (p.purchase_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        }
        if (document.getElementById('prod-sell-price')) {
            document.getElementById('prod-sell-price').value = (p.sale_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        }

        // Store ID in form
        form.dataset.editId = productId;

    } catch (err) {
        console.error('Erro ao carregar produto para edição:', err);
    }
}

/**
 * Multi-vehicle Tag Management
 */
function addVehicleTag(model) {
    const container = document.getElementById('selected-vehicles-tags');
    if (!container) return;

    // Avoid duplicates
    const existing = Array.from(container.querySelectorAll('.veh-tag')).map(t => t.dataset.value);
    if (existing.includes(model)) return;

    const tag = document.createElement('div');
    tag.className = 'veh-tag flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-all hover:bg-slate-200';
    tag.dataset.value = model;
    tag.innerHTML = `
        <span>${model}</span>
        <button type="button" class="text-slate-400 hover:text-red-500 transition-colors" onclick="this.parentElement.remove()">
            <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
    `;
    container.appendChild(tag);
}

function getSelectedVehicleTags() {
    const container = document.getElementById('selected-vehicles-tags');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.veh-tag')).map(t => t.dataset.value);
}

console.log('Inventory Module Scripts Loaded Correctmente');

/**
 * Quick add for auxiliary data from the product form
 */
async function quickAddAux(id) {
    let label = '';
    let table = '';
    
    if (id === 'prod-category') { label = 'Nova Categoria'; table = 'inventory_categories'; }
    else if (id === 'prod-vehicles') { label = 'Novo Modelo de Veículo'; table = 'vehicle_models'; }
    else if (id === 'prod-unit') { label = 'Nova Unidade de Medida'; table = 'inventory_units'; }
    else if (id === 'prod-supplier') { label = 'Novo Fornecedor'; table = 'suppliers'; }

    const name = prompt(`Digite o nome do(a) ${label}:`);
    if (!name || name.trim() === '') return;

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        if (!user) return;

        const { error } = await MyFleetCar.DB.insert(table, { workshop_id: user.id, name: name.trim().toUpperCase() });
        if (error) throw error;

        // Refresh dropdowns
        await new Promise(r => setTimeout(r, 500)); 
        await loadDynamicAuxData();
        
        // Select the newly added item
        const select = document.getElementById(id);
        if (select) {
            const finalName = name.trim().toUpperCase();
            if (id === 'prod-vehicles') {
                addVehicleTag(finalName);
                select.value = '';
            } else {
                select.value = finalName;
            }
        }

    } catch (err) {
        alert('Erro ao cadastrar rápido: ' + err.message);
    }
}
