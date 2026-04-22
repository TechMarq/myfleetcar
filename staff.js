/**
 * Staff Management Logic for MyFleetCar SaaS
 */

document.addEventListener('DOMContentLoaded', () => {
    loadStaff();

    const staffForm = document.getElementById('staff-form');
    if (staffForm) {
        staffForm.addEventListener('submit', handleAddStaff);
    }
});

/**
 * Toggles input fields based on pay type selection
 */
window.togglePayFields = function() {
    const payType = document.getElementById('staff-pay-type').value;
    const commField = document.getElementById('commission-field');
    const salaryField = document.getElementById('salary-field');

    if (payType === 'Comissão') {
        commField.classList.remove('hidden');
        salaryField.classList.add('hidden');
    } else {
        commField.classList.add('hidden');
        salaryField.classList.remove('hidden');
    }
};

let currentEditingId = null;

/**
 * Loads staff members from the DB
 */
async function loadStaff() {
    const list = document.getElementById('staff-list');
    if (!list) return;

    try {
        const { data: staff, error } = await MyFleetCar.DB.select('staff', {
            order: { column: 'name', ascending: true }
        });

        if (error) throw error;

        if (!staff || staff.length === 0) {
            list.innerHTML = `<tr><td colspan="4" class="px-6 py-20 text-center text-slate-400 italic">Nenhum funcionário cadastrado.</td></tr>`;
            return;
        }

        // Global store for access by edit button
        window.allStaff = staff;

        list.innerHTML = staff.map(s => `
            <tr class="hover:bg-slate-50 transition-all group">
                <td class="px-6 py-6">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                            ${s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="text-sm font-bold text-slate-900">${s.name}</div>
                            <div class="text-xs text-slate-500">${s.role}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-6">
                    <span class="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full uppercase tracking-widest whitespace-nowrap">
                        ${s.compensation_type}
                    </span>
                </td>
                <td class="px-6 py-6 font-mono text-sm font-bold text-slate-700">
                    ${s.compensation_type === 'Comissão' ? s.commission_percent + '%' : 'R$ ' + s.fixed_salary.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </td>
                <td class="px-6 py-6 text-right">
                    <div class="flex items-center justify-end gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="editStaff('${s.id}')" class="p-2 text-slate-400 hover:text-orange-500 transition-colors" title="Editar">
                            <span class="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button onclick="deleteStaff('${s.id}')" class="p-2 text-slate-300 hover:text-red-500 transition-colors" title="Excluir">
                            <span class="material-symbols-outlined text-lg">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Error loading staff:', err);
    }
}

/**
 * Prepares the modal for editing a staff member
 */
window.editStaff = function(id) {
    const s = window.allStaff.find(item => item.id === id);
    if (!s) return;

    currentEditingId = id;
    
    // Update modal UI
    document.querySelector('#modal-staff h3').textContent = 'Editar Funcionário';
    document.getElementById('staff-name').value = s.name;
    document.getElementById('staff-role').value = s.role;
    document.getElementById('staff-pay-type').value = s.compensation_type;
    document.getElementById('staff-commission').value = s.commission_percent;
    document.getElementById('staff-salary').value = s.fixed_salary;

    togglePayFields();
    openModal('modal-staff');
};

/**
 * Resets modal for a new entry
 */
window.openStaffModal = function() {
    currentEditingId = null;
    document.querySelector('#modal-staff h3').textContent = 'Cadastrar Funcionário';
    document.getElementById('staff-form').reset();
    togglePayFields();
    openModal('modal-staff');
};

/**
 * Handles adding or updating a staff member
 */
async function handleAddStaff(e) {
    e.preventDefault();

    const { data: { user } } = await MyFleetCar.Auth.getUser();
    if (!user) return;

    const staffData = {
        workshop_id: user.id,
        name: document.getElementById('staff-name').value,
        role: document.getElementById('staff-role').value,
        compensation_type: document.getElementById('staff-pay-type').value,
        commission_percent: parseFloat(document.getElementById('staff-commission').value) || 0,
        fixed_salary: parseFloat(document.getElementById('staff-salary').value) || 0
    };

    try {
        let result;
        if (currentEditingId) {
            // Update existing
            result = await MyFleetCar.DB.update('staff', staffData, { id: currentEditingId });
        } else {
            // Insert new
            result = await MyFleetCar.DB.insert('staff', staffData);
        }

        if (result.error) throw result.error;

        closeModal('modal-staff');
        document.getElementById('staff-form').reset();
        loadStaff();
        alert(currentEditingId ? 'Funcionário atualizado com sucesso!' : 'Funcionário cadastrado com sucesso!');
        currentEditingId = null;
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar funcionário: ' + err.message);
    }
}

/**
 * Deletes a staff member
 */
window.deleteStaff = async function(id) {
    if (!confirm('Deseja realmente excluir este funcionário?')) return;

    try {
        const { error } = await MyFleetCar.DB.delete('staff', { id });
        if (error) throw error;
        loadStaff();
    } catch (err) {
        console.error(err);
        alert('Erro ao excluir funcionário.');
    }
};

window.openModal = (id) => document.getElementById(id).classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
