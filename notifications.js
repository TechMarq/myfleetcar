/**
 * Notification System for MyFleetCar SaaS
 * Handles fetching overdue payments, late service orders, and upcoming tasks.
 */

class NotificationManager {
    constructor() {
        this.notifications = [];
        this.isOpen = false;
        this.init();
    }

    async init() {
        // Inject Notification Dropdown HTML into the header if possible
        this.injectUI();
        
        // Setup toggle listener
        const btn = document.getElementById('notification-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // Close on outside click
        document.addEventListener('click', () => {
            if (this.isOpen) this.toggle(false);
        });

        // Load notifications
        await this.loadNotifications();
    }

    injectUI() {
        // Find the notification button (usually has the notifications icon)
        // If it doesn't have an ID, we try to find it and add one
        let btn = document.getElementById('notification-btn');
        if (!btn) {
            const icons = document.querySelectorAll('.material-symbols-outlined');
            for (const icon of icons) {
                if (icon.textContent === 'notifications') {
                    btn = icon.closest('button');
                    if (btn) {
                        btn.id = 'notification-btn';
                        btn.classList.add('relative');
                        break;
                    }
                }
            }
        }

        if (!btn) return;

        // Create the badge if it doesn't exist
        if (!btn.querySelector('.notification-badge')) {
            const badge = document.createElement('span');
            badge.className = 'notification-badge absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white hidden';
            btn.appendChild(badge);
        }

        // Create the dropdown container
        const dropdown = document.createElement('div');
        dropdown.id = 'notification-dropdown';
        dropdown.className = 'absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 hidden z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200';
        dropdown.style.top = '100%';
        
        dropdown.innerHTML = `
            <div class="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                <h3 class="text-xs font-black uppercase tracking-widest text-slate-400">Notificações</h3>
                <span id="notif-count" class="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">0</span>
            </div>
            <div id="notification-list" class="max-h-96 overflow-y-auto">
                <div class="p-8 text-center text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-2 opacity-20">notifications_off</span>
                    <p class="text-xs">Nenhuma notificação relevante no momento.</p>
                </div>
            </div>
            <div class="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <button onclick="window.notificationManager.loadNotifications()" class="text-[10px] font-bold text-slate-500 hover:text-primary uppercase tracking-widest">Atualizar</button>
            </div>
        `;

        // Append to the button's parent (relative container)
        btn.parentElement.classList.add('relative');
        btn.parentElement.appendChild(dropdown);
        
        // Prevent clicks inside dropdown from closing it
        dropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    toggle(force) {
        const dropdown = document.getElementById('notification-dropdown');
        if (!dropdown) return;

        this.isOpen = force !== undefined ? force : !this.isOpen;
        if (this.isOpen) {
            dropdown.classList.remove('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
    }

    async loadNotifications() {
        if (!window.MyFleetCar || !window.MyFleetCar.DB) return;

        try {
            const { data: { user } } = await window.MyFleetCar.Auth.getUser();
            if (!user) return;

            const today = new Date().toISOString().split('T')[0];
            const items = [];

            // 1. Fetch Overdue Receivables
            const { data: receivables } = await window.MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: user.id, type: 'Receita', status: 'Pendente' },
                lt: { due_date: today }
            });

            if (receivables) {
                receivables.forEach(r => {
                    items.push({
                        type: 'finance',
                        title: 'Pagamento Atrasado',
                        desc: `${r.description || 'Transação'} - R$ ${r.amount.toLocaleString('pt-BR')}`,
                        date: r.due_date,
                        priority: 'high',
                        link: 'gestao-receita-financeiro.html'
                    });
                });
            }

            // 2. Fetch Overdue Service Orders
            const { data: orders } = await window.MyFleetCar.DB.select('service_orders', {
                match: { workshop_id: user.id }
            });

            if (orders) {
                const lateOrders = orders.filter(o => 
                    !['Concluído', 'Finalizada', 'Cancelado'].includes(o.status) && 
                    o.deadline_at && new Date(o.deadline_at) < new Date()
                );

                lateOrders.forEach(o => {
                    items.push({
                        type: 'service',
                        title: 'OS Atrasada',
                        desc: `OS #${o.os_number || o.id.slice(-6).toUpperCase()} está fora do prazo.`,
                        date: o.deadline_at,
                        priority: 'medium',
                        link: 'lista-ordem.html'
                    });
                });
            }

            this.notifications = items;
            this.render();

        } catch (err) {
            console.error('Error loading notifications:', err);
        }
    }

    render() {
        const list = document.getElementById('notification-list');
        const badge = document.querySelector('.notification-badge');
        const count = document.getElementById('notif-count');
        
        if (!list) return;

        if (this.notifications.length === 0) {
            list.innerHTML = `
                <div class="p-8 text-center text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-2 opacity-20">notifications_off</span>
                    <p class="text-xs">Nenhuma notificação relevante no momento.</p>
                </div>
            `;
            if (badge) badge.classList.add('hidden');
            if (count) count.textContent = '0';
            return;
        }

        if (badge) badge.classList.remove('hidden');
        if (count) count.textContent = this.notifications.length;

        const icons = {
            finance: 'payments',
            service: 'engineering',
            alert: 'warning'
        };

        const colors = {
            high: 'text-red-600 bg-red-50',
            medium: 'text-orange-600 bg-orange-50',
            low: 'text-blue-600 bg-blue-50'
        };

        list.innerHTML = this.notifications.map(n => `
            <a href="${n.link || '#'}" class="block p-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 group">
                <div class="flex gap-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[n.priority] || 'bg-slate-100 text-slate-600'}">
                        <span class="material-symbols-outlined text-xl">${icons[n.type] || 'notifications'}</span>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors">${n.title}</p>
                        <p class="text-[10px] text-slate-500 line-clamp-2 mt-0.5">${n.desc}</p>
                        <p class="text-[9px] text-slate-400 mt-1 font-medium italic">${new Date(n.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                </div>
            </a>
        `).join('');
    }
}

// Initialize global manager
window.addEventListener('DOMContentLoaded', () => {
    window.notificationManager = new NotificationManager();
});
