/**
 * Clients Management Logic for AutoFlow SaaS
 */

let allClients = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Fetch Clients if on the list page
    if (document.getElementById('clients-list')) {
        loadClients();
        
        // Setup Search
        const searchInput = document.getElementById('search-clients');
        if (searchInput) {
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = allClients.filter(client => {
                    const nameMatch = client.full_name?.toLowerCase().includes(term);
                    const plateMatch = client.vehicles?.some(v => v.license_plate?.toLowerCase().includes(term));
                    return nameMatch || plateMatch;
                });
                renderClientRows(filtered, term);
            };
        }
    }

    // 2. Handle Client Form if on the registration page
    const clientForm = document.getElementById('client-form');
    if (clientForm) {
        clientForm.addEventListener('submit', handleNewClient);
        
        // 3. Hydrate form if editing
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('id');
        if (editId) {
            loadClientData(editId);
        }
    }
});

/**
 * Loads and hydrates the form for editing
 */
async function loadClientData(id) {
    console.log('Loading client data for ID:', id);
    try {
        const { data: clients, error } = await AutoFlow.DB.select('customers', {
            match: { id: id },
            select: '*, vehicles(*)'
        });

        if (error) throw error;
        if (!clients || clients.length === 0) return;

        const client = clients[0];

        // Fill Form
        document.getElementById('client-name').value = client.full_name || '';
        document.getElementById('client-email').value = client.email || '';
        document.getElementById('client-phone').value = client.phone || '';
        document.getElementById('client-cpf').value = client.cpf_cnpj || '';
        document.getElementById('client-address').value = client.address || '';

        // Update Title/Button
        const title = document.querySelector('h2.workshop-name-display');
        if (title) title.textContent = 'Editar Cliente';
        
        const subTitle = document.querySelector('h3.text-on-surface-variant');
        if (subTitle && subTitle.textContent.includes('1.')) subTitle.textContent = '1. Informações do Cliente (Editando)';

        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Atualizar Cliente';

        // Load Vehicles
        if (client.vehicles && client.vehicles.length > 0) {
            // In case of editing, we might want to blend existing vehicles with new temp ones
            // For now, let's just show the existing ones in the list
            if (typeof renderVehicles === 'function') {
                renderVehicles(client.vehicles);
            }
        }
    } catch (err) {
        console.error('Error loading client data:', err);
    }
}

/**
 * Loads and displays the clients list
 */
async function loadClients() {
    const listContainer = document.getElementById('clients-list');
    if (!listContainer) return;

    try {
        // Fetch clients with their vehicles
        const { data: clients, error } = await AutoFlow.DB.select('customers', {
            select: '*, vehicles(*)',
            order: { column: 'created_at', ascending: false }
        });

        if (error) throw error;
        
        allClients = clients || [];
        renderClientRows(allClients);

    } catch (err) {
        console.error('Error loading clients:', err);
        listContainer.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-red-500">Erro ao carregar clientes: ${err.message}</td></tr>`;
    }
}

/**
 * Renders the table rows for a given list of clients
 */
