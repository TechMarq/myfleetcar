/**
 * Master Admin Logic for MyFleetCar SaaS
 * Enhanced Subscription & Billing Management
 */

const MasterAdmin = {
    state: {
        profiles: [],
        payments: [],
        currentTab: 'users'
    },

    async init() {
        console.log('[MASTER ADMIN] Initializing...');
        await this.refreshData();
        this.setupForm();
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
        const now = new Date();
        const monthRef = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
        const el = document.getElementById('current-billing-month');
        if (el) el.textContent = `Referência: ${monthRef}`;
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

        // Update headers
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
            const status = p.status || 'active';
            const isActive = status === 'active';
            const planValue = parseFloat(p.plan_value || 0);
            const nextDue = p.next_due_date ? new Date(p.next_due_date).toLocaleDateString('pt-BR') : 'S/ Data';

            return `
                <tr class="hover:bg-slate-900/30 transition-colors">
                    <td class="px-8 py-5">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 font-black text-xs">
                                ${(p.workshop_name || 'N').substring(0,2).toUpperCase()}
                            </div>
                            <div>
                                <p class="font-bold text-slate-100">${p.workshop_name || 'Sem Nome'}</p>
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
                        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isActive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}">
                            ${isActive ? 'Ativo' : 'Suspenso'}
                        </span>
                    </td>
                    <td class="px-8 py-5 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="MasterAdmin.openModal('${p.id}')" class="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-all">
                                <span class="material-symbols-outlined text-sm">settings</span>
                            </button>
                            <button onclick="MasterAdmin.toggleAccess('${p.id}', '${status}')" 
                                class="px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white'}">
                                ${isActive ? 'Suspender' : 'Reativar'}
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
        const now = new Date();
        const monthRef = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
        const list = document.getElementById('billing-list');

        list.innerHTML = this.state.profiles.map(p => {
            // Check if there is a payment for this workshop in the current reference month
            const hasPaid = this.state.payments.some(pay => pay.workshop_id === p.id && pay.reference_month === monthRef);
            const planValue = parseFloat(p.plan_value || 0);
            const dueDay = p.due_day || 10;

            return `
                <tr class="hover:bg-slate-900/30 transition-colors">
                    <td class="px-8 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg ${hasPaid ? 'bg-green-500/20 text-green-500' : 'bg-slate-800 text-slate-500'} flex items-center justify-center">
                                <span class="material-symbols-outlined text-sm">${hasPaid ? 'check_circle' : 'pending'}</span>
                            </div>
                            <p class="font-bold text-slate-100 text-sm">${p.workshop_name || 'Oficina'}</p>
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
                        <button disabled class="text-slate-600 text-[9px] font-black uppercase tracking-widest">Pago</button>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    },

    openModal(id) {
        const p = this.state.profiles.find(pr => pr.id === id);
        if (!p) return;

        document.getElementById('modal-title').textContent = p.workshop_name;
        document.getElementById('modal-workshop-id').value = id;
        document.getElementById('modal-plan-value').value = p.plan_value || 0;
        document.getElementById('modal-due-day').value = p.due_day || 10;
        document.getElementById('modal-next-due').value = p.next_due_date || '';
        
        // Setup payment fields
        document.getElementById('modal-pay-amount').value = p.plan_value || 0;
        const now = new Date();
        document.getElementById('modal-pay-ref').value = `${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

        // Render mini history
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

    closeModal() {
        document.getElementById('payment-modal').classList.add('hidden');
    },

    setupForm() {
        document.getElementById('payment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('modal-workshop-id').value;
            const planValue = document.getElementById('modal-plan-value').value;
            const dueDay = document.getElementById('modal-due-day').value;
            const nextDue = document.getElementById('modal-next-due').value;
            const payAmount = document.getElementById('modal-pay-amount').value;
            const payRef = document.getElementById('modal-pay-ref').value;

            try {
                // 1. Update Profile
                await MyFleetCar.DB.update('profiles', {
                    plan_value: planValue,
                    due_day: parseInt(dueDay),
                    next_due_date: nextDue
                }, { id });

                // 2. Register Payment
                if (parseFloat(payAmount) > 0) {
                    await MyFleetCar.DB.insert('master_payments', {
                        workshop_id: id,
                        amount: payAmount,
                        reference_month: payRef,
                        method: 'Manual/Pix'
                    });
                }

                alert('Dados atualizados!');
                this.closeModal();
                await this.refreshData();
            } catch (err) {
                alert('Erro: ' + err.message);
            }
        });
    },

    async toggleAccess(workshopId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        if (!confirm(`Confirmar alteração de acesso para: ${newStatus.toUpperCase()}?`)) return;

        try {
            await MyFleetCar.DB.update('profiles', { status: newStatus }, { id: workshopId });
            await this.refreshData();
        } catch (err) {
            alert('Erro: ' + err.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => MasterAdmin.init());
