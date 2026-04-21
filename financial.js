/**
 * AutoFlow Financial Module Logic
 */

const Financial = {
    async initDashboard() {
        try {
            const { data: { user } } = await AutoFlow.Auth.getUser();
            if (!user) return;

            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

            // 1. Fetch ALL financial transactions for the workshop
            // We filter in memory to handle fallback between due_date and created_at
            const { data: allTransactions } = await AutoFlow.DB.select('financial_transactions', {
                match: { workshop_id: user.id }
            });

            const transactions = (allTransactions || []).filter(t => {
                const date = t.due_date || t.created_at || '';
                const d = date.split('T')[0];
                return d >= firstDayOfMonth && d <= lastDayOfMonth;
            });

            // 2. Fetch specific OS linked to these transactions to calculate commissions
            const linkedOsIds = [...new Set((transactions || [])
                .filter(t => t.service_order_id)
                .map(t => t.service_order_id))];

            let orders = [];
            if (linkedOsIds.length > 0) {
                const { data: osData } = await AutoFlow.DB.select('service_orders', {
                    in: { id: linkedOsIds }
                });
                orders = osData || [];
            }

            // 3. Fetch Staff to calculate commissions
            const { data: staff } = await AutoFlow.DB.select('staff', {
                match: { workshop_id: user.id }
            });

            this.renderMetrics(orders, transactions || [], staff || []);
            this.renderRecentTransactions(user.id);
        } catch (err) {
            console.error('Financial Init Error:', err);
        }
    },

    renderMetrics(orders, transactions, staff) {
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
        const { totalCommissions, employeeCommissions } = this.calculateCommissions(orders, transactions, staff);

        // 4. Final Metrics
        // Mensal Líquido = Receitas Pagas - Despesas Pagas (Ignora comissões não pagas para não duplicar deduções)
        const netProfit = grossRevenue - paidExpenses;

        const osPaidCount = transactions.filter(t => t.service_order_id && t.type === 'Receita' && t.status === 'Pago').length;
        const osPendingCount = transactions.filter(t => t.service_order_id && t.type === 'Receita' && t.status === 'Pendente').length;

        // Update DOM
        const metrics = document.querySelectorAll('h3.text-2xl.font-black');
        const labels = document.querySelectorAll('.grid p.font-bold.uppercase');

        if (metrics.length >= 5) {
            // Bruto
            metrics[0].textContent = `R$ ${grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            // Previsto
            metrics[1].textContent = `R$ ${forecastedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            // Líquido
            metrics[2].textContent = `R$ ${netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            metrics[2].className = `text-2xl font-black ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`;
            // Dívida de Comissões
            metrics[3].textContent = `R$ ${totalCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            // Resumo
            metrics[4].innerHTML = `<span class="text-green-600">${osPaidCount} Paga</span> / <span class="text-blue-600">${osPendingCount} Pend.</span>`;

            // Fix labels
            if (labels[0]) labels[0].textContent = 'Mensal Bruto';
            if (labels[1]) labels[1].textContent = 'Mensal Previsto';
            if (labels[2]) labels[2].textContent = 'Mensal Líquido';
            if (labels[3]) labels[3].textContent = 'Comissões (Dívida)';
            if (labels[4]) labels[4].textContent = 'Resumo OS';
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

                    const commissionRecord = {
                        os_id: o.id,
                        os_number: o.os_number || o.id.toString().substring(0, 8),
                        item_name: itemName,
                        total_os: itemPrice * itemQty,
                        rate: (rate * 100).toFixed(0) + '%',
                        amount: commissionAmount,
                        status: isCommissionPaid ? 'Pago' : 'Pendente',
                        paid_transaction_id: paidTrans ? paidTrans.id : null
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

        return { totalCommissions, employeeCommissions };
    },

    async initCommissionsPage() {
        try {
            const { data: { user } } = await AutoFlow.Auth.getUser();
            if (!user) return;

            // Fetch data similar to dashboard (all workshop transactions)
            const { data: allTransactions } = await AutoFlow.DB.select('financial_transactions', {
                match: { workshop_id: user.id }
            });

            const { data: staff } = await AutoFlow.DB.select('staff', {
                match: { workshop_id: user.id }
            });

            // Fetch specific OS linked to these transactions
            const linkedOsIds = [...new Set((allTransactions || [])
                .filter(t => t.service_order_id)
                .map(t => t.service_order_id))];

            let orders = [];
            if (linkedOsIds.length > 0) {
                const { data: osData } = await AutoFlow.DB.select('service_orders', {
                    in: { id: linkedOsIds }
                });
                orders = osData || [];
            }

            const { employeeCommissions } = this.calculateCommissions(orders, allTransactions || [], staff || []);

            this.renderEmployeeCommissions(employeeCommissions);
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
            <div class="col-span-full bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden mb-8">
                <!-- Employee Header -->
                <div class="px-8 py-6 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-black text-xl shadow-md shadow-primary/20">
                            ${emp.name.charAt(0)}
                        </div>
                        <div>
                            <h3 class="text-lg font-black text-on-surface">${emp.name}</h3>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">${emp.items.length} Serviços Realizados</p>
                        </div>
                    </div>
                    <div class="flex gap-8">
                        <div class="text-right">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Total Pago</p>
                            <p class="text-lg font-black text-slate-400">R$ ${emp.total_paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] text-primary font-bold uppercase tracking-widest leading-none">A Receber</p>
                            <p class="text-xl font-black text-primary">R$ ${emp.total_pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>

                <!-- OS List Table -->
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                <th class="px-4 py-4 text-center w-12">
                                    <input type="checkbox" onclick="toggleSelectAllCommissions(this, '${emp.id}')" class="rounded border-slate-300 text-primary focus:ring-primary">
                                </th>
                                <th class="px-8 py-4">OS / Serviço</th>
                                <th class="px-6 py-4">Valor Serviço</th>
                                <th class="px-6 py-4">Comissão (%)</th>
                                <th class="px-6 py-4">Valor Comissão</th>
                                <th class="px-6 py-4 text-center">Status</th>
                                <th class="px-8 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50">
                            ${emp.items.map(item => `
                                <tr class="hover:bg-slate-50/30 transition-colors" data-os="${item.os_id}" data-amount="${item.amount}" data-emp="${emp.name}" data-empid="${emp.id}" data-ref="OS #${item.os_number}">
                                    <td class="px-4 py-4 w-12 text-center">
                                        ${item.status === 'Pendente' ? `
                                            <input type="checkbox" onchange="toggleCommissionSelection(this)" class="commission-checkbox-${emp.id} commission-checkbox rounded border-slate-300 text-primary focus:ring-primary">
                                        ` : ''}
                                    </td>
                                    <td class="px-8 py-4">
                                        <p class="text-xs font-bold text-on-surface">OS #${item.os_number}</p>
                                        <p class="text-[10px] text-slate-500 font-medium">${item.item_name}</p>
                                    </td>
                                    <td class="px-6 py-4">
                                        <p class="text-xs font-medium text-slate-600">R$ ${item.total_os.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </td>
                                    <td class="px-6 py-4">
                                        <p class="text-xs font-medium text-slate-600">${item.rate}</p>
                                    </td>
                                    <td class="px-6 py-4">
                                        <p class="text-xs font-black text-on-surface">R$ ${item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.status === 'Pago' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
                                            ${item.status}
                                        </span>
                                    </td>
                                    <td class="px-8 py-4 text-right">
                                        ${item.status === 'Pendente' ? `
                                            <button onclick="Financial.payCommission('${emp.id}', '${emp.name}', '${item.os_id}', ${item.amount}, 'OS #${item.os_number}', '${item.item_name}')" 
                                                class="px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-primary-container transition-all shadow-sm">
                                                Pagar Agora
                                            </button>
                                        ` : `
                                            <div class="flex items-center justify-end gap-2 group/undo">
                                                <div class="flex items-center text-green-600 gap-1 font-black text-[10px] uppercase tracking-widest">
                                                    <span class="material-symbols-outlined text-sm">check_circle</span>
                                                    Liquidado
                                                </div>
                                                <button onclick="Financial.undoCommission('${item.paid_transaction_id}')" class="opacity-50 hover:opacity-100 p-1.5 bg-orange-50 text-orange-600 rounded lg:opacity-0 lg:group-hover/undo:opacity-100 transition-all shadow-sm" title="Reverter Pagamento">
                                                    <span class="material-symbols-outlined text-[16px]">undo</span>
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
            const { data: { user } } = await AutoFlow.Auth.getUser();
            if (!user) return;

            // Create a 'Despesa' transaction for this commission
            const newExpense = {
                workshop_id: user.id,
                service_order_id: osId,
                type: 'Despesa',
                category: 'Comissão',
                amount: amount,
                payment_method: 'Transferência',
                due_date: new Date().toISOString().split('T')[0],
                status: 'Pago',
                description: `Comissão ${osRef} (${itemName}) - Beneficiário: ${employeeName}`
            };

            const { error } = await AutoFlow.DB.insert('financial_transactions', newExpense);
            
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
            const { error } = await AutoFlow.DB.delete('financial_transactions', { id: transactionId });
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
            const { data: transactions } = await AutoFlow.DB.select('financial_transactions', {
                match: { workshop_id: workshopId },
                order: { column: 'created_at', ascending: false },
                limit: 5
            });

            if (!transactions || transactions.length === 0) {
                listContainer.innerHTML = '<div class="py-8 text-center text-slate-400 text-xs">Nenhuma transação recente encontrada.</div>';
                return;
            }

            listContainer.innerHTML = transactions.map(t => `
                <div class="flex items-center justify-between group">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl ${t.type === 'Receita' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} flex items-center justify-center">
                            <span class="material-symbols-outlined text-lg">${t.type === 'Receita' ? 'keyboard_double_arrow_up' : 'keyboard_double_arrow_down'}</span>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-on-surface">${t.description}</p>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">${new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                    </div>
                    <p class="text-sm font-black ${t.type === 'Receita' ? 'text-green-600' : 'text-red-600'}">
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
            const { data: { user } } = await AutoFlow.Auth.getUser();
            if (!user) return;

            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            // 1. Fetch ALL Transactions for the workshop
            const { data: allTransactions, error: transError } = await AutoFlow.DB.select('financial_transactions', {
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
                const { data: osData } = await AutoFlow.DB.select('service_orders', {
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
                sortOrder: 'desc', // 'asc' or 'desc'
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
            filtered = filtered.filter(t => t.status !== 'Pago' && new Date(t.due_date || t.created_at) < now);
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
            const customer = order?.customers;
            const customerName = customer?.full_name || 'N/A';
            const customerPhone = customer?.phone || '';

            const transDate = new Date(t.due_date || t.created_at);
            const isOverdue = t.status !== 'Pago' && transDate < new Date();

            const statusStyle = t.status === 'Pago'
                ? 'bg-green-100 text-green-700'
                : (isOverdue ? 'bg-red-100 text-red-700 font-black' : 'bg-blue-100 text-blue-700');

            const statusLabel = t.status === 'Pago' ? 'Pago' : (isOverdue ? 'Atrasado' : 'Pendente');

            // Quick Actions Helper
            const waMsg = encodeURIComponent(`Olá ${customerName}, enviamos este lembrete sobre a sua OS ${t.description}. Status atual: ${statusLabel}. Valor: R$ ${parseFloat(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            const waLink = customerPhone ? `https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${waMsg}` : '#';

            return `
                <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td class="px-8 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                                <span class="material-symbols-outlined text-sm">receipt_long</span>
                            </div>
                            <div>
                                <p class="text-sm font-bold text-on-surface">${t.description}</p>
                                <p class="text-[10px] text-slate-400 font-bold uppercase">${t.category || 'Serviço'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <p class="text-sm font-medium text-slate-600">${customerName}</p>
                    </td>
                    <td class="px-6 py-4">
                        <p class="text-sm font-medium text-slate-600">${transDate.toLocaleDateString('pt-BR')}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Vencimento</p>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusStyle}">
                            ${statusLabel}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <p class="text-sm font-black text-on-surface">R$ ${parseFloat(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase">${t.payment_method || '-'}</p>
                    </td>
                    <td class="px-8 py-4 text-right">
                        <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <!-- Action: Enviar Lembrete -->
                            <a href="${waLink}" target="_blank" class="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-600 hover:text-white transition-all shadow-sm" title="Enviar Lembrete WhatsApp">
                                <span class="material-symbols-outlined text-sm">send</span>
                            </a>
                            
                            <!-- Action: Reabrir OS -->
                            ${t.service_order_id ? `
                            <button onclick="reopenOSFromFinance('${t.service_order_id}')" class="p-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-600 hover:text-white transition-all shadow-sm" title="Reabrir Ordem">
                                <span class="material-symbols-outlined text-sm">settings_backup_restore</span>
                            </button>
                            ` : ''}

                            <!-- Action: Toggle Status -->
                            <button onclick="toggleTransactionStatus('${t.id}', '${t.status}')" class="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="${t.status === 'Pago' ? 'Marcar como Pendente' : 'Marcar como Pago'}">
                                <span class="material-symbols-outlined text-sm">${t.status === 'Pago' ? 'undo' : 'check'}</span>
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

        // Update Bento Summary
        const mainMetrics = document.querySelectorAll('h3.font-black');
        if (mainMetrics.length >= 3) {
            mainMetrics[0].textContent = `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            mainMetrics[1].textContent = `R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            mainMetrics[2].textContent = `R$ ${avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }

        const forecastingDisplay = document.querySelector('.forecasting-display');
        if (forecastingDisplay) {
            forecastingDisplay.textContent = `Você tem R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a receber de faturas pendentes.`;
        }
    },

    // --- EXPENSES MANAGEMENT ---

    async initExpensePage() {
        console.log('[DEBUG] Iniciando página de despesas...');
        try {
            const { data: { user } } = await AutoFlow.Auth.getUser();
            if (!user) {
                console.error('[DEBUG] Usuário não autenticado.');
                return;
            }
            console.log('[DEBUG] Usuário logado ID:', user.id);

            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            const { data: allTransactions, error } = await AutoFlow.DB.select('financial_transactions', {
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
                sortOrder: 'desc',
                firstDayOfMonth
            };

            this.applyExpenseFilters();
            this.renderExpenseSummary(expenses, firstDayOfMonth);
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
            filtered = filtered.filter(t => t.status !== 'Pago' && new Date(t.due_date || t.created_at) < now);
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
            const transDate = new Date(t.due_date);
            const isOverdue = t.status !== 'Pago' && transDate < new Date();
            const statusStyle = t.status === 'Pago' ? 'bg-slate-100 text-slate-500' : (isOverdue ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700');
            const statusLabel = t.status === 'Pago' ? 'Pago' : (isOverdue ? 'Atrasado' : 'Pendente');

            return `
                <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group" data-id="${t.id}">
                    <td class="px-8 py-4">
                        <input type="checkbox" onchange="toggleItemSelection('${t.id}', this)" class="item-checkbox rounded border-slate-300 text-primary focus:ring-primary">
                    </td>
                    <td class="px-4 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center">
                                <span class="material-symbols-outlined text-sm">payments</span>
                            </div>
                            <div>
                                <p class="text-sm font-bold text-on-surface">${t.description}</p>
                                <p class="text-[10px] text-slate-400 font-bold uppercase">${t.category || 'Geral'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">${t.category || 'Fixo'}</span>
                    </td>
                    <td class="px-6 py-4">
                        <p class="text-sm font-medium text-slate-600">${transDate.toLocaleDateString('pt-BR')}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Vencimento</p>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusStyle}">
                            ${statusLabel}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <p class="text-sm font-black text-on-surface">R$ ${parseFloat(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase">${t.payment_method || '-'}</p>
                    </td>
                    <td class="px-8 py-4 text-right">
                        <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onclick="toggleExpenseStatus('${t.id}', '${t.status}')" class="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Alternar Status">
                                <span class="material-symbols-outlined text-sm">${t.status === 'Pago' ? 'undo' : 'check'}</span>
                            </button>
                            <button onclick="handleDeleteRequest('${t.id}')" class="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Excluir">
                                <span class="material-symbols-outlined text-sm">delete</span>
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

        const totalOverdue = transactions.filter(t => t.status !== 'Pago' && new Date(t.due_date || t.created_at) < now).reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);

        const mainMetrics = document.querySelectorAll('h3.font-black');
        if (mainMetrics.length >= 3) {
            mainMetrics[0].textContent = `R$ ${totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            mainMetrics[1].textContent = `R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            mainMetrics[2].textContent = `R$ ${totalOverdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

            // Progress bar for overdue (visual only for now)
            const progressBar = document.querySelector('.bg-red-500');
            if (progressBar) progressBar.style.width = totalOverdue > 0 ? '100%' : '0%';
        }
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
    const key = tr.dataset.empid + '-' + tr.dataset.os;
    if (cb.checked) {
        window.selectedCommissions.set(key, {
            employeeId: tr.dataset.empid,
            employeeName: tr.dataset.emp,
            osId: tr.dataset.os,
            amount: parseFloat(tr.dataset.amount),
            osRef: tr.dataset.ref
        });
    } else {
        window.selectedCommissions.delete(key);
    }
    if(window.AutoFlow && window.AutoFlow.Financial) {
        window.AutoFlow.Financial.updateCommissionBulkBar();
    } else if(Financial) {
        Financial.updateCommissionBulkBar();
    }
};

window.clearCommissionSelection = () => {
    window.selectedCommissions.clear();
    document.querySelectorAll('.commission-checkbox, input[type="checkbox"]').forEach(cb => cb.checked = false);
    if(window.AutoFlow && window.AutoFlow.Financial) {
        window.AutoFlow.Financial.updateCommissionBulkBar();
    } else if(Financial) {
        Financial.updateCommissionBulkBar();
    }
};

window.bulkPayCommissions = async () => {
    const items = Array.from(window.selectedCommissions.values());
    if (items.length === 0) return;
    
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    if (!confirm(`Confirmar o pagamento de ${items.length} comissões no total de R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?`)) return;

    // Use absolute AutoFlow context reference
    const af = window.AutoFlow || AutoFlow;

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
                due_date: new Date().toISOString().split('T')[0],
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
        const { error } = await AutoFlow.DB.update('financial_transactions', { status: newStatus }, { id: transId });
        if (error) throw error;
        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

window.reopenOSFromFinance = async (osId) => {
    if (!confirm('Deseja realmente reabrir esta Ordem de Serviço? Ela voltará para o status "Em Aberto".')) return;
    try {
        const { error } = await AutoFlow.DB.update('service_orders', { status: 'Em Aberto', finished_at: null }, { id: osId });
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
            await AutoFlow.DB.update('financial_transactions', { status: 'Pago' }, { id });
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
            await AutoFlow.DB.delete('financial_transactions', { id });
        }
        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

window.toggleExpenseStatus = async (transId, currentStatus) => {
    const newStatus = currentStatus === 'Pago' ? 'Pendente' : 'Pago';
    try {
        const { error } = await AutoFlow.DB.update('financial_transactions', { status: newStatus }, { id: transId });
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
        const { error } = await AutoFlow.DB.delete('financial_transactions', { id });
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
            await AutoFlow.DB.delete('financial_transactions', { id });
        } else if (type === 'future') {
            const siblings = window.expenseState.transactions.filter(item =>
                item.description.startsWith(baseDesc) &&
                item.created_at === t.created_at &&
                item.due_date >= t.due_date
            );
            for (const s of siblings) await AutoFlow.DB.delete('financial_transactions', { id: s.id });
        } else if (type === 'all') {
            const siblings = window.expenseState.transactions.filter(item =>
                item.description.startsWith(baseDesc) &&
                item.created_at === t.created_at
            );
            for (const s of siblings) await AutoFlow.DB.delete('financial_transactions', { id: s.id });
        }

        window.location.reload();
    } catch (err) { alert('Erro: ' + err.message); }
};

// Export to global AutoFlow namespace
if (window.AutoFlow) {
    window.AutoFlow.Financial = Financial;
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