function renderClientRows(clients, searchTerm = '') {
    const listContainer = document.getElementById('clients-list');
    if (!listContainer) return;

    if (!clients || clients.length === 0) {
        listContainer.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400">Nenhum cliente encontrado.</td></tr>';
        return;
    }

    listContainer.innerHTML = clients.map(client => {
        // Context-aware primary vehicle: 
        // If searching a plate, prioritize showing that specific vehicle
        let primaryVehicle = client.vehicles && client.vehicles.length > 0 ? client.vehicles[0] : null;

        if (searchTerm && client.vehicles) {
            const matchingVehicle = client.vehicles.find(v => v.license_plate?.toLowerCase().includes(searchTerm.toLowerCase()));
            if (matchingVehicle) primaryVehicle = matchingVehicle;
        }
        
        const extraVehicles = client.vehicles && client.vehicles.length > 1 ? client.vehicles.length - 1 : 0;
        
        return `
            <tr class="hover:bg-slate-50/50 transition-colors group">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                            ${(client.full_name || 'C').charAt(0)}
                        </div>
                        <div>
                            <div class="text-sm font-bold text-on-surface">${client.full_name}</div>
                            <div class="text-[10px] text-slate-500">${client.email || 'Sem e-mail'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-sm text-slate-600 font-medium">${client.phone || '-'}</td>
                <td class="px-6 py-4 text-sm text-slate-600">
                    <div class="flex items-center gap-2">
                        <div class="flex flex-col">
                            <span class="font-black text-on-surface tracking-wider uppercase">${primaryVehicle ? primaryVehicle.license_plate : '-'}</span>
                            <span class="text-[10px] text-slate-500 font-bold uppercase">${primaryVehicle ? primaryVehicle.brand + ' ' + primaryVehicle.model : 'Nenhum vinculado'}</span>
                        </div>
                        ${extraVehicles > 0 ? `
                            <div class="bg-slate-100 text-slate-600 text-[10px] font-black px-1.5 py-0.5 rounded-md border border-slate-200" title="Possui mais ${extraVehicles} veículos">
                                + ${extraVehicles}
                            </div>
                        ` : ''}
                    </div>
                </td>
                <td class="px-6 py-4 text-sm text-slate-600">-</td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 capitalize">Ativo</span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="viewClientDetail('${client.id}')" class="p-2 text-slate-400 hover:text-tertiary transition-colors" title="Ver Detalhes">
                            <span class="material-symbols-outlined text-lg">visibility</span>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
}

/**
 * Handles creation of a new client
 */
async function handleNewClient(e) {
    e.preventDefault();
    
    const form = e.target;
    // Get the workshop_id from current user
    const { data: { user } } = await AutoFlow.Auth.getUser();
    if (!user) {
        alert('Sessão expirada. Faça login novamente.');
        window.location.href = 'login.html';
        return;
    }

    // Ensure profile exists to avoid FK error
    try {
        const { data: profile } = await AutoFlow.DB.select('profiles', { match: { id: user.id } });
        if (!profile || profile.length === 0) {
            console.log('Profile missing, creating...');
            // Attempt to create basic profile if trigger failed
            await AutoFlow.supabase.from('profiles').upsert({ 
                id: user.id, 
                workshop_name: user.user_metadata.workshop_name || 'Minha Oficina',
                owner_name: user.user_metadata.owner_name || ''
            });
        }
    } catch (e) {
        console.warn('Profile check error:', e);
    }

    const clientData = {
        workshop_id: user.id,
        full_name: document.getElementById('client-name').value,
        email: document.getElementById('client-email').value,
        phone: document.getElementById('client-phone').value,
        cpf_cnpj: document.getElementById('client-cpf').value,
        address: document.getElementById('client-address').value
    };

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('id');

    try {
        let result;
        if (editId) {
            // Update
            result = await AutoFlow.DB.update('customers', clientData, { id: editId });
        } else {
            // Insert
            result = await AutoFlow.DB.insert('customers', clientData);
        }
        
        const { data, error } = result;
        if (error) throw error;

        const savedClientId = editId || data[0].id;

        // Save temporary vehicles if any
        if (window.tempVehicles && window.tempVehicles.length > 0) {
            console.log(`Saving ${window.tempVehicles.length} vehicles for client ${savedClientId}`);
            
            for (const v of window.tempVehicles) {
                // If it already has a customer_id, it might be an existing vehicle being displayed
                // We only want to save NEW vehicles (those without customer_id or those in tempVehicles)
                // Actually, tempVehicles should only contain new ones, but let's be safe.
                
                const { id, created_at, workshop_id, customer_id, ...cleanVehicle } = v;
                
                const vehicleToSave = {
                    ...cleanVehicle,
                    customer_id: savedClientId,
                    workshop_id: user.id
                };
                
                const { data: vData, error: vError } = await AutoFlow.DB.insert('vehicles', vehicleToSave);
                if (vError) {
                    console.error('Error saving vehicle:', vError);
                    throw new Error('Erro ao salvar veículo: ' + vError.message);
                }
                console.log('Vehicle saved successfully:', vData);
            }
            // Clear temp vehicles
            window.tempVehicles = [];
        }

        alert(editId ? 'Cliente atualizado com sucesso!' : 'Cliente e veículos cadastrados com sucesso!');
        window.location.href = 'lista-clientes.html';
    } catch (err) {
        console.error('Error saving client:', err);
        alert('Erro ao salvar cliente: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = editId ? 'Atualizar Cliente' : 'Salvar Cliente';
    }
}

// Global exposure for buttons in table
window.viewClientDetail = (id) => {
    window.location.href = `perfil-cliente.html?id=${id}`;
};

window.editClient = (id) => {
    window.location.href = `cadastro-cliente.html?id=${id}`;
};
