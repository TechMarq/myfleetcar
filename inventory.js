/**
 * Inventory Management Logic for AutoFlow SaaS
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Fetch Inventory if on the list page
    if (document.getElementById('inventory-list')) {
        loadInventory();
    }

    // 2. Handle New Product Form if on the registration page
    const productForm = document.getElementById('product-form');
    if (productForm) {
        productForm.addEventListener('submit', handleNewProduct);
    }
});

/**
 * Loads and displays the inventory list
 */
async function loadInventory() {
    const listContainer = document.getElementById('inventory-list');
    if (!listContainer) return;

    try {
        const { data: items, error } = await AutoFlow.DB.select('inventory', {
            order: { column: 'created_at', ascending: false }
        });

        if (error) throw error;

        if (!items || items.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400">Nenhum produto cadastrado no estoque.</td></tr>';
            return;
        }

        listContainer.innerHTML = items.map(item => {
            const lowStock = item.quantity <= (item.min_quantity || 0);
            return `
                <tr class="hover:bg-slate-50/50 transition-colors group">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center overflow-hidden border border-outline-variant/5">
                                <span class="material-symbols-outlined text-slate-400">box_edit</span>
                            </div>
                            <div>
                                <h4 class="text-sm font-bold text-slate-900 tracking-tight">${item.name}</h4>
                                <p class="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-0.5">${item.sku || 'S/ SKU'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-100 uppercase tracking-widest">
                            ${item.category || 'Geral'}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-slate-900">${item.quantity} unidades</span>
                            ${lowStock ? 
                                `<div class="flex items-center gap-1.5 mt-0.5">
                                    <div class="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></div>
                                    <span class="text-[10px] text-error font-bold uppercase">Estoque Baixo</span>
                                </div>` : 
                                `<span class="text-[10px] text-emerald-600 font-semibold mt-0.5">Em estoque</span>`
                            }
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex flex-col">
                            <span class="text-sm font-bold text-slate-900">R$ ${item.sale_price ? item.sale_price.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '0,00'}</span>
                            <span class="text-[10px] text-slate-400">Preço de Venda</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button class="p-2 text-slate-300 hover:text-primary transition-all active:scale-90">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading inventory:', err);
        listContainer.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-red-500">Erro ao carregar estoque: ${err.message}</td></tr>`;
    }
}

/**
 * Handles creation of a new product
 */
async function handleNewProduct(e) {
    e.preventDefault();
    
    const form = e.target;
    const { data: { user } } = await AutoFlow.Auth.getUser();
    if (!user) {
        alert('Sessão expirada. Faça login novamente.');
        window.location.href = 'login.html';
        return;
    }

    const productData = {
        workshop_id: user.id,
        name: document.getElementById('prod-name').value,
        sku: document.getElementById('prod-sku').value,
        quantity: parseInt(document.getElementById('prod-qty').value) || 0,
        min_quantity: parseInt(document.getElementById('prod-min-qty').value) || 1,
        purchase_price: parseFloat(document.getElementById('prod-buy-price').value.replace(',', '.')) || 0,
        sale_price: parseFloat(document.getElementById('prod-sell-price').value.replace(',', '.')) || 0,
        category: document.getElementById('prod-category').value
    };

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const { data, error } = await AutoFlow.DB.insert('inventory', productData);
        if (error) throw error;

        alert('Produto cadastrado com sucesso!');
        window.location.href = 'lista-estoque.html';
    } catch (err) {
        console.error('Error saving product:', err);
        alert('Erro ao salvar produto: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Produto';
    }
}
