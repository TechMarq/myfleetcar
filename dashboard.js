/**
 * Dashboard Logic for MyFleetCar SaaS
 */

const Dashboard = {
    async init() {
        const { data: { user } } = await window.MyFleetCar.Auth.getUser();
        if (!user) return;
        this.loadMetrics(user.id);
        this.loadRecentServices(user.id);
        this.loadAppointments(user.id);
        this.loadChart(user.id);
    },

    async loadMetrics(workshopId) {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        const todayStr = now.toISOString().split('T')[0];

        try {
            // 1. Receita Mensal
            const { data: revData } = await window.MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: workshopId, type: 'Receita', status: 'Pago' },
                gte: { due_date: firstDayOfMonth.split('T')[0] },
                lte: { due_date: lastDayOfMonth.split('T')[0] }
            });
            let totalRevenue = 0;
            if (revData) {
                totalRevenue = revData.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
            }
            // 2. OS Data
            const { data: osData } = await window.MyFleetCar.DB.select('service_orders', {
                match: { workshop_id: workshopId }
            });
            const allOS = osData || [];
            const openOS = allOS.filter(os => !['Concluído', 'Cancelado', 'Excluída', 'Completed', 'Cancelled'].includes(os.status));
            const doneOS = allOS.filter(os => 
                ['Concluído', 'Completed'].includes(os.status) && 
                new Date(os.created_at) >= new Date(firstDayOfMonth) && 
                new Date(os.created_at) <= new Date(lastDayOfMonth)
            );

            // 3. Activity metrics
            const activeVehicles = new Set(openOS.map(os => os.vehicle_id).filter(id => id));
            
            const { data: apptData } = await window.MyFleetCar.DB.select('appointments', {
                match: { workshop_id: workshopId, appointment_date: todayStr }
            });
            const validAppts = (apptData || []).filter(a => !['Cancelado', 'Finalizado'].includes(a.status));

            const delayedOS = openOS.filter(os => {
                if (os.status === 'Atrasado') return true;
                if (!os.deadline_at && !os.exit_date) return false;
                const dDate = new Date(os.deadline_at || os.exit_date);
                return dDate < now && !['Concluído', 'Cancelado'].includes(os.status);
            });

            // Update DOM using IDs (robust) or positional selectors (fallback)
            const metricRevenue = document.getElementById('metric-revenue-month') || document.querySelectorAll('.text-xl.font-black')[0];
            const metricOpen = document.getElementById('metric-os-open') || document.querySelectorAll('.text-xl.font-black')[1];
            const metricFinished = document.getElementById('metric-os-finished') || document.querySelectorAll('.text-xl.font-black')[2];
            const metricVehicles = document.getElementById('metric-active-vehicles') || document.querySelectorAll('.text-xl.font-black')[3];
            const metricAppointments = document.getElementById('metric-appointments-today') || document.querySelectorAll('.text-xl.font-black')[4];
            const metricDelayed = document.getElementById('metric-delayed-services') || document.querySelectorAll('.text-xl.font-black')[5];

            if (metricRevenue) metricRevenue.textContent = 'R$ ' + totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2});
            if (metricOpen) metricOpen.textContent = openOS.length;
            if (metricFinished) metricFinished.textContent = doneOS.length;
            if (metricVehicles) metricVehicles.textContent = activeVehicles.size;
            if (metricAppointments) metricAppointments.textContent = validAppts.length;
            if (metricDelayed) metricDelayed.textContent = delayedOS.length;
        } catch (err) {
            console.error('Error loading metrics:', err);
        }
    },

    async loadRecentServices(workshopId) {
        try {
            const { data: osData } = await window.MyFleetCar.DB.select('service_orders', {
                select: '*, customers(full_name), vehicles(brand, model, license_plate)',
                match: { workshop_id: workshopId },
                order: { column: 'created_at', ascending: false },
                limit: 5
            });

            const tbody = document.getElementById('recent-services-list');
            if (!tbody) return;

            if (!osData || osData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 text-xs italic">Nenhum serviço recente registrado.</td></tr>';
                return;
            }

            tbody.innerHTML = osData.map(os => {
                const vehicle = os.vehicles ? `${os.vehicles.brand} ${os.vehicles.model}` : 'N/A';
                const plate = os.vehicles && os.vehicles.license_plate ? os.vehicles.license_plate : '--';
                const customer = os.customers ? os.customers.full_name : 'N/A';
                const statusColor = os.status === 'Concluído' ? 'text-green-600 bg-green-50' : 
                                   os.status === 'Em Andamento' ? 'text-blue-600 bg-blue-50' : 
                                   os.status === 'Atrasado' ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-100';

                return `
                    <tr class="hover:bg-surface-container-high transition-colors">
                        <td class="px-6 py-4">
                            <div class="text-sm font-black text-on-surface font-mono tracking-widest uppercase">${plate}</div>
                            <div class="text-[10px] text-slate-500 font-bold mt-0.5">${vehicle}</div>
                        </td>
                        <td class="px-6 py-4 text-[10px] uppercase font-bold text-slate-500">${customer}</td>
                        <td class="px-6 py-4 text-xs font-medium text-slate-600">${os.description ? os.description.substring(0,25) + '...' : 'Serviço Automotivo'}</td>
                        <td class="px-6 py-4">
                            <span class="px-2 py-1 ${statusColor} rounded text-[10px] font-bold uppercase tracking-widest">${os.status}</span>
                        </td>
                        <td class="px-6 py-4 text-sm font-black text-on-surface">R$ ${(os.total_amount || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('Error loading recent services:', err);
        }
    },

    async loadAppointments(workshopId) {
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: apptData } = await window.MyFleetCar.DB.select('appointments', {
                select: '*, customers(full_name)',
                match: { workshop_id: workshopId, appointment_date: todayStr },
                order: { column: 'appointment_time', ascending: true },
                limit: 5
            });

            const list = document.getElementById('next-appointments-list');
            if (!list) return;

            if (!apptData || apptData.length === 0) {
                list.innerHTML = '<div class="py-12 text-center text-slate-400 text-xs italic bg-surface-container-low rounded-xl">Nenhum agendamento para hoje.</div>';
                return;
            }

            list.innerHTML = apptData.map(a => {
                const customer = a.customers ? a.customers.full_name : 'N/A';
                const time = a.appointment_time ? a.appointment_time.substring(0, 5) : '--:--';
                return `
                    <div class="flex items-center gap-4 p-3 hover:bg-surface-container-low rounded-xl transition-colors">
                        <div class="bg-primary/10 text-primary px-3 py-2 rounded-lg font-black text-sm">
                            ${time}
                        </div>
                        <div>
                            <p class="text-sm font-bold text-on-surface">${customer}</p>
                            <p class="text-[10px] text-slate-500 font-bold uppercase">${a.service_type || 'Manutenção'}</p>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Error loading appointments:', err);
        }
    },



    async loadChart(workshopId) {
        try {
            const now = new Date();
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 6);

            const { data: revData } = await window.MyFleetCar.DB.select('financial_transactions', {
                match: { workshop_id: workshopId, type: 'Receita', status: 'Pago' },
                gte: { due_date: lastWeek.toISOString().split('T')[0] },
                lte: { due_date: now.toISOString().split('T')[0] }
            });

            // Aggregate by day of week
            const daily = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0}; // 0 = Sunday
            if (revData) {
                revData.forEach(r => {
                    const d = new Date(r.due_date + 'T12:00:00'); 
                    daily[d.getDay()] += parseFloat(r.amount);
                });
            }

            const maxVal = Math.max(...Object.values(daily), 1);
            
            const chartBars = document.querySelectorAll('.w-2.h-32.bg-orange-100');
            const dayLabels = document.querySelectorAll('.text-\\[10px\\].mt-4.font-bold.text-slate-400');
            const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

            if (chartBars.length === 7) {
                for (let i = 0; i < 7; i++) {
                    const targetDate = new Date();
                    targetDate.setDate(now.getDate() - (6 - i));
                    const dayIdx = targetDate.getDay();
                    const val = daily[dayIdx];
                    
                    const percent = (val / maxVal) * 100;
                    chartBars[i].firstElementChild.style.height = `${percent}%`;
                    if (dayLabels[i]) {
                        dayLabels[i].textContent = dayNames[dayIdx];
                    }
                }
            }
        } catch(err) {
            console.error('Error loading chart:', err);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('home.html') || window.location.pathname.endsWith('/')) {
        Dashboard.init();
    }
});
