/**
 * Settings Management Logic for AutoFlow SaaS
 * Handles Workshop Profile and Preferences
 */

document.addEventListener('DOMContentLoaded', () => {
    loadWorkshopProfile();

    const settingsForm = document.getElementById('workshop-settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSaveSettings);
    }
});

/**
 * Loads the workshop profile from the database
 */
async function loadWorkshopProfile() {
    try {
        const { data: { user } } = await AutoFlow.Auth.getUser();
        if (!user) return;

        const { data: profile, error } = await AutoFlow.DB.select('profiles', {
            match: { id: user.id }
        });

        if (error) throw error;

        if (profile && profile.length > 0) {
            const p = profile[0];
            
            // Map table values to form fields
            const fields = {
                'workshop-name': p.workshop_name || user.user_metadata.workshop_name || '',
                'workshop-cnpj': p.cnpj || '',
                'workshop-phone': p.phone || user.user_metadata.phone || '',
                'workshop-email': user.email || '', // Email usually comes from Auth
                'workshop-address': p.address || ''
            };

            for (const [id, value] of Object.entries(fields)) {
                const el = document.getElementById(id);
                if (el) el.value = value;
            }

            // Update Header/Display if needed
            const displays = document.querySelectorAll('.workshop-name-display');
            displays.forEach(d => d.textContent = p.workshop_name || 'Minha Oficina');

            // Calculate completeness
            updateProfileCompleteness(p);
        }
    } catch (err) {
        console.error('Error loading profile:', err);
    }
}

/**
 * Saves the updated profile back to the database
 */
async function handleSaveSettings(e) {
    e.preventDefault();

    const { data: { user } } = await AutoFlow.Auth.getUser();
    if (!user) return;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Salvando...';

    const profileData = {
        workshop_name: document.getElementById('workshop-name').value,
        cnpj: document.getElementById('workshop-cnpj').value,
        phone: document.getElementById('workshop-phone').value,
        address: document.getElementById('workshop-address').value,
        owner_name: user.user_metadata.owner_name || '' // Preserve owner name if exists
    };

    try {
        const { error } = await AutoFlow.DB.update('profiles', profileData, { id: user.id });
        if (error) throw error;

        alert('Configurações salvas com sucesso!');
        loadWorkshopProfile();
    } catch (err) {
        console.error(err);
        alert('Erro ao salvar: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/**
 * UI visual helper for profile completeness indicator
 */
function updateProfileCompleteness(profile) {
    const fields = ['workshop_name', 'cnpj', 'phone', 'address'];
    let filled = 0;
    fields.forEach(f => {
        if (profile[f] && profile[f].trim() !== '' && profile[f] !== 'Minha Oficina') {
            filled++;
        }
    });

    const percent = Math.round((filled / fields.length) * 100);
    const label = document.querySelector('.profile-completeness-label');
    const bar = document.querySelector('.profile-completeness-bar');

    if (label) label.textContent = percent + '%';
    if (bar) bar.style.width = percent + '%';
}
