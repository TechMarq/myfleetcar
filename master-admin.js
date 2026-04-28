/**
 * Master Admin Logic for MyFleetCar SaaS
 * Enhanced Subscription, Billing & Status Management
 */

const MasterAdmin = {
    state: {
        profiles: [],
        payments: [],
        currentTab: 'users',
        billingDate: new Date(),
        filters: {
            start: null,
            end: null
        }
    },

    async init() {
        console.log('[MASTER ADMIN] Initializing...');
        await this.refreshData();
        this.setupForms();
        this.updateCurrentMonthDisplay();
    },

    async refreshData() {
        try {
            const { data: profiles } = await MyFleetCar.DB.select('profiles', { order: { column: 'created_at', ascending: false } });
            const { data: payments } = await MyFleetCar.DB.select('master_payments', { order: { column: 'payment_date', ascending: false } });
            
            this.state.profiles = profiles || [];
            this.state.payments = payments || [];

            this.renderAll();
        } catch (err) {
            console.error('Data refresh error:', err);
        }
    },

    updateCurrentMonthDisplay() {
        const monthRef = this.getFormattedMonth(this.state.billingDate);
        const el = document.getElementById('current-billing-month');
        if (el) el.textContent = monthRef;
    },

    getFormattedMonth(date) {
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    },

    changeBillingMonth(direction) {
        const d = this.state.billingDate;
        d.setMonth(d.getMonth() + direction);
        this.state.billingDate = new Date(d);
        this.updateCurrentMonthDisplay();
        this.renderBilling();
    },

    applyDateFilter() {
        const start = document.getElementById('billing-start-date').value;
        const end = document.getElementById('billing-end-date').value;
        if (!start || !end) { alert('Selecione um período válido.'); return; }
        this.state.filters.start = new Date(start);
        this.state.filters.end = new Date(end);
        this.state.filters.end.setHours(23, 59, 59);
        this.renderBilling();
    },

    clearFilters() {
        document.getElementById('billing-start-date').value = '';
        document.getElementById('billing-end-date').value = '';
        this.state.filters.start = null;
        this.state.filters.end = null;
        this.renderBilling();
    },

    switchTab(tab, el) {
        this.state.currentTab = tab;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(`tab-${tab}`).classList.remove('hidden');

        document.querySelectorAll('.nav-item').forEach(i => {
            i.classList.remove('bg-orange-600', 'text-white');
            i.classList.add('text-slate-500', 'hover:bg-slate-800');
        });
        el.classList.add('bg-orange-600', 'text-white');
        el.classList.remove('text-slate-500', 'hover:bg-slate-800');

        const title = document.getElementById('page-title');
        const sub = document.getElementById('page-subtitle');
        if (tab === 'users') { title.textContent = 'Usuários & Acesso'; sub.textContent = 'Gestão de contas e suspensão.'; }
        if (tab === 'finance') { title.textContent = 'Dashboard SaaS'; sub.textContent = 'Análise financeira e métricas de lucro.'; }
        if (tab === 'billing') { title.textContent = 'Cobranças Mensais'; sub.textContent = 'Controle de pagamentos pendentes e recebidos.'; }
    },

    renderAll() {
        this.renderUsers();
        this.renderFinance();
        this.renderBilling();
    },

    renderUsers() {
        const list = document.getElementById('users-list');
        document.getElementById('total-workshops').textContent = this.state.profiles.length;

        list.innerHTML = this.state.profiles.map(p => {
            const status = p.status || 'trial';
            const isActive = status === 'active';
            const isTrial = status === 'trial';
            const isFree = status === 'free';
            
            const createdAt = new Date(p.created_at);
            const now = new Date();
            const diffDays = Math.ceil(Math.abs(now - createdAt) / (1000 * 60 * 60 * 24));
            const isTrialExpired = isTrial && diffDays > 7;

            const planValue = parseFloat(p.plan_value || 0);
            const nextDue = p.next_due_date ? new Date(p.next_due_date).toLocaleDateString('pt-BR') : 'S/ Data';

            let statusBadge = '';
            if (isActive) {
                statusBadge = `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-500">Ativo</span>`;
            } else if (isFree) {
                statusBadge = `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500">Gratuito</span>`;
            } else if (isTrial) {
                const remainingDays = Math.max(0, 7 - diffDays);
                statusBadge = `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isTrialExpired ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}">
                    ${isTrialExpired ? 'Teste Expirado' : `Faltam ${remainingDays} dias`}
                </span>`;
            } else {
                statusBadge = `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-500">Suspenso</span>`;
            }

            return `
                <tr class="hover:bg-slate-900/30 transition-colors">
                    <td class="px-8 py-5">
                        <div class="flex items-center gap-4 cursor-pointer group/name" onclick="MasterAdmin.openModal('${p.id}')">
                            <div class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 font-black text-xs group-hover/name:bg-orange-600 group-hover/name:text-white transition-all">
                                ${(p.workshop_name || 'N').substring(0,2).toUpperCase()}
                            </div>
                            <div>
                                <p class="font-bold text-slate-100 group-hover/name:text-orange-500 transition-colors">${p.workshop_name || 'Sem Nome'}</p>
                                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">${p.owner_name || 'Proprietário'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-8 py-5">
                        <p class="text-sm font-bold text-slate-200">R$ ${planValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p class="text-[9px] text-slate-500 font-black uppercase">Mensalidade</p>
                    </td>
                    <td class="px-8 py-5">
                        <p class="text-sm font-medium text-slate-400">${nextDue}</p>
                    </td>
                    <td class="px-8 py-5">
                        ${statusBadge}
                    </td>
                    <td class="px-8 py-5 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="MasterAdmin.openModal('${p.id}')" class="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-all">
                                <span class="material-symbols-outlined text-sm">settings</span>
                            </button>
                            <button onclick="MasterAdmin.toggleAccess('${p.id}', '${status}')" 
                                class="px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white'}">
                                ${isActive ? 'Suspenso' : 'Ativar'}
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderFinance() {
        const totalRevenue = this.state.payments.reduce((acc, p) => acc + parseFloat(p.amount), 0);
        const mrr = this.state.profiles.filter(p => p.status !== 'suspended').reduce((acc, p) => acc + parseFloat(p.plan_value || 0), 0);
        
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthRevenue = this.state.payments.filter(p => new Date(p.payment_date) >= firstDay).reduce((acc, p) => acc + parseFloat(p.amount), 0);

        document.getElementById('master-total-revenue').textContent = `R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('mrr-display').textContent = `R$ ${mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('month-revenue').textContent = `R$ ${monthRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        const historyList = document.getElementById('payments-history-list');
        historyList.innerHTML = this.state.payments.map(p => {
            const profile = this.state.profiles.find(pr => pr.id === p.workshop_id);
            return `
                <tr class="hover:bg-slate-900/30 transition-colors">
                    <td class="px-8 py-4 text-xs text-slate-500 font-mono">${new Date(p.payment_date).toLocaleDateString('pt-BR')}</td>
                    <td class="px-8 py-4 text-xs font-bold text-slate-200">${profile?.workshop_name || 'Desconhecido'}</td>
                    <td class="px-8 py-4 text-xs text-slate-400 italic">${p.reference_month || '-'}</td>
                    <td class="px-8 py-4 text-right text-xs font-black text-green-500">R$ ${parseFloat(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td class="px-8 py-4 text-right">
                         <span class="text-[9px] text-slate-600 font-bold uppercase tracking-widest">${p.method || 'Manual'}</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderBilling() {
        const monthRef = this.getFormattedMonth(this.state.billingDate);
        const list = document.getElementById('billing-list');
        const filters = this.state.filters;

        list.innerHTML = this.state.profiles.map(p => {
            const payment = this.state.payments.find(pay => {
                const sameWorkshop = pay.workshop_id === p.id;
                const sameMonth = pay.reference_month === monthRef;
                if (filters.start && filters.end) {
                    const payDate = new Date(pay.payment_date);
                    return sameWorkshop && payDate >= filters.start && payDate <= filters.end;
                }
                return sameWorkshop && sameMonth;
            });

            const hasPaid = !!payment;
            const planValue = parseFloat(p.plan_value || 0);
            const dueDay = p.due_day || 10;

            return `
                <tr class="hover:bg-slate-900/30 transition-colors">
                    <td class="px-8 py-5">
                        <div class="flex items-center gap-3 cursor-pointer group/bill" onclick="MasterAdmin.openModal('${p.id}')">
                            <div class="w-8 h-8 rounded-lg ${hasPaid ? 'bg-green-500/20 text-green-500' : 'bg-slate-800 text-slate-500'} flex items-center justify-center group-hover/bill:bg-orange-600 group-hover/bill:text-white transition-all">
                                <span class="material-symbols-outlined text-sm">${hasPaid ? 'check_circle' : 'pending'}</span>
                            </div>
                            <p class="font-bold text-slate-100 text-sm group-hover/bill:text-orange-500 transition-colors">${p.workshop_name || 'Oficina'}</p>
                        </div>
                    </td>
                    <td class="px-8 py-5 text-center text-sm font-medium text-slate-400">Dia ${dueDay}</td>
                    <td class="px-8 py-5 text-right text-sm font-black text-slate-200">R$ ${planValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td class="px-8 py-5 text-center">
                        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${hasPaid ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500 animate-pulse'}">
                            ${hasPaid ? 'Recebido' : 'Pendente'}
                        </span>
                    </td>
                    <td class="px-8 py-5 text-right">
                        ${!hasPaid ? `
                        <button onclick="MasterAdmin.openModal('${p.id}')" class="bg-orange-600 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-orange-700 transition-all">
                            Dar Baixa
                        </button>
                        ` : `
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="MasterAdmin.deletePayment('${payment.id}')" class="p-2 bg-orange-500/10 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-all shadow-sm" title="Reabrir Cobrança (Marcar como Pendente)">
                                <span class="material-symbols-outlined text-xs">settings_backup_restore</span>
                            </button>
                            <span class="text-slate-600 text-[9px] font-black uppercase tracking-widest">Pago</span>
                        </div>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    },

    async deletePayment(paymentId) {
        if (!confirm('Deseja REABRIR esta cobrança? O registro de pagamento será removido e o status voltará para PENDENTE.')) return;
        try {
            const { error } = await MyFleetCar.DB.delete('master_payments', { id: paymentId });
            if (error) throw error;
            alert('Pagamento excluído. Cobrança reaberta.');
            await this.refreshData();
        } catch (err) { alert('Erro ao excluir: ' + err.message); }
    },

    async openModal(id) {
        const p = this.state.profiles.find(pr => pr.id === id);
        if (!p) return;

        // Fetch Workshop Stats
        let stats = { customers: 0, vehicles: 0, orders: 0 };
        try {
            const { count: cCount } = await MyFleetCar.DB.select('customers', { match: { workshop_id: id }, count: 'exact', head: true });
            const { count: vCount } = await MyFleetCar.DB.select('vehicles', { match: { workshop_id: id }, count: 'exact', head: true });
            const { count: oCount } = await MyFleetCar.DB.select('service_orders', { match: { workshop_id: id }, count: 'exact', head: true });
            stats = { customers: cCount || 0, vehicles: vCount || 0, orders: oCount || 0 };
        } catch (e) { console.error('Stats fetch error:', e); }

        document.getElementById('modal-title').textContent = p.workshop_name;
        document.getElementById('modal-workshop-id').value = id;
        document.getElementById('modal-status').value = p.status || 'trial';
        document.getElementById('modal-plan-value').value = p.plan_value || 0;
        document.getElementById('modal-due-day').value = p.due_day || 10;
        document.getElementById('modal-next-due').value = p.next_due_date || '';
        
        // Detailed Info
        document.getElementById('modal-created-at').textContent = new Date(p.created_at).toLocaleDateString('pt-BR');
        document.getElementById('modal-owner-name').textContent = p.owner_name || 'Não informado';
        document.getElementById('modal-email').textContent = p.email || 'Não informado';
        document.getElementById('modal-phone').textContent = p.phone || 'Não informado';

        // Stats Display
        document.getElementById('modal-stat-customers').textContent = stats.customers;
        document.getElementById('modal-stat-vehicles').textContent = stats.vehicles;
        document.getElementById('modal-stat-orders').textContent = stats.orders;

        document.getElementById('modal-pay-amount').value = p.plan_value || 0;
        document.getElementById('modal-pay-ref').value = this.getFormattedMonth(this.state.billingDate);

        const userPayments = this.state.payments.filter(pay => pay.workshop_id === id).slice(0, 5);
        document.getElementById('modal-history').innerHTML = userPayments.length > 0 ? userPayments.map(pay => `
            <div class="flex justify-between items-center bg-slate-950/30 p-3 rounded-xl border border-slate-800/50">
                <span class="text-[10px] font-mono text-slate-500">${new Date(pay.payment_date).toLocaleDateString('pt-BR')}</span>
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${pay.reference_month}</span>
                <span class="text-[10px] font-black text-green-500">R$ ${parseFloat(pay.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
        `).join('') : '<p class="text-[10px] text-slate-600 text-center py-4">Nenhum histórico encontrado.</p>';

        document.getElementById('payment-modal').classList.remove('hidden');
    },

    closeModal() { document.getElementById('payment-modal').classList.add('hidden'); },

    openNewUserModal() { document.getElementById('new-user-modal').classList.remove('hidden'); },
    closeNewUserModal() { document.getElementById('new-user-modal').classList.add('hidden'); },

    setupForms() {
        // Form: Config & Payment
        document.getElementById('payment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('modal-workshop-id').value;
            const status = document.getElementById('modal-status').value;
            let planValue = document.getElementById('modal-plan-value').value;
            const dueDay = document.getElementById('modal-due-day').value;
            const nextDue = document.getElementById('modal-next-due').value;
            const payAmount = document.getElementById('modal-pay-amount').value;
            const payRef = document.getElementById('modal-pay-ref').value;

            // Se for plano gratuito, zerar valor do plano
            if (status === 'free') {
                planValue = 0;
            }

            try {
                const { error: upError } = await MyFleetCar.DB.update('profiles', {
                    status,
                    plan_value: planValue,
                    due_day: parseInt(dueDay),
                    next_due_date: nextDue
                }, { id });

                if (upError) throw upError;

                if (parseFloat(payAmount) > 0) {
                    const { error: payError } = await MyFleetCar.DB.insert('master_payments', {
                        workshop_id: id,
                        amount: payAmount,
                        reference_month: payRef,
                        method: 'Manual/Pix'
                    });
                    if (payError) throw payError;
                }

                alert('Dados atualizados com sucesso!');
                this.closeModal();
                await this.refreshData();
            } catch (err) { 
                console.error('Update error:', err);
                alert('Erro ao atualizar: ' + (err.message || 'Erro desconhecido')); 
            }
        });

        // Form: New User (Manual Profile)
        document.getElementById('new-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-workshop-name').value;
            const email = document.getElementById('new-workshop-email').value;

            try {
                // Since we can't create Auth users from client-side easily without logging out,
                // we create the PROFILE. When the real user signs up with THIS email, 
                // they will see this profile if we logic it correctly, OR better yet,
                // this allows the admin to pre-configure workshops.
                
                // For this SaaS, we'll use a UUID as a placeholder ID if it's manual, 
                // but it's better to let them register. 
                // However, I'll implement a "Manual Insert" for the profile.
                
                // IMPORTANT: In Supabase, the ID must be a UUID from auth.users.
                // If we want to create a profile BEFORE the user exists, we have a challenge.
                // Instead, let's make this "Novo Usuário" just a "Pre-cadastro" record 
                // or just advise that they must register first.
                
                alert('Aviso: Como o sistema é seguro, o usuário deve primeiro se cadastrar na tela de registro. Após o cadastro, ele aparecerá aqui e você poderá mudar o status para Teste ou Ativo.');
                this.closeNewUserModal();
            } catch (err) { alert('Erro: ' + err.message); }
        });
    },

    async toggleAccess(workshopId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        if (!confirm(`Confirmar alteração de acesso para: ${newStatus.toUpperCase()}?`)) return;
        try {
            await MyFleetCar.DB.update('profiles', { status: newStatus }, { id: workshopId });
            await this.refreshData();
        } catch (err) { alert('Erro: ' + err.message); }
    }
};

document.addEventListener('DOMContentLoaded', () => MasterAdmin.init());
