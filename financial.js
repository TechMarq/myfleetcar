/**
 * MyFleetCar Financial Module Logic
 */

const Financial = {
    parseDate(dateStr) {
        if (!dateStr) return new Date();
        if (typeof dateStr !== 'string') return new Date(dateStr);
        return new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    },

    async initDashboard() {
        try {
            const { data: { user } } = await MyFleetCar.Auth.getUser();
            if (!user) return;

            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

            // 1. Fetch ALL financial transactions for the workshop
            const { data: allTransactions } = await MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: user.id }
            });

            const currentMonthTransactions = (allTransactions || []).filter(t => {
                const date = t.due_date || t.created_at || '';
                const d = date.split('T')[0];
                return d >= firstDayOfMonth && d <= lastDayOfMonth;
            });

            // 2. Fetch specific OS linked to ALL transactions (to have customer data for analytics)
            const linkedOsIds = [...new Set((allTransactions || [])
                .filter(t => t.service_order_id)
                .map(t => t.service_order_id))];

            let orders = [];
            if (linkedOsIds.length > 0) {
                const { data: osData } = await MyFleetCar.DB.select('service_orders', {
                    select: '*, customers(*)',
                    in: { id: linkedOsIds }
                });
                orders = osData || [];
            }

            // 3. Fetch Staff to calculate commissions
            const { data: staff } = await MyFleetCar.DB.select('staff', {
                match: { workshop_id: user.id }
            });

            // 4. Fetch Commission Receipts
            const { data: receipts } = await MyFleetCar.DB.select('commission_receipts', {
                match: { workshop_id: user.id }
            });

            this.renderMetrics(orders, currentMonthTransactions || [], staff || [], receipts || []);
            this.renderRecentTransactions(user.id);
            this.renderChart(allTransactions || []);
            this.renderOperationalInsights(allTransactions || []);
            this.renderTopCustomers(orders, allTransactions || []);
        } catch (err) {
            console.error('Financial Dashboard Error:', err);
        }
    },

    renderMetrics(orders, transactions, staff, receipts = []) {
        // 1. Calculate Revenue from Transactions
        const grossRevenue = transactions
            .filter(t => t.type === 'Receita' && t.status === 'Pago')
            .reduce((acc, t) => acc + (t.amount || 0), 0);

        const forecastedRevenue = transactions
            .filter(t => t.type === 'Receita' && t.status === 'Pendente')
            .reduce((acc, t) => acc + (t.amount || 0), 0);

        const totalMonthlyRevenue = grossRevenue + forecastedRevenue;

        // 2. Calculate Expenses (Paid)
        const paidExpenses = transactions
            .filter(t => t.type === 'Despesa' && t.status === 'Pago')
            .reduce((acc, t) => acc + (t.amount || 0), 0);

        // 3. Calculate Commissions
        const { totalCommissions, employeeCommissions } = this.calculateCommissions(orders, transactions, staff, receipts);

        // 4. Final Metrics
        // Mensal Líquido = Receitas Pagas - Despesas Pagas (Ignora comissões não pagas para não duplicar deduções)
        const netProfit = grossRevenue - paidExpenses;

        const osPaidCount = transactions.filter(t => t.service_order_id && t.type === 'Receita' && t.status === 'Pago').length;
        const osPendingCount = transactions.filter(t => t.service_order_id && t.type === 'Receita' && t.status === 'Pendente').length;

        // Update DOM using IDs (robust) or selectors (fallback)
        const metricBruto = document.getElementById('metric-bruto') || document.querySelectorAll('h3.font-black')[0];
        const metricPrevisto = document.getElementById('metric-previsto') || document.querySelectorAll('h3.font-black')[1];
        const metricLiquido = document.getElementById('metric-liquido') || document.querySelectorAll('h3.font-black')[2];
        const metricComissoes = document.getElementById('metric-comissoes') || document.querySelectorAll('h3.font-black')[3];
        const metricOs = document.getElementById('metric-os-summary') || document.querySelectorAll('h3.font-black')[4];

        if (metricBruto) metricBruto.textContent = `R$ ${grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (metricPrevisto) metricPrevisto.textContent = `R$ ${forecastedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (metricLiquido) {
            metricLiquido.textContent = `R$ ${netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            metricLiquido.classList.remove('text-green-600', 'text-red-600');
            metricLiquido.classList.add(netProfit >= 0 ? 'text-green-600' : 'text-red-600');
        }
        if (metricComissoes) metricComissoes.textContent = `R$ ${totalCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (metricOs) metricOs.innerHTML = `<span class="text-green-600">${osPaidCount} Paga</span> / <span class="text-blue-600">${osPendingCount} Pend.</span>`;

        // Labels (Optional update)
        const labels = document.querySelectorAll('.grid p.font-bold.uppercase');
        if (labels.length >= 5) {
            labels[0].textContent = 'Mensal Recebido';
            labels[1].textContent = 'Mensal Aberto';
            labels[2].textContent = 'Mensal Líquido';
            labels[3].textContent = 'Comissões (Dívida)';
            labels[4].textContent = 'Resumo OS';
        }
    },

    calculateCommissions(orders, transactions, staff) {
        let totalCommissions = 0;
        const employeeCommissions = {};

        // 1. Identify transactions that are 'Despesas' of category 'Comissão'
        // These represent already paid commissions
        const paidCommissionTrans = transactions.filter(t => 
            t.type === 'Despesa' && 
            ((t.category || '').toLowerCase() === 'comissão' || (t.description || '').toLowerCase().includes('comissão'))
        );

        orders.forEach(o => {
            console.log('Checking OS:', o.os_number || o.id, 'Status:', o.status);
            // Normalizing status to avoid issues with accents (Concluído vs Concluido)
            const osStatus = (o.status || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
            
            // Check if OS is finished
            const isValidStatus = osStatus === 'completed' || osStatus === 'concluido' || osStatus === 'finalizado' || osStatus === 'concluida';
            
            // Requirement: OS must be PAID by customer
            const customerPayment = transactions.find(t => t.service_order_id === o.id && t.type === 'Receita');
            const isOsPaid = customerPayment && customerPayment.status === 'Pago';
            
            if (!isValidStatus || !isOsPaid) return;

            // Handle labor_services that might be a JSON string in DB
            let items = o.labor_services || o.services || [];
            if (typeof items === 'string') {
                try { items = JSON.parse(items); } catch(e) { items = []; }
            }
            if (!Array.isArray(items)) items = [];

            items.forEach(item => {
                const mechanicName = (item.mechanic_name || o.mechanic_name || '').trim();
                if (!mechanicName) return;

                const employee = staff.find(s => {
                    const sName = (s.name || '').trim().toLowerCase();
                    const mName = mechanicName.toLowerCase();
                    return sName === mName || mName.includes(sName) || sName.includes(mName);
                });

                // SKIP parts for commission calculation
                if (item.type === 'part') return;

                if (employee && (employee.compensation_type || '').toLowerCase().includes('comis')) {
                    const rate = (parseFloat(employee.commission_percent) || 0) / 100;

                    const itemPrice = parseFloat(item.price || 0);
                    const itemQty = parseFloat(item.qty || 1);
                    const commissionAmount = (itemPrice * itemQty) * rate;
                    
                    totalCommissions += commissionAmount;

                    // Check if THIS specific commission was already paid
                    const itemName = item.name || item.description || 'Serviço';
                    
                    const paidTrans = paidCommissionTrans.find(pt => 
                        pt.service_order_id === o.id && 
                        (pt.description || '').toLowerCase().includes(employee.name.toLowerCase()) &&
                        (pt.description || '').toLowerCase().includes(itemName.toLowerCase())
                    );
                    const isCommissionPaid = !!paidTrans;

                    if (!employeeCommissions[employee.id]) {
                        employeeCommissions[employee.id] = {
                            id: employee.id,
                            name: employee.name,
                            total_pending: 0,
                            total_paid: 0,
                            items: []
                        };
                    }

                    // Handle Supabase returning arrays or objects for joined data
                    const rawCustomer = o.customers;
                    const rawVehicle = o.vehicles;
                    
                    const customer = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer;
                    const vehicle = Array.isArray(rawVehicle) ? rawVehicle[0] : rawVehicle;

                    const vehicleInfo = vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.license_plate})` : 'N/A';
                    const customerName = customer ? customer.full_name : 'N/A';
                    const finishedAt = o.finished_at || o.exit_date || o.created_at;

                    const commissionRecord = {
                        os_id: o.id,
                        os_number: o.os_number || o.id.toString().substring(0, 8),
                        item_name: itemName || 'Serviço',
                        total_os: (itemPrice * itemQty) || 0,
                        rate: (rate * 100).toFixed(0) + '%',
                        amount: commissionAmount || 0,
                        status: isCommissionPaid ? 'Pago' : 'Pendente',
                        paid_transaction_id: paidTrans ? paidTrans.id : null,
                        customer_name: customerName,
                        vehicle_info: vehicleInfo,
                        finished_at: finishedAt
                    };

                    employeeCommissions[employee.id].items.push(commissionRecord);
                    if (isCommissionPaid) {
                        employeeCommissions[employee.id].total_paid += commissionAmount;
                    } else {
                        employeeCommissions[employee.id].total_pending += commissionAmount;
                    }
                }
            });
        });

        // 2. Cross-reference with Receipts
        const receipts = arguments[3] || [];
        receipts.forEach(receipt => {
            if (receipt.status === 'Pago') return; // Already accounted for if paid (will be in financial_transactions)
            
            let items = receipt.items_json || [];
            if (typeof items === 'string') try { items = JSON.parse(items); } catch(e) { items = []; }
            
            items.forEach(item => {
                const empId = receipt.employee_id;
                if (!employeeCommissions[empId]) return;
                
                // Standardize property access (handle both camelCase from JS and snake_case from potential DB legacy)
                const itemOsId = item.osId || item.os_id;
                const itemServiceName = item.serviceName || item.item_name;

                // Find the matching item in employeeCommissions and update its status
                const existingItem = employeeCommissions[empId].items.find(ei => 
                    ei.os_id === itemOsId && ei.item_name === itemServiceName
                );
                
                if (existingItem && existingItem.status === 'Pendente') {
                    existingItem.status = 'RECIBO';
                    existingItem.receipt_number = receipt.receipt_number;
                    existingItem.receipt_id = receipt.id;
                }
            });
        });

        return { totalCommissions, employeeCommissions };
    },

    renderReceipts(receipts, staff) {
        const section = document.getElementById('receipts-box-section');
        const grid = document.getElementById('receipts-list-grid');
        const stats = document.getElementById('receipts-stats');
        if (!section || !grid) return;

        const openReceipts = receipts.filter(r => r.status === 'Aberto');
        
        if (openReceipts.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');

        const totalAmount = openReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        if (stats) {
            stats.innerHTML = `
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Total em Aberto</p>
                <p class="text-lg font-black text-blue-600">R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            `;
        }

        grid.innerHTML = openReceipts.map(r => {
            const employee = staff.find(s => s.id === r.employee_id);
            const empName = employee ? employee.name : 'Funcionário';
            const date = new Date(r.created_at).toLocaleDateString('pt-BR');
            
            return `
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all group border-l-4 border-l-blue-500">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <p class="text-[10px] font-black text-blue-600 uppercase tracking-widest">${r.receipt_number}</p>
                            <h3 class="text-sm font-black text-on-surface mt-1">${empName}</h3>
                            <p class="text-[10px] text-slate-400 font-medium">${date}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-black text-on-surface">R$ ${parseFloat(r.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <span class="px-2 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest rounded-full">Aberto</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2 mt-6 pt-4 border-t border-slate-50">
                        <button onclick="viewReceipt('${r.id}')" class="flex-1 py-2 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-100 transition-all">
                            Visualizar
                        </button>
                        <button onclick="payReceipt('${r.id}')" class="flex-1 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-all shadow-sm shadow-blue-200">
                            Pagar
                        </button>
                        <button onclick="deleteReceipt('${r.id}')" class="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <span class="material-symbols-outlined text-lg">delete</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    async initCommissionsPage() {
        try {
            const { data: { user } } = await MyFleetCar.Auth.getUser();
            if (!user) return;

            // Fetch data similar to dashboard (all workshop transactions)
            const { data: allTransactions } = await MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: user.id }
            });

            const { data: staff } = await MyFleetCar.DB.select('staff', {
                match: { workshop_id: user.id }
            });

            // Fetch specific OS linked to these transactions
            const linkedOsIds = [...new Set((allTransactions || [])
                .filter(t => t.service_order_id)
                .map(t => t.service_order_id))];

            let orders = [];
            if (linkedOsIds.length > 0) {
                const { data: osData } = await MyFleetCar.DB.select('service_orders', {
                    select: '*, customers(*), vehicles(*)',
                    in: { id: linkedOsIds }
                });
                orders = osData || [];
            }

            const { data: receipts } = await MyFleetCar.DB.select('commission_receipts', {
                match: { workshop_id: user.id }
            });

            const { employeeCommissions } = this.calculateCommissions(orders, allTransactions || [], staff || [], receipts || []);

            this.renderEmployeeCommissions(employeeCommissions);
            this.renderReceipts(receipts || [], staff || []);
        } catch (err) {
            alert('Erro detectado na página de comissões: ' + err.message);
            console.error('Commissions Page Error:', err);
        }
    },

    renderEmployeeCommissions(employeeMap) {
        const grid = document.getElementById('employee-commissions-grid');
        if (!grid) return;

        const employees = Object.values(employeeMap);

        if (employees.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-12 text-center text-slate-400 text-xs italic bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant/30">
                    Nenhuma comissão pendente calculada. Lembre-se: OS devem estar "Concluídas" e "Pagas" pelo cliente.
                </div>
            `;
            return;
        }

        grid.innerHTML = employees.map(emp => `
            <div class="col-span-full bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden mb-4 md:mb-8">
                <!-- Employee Header -->
                <div class="px-4 md:px-8 py-4 md:py-6 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div class="flex items-center gap-3 md:gap-4">
                        <div class="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary text-white flex items-center justify-center font-black text-lg md:text-xl shadow-md shadow-primary/20">
                            ${emp.name.charAt(0)}
                        </div>
                        <div>
                            <h3 class="text-base md:text-lg font-black text-on-surface leading-tight">${emp.name}</h3>
                            <p class="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">${emp.items.length} Serviços</p>
                        </div>
                    </div>
                    <div class="flex w-full md:w-auto justify-between md:justify-end gap-4 md:gap-8 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                        <div class="text-left md:text-right">
                            <p class="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Total Pago</p>
                            <p class="text-sm md:text-lg font-black text-slate-400">R$ ${emp.total_paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-[8px] md:text-[10px] text-primary font-bold uppercase tracking-widest leading-none">A Receber</p>
                            <p class="text-base md:text-xl font-black text-primary">R$ ${emp.total_pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>

                <!-- OS List Table -->
                <div class="overflow-x-auto no-scrollbar">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50/30 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                <th class="px-2 md:px-4 py-3 md:py-4 text-center w-10 md:w-12">
                                    <input type="checkbox" onclick="toggleSelectAllCommissions(this, '${emp.id}')" class="rounded border-slate-300 text-primary focus:ring-primary scale-75 md:scale-100">
                                </th>
                                <th class="px-4 md:px-8 py-3 md:py-4">OS / Serviço</th>
                                <th class="px-6 py-4 hidden md:table-cell">Valor Serviço</th>
                                <th class="px-6 py-4 hidden md:table-cell">Comissão (%)</th>
                                <th class="px-4 md:px-6 py-3 md:py-4">Valor Comissão</th>
                                <th class="px-4 md:px-6 py-3 md:py-4 text-center">Status</th>
                                <th class="px-4 md:px-8 py-3 md:py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50">
                            ${emp.items.map(item => `
                                <tr class="hover:bg-slate-50/30 transition-colors text-[10px] md:text-xs" 
                                    data-os="${item.os_id}" 
                                    data-amount="${item.amount}" 
                                    data-emp="${emp.name}" 
                                    data-empid="${emp.id}" 
                                    data-ref="OS #${item.os_number}"
                                    data-customer="${item.customer_name || 'N/A'}"
                                    data-vehicle="${item.vehicle_info || 'N/A'}"
                                    data-finished="${item.finished_at || ''}"
                                    data-total-os="${item.total_os || 0}"
                                    data-rate="${item.rate || '0%'}"
                                    data-service="${item.item_name || 'Serviço'}"
                                >
                                    <td class="px-2 md:px-4 py-3 md:py-4 w-10 md:w-12 text-center">
                                        ${item.status === 'Pendente' ? `
                                            <input type="checkbox" onchange="toggleCommissionSelection(this)" class="commission-checkbox-${emp.id} commission-checkbox rounded border-slate-300 text-primary focus:ring-primary scale-75 md:scale-100">
                                        ` : ''}
                                    </td>
                                    <td class="px-4 md:px-8 py-3 md:py-4">
                                        <p class="font-bold text-on-surface">#${item.os_number}</p>
                                        <p class="text-[9px] md:text-[10px] text-slate-500 font-medium truncate max-w-[100px] md:max-w-none">${item.item_name}</p>
                                    </td>
                                    <td class="px-6 py-4 hidden md:table-cell">
                                        <p class="font-medium text-slate-600">R$ ${item.total_os.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </td>
                                    <td class="px-6 py-4 hidden md:table-cell">
                                        <p class="font-medium text-slate-600">${item.rate}</p>
                                    </td>
                                    <td class="px-4 md:px-6 py-3 md:py-4">
                                        <p class="font-black text-on-surface">R$ ${item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </td>
                                    <td class="px-4 md:px-6 py-3 md:py-4 text-center">
                                        <span class="px-2 md:px-3 py-0.5 md:py-1 rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest 
                                            ${item.status === 'Pago' ? 'bg-green-100 text-green-700' : 
                                              item.status === 'RECIBO' ? 'bg-blue-600 text-white shadow-sm' : 'bg-orange-100 text-orange-700'}">
                                            ${item.status === 'RECIBO' ? `RECIBO ${item.receipt_number}` : item.status}
                                        </span>
                                    </td>
                                    <td class="px-4 md:px-8 py-3 md:py-4 text-right">
                                        ${item.status === 'Pendente' ? `
                                            <button onclick="Financial.payCommission('${emp.id}', '${emp.name}', '${item.os_id}', ${item.amount}, 'OS #${item.os_number}', '${item.item_name}')" 
                                                class="px-2 md:px-4 py-1.5 md:py-2 bg-primary text-white text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-primary-container transition-all shadow-sm">
                                                Pagar
                                            </button>
                                        ` : item.status === 'RECIBO' ? `
                                            <button onclick="viewReceipt('${item.receipt_id}')" 
                                                class="px-2 md:px-4 py-1.5 md:py-2 bg-blue-50 text-blue-600 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-100 transition-all">
                                                Ver Recibo
                                            </button>
                                        ` : `
                                            <div class="flex items-center justify-end gap-1 md:gap-2 group/undo">
                                                <div class="flex items-center text-green-600 gap-1 font-black text-[8px] md:text-[10px] uppercase tracking-widest">
                                                    <span class="material-symbols-outlined text-xs md:text-sm">check_circle</span>
                                                    <span class="hidden md:inline">Liquidado</span>
                                                </div>
                                                <button onclick="Financial.undoCommission('${item.paid_transaction_id}')" class="opacity-100 md:opacity-50 hover:opacity-100 p-1 bg-orange-50 text-orange-600 rounded md:opacity-0 md:group-hover/undo:opacity-100 transition-all shadow-sm" title="Reverter Pagamento">
                                                    <span class="material-symbols-outlined text-[14px] md:text-[16px]">undo</span>
                                                </button>
                                            </div>
                                        `}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join('');
    },

    updateCommissionBulkBar() {
        const bar = document.getElementById('commission-bulk-bar');
        const countDisplay = document.getElementById('commission-selected-count');
        if (!bar || !countDisplay) return;

        const count = window.selectedCommissions?.size || 0;
        countDisplay.textContent = count;

        if (count > 0) {
            bar.classList.remove('translate-y-32');
            bar.classList.add('translate-y-0');
        } else {
            bar.classList.add('translate-y-32');
            bar.classList.remove('translate-y-0');
        }
    },

    async payCommission(employeeId, employeeName, osId, amount, osRef, itemName) {
        if (!confirm(`Confirmar pagamento de R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para ${employeeName}?`)) return;

        try {
            const { data: { user } } = await MyFleetCar.Auth.getUser();
            if (!user) return;

            // Create a 'Despesa' transaction for this commission
            const newExpense = {
                workshop_id: user.id,
                service_order_id: osId,
                type: 'Despesa',
                category: 'Comissão',
                amount: amount,
                payment_method: 'Transferência',
                due_date: new Date().toISOString(),
                status: 'Pago',
                description: `Comissão ${osRef} (${itemName}) - Beneficiário: ${employeeName}`
            };

            const { error } = await MyFleetCar.DB.insert('financial_transactions', newExpense);
            
            if (error) throw error;

            alert('Pagamento registrado com sucesso!');
            this.initCommissionsPage(); // Refresh list
        } catch (err) {
            console.error('Error paying commission:', err);
            alert('Erro ao registrar pagamento.');
        }
    },

    async undoCommission(transactionId) {
        if (!confirm('Deseja reverter (excluir) este pagamento e voltar a comissão para pendente?')) return;
        
        try {
            const { error } = await MyFleetCar.DB.delete('financial_transactions', { id: transactionId });
            if (error) throw error;
            
            alert('Pagamento revertido com sucesso!');
            this.initCommissionsPage(); // Refresh list
        } catch (err) {
            console.error('Error undoing commission:', err);
            alert('Erro ao reverter o pagamento.');
        }
    },

    async renderRecentTransactions(workshopId) {
        const listContainer = document.getElementById('recent-transactions-list');
        if (!listContainer) return;

        try {
            // Get combined recent items (could also merge OS here if we want a unified view)
            const { data: transactions } = await MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: workshopId },
                order: { column: 'created_at', ascending: false },
                limit: 5
            });

            if (!transactions || transactions.length === 0) {
                listContainer.innerHTML = '<div class="py-8 text-center text-slate-400 text-xs">Nenhuma transação recente encontrada.</div>';
                return;
            }

            listContainer.innerHTML = transactions.map(t => `
                <div class="flex items-center justify-between group py-2 md:py-3 border-b border-slate-50 last:border-0">
                    <div class="flex items-center gap-2 md:gap-3 overflow-hidden">
                        <div class="w-8 h-8 md:w-10 md:h-10 rounded-lg ${t.type === 'Receita' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} flex items-center justify-center flex-shrink-0">
                            <span class="material-symbols-outlined text-base md:text-lg">${t.type === 'Receita' ? 'keyboard_double_arrow_up' : 'keyboard_double_arrow_down'}</span>
                        </div>
                        <div class="truncate">
                            <p class="text-[11px] md:text-sm font-bold text-on-surface truncate">${t.description}</p>
                            <p class="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-tight">${new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                    </div>
                    <p class="text-[11px] md:text-sm font-black ${t.type === 'Receita' ? 'text-green-600' : 'text-red-600'} whitespace-nowrap ml-2">
                        ${t.type === 'Receita' ? '+' : '-'} R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
            `).join('');
        } catch (err) {
            console.error('Render Transactions Error:', err);
        }
    },

    async initRevenuePage() {
        try {
            const { data: { user } } = await MyFleetCar.Auth.getUser();
            if (!user) return;

            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            // 1. Fetch ALL Transactions for the workshop
            const { data: allTransactions, error: transError } = await MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: user.id },
                order: { column: 'created_at', ascending: false }
            });

            // Filter for 'Receita' (Revenue)
            const revenueTransactions = (allTransactions || []).filter(t =>
                (t.type || '').toLowerCase() === 'receita'
            );

            // 2. Fetch linked orders and customers
            const osIds = [...new Set(revenueTransactions.filter(t => t.service_order_id).map(t => t.service_order_id))];
            let orders = [];
            if (osIds.length > 0) {
                const { data: osData } = await MyFleetCar.DB.select('service_orders', {
                    select: '*, customers(*)',
                    in: { id: osIds }
                });
                orders = osData || [];
            }

            window.revenueState = {
                transactions: revenueTransactions,
                orders: orders,
                filter: 'all',
                search: '',
                sortColumn: 'due_date',
                sortOrder: 'asc', // 'asc' or 'desc'
                firstDayOfMonth
            };

            // 3. Initial Render
            this.applyRevenueFilters();
            this.renderRevenueSummary(revenueTransactions, firstDayOfMonth);
        } catch (err) {
            console.error('Revenue Page Error:', err);
        }
    },

    applyRevenueFilters() {
        if (!window.revenueState) return;

        const { transactions, orders, filter } = window.revenueState;
        const searchLower = (document.getElementById('revenue-search')?.value || '').toLowerCase();
        const dateStart = document.getElementById('revenue-date-start')?.value;
        const dateEnd = document.getElementById('revenue-date-end')?.value;

        let filtered = transactions;

        // 1. Status Filter
        if (filter === 'Pago' || filter === 'Pendente') {
            filtered = filtered.filter(t => t.status === filter);
        } else if (filter === 'Atrasado') {
            const now = new Date();
            filtered = filtered.filter(t => t.status !== 'Pago' && this.parseDate(t.due_date || t.created_at) < now);
        }

        // 2. Date Range Filter
        if (dateStart) {
            filtered = filtered.filter(t => (t.due_date || t.created_at) >= dateStart);
        }
        if (dateEnd) {
            filtered = filtered.filter(t => (t.due_date || t.created_at) <= dateEnd);
        }

        // 3. Search Filter (OS Number or Customer Name)
        if (searchLower) {
            filtered = filtered.filter(t => {
                const order = orders.find(o => o.id === t.service_order_id);
                const customerName = (order?.customers?.full_name || '').toLowerCase();
                const description = (t.description || '').toLowerCase();
                return customerName.includes(searchLower) || description.includes(searchLower);
            });
        }

        // 4. Sort Logic
        const { sortColumn, sortOrder } = window.revenueState;
        filtered.sort((a, b) => {
            let valA = a[sortColumn] || '';
            let valB = b[sortColumn] || '';

            if (sortColumn === 'amount') {
                valA = parseFloat(valA);
                valB = parseFloat(valB);
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        this.renderRevenueTable(filtered, orders);
    },

    renderRevenueTable(transactions, orders) {
        const listContainer = document.getElementById('revenue-list');
        const paginationInfo = document.getElementById('pagination-info');
        if (!listContainer) return;

        if (transactions.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="6" class="px-8 py-20 text-center text-slate-400">Nenhum lançamento encontrado com esses filtros.</td></tr>';
            if (paginationInfo) paginationInfo.innerHTML = 'Mostrando <span class="text-on-surface">0</span> resultados';
            return;
        }

        listContainer.innerHTML = transactions.map(t => {
            const order = orders.find(o => o.id === t.service_order_id);
            const rawCustomer = order?.customers;
            const customer = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer;
            const customerName = customer?.full_name || 'N/A';
            const customerPhone = customer?.phone || '';

            const transDate = this.parseDate(t.due_date || t.created_at);
            const isOverdue = t.status !== 'Pago' && transDate < new Date();

            const statusStyle = t.status === 'Pago'
                ? 'bg-green-100 text-green-700'
                : (isOverdue ? 'bg-red-100 text-red-700 font-black' : 'bg-blue-100 text-blue-700');

            const statusLabel = t.status === 'Pago' ? 'Pago' : (isOverdue ? 'Atrasado' : 'Pendente');

            // Quick Actions Helper
            const waMsg = encodeURIComponent(`Olá ${customerName}, enviamos este lembrete sobre a sua OS ${t.description}. Status atual: ${statusLabel}. Valor: R$ ${parseFloat(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            const waLink = customerPhone ? `https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${waMsg}` : '#';

            return `
                <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group text-[10px] md:text-sm">
                    <td class="px-3 md:px-8 py-3 md:py-4">
                        <div class="flex items-center gap-2 md:gap-3">
                            <div class="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                                <span class="material-symbols-outlined text-xs md:text-sm">receipt_long</span>
                            </div>
                            <div class="truncate">
                                <p class="font-bold text-on-surface truncate max-w-[120px] md:max-w-none">${t.description}</p>
                                <p class="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase">${t.category || 'Serviço'} • <span class="text-primary/70">${transDate.toLocaleDateString('pt-BR')}</span></p>
                            </div>
                        </div>
                    </td>
                    <td class="px-3 md:px-6 py-3 md:py-4">
                        <p class="font-medium text-slate-600 truncate max-w-[100px] md:max-w-none">${customerName}</p>
                    </td>
                    <td class="hidden md:table-cell px-6 py-4">
                        <p class="font-medium text-slate-600">${transDate.toLocaleDateString('pt-BR')}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Vencimento</p>
                    </td>
                    <td class="hidden lg:table-cell px-6 py-4">
                        <span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusStyle}">
                            ${statusLabel}
                        </span>
                    </td>
                    <td class="px-3 md:px-6 py-3 md:py-4 text-right">
                        <p class="font-black text-on-surface">R$ ${parseFloat(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p class="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase">${t.payment_method || '-'}</p>
                    </td>
                    <td class="px-4 md:px-8 py-3 md:py-4 text-right">
                        <div class="flex items-center justify-end gap-1 md:gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all">
                            <!-- Action: Enviar Lembrete -->
                            <a href="${waLink}" target="_blank" class="p-1.5 md:p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-600 hover:text-white transition-all shadow-sm" title="Enviar Lembrete WhatsApp">
                                <span class="material-symbols-outlined text-xs md:text-sm">send</span>
                            </a>
                            
                            <!-- Action: Reabrir OS -->
                            ${t.service_order_id ? `
                            <button onclick="reopenOSFromFinance('${t.service_order_id}')" class="p-1.5 md:p-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-600 hover:text-white transition-all shadow-sm" title="Reabrir Ordem">
                                <span class="material-symbols-outlined text-xs md:text-sm">settings_backup_restore</span>
                            </button>
                            ` : ''}
 
                            <!-- Action: Toggle Status -->
                            <button onclick="toggleTransactionStatus('${t.id}', '${t.status}')" class="p-1.5 md:p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="${t.status === 'Pago' ? 'Marcar como Pendente' : 'Marcar como Pago'}">
                                <span class="material-symbols-outlined text-xs md:text-sm">${t.status === 'Pago' ? 'undo' : 'check'}</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (paginationInfo) {
            paginationInfo.innerHTML = `Mostrando <span class="text-on-surface">${transactions.length}</span> resultados`;
        }
    },

    renderRevenueSummary(transactions, firstDayOfMonth) {
        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        
        // Use simplified yyyy-mm-dd for comparison
        const firstDay = firstDayOfMonth.split('T')[0];

        const currentMonth = transactions.filter(t => {
            const d = t.due_date || t.created_at || '';
            return d >= firstDay && d <= lastDayOfMonth;
        });

        const totalPaid = currentMonth.filter(t => t.status === 'Pago').reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
        const totalPending = currentMonth.filter(t => t.status === 'Pendente').reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
        const avgTicket = currentMonth.length > 0 ? (totalPaid / currentMonth.length) : 0;

        // Update Bento Summary using specific IDs
        const summaryPaid = document.getElementById('revenue-summary-paid') || document.querySelectorAll('h3.font-black')[0];
        const summaryPending = document.getElementById('revenue-summary-pending') || document.querySelectorAll('h3.font-black')[1];
        const summaryAvg = document.getElementById('revenue-summary-avg') || document.querySelectorAll('h3.font-black')[2];

        if (summaryPaid) summaryPaid.textContent = `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (summaryPending) summaryPending.textContent = `R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (summaryAvg) summaryAvg.textContent = `R$ ${avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        const forecastingDisplay = document.querySelector('.forecasting-display');
        if (forecastingDisplay) {
            forecastingDisplay.textContent = `Você tem R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a receber de faturas pendentes.`;
        }
    },

    // --- EXPENSES MANAGEMENT ---

    async initExpensePage() {
        console.log('[DEBUG] Iniciando página de despesas...');
        try {
            const { data: { user } } = await MyFleetCar.Auth.getUser();
            if (!user) {
                console.error('[DEBUG] Usuário não autenticado.');
                return;
            }
            console.log('[DEBUG] Usuário logado ID:', user.id);

            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            const { data: allTransactions, error } = await MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: user.id },
                order: { column: 'due_date', ascending: false }
            });

            if (error) {
                console.error('[DEBUG] Erro na busca do DB:', error);
                return;
            }

            console.log('[DEBUG] Total de transações encontradas no banco:', allTransactions?.length || 0);
            if (allTransactions && allTransactions.length > 0) {
                console.log('[DEBUG] Exemplo da primeira transação encontrada:', {
                    tipo: allTransactions[0].type,
                    valor: allTransactions[0].amount,
                    desc: allTransactions[0].description
                });
            }

            // ultra-pervasive filtering
            const expenses = (allTransactions || []).filter(t => {
                const type = (t.type || '').toLowerCase();
                // Check if it's explicitly a Despesa, or if it has NO type and we are in the expenses page
                return type.includes('desp') || type === 'saida' || type === 'expense' || t.amount < 0 || (allTransactions.length === 1 && type === '');
            });

            console.log('[DEBUG] Total filtrado como Despesas:', expenses.length);

            window.expenseState = {
                transactions: expenses,
                filter: 'all',
                sortColumn: 'due_date',
                sortOrder: 'asc',
                firstDayOfMonth
            };

            this.applyExpenseFilters();
            this.renderExpenseSummary(expenses, firstDayOfMonth);
            this.renderPopularCategories(expenses);
        } catch (err) {
            console.error('[DEBUG] Erro Fatal no initExpensePage:', err);
        }
    },

    applyExpenseFilters() {
        if (!window.expenseState) return;
        const { transactions, filter } = window.expenseState;
        const searchLower = (document.getElementById('expense-search')?.value || '').toLowerCase();
        const dateStart = document.getElementById('expense-date-start')?.value;
        const dateEnd = document.getElementById('expense-date-end')?.value;

        let filtered = transactions;

        if (filter === 'Pago' || filter === 'Pendente') {
            filtered = filtered.filter(t => t.status === filter);
        } else if (filter === 'Atrasado') {
            const now = new Date();
            filtered = filtered.filter(t => t.status !== 'Pago' && this.parseDate(t.due_date || t.created_at) < now);
        }

        if (dateStart) filtered = filtered.filter(t => (t.due_date || t.created_at) >= dateStart);
        if (dateEnd) filtered = filtered.filter(t => (t.due_date || t.created_at) <= dateEnd);

        if (searchLower) {
            filtered = filtered.filter(t => (t.description || '').toLowerCase().includes(searchLower));
        }

        // Sort Logic
        const { sortColumn, sortOrder } = window.expenseState;
        filtered.sort((a, b) => {
            let valA = a[sortColumn] || '';
            let valB = b[sortColumn] || '';
            if (sortColumn === 'amount') { valA = parseFloat(valA); valB = parseFloat(valB); }
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        this.renderExpenseTable(filtered);
        console.log('[DEBUG] Tabela de despesas renderizada com:', filtered.length, 'itens.');
    },

    renderExpenseTable(transactions) {
        const listContainer = document.getElementById('expenses-list');
        const paginationInfo = document.getElementById('pagination-info-expenses');
        if (!listContainer) return;

        // Reset Selection State on Re-render
        window.selectedExpenses = new Set();
        this.updateBulkBar();

        if (transactions.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="7" class="px-8 py-20 text-center text-slate-400">Nenhum lançamento de despesa encontrado.</td></tr>';
            if (paginationInfo) paginationInfo.textContent = 'Mostrando 0 resultados';
            return;
        }

        listContainer.innerHTML = transactions.map(t => {
            const transDate = this.parseDate(t.due_date || t.created_at);
            const isOverdue = t.status !== 'Pago' && transDate < new Date();
            const statusStyle = t.status === 'Pago' ? 'bg-slate-100 text-slate-500' : (isOverdue ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700');
            const statusLabel = t.status === 'Pago' ? 'Pago' : (isOverdue ? 'Atrasado' : 'Pendente');

            return `
                <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group text-[10px] md:text-sm" data-id="${t.id}">
                    <td class="hidden md:table-cell px-8 py-4">
                        <input type="checkbox" onchange="toggleItemSelection('${t.id}', this)" class="item-checkbox rounded border-slate-300 text-primary focus:ring-primary">
                    </td>
                    <td class="px-3 md:px-4 py-3 md:py-4">
                        <div class="flex items-center gap-2 md:gap-3">
                            <div class="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center flex-shrink-0">
                                <span class="material-symbols-outlined text-xs md:text-sm">payments</span>
                            </div>
                            <div class="truncate">
                                <p class="font-bold text-on-surface truncate max-w-[120px] md:max-w-none">${t.description}</p>
                                <p class="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase">${t.category || 'Geral'} • <span class="text-primary/70">${transDate.toLocaleDateString('pt-BR')}</span></p>
                            </div>
                        </div>
                    </td>
                    <td class="hidden sm:table-cell px-6 py-4">
                        <span class="text-[9px] md:text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 md:py-1 rounded-lg">${t.category || 'Fixo'}</span>
                    </td>
                    <td class="hidden md:table-cell px-6 py-4">
                        <p class="font-medium text-slate-600">${transDate.toLocaleDateString('pt-BR')}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Vencimento</p>
                    </td>
                    <td class="hidden lg:table-cell px-6 py-4">
                        <span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusStyle}">
                            ${statusLabel}
                        </span>
                    </td>
                    <td class="px-3 md:px-6 py-3 md:py-4 text-right">
                        <p class="font-black text-on-surface">R$ ${parseFloat(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p class="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase">${t.payment_method || '-'}</p>
                    </td>
                    <td class="px-4 md:px-8 py-3 md:py-4 text-right">
                        <div class="flex items-center justify-end gap-1 md:gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all">
                            <button onclick="toggleExpenseStatus('${t.id}', '${t.status}')" class="p-1.5 md:p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Alternar Status">
                                <span class="material-symbols-outlined text-xs md:text-sm">${t.status === 'Pago' ? 'undo' : 'check'}</span>
                            </button>
                            <button onclick="handleDeleteRequest('${t.id}')" class="p-1.5 md:p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Excluir">
                                <span class="material-symbols-outlined text-xs md:text-sm">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (paginationInfo) paginationInfo.innerHTML = `Mostrando <span class="text-on-surface">${transactions.length}</span> resultados`;
    },

    updateBulkBar() {
        const bar = document.getElementById('bulk-actions-bar');
        const countDisplay = document.getElementById('selected-count');
        if (!bar || !countDisplay) return;

        const count = window.selectedExpenses?.size || 0;
        countDisplay.textContent = count;

        if (count > 0) {
            bar.classList.remove('translate-y-32');
            bar.classList.add('translate-y-0');
        } else {
            bar.classList.add('translate-y-32');
            bar.classList.remove('translate-y-0');
        }
    },

    renderExpenseSummary(transactions, firstDayOfMonth) {
        const now = new Date();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const firstDay = firstDayOfMonth.split('T')[0];

        const currentMonth = transactions.filter(t => {
            const d = t.due_date || t.created_at || '';
            return d >= firstDay && d <= lastDayOfMonth;
        });

        const totalPaid = currentMonth.filter(t => t.status === 'Pago').reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
        const totalPending = currentMonth.filter(t => t.status === 'Pendente').reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);

        const totalOverdue = transactions.filter(t => t.status !== 'Pago' && this.parseDate(t.due_date || t.created_at) < now).reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);

        // Update Summary using specific IDs
        const summaryPaid = document.getElementById('expense-summary-paid') || document.querySelectorAll('h3.font-black')[0];
        const summaryPending = document.getElementById('expense-summary-pending') || document.querySelectorAll('h3.font-black')[1];
        const summaryOverdue = document.getElementById('expense-summary-overdue') || document.querySelectorAll('h3.font-black')[2];

        if (summaryPaid) summaryPaid.textContent = `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (summaryPending) summaryPending.textContent = `R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (summaryOverdue) summaryOverdue.textContent = `R$ ${totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        const progressBarOverdue = document.getElementById('expense-progress-overdue');
        if (progressBarOverdue) progressBarOverdue.style.width = totalOverdue > 0 ? '100%' : '0%';
    },

    renderChart(transactions) {
        const chartContainer = document.getElementById('financial-main-chart');
        const labelContainer = document.getElementById('financial-chart-labels');
        if (!chartContainer || !labelContainer) return;

        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
                year: d.getFullYear(),
                month: d.getMonth(),
                label: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.', ''),
                revenue: 0,
                expense: 0
            });
        }

        transactions.forEach(t => {
            const dateStr = t.due_date || t.created_at;
            if (!dateStr) return;
            const date = this.parseDate(dateStr);
            const mIdx = months.findIndex(m => m.year === date.getFullYear() && m.month === date.getMonth());
            if (mIdx !== -1) {
                if (t.type === 'Receita' && t.status === 'Pago') months[mIdx].revenue += (t.amount || 0);
                if (t.type === 'Despesa' && t.status === 'Pago') months[mIdx].expense += (t.amount || 0);
            }
        });

        const maxVal = Math.max(...months.map(m => Math.max(m.revenue, m.expense)), 1);

        chartContainer.innerHTML = months.map(m => {
            const revHeight = (m.revenue / maxVal) * 100;
            const expHeight = (m.expense / maxVal) * 100;
            return `
                <div class="flex-1 h-full flex items-end space-x-1 group relative">
                    <div class="w-full bg-primary-container rounded-t-sm transition-all duration-500 hover:brightness-110" style="height: ${revHeight}%" title="Receita: R$ ${m.revenue.toLocaleString('pt-BR')}"></div>
                    <div class="w-full bg-tertiary rounded-t-sm transition-all duration-500 hover:brightness-110" style="height: ${expHeight}%" title="Despesa: R$ ${m.expense.toLocaleString('pt-BR')}"></div>
                </div>
            `;
        }).join('');

        labelContainer.innerHTML = months.map(m => `
            <span class="text-[10px] font-bold text-slate-400 w-full text-center">${m.label}</span>
        `).join('');
    },

    renderOperationalInsights(transactions) {
        const container = document.getElementById('category-insights-list');
        if (!container) return;

        const categories = {};
        let totalRevenue = 0;

        transactions.filter(t => t.type === 'Receita' && t.status === 'Pago').forEach(t => {
            const cat = t.category || 'Geral';
            categories[cat] = (categories[cat] || 0) + (t.amount || 0);
            totalRevenue += (t.amount || 0);
        });

        const sortedCategories = Object.entries(categories)
            .sort((a, b) => b[1] - a[1])
            .filter(([cat, val]) => val > 0);

        if (sortedCategories.length === 0) {
            container.innerHTML = '<div class="py-4 text-center text-slate-400 text-[10px] italic">Sem dados de faturamento por categoria.</div>';
            return;
        }

        container.innerHTML = sortedCategories.slice(0, 5).map(([cat, val]) => {
            const percent = totalRevenue > 0 ? (val / totalRevenue * 100).toFixed(0) : 0;
            return `
                <div>
                    <div class="flex justify-between text-[10px] font-bold mb-1">
                        <span>${cat}</span>
                        <span>${percent}%</span>
                    </div>
                    <div class="h-1.5 bg-slate-200 rounded-full">
                        <div class="h-1.5 bg-tertiary rounded-full" style="width: ${percent}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderTopCustomers(orders, transactions) {
        const container = document.getElementById('top-customers-list');
        if (!container) return;

        const customerStats = {};

        // Use all available orders with customer data
        orders.forEach(o => {
            const rawCustomer = o.customers;
            const customer = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer;
            if (!customer) return;
            const cid = customer.id;
            if (!customerStats[cid]) {
                customerStats[cid] = {
                    name: customer.full_name,
                    servicesCount: 0,
                    totalValue: 0,
                    paidOnTime: 0,
                    totalTransactions: 0
                };
            }
            customerStats[cid].servicesCount++;
        });

        transactions.filter(t => t.service_order_id && t.type === 'Receita').forEach(t => {
            const order = orders.find(o => o.id === t.service_order_id);
            if (!order || !order.customers) return;
            const cid = order.customers.id;
            
            customerStats[cid].totalTransactions++;
            if (t.status === 'Pago') {
                customerStats[cid].totalValue += (t.amount || 0);
                customerStats[cid].paidOnTime++;
            }
        });

        const sortedCustomers = Object.values(customerStats)
            .map(c => {
                const paidRatio = c.totalTransactions > 0 ? c.paidOnTime / c.totalTransactions : 0;
                // Mixed score: services weight 10, payment punctuality weight 50, value weight per 1k
                c.score = (c.servicesCount * 10) + (paidRatio * 50) + (c.totalValue / 1000);
                return c;
            })
            .sort((a, b) => b.score - a.score)
            .filter(c => c.servicesCount > 0);

        if (sortedCustomers.length === 0) {
            container.innerHTML = '<div class="py-4 text-center text-slate-400 text-[10px] italic">Nenhum cliente com dados suficientes.</div>';
            return;
        }

        container.innerHTML = sortedCustomers.slice(0, 3).map(c => `
            <div class="flex items-center justify-between group">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-[10px]">
                        ${c.name.charAt(0)}
                    </div>
                    <div>
                        <p class="text-xs font-bold text-on-surface">${c.name}</p>
                        <p class="text-[9px] text-slate-400 font-bold uppercase">${c.servicesCount} OS • R$ ${c.totalValue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="px-2 py-1 bg-green-50 text-green-700 rounded text-[9px] font-black uppercase tracking-tighter">
                        ${( (c.paidOnTime / (c.totalTransactions || 1)) * 100 ).toFixed(0)}% Pontual
                    </span>
                </div>
            </div>
        `).join('');
    },

    renderPopularCategories(expenses) {
        const container = document.getElementById('popular-categories-list');
        const trimesterTotal = document.getElementById('expense-trimestre-total');
        if (!container) return;

        const now = new Date();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(now.getDate() - 90);

        const recentExpenses = expenses.filter(t => {
            const date = this.parseDate(t.due_date || t.created_at);
            return date >= ninetyDaysAgo;
        });

        const categories = {};
        let totalAmount = 0;

        recentExpenses.forEach(t => {
            const cat = t.category || 'Geral';
            const amount = Math.abs(t.amount || 0);
            categories[cat] = (categories[cat] || 0) + amount;
            totalAmount += amount;
        });

        if (trimesterTotal) {
            trimesterTotal.textContent = `R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }

        const sortedCategories = Object.entries(categories)
            .sort((a, b) => b[1] - a[1])
            .filter(([cat, val]) => val > 0);

        if (sortedCategories.length === 0) {
            container.innerHTML = '<div class="py-4 text-center text-slate-400 text-[10px] italic">Sem dados de categorias populares.</div>';
            return;
        }

        const colors = ['bg-primary', 'bg-tertiary', 'bg-secondary', 'bg-slate-300'];

        container.innerHTML = sortedCategories.slice(0, 4).map(([cat, val], idx) => {
            const percent = totalAmount > 0 ? (val / totalAmount * 100).toFixed(0) : 0;
            const color = colors[idx] || 'bg-slate-200';
            return `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full ${color}"></div>
                        <span class="text-xs font-bold text-on-surface-variant">${cat}</span>
                    </div>
                    <span class="text-xs font-black">${percent}%</span>
                </div>
            `;
        }).join('');
    }
};

// --- GLOBAL ATTACHMENTS FOR INTERACTIVITY ---

window.selectedCommissions = new Map();

window.toggleSelectAllCommissions = (headerCheckbox, empId) => {
    const checkboxes = document.querySelectorAll(`.commission-checkbox-${empId}`);
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            cb.checked = headerCheckbox.checked;
            window.toggleCommissionSelection(cb);
        }
    });
};

window.toggleCommissionSelection = (cb) => {
    const tr = cb.closest('tr');
    // The key must be unique per service item. Using employee + os + service name to avoid collisions.
    const key = `${tr.dataset.empid}-${tr.dataset.os}-${tr.dataset.service}`;
    if (cb.checked) {
        window.selectedCommissions.set(key, {
            employeeId: tr.dataset.empid,
            employeeName: tr.dataset.emp,
            osId: tr.dataset.os,
            amount: parseFloat(tr.dataset.amount),
            osRef: tr.dataset.ref,
            customerName: tr.dataset.customer,
            vehicleInfo: tr.dataset.vehicle,
            finishedAt: tr.dataset.finished,
            totalOs: parseFloat(tr.dataset.totalOs),
            rate: tr.dataset.rate,
            serviceName: tr.dataset.service
        });
    } else {
        window.selectedCommissions.delete(key);
    }
    if(window.MyFleetCar && window.MyFleetCar.Financial) {
        window.MyFleetCar.Financial.updateCommissionBulkBar();
    } else if(Financial) {
        Financial.updateCommissionBulkBar();
    }
};

window.clearCommissionSelection = () => {
    window.selectedCommissions.clear();
    document.querySelectorAll('.commission-checkbox, input[type="checkbox"]').forEach(cb => cb.checked = false);
    if(window.MyFleetCar && window.MyFleetCar.Financial) {
        window.MyFleetCar.Financial.updateCommissionBulkBar();
    } else if(Financial) {
        Financial.updateCommissionBulkBar();
    }
};

window.bulkPayCommissions = async () => {
    const items = Array.from(window.selectedCommissions.values());
    if (items.length === 0) return;
    
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    if (!confirm(`Confirmar o pagamento de ${items.length} comissões no total de R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?`)) return;

    // Use absolute MyFleetCar context reference
    const af = window.MyFleetCar || MyFleetCar;

    try {
        const { data: { user } } = await af.Auth.getUser();
        if (!user) return;

        for (const item of items) {
            const newExpense = {
                workshop_id: user.id,
                service_order_id: item.osId,
                type: 'Despesa',
                category: 'Comissão',
                amount: item.amount,
                payment_method: 'Transferência',
                due_date: new Date().toISOString(),
                status: 'Pago',
                description: `Comissão ${item.osRef} - Beneficiário: ${item.employeeName}`
            };
            await af.DB.insert('financial_transactions', newExpense);
        }

        alert('Pagamentos em lote registrados com sucesso!');
        window.selectedCommissions.clear();
        if(af.Financial) {
            af.Financial.updateCommissionBulkBar();
            af.Financial.initCommissionsPage();
        } else if(Financial) {
            Financial.updateCommissionBulkBar();
            Financial.initCommissionsPage(); 
        }
    } catch (err) {
        alert('Erro ao registrar pagamentos em lote: ' + err.message);
    }
};

window.generateCommissionReceipt = async () => {
    const items = Array.from(window.selectedCommissions.values());
    if (items.length === 0) return;

    // Check if all selected items are from the same employee
    const firstEmpId = items[0].employeeId;
    const sameEmployee = items.every(item => item.employeeId === firstEmpId);
    
    if (!sameEmployee) {
        alert('Para gerar um recibo, todos os itens selecionados devem pertencer ao mesmo funcionário.');
        return;
    }

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const empName = items[0].employeeName;

    if (!confirm(`Deseja gerar um recibo de R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para ${empName}?`)) return;

    const af = window.MyFleetCar || MyFleetCar;
    try {
        const { data: { user } } = await af.Auth.getUser();
        if (!user) return;

        // 1. Get last receipt number to increment
        const { data: lastReceipt } = await af.DB.select('commission_receipts', {
            match: { workshop_id: user.id },
            order: { column: 'receipt_number', ascending: false },
            limit: 1
        });

        let nextNum = 1;
        if (lastReceipt && lastReceipt.length > 0) {
            const lastNumStr = lastReceipt[0].receipt_number.replace('RP', '');
            nextNum = parseInt(lastNumStr) + 1;
        }
        const receiptNumber = 'RP' + nextNum.toString().padStart(4, '0');

        // 2. Insert receipt
        const newReceipt = {
            workshop_id: user.id,
            employee_id: firstEmpId,
            receipt_number: receiptNumber,
            amount: totalAmount,
            status: 'Aberto',
            items_json: items // Store full items info
        };

        const { error } = await af.DB.insert('commission_receipts', newReceipt);
        if (error) throw error;

        alert(`Recibo ${receiptNumber} gerado com sucesso!`);
        window.clearCommissionSelection();
        if (af.Financial) af.Financial.initCommissionsPage();
    } catch (err) {
        console.error('Error generating receipt:', err);
        alert('Erro ao gerar recibo. Verifique se a tabela commission_receipts existe no banco de dados.');
    }
};

window.viewReceipt = async (receiptId) => {
    const af = window.MyFleetCar || MyFleetCar;
    try {
        const { data: receipts, error } = await af.DB.select('commission_receipts', {
            match: { id: receiptId }
        });
        if (error) throw error;
        const receipt = receipts[0];
        if (!receipt) throw new Error('Recibo não encontrado');

        const { data: staffList } = await af.DB.select('staff', {
            match: { id: receipt.employee_id }
        });
        const staff = staffList ? staffList[0] : null;

        const modal = document.getElementById('receipt-modal');
        const numberDisplay = document.getElementById('receipt-modal-number');
        const content = document.getElementById('receipt-modal-content');
        const printBtn = document.getElementById('btn-print-receipt');

        numberDisplay.textContent = receipt.receipt_number;
        
        let items = receipt.items_json || [];
        if (typeof items === 'string') try { items = JSON.parse(items); } catch(e) {}

        content.innerHTML = `
            <div class="space-y-6">
                <div class="flex justify-between border-b pb-4">
                    <div>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Funcionário</p>
                        <p class="text-lg font-black text-on-surface">${staff ? staff.name : 'N/A'}</p>
                        <p class="text-xs text-slate-500">${staff ? staff.role : ''}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Data de Emissão</p>
                        <p class="text-sm font-bold text-on-surface">${new Date(receipt.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                </div>

                <div>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">Detalhamento dos Serviços</p>
                    <div class="bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-[9px] md:text-xs">
                                <thead>
                                    <tr class="bg-slate-100/50 text-[9px] font-bold uppercase text-slate-500">
                                        <th class="px-3 py-2">OS</th>
                                        <th class="px-3 py-2">Cliente / Veículo</th>
                                        <th class="px-3 py-2 text-center">Concluído</th>
                                        <th class="px-3 py-2">Item do Serviço</th>
                                        <th class="px-3 py-2 text-right">Valor Cobrado</th>
                                        <th class="px-3 py-2 text-center">%</th>
                                        <th class="px-3 py-2 text-right">Comissão</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200">
                                    ${items.map(it => `
                                        <tr>
                                            <td class="px-3 py-3 font-bold text-on-surface">
                                                ${it.osRef || 'OS #' + it.osId}
                                            </td>
                                            <td class="px-3 py-3">
                                                <p class="font-medium">${it.customerName || 'N/A'}</p>
                                                <p class="text-[8px] text-slate-500">${it.vehicleInfo || 'N/A'}</p>
                                            </td>
                                            <td class="px-3 py-3 text-center text-slate-500">
                                                ${it.finishedAt ? this.parseDate(it.finishedAt).toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                            <td class="px-3 py-3">
                                                <p class="font-bold text-primary">${it.serviceName || it.item_name || 'Serviço'}</p>
                                            </td>
                                            <td class="px-3 py-3 text-right">R$ ${parseFloat(it.totalOs || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            <td class="px-3 py-3 text-center">${it.rate || '-'}</td>
                                            <td class="px-3 py-3 text-right font-bold text-on-surface">R$ ${parseFloat(it.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot>
                                    <tr class="bg-slate-100 font-black">
                                        <td colspan="6" class="px-3 py-3 text-right uppercase tracking-widest text-[9px]">Total a Pagar</td>
                                        <td class="px-3 py-3 text-right text-sm">R$ ${parseFloat(receipt.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="pt-8 text-center">
                    <div class="w-64 h-[1px] bg-slate-300 mx-auto mb-2"></div>
                    <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Assinatura do Funcionário</p>
                </div>
            </div>
        `;

        printBtn.onclick = () => {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Recibo ${receipt.receipt_number}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; color: #333; font-size: 12px; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
                        h1 { margin: 0; font-size: 20px; }
                        .receipt-info { text-align: right; }
                        .details { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                        .details th, .details td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        .details th { background-color: #f5f5f5; font-size: 10px; text-transform: uppercase; }
                        .total { text-align: right; font-size: 16px; font-weight: bold; margin-bottom: 60px; }
                        .footer { display: flex; justify-content: space-around; margin-top: 40px; }
                        .signature { border-top: 1px solid #000; width: 250px; text-align: center; padding-top: 10px; font-size: 11px; }
                        p { margin: 5px 0; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <h1>RECIBO DE PAGAMENTO DE COMISSÃO</h1>
                            <p><strong>Emissor:</strong> MyFleetCar SaaS</p>
                            <p><strong>Funcionário:</strong> ${staff ? staff.name : 'N/A'}</p>
                        </div>
                        <div class="receipt-info">
                            <p><strong>Número:</strong> ${receipt.receipt_number}</p>
                            <p><strong>Data de Emissão:</strong> ${new Date(receipt.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                    </div>
                    <p>Declaramos para os devidos fins que o funcionário acima citado faz jus ao recebimento de <strong>R$ ${parseFloat(receipt.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> referente às comissões detalhadas abaixo:</p>
                    <table class="details">
                        <thead>
                            <tr>
                                <th>OS</th>
                                <th>Cliente / Veículo</th>
                                <th>Data Conc.</th>
                                <th>Item do Serviço</th>
                                <th>Vlr. Serviço</th>
                                <th>%</th>
                                <th style="text-align: right">Vlr. Comissão</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(it => `
                                <tr>
                                    <td>${it.osRef || 'OS #' + it.osId}</td>
                                    <td>${it.customerName || 'N/A'}<br><small>${it.vehicleInfo || 'N/A'}</small></td>
                                    <td>${it.finishedAt ? this.parseDate(it.finishedAt).toLocaleDateString('pt-BR') : '-'}</td>
                                    <td><strong>${it.serviceName || it.item_name || 'Serviço'}</strong></td>
                                    <td>R$ ${parseFloat(it.totalOs || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td>${it.rate || '-'}</td>
                                    <td style="text-align: right">R$ ${parseFloat(it.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="total">VALOR TOTAL DO RECIBO: R$ ${parseFloat(receipt.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <p style="margin-top: 30px;">Por ser verdade, firmo o presente para que produza seus efeitos legais.</p>
                    <div class="footer">
                        <div class="signature" style="margin-top: 50px;">
                            <p>${staff ? staff.name : 'ASSINATURA DO FUNCIONÁRIO'}</p>
                            <p>Beneficiário</p>
                        </div>
                    </div>
                    <script>window.onload = function() { window.print(); }</script>
                </body>
                </html>
            `);
            printWindow.document.close();
        };

        modal.classList.remove('hidden');
    } catch (err) {
        alert('Erro ao carregar recibo: ' + err.message);
    }
};

window.closeReceiptModal = () => {
    document.getElementById('receipt-modal').classList.add('hidden');
};

window.payReceipt = async (receiptId) => {
    if (!confirm('Deseja marcar este recibo como PAGO? Isso registrará as despesas individuais e liquidará as comissões.')) return;

    const af = window.MyFleetCar || MyFleetCar;
    try {
        const { data: { user } } = await af.Auth.getUser();
        if (!user) return;

        const { data: receipts } = await af.DB.select('commission_receipts', {
            match: { id: receiptId }
        });
        const receipt = receipts ? receipts[0] : null;
        if (!receipt) return;

        const { data: staffList } = await af.DB.select('staff', {
            match: { id: receipt.employee_id }
        });
        const staff = staffList ? staffList[0] : null;

        let items = receipt.items_json || [];
        if (typeof items === 'string') try { items = JSON.parse(items); } catch(e) {}

        // 1. Create financial transactions for each item (to follow existing logic)
        for (const item of items) {
            const serviceOrderId = item.osId || item.os_id;
            const serviceName = item.serviceName || item.item_name || 'Serviço';
            const osRef = item.osRef || 'OS';

            const newExpense = {
                workshop_id: user.id,
                service_order_id: serviceOrderId,
                type: 'Despesa',
                category: 'Comissão',
                amount: item.amount,
                payment_method: 'Transferência',
                due_date: new Date().toISOString(),
                status: 'Pago',
                description: `Comissão ${osRef} (${serviceName}) - Beneficiário: ${staff.name} (Ref: ${receipt.receipt_number})`
            };
            await af.DB.insert('financial_transactions', newExpense);
        }

        // 2. Update receipt status to 'Pago' (or delete it if preferred, but 'Pago' is better for history)
        await af.DB.update('commission_receipts', { status: 'Pago' }, { id: receiptId });

        alert('Recibo liquidado com sucesso!');
        if (af.Financial) af.Financial.initCommissionsPage();
    } catch (err) {
        console.error('Error paying receipt:', err);
        alert('Erro ao liquidar recibo.');
    }
};

window.deleteReceipt = async (receiptId) => {
    if (!confirm('Deseja excluir este recibo? Os serviços voltarão a ficar disponíveis para novo pagamento ou recibo.')) return;

    const af = window.MyFleetCar || MyFleetCar;
    try {
        const { error } = await af.DB.delete('commission_receipts', { id: receiptId });
        if (error) throw error;
        alert('Recibo excluído com sucesso.');
        if (af.Financial) af.Financial.initCommissionsPage();
    } catch (err) {
        alert('Erro ao excluir recibo.');
    }
};

window.applyRevenueFilters = () => Financial.applyRevenueFilters();

window.handleRevenueSort = (column) => {
    if (!window.revenueState) return;
    if (window.revenueState.sortColumn === column) {
        window.revenueState.sortOrder = window.revenueState.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        window.revenueState.sortColumn = column;
        window.revenueState.sortOrder = 'asc';
    }
    Financial.applyRevenueFilters();
};

window.setRevenueFilter = (filterValue, btn) => {
    if (!window.revenueState) return;
    document.querySelectorAll('.revenue-filter-btn').forEach(b => {
        b.className = 'revenue-filter-btn px-6 py-2 rounded-full text-sm font-medium text-slate-500 hover:text-on-surface transition-all whitespace-nowrap';
    });
    btn.className = 'revenue-filter-btn px-6 py-2 rounded-full text-sm font-bold bg-white shadow-sm text-on-surface transition-all whitespace-nowrap';
    window.revenueState.filter = filterValue;
    Financial.applyRevenueFilters();
};

window.toggleTransactionStatus = async (transId, currentStatus) => {
    const newStatus = currentStatus === 'Pago' ? 'Pendente' : 'Pago';
    try {
        const { error } = await MyFleetCar.DB.update('financial_transactions', { status: newStatus }, { id: transId });
        if (error) throw error;
        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

window.reopenOSFromFinance = async (osId) => {
    if (!confirm('Deseja realmente reabrir esta Ordem de Serviço? Ela voltará para o status "Em Aberto".')) return;
    try {
        const { error } = await MyFleetCar.DB.update('service_orders', { status: 'Em Aberto', finished_at: null }, { id: osId });
        if (error) throw error;
        alert('OS reaberta com sucesso! Você pode encontrá-la no painel principal.');
        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

// --- EXPENSES GLOBAL ATTACHMENTS ---

window.setExpenseFilter = (filterValue, btn) => {
    if (!window.expenseState) return;

    document.querySelectorAll('.expense-filter-btn').forEach(b => {
        b.className = 'expense-filter-btn px-6 py-2 rounded-full text-sm font-medium text-slate-500 hover:text-on-surface transition-all whitespace-nowrap';
    });
    btn.className = 'expense-filter-btn px-6 py-2 rounded-full text-sm font-bold bg-white shadow-sm text-on-surface transition-all whitespace-nowrap';

    window.expenseState.filter = filterValue;
    Financial.applyExpenseFilters();
};

window.applyExpenseFilters = () => Financial.applyExpenseFilters();

window.handleExpenseSort = (column) => {
    if (!window.expenseState) return;
    if (window.expenseState.sortColumn === column) {
        window.expenseState.sortOrder = window.expenseState.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        window.expenseState.sortColumn = column;
        window.expenseState.sortOrder = 'asc';
    }
    Financial.applyExpenseFilters();
};

// --- BULK & SMART DELETE GLOBAL HANDLES ---
window.selectedExpenses = new Set();

window.toggleSelectAll = (headerCheckbox) => {
    const checkboxes = document.querySelectorAll('.item-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = headerCheckbox.checked;
        const rowId = cb.closest('tr').dataset.id;
        if (headerCheckbox.checked) window.selectedExpenses.add(rowId);
        else window.selectedExpenses.delete(rowId);
    });
    Financial.updateBulkBar();
};

window.toggleItemSelection = (id, cb) => {
    if (cb.checked) window.selectedExpenses.add(id);
    else window.selectedExpenses.delete(id);
    Financial.updateBulkBar();
};

window.clearSelection = () => {
    window.selectedExpenses.clear();
    document.getElementById('select-all-expenses').checked = false;
    document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = false);
    Financial.updateBulkBar();
};

window.bulkMarkAsPaid = async () => {
    const ids = Array.from(window.selectedExpenses);
    if (ids.length === 0) return;
    try {
        for (const id of ids) {
            await MyFleetCar.DB.update('financial_transactions', { status: 'Pago' }, { id });
        }
        alert(`${ids.length} despesas marcadas como pagas.`);
        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

window.bulkDelete = async () => {
    const ids = Array.from(window.selectedExpenses);
    if (!confirm(`Deseja excluir permanentemente ${ids.length} itens?`)) return;
    try {
        for (const id of ids) {
            await MyFleetCar.DB.delete('financial_transactions', { id });
        }
        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

window.toggleExpenseStatus = async (transId, currentStatus) => {
    const newStatus = currentStatus === 'Pago' ? 'Pendente' : 'Pago';
    try {
        const { error } = await MyFleetCar.DB.update('financial_transactions', { status: newStatus }, { id: transId });
        if (error) throw error;

        const trans = window.expenseState.transactions.find(t => t.id === transId);
        if (trans) trans.status = newStatus;

        Financial.applyExpenseFilters();
        Financial.renderExpenseSummary(window.expenseState.transactions, window.expenseState.firstDayOfMonth);
    } catch (err) { alert('Erro: ' + err.message); }
};

window.deleteExpense = async (id) => {
    if (!confirm('Deseja excluir permanentemente este lançamento?')) return;
    try {
        const { error } = await MyFleetCar.DB.delete('financial_transactions', { id });
        if (error) throw error;
        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

// --- SMART DELETE RECURRING ---
window.pendingDeleteId = null;

window.handleDeleteRequest = (id) => {
    const t = window.expenseState.transactions.find(item => item.id === id);
    // Recurring check logic: match description (base part) and created_at
    // We created them with same created_at and same base description
    const baseDesc = t.description.split(' (')[0];
    const siblings = window.expenseState.transactions.filter(item =>
        item.description.startsWith(baseDesc) &&
        item.created_at === t.created_at &&
        item.id !== t.id
    );

    if (siblings.length > 0) {
        window.pendingDeleteId = id;
        document.getElementById('smart-delete-modal').classList.remove('hidden');
    } else {
        window.deleteExpense(id); // Normal delete for non-recurring
    }
};

window.closeSmartDeleteModal = () => {
    document.getElementById('smart-delete-modal').classList.add('hidden');
    window.pendingDeleteId = null;
};

window.confirmSmartDelete = async (type) => {
    const id = window.pendingDeleteId;
    const t = window.expenseState.transactions.find(item => item.id === id);
    const baseDesc = t.description.split(' (')[0];

    try {
        if (type === 'single') {
            await MyFleetCar.DB.delete('financial_transactions', { id });
        } else if (type === 'future') {
            const siblings = window.expenseState.transactions.filter(item =>
                item.description.startsWith(baseDesc) &&
                item.created_at === t.created_at &&
                item.due_date >= t.due_date
            );
            for (const s of siblings) await MyFleetCar.DB.delete('financial_transactions', { id: s.id });
        } else if (type === 'all') {
            const siblings = window.expenseState.transactions.filter(item =>
                item.description.startsWith(baseDesc) &&
                item.created_at === t.created_at
            );
            for (const s of siblings) await MyFleetCar.DB.delete('financial_transactions', { id: s.id });
        }

        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

// Export to global MyFleetCar namespace
if (window.MyFleetCar) {
    window.MyFleetCar.Financial = Financial;
}

// Route Initialization
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('painel-financeiro.html')) {
        Financial.initDashboard();
    } else if (path.includes('gestao-receita-financeiro.html')) {
        Financial.initRevenuePage();
    } else if (path.includes('gestao-despesa-financeiro.html')) {
        Financial.initExpensePage();
    } else if (path.includes('gestao-comissoes-financeiro.html')) {
        Financial.initCommissionsPage();
    }
});
