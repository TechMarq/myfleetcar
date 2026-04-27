/**
 * Settings Management Logic for MyFleetCar SaaS
 * Handles Workshop Profile and Preferences
 */

document.addEventListener('DOMContentLoaded', () => {
    loadWorkshopProfile();

    const settingsForm = document.getElementById('workshop-settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSaveSettings);
    }

    // Logo Upload Logic
    const logoUpload = document.getElementById('logo-upload');
    const changeLogoBtn = document.getElementById('change-logo-btn');
    const logoContainer = document.getElementById('logo-container');

    if (changeLogoBtn && logoUpload) {
        changeLogoBtn.onclick = () => logoUpload.click();
        if (logoContainer) logoContainer.onclick = () => logoUpload.click();
        logoUpload.onchange = handleLogoUpload;
    }
});

/**
 * Loads the workshop profile from the database
 */
async function loadWorkshopProfile() {
    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        if (!user) return;

        const { data: profile, error } = await MyFleetCar.DB.select('profiles', {
            match: { id: user.id }
        });

        if (error) throw error;

        if (profile && profile.length > 0) {
            const p = profile[0];
            
            // Map table values to form fields
            const fields = {
                'workshop-name': p.workshop_name || user.user_metadata.workshop_name || '',
                'owner-name': p.owner_name || user.user_metadata.full_name || '',
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

            // Update Logo Preview
            if (p.logo_url) {
                updateLogoUI(p.logo_url);
            }

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

    const { data: { user } } = await MyFleetCar.Auth.getUser();
    if (!user) return;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Salvando...';

    const profileData = {
        workshop_name: document.getElementById('workshop-name').value,
        owner_name: document.getElementById('owner-name').value,
        cnpj: document.getElementById('workshop-cnpj').value,
        phone: document.getElementById('workshop-phone').value,
        address: document.getElementById('workshop-address').value
    };

    try {
        const { error } = await MyFleetCar.DB.update('profiles', profileData, { id: user.id });
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
    const fields = ['workshop_name', 'owner_name', 'cnpj', 'phone', 'address'];
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

/**
 * Handles the logo file upload to Supabase Storage
 */
async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('O arquivo é muito grande. Máximo 5MB.');
        return;
    }

    try {
        const { data: { user } } = await MyFleetCar.Auth.getUser();
        if (!user) return;

        // Show loading state
        const placeholder = document.getElementById('logo-placeholder');
        if (placeholder) {
            placeholder.textContent = 'sync';
            placeholder.classList.add('animate-spin');
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/logo_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `workshop_logos/${fileName}`;

        // 1. Upload to Storage
        const { error: uploadError } = await MyFleetCar.Storage.uploadFile('assets', filePath, file);
        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const publicUrl = MyFleetCar.Storage.getPublicUrl('assets', filePath);
        
        // 3. Update Profile in DB
        const { error: updateError } = await MyFleetCar.DB.update('profiles', { logo_url: publicUrl }, { id: user.id });
        if (updateError) throw updateError;

        // 4. Update UI
        updateLogoUI(publicUrl);
        alert('Logo atualizada com sucesso!');
        
    } catch (err) {
        console.error('Error uploading logo:', err);
        alert('Erro ao enviar imagem: ' + err.message);
    } finally {
        const placeholder = document.getElementById('logo-placeholder');
        if (placeholder) {
            placeholder.textContent = 'add_a_photo';
            placeholder.classList.remove('animate-spin');
        }
    }
}

function updateLogoUI(url) {
    const preview = document.getElementById('logo-preview');
    const placeholder = document.getElementById('logo-placeholder');
    if (preview && url) {
        preview.src = url;
        preview.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
    }
}
