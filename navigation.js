// Common navigation and UI logic for MyFleetCar SaaS

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Protect the route immediately
    if (window.MyFleetCar && window.MyFleetCar.checkAuth) {
        await window.MyFleetCar.checkAuth();
    }

    // Initialize UI components
    setupSidebar();
    updateUserProfile();
    
    // Apply mobile responsiveness fixes
    applyGlobalResponsiveFixes();
});

function setupSidebar() {
    const sidebarLinks = document.querySelectorAll('aside nav a');
    const currentPath = window.location.pathname;

    sidebarLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        const isDeactivated = href.includes('agendamento');
        
        if (isDeactivated) {
            link.classList.add('opacity-40', 'grayscale', 'cursor-not-allowed', 'pointer-events-none', 'select-none');
            link.title = "Módulo Em Breve";
            link.removeAttribute('href');
            link.onclick = (e) => { e.preventDefault(); return false; };
            link.classList.remove('hover:text-orange-50', 'active:scale-95');
            return;
        }

        // Active state logic - better matching
        const page = currentPath.split('/').pop() || 'home.html';
        if (href === page || (page === '' && href === 'home.html')) {
            link.classList.add('text-orange-600', 'dark:text-orange-400', 'border-r-4', 'border-orange-600', 'dark:border-orange-500', 'bg-orange-50/50', 'dark:bg-orange-950/10', 'font-bold');
            link.classList.remove('text-slate-600', 'dark:text-slate-400');
        }
    });
}

/**
 * Updates the sidebar/header user profile info if logged in
 */
async function updateUserProfile() {
    if (!window.MyFleetCar || !window.MyFleetCar.Auth) return;
    
    const { data: { user } } = await window.MyFleetCar.Auth.getUser();
    if (!user) return;

    // Determine the workshop ID to fetch branding
    // Master user: id is their own. Sub-user: id should be in metadata.
    const workshopId = user.user_metadata?.workshop_id || user.id;

    // Fetch workshop profile for branding (Logo and Workshop Name)
    const { data: profile } = await window.MyFleetCar.DB.select('profiles', {
        match: { id: workshopId }
    });
    const p = (profile && profile.length > 0) ? profile[0] : null;

    if (user) {
        // 1. Update User Name
        // Logic: Show owner_name if master, or specific name if available in metadata
        const nameElements = document.querySelectorAll('.user-name-display');
        nameElements.forEach(el => {
            const displayName = user.user_metadata?.full_name || user.user_metadata?.owner_name || p?.owner_name || user.email;
            el.textContent = displayName;
        });

        // 2. Update Workshop Name (Secondary text in sidebar)
        // Find specifically the sidebar subtext (fix for config page)
        const sidebarSubText = document.querySelector('aside .p-4.rounded-xl p.text-slate-500, aside .p-4.rounded-xl p.text-\\[10px\\]');
        if (sidebarSubText) {
            sidebarSubText.textContent = p?.workshop_name || user.user_metadata?.workshop_name || 'Minha Oficina';
        }

        // 2.1 Update Account Status Display
        const statusElements = document.querySelectorAll('.account-status-display');
        const status = p?.status || 'trial';
        
        let remainingDays = 7;
        if (p?.created_at) {
            const createdAt = new Date(p.created_at);
            const now = new Date();
            const diffDays = Math.ceil(Math.abs(now - createdAt) / (1000 * 60 * 60 * 24));
            remainingDays = Math.max(0, 7 - diffDays);
        }

        let statusLabel = 'Plano de Teste';
        let statusClass = 'text-blue-500';

        if (status === 'active') {
            statusLabel = 'Plano Ativo';
            statusClass = 'text-green-500';
        } else if (status === 'free') {
            statusLabel = 'Plano Gratuito';
            statusClass = 'text-emerald-500';
        } else if (status === 'suspended') {
            statusLabel = 'Conta Suspensa';
            statusClass = 'text-red-500';
        } else if (status === 'trial') {
            statusLabel = remainingDays > 0 ? `Teste (${remainingDays} dias)` : 'Teste Expirado';
        }

        // Try to find the generic "Workshop Owner" text and replace it, or update specific elements
        const ownerText = document.querySelector('aside .p-4.rounded-xl div p:last-child');
        if (ownerText && !ownerText.classList.contains('workshop-name-display')) {
            ownerText.textContent = statusLabel;
            ownerText.className = `text-[10px] font-black uppercase tracking-widest ${statusClass}`;
        }

        statusElements.forEach(el => {
            el.textContent = statusLabel;
            el.className = `account-status-display text-[10px] font-black uppercase tracking-widest ${statusClass}`;
        });

        // Update other elements with the class (except headers that might use it differently)
        const workshopElements = document.querySelectorAll('.workshop-name-display');
        workshopElements.forEach(el => {
            if (el.tagName !== 'H2' || el.closest('header') === null) {
                el.textContent = p?.workshop_name || user.user_metadata?.workshop_name || 'Minha Oficina';
            }
        });

        // 3. Update Profile Image (Workshop Logo)
        // Targeted selector for the sidebar avatar only
        const avatarImages = document.querySelectorAll('aside .p-4.rounded-xl img.rounded-full');
        avatarImages.forEach(img => {
            if (p && p.logo_url) {
                img.src = p.logo_url;
            } else {
                img.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p?.workshop_name || 'MO') + '&background=ff6b00&color=fff';
            }
            // Remove hardcoded data-alt or alt to avoid confusion
            img.removeAttribute('data-alt');
        });

        // 4. Handle Trial Banner
        if (p && (status === 'trial')) {
            const remaining = remainingDays;

            if (remaining >= 0) {
                const aside = document.querySelector('aside');
                if (aside && !document.getElementById('trial-banner')) {
                    const banner = document.createElement('div');
                    banner.id = 'trial-banner';
                    banner.className = 'mx-4 mb-4 p-4 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-900/20';
                    banner.innerHTML = `
                        <p class="text-[9px] font-black uppercase tracking-widest opacity-80 mb-1">Período de Teste</p>
                        <h4 class="text-xs font-black">${remaining > 0 ? `${remaining} dias restantes` : 'Último dia de teste!'}</h4>
                        <p class="text-[9px] mt-2 leading-tight opacity-70">Aproveite todos os recursos. Após o teste, entre em contato para ativar.</p>
                    `;
                    // Insert before the logout button or at the bottom of navigation
                    const nav = aside.querySelector('nav');
                    if (nav) nav.after(banner);
                }
            }
        }

        // 5. Handle Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (window.MyFleetCar && window.MyFleetCar.Auth) {
                    await window.MyFleetCar.Auth.signOut();
                }
            });
        }
    }
}

/**
 * Universal Mobile Responsiveness & App-Like Experience Injector
 */
function applyGlobalResponsiveFixes() {
    // 1. Inject Global Mobile CSS (Removed destructive font-size overrides)
    const style = document.createElement('style');
    style.textContent = `
        @media (max-width: 1024px) {
            /* Mobile Sidebar / Drawer */
            aside {
                transform: translateY(100%) !important;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 100 !important;
                box-shadow: 0 -10px 25px rgba(0,0,0,0.1) !important;
                width: 100% !important;
                height: 80vh !important;
                top: auto !important;
                bottom: 0 !important;
                border-radius: 24px 24px 0 0 !important;
                flex-direction: column !important;
            }
            aside.mobile-open {
                transform: translateY(0) !important;
            }
            
            /* Expand Main to fit bottom bar */
            main.ml-64, main {
                margin-left: 0 !important;
                width: 100% !important;
                max-width: 100vw !important;
                padding-bottom: 5rem !important; /* space for bottom nav */
            }
            
            /* Adjust top header */
            header {
                width: 100% !important;
                left: 0 !important;
                z-index: 40 !important;
                height: auto !important;
            }

            header .h-16 {
                height: 3.5rem !important;
                padding-left: 1rem !important;
                padding-right: 1rem !important;
            }

            header h1 {
                font-size: 0.75rem !important;
            }

            header nav {
                padding-left: 1rem !important;
                padding-right: 1rem !important;
            }
            
            .mobile-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.6);
                z-index: 90;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease;
                backdrop-filter: blur(4px);
            }
            .mobile-overlay.active {
                opacity: 1;
                pointer-events: auto;
            }
            
            /* Bottom App Bar */
            .bottom-app-bar {
                position: fixed;
                bottom: 0;
                left: 0;
                width: 100%;
                background: rgba(255, 255, 255, 0.9);
                backdrop-filter: blur(10px);
                border-top: 1px solid rgba(0,0,0,0.05);
                display: flex;
                justify-content: space-around;
                align-items: center;
                padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom)) 0.5rem;
                z-index: 80;
                box-shadow: 0 -4px 10px rgba(0,0,0,0.03);
            }
            
            .dark .bottom-app-bar {
                background: rgba(15, 23, 42, 0.95);
                border-top-color: rgba(255,255,255,0.08);
            }
            
            .bottom-bar-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #94a3b8;
                font-size: 0.6rem;
                font-weight: 700;
                padding: 0.4rem 0;
                gap: 0.15rem;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                text-decoration: none;
                width: 20%;
                border-radius: 12px;
            }
            
            .dark .bottom-bar-item {
                color: #64748b;
            }
            
            .bottom-bar-item.active {
                color: #ea580c;
                background: rgba(234, 88, 12, 0.05);
            }

            .dark .bottom-bar-item.active {
                background: rgba(234, 88, 12, 0.1);
            }
            
            .bottom-bar-item .material-symbols-outlined {
                font-size: 1.35rem;
                font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            }

            .bottom-bar-item.active .material-symbols-outlined {
                font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            }

            /* Floating Action Button (FAB) */
            .fab-center {
                position: relative;
                top: -1.5rem;
                z-index: 90;
            }
            
            .fab-button-main {
                width: 3.5rem;
                height: 3.5rem;
                background: linear-gradient(135deg, #f97316, #ea580c);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                box-shadow: 0 8px 20px rgba(234, 88, 12, 0.4);
                border: 4px solid #fff;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .dark .fab-button-main {
                border-color: #0f172a;
            }
            
            .fab-button-main.active {
                transform: rotate(45deg);
                background: #64748b;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            }

            /* Quick Action Menu */
            .quick-actions-menu {
                position: fixed;
                bottom: 5.5rem;
                left: 50%;
                transform: translateX(-50%) scale(0.9);
                width: calc(100% - 2rem);
                max-width: 300px;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border-radius: 1.5rem;
                padding: 1rem;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                z-index: 100;
                display: none;
                flex-direction: column;
                gap: 0.5rem;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .dark .quick-actions-menu {
                background: rgba(30, 41, 59, 0.95);
                box-shadow: 0 10px 25px rgba(0,0,0,0.4);
            }
            
            .quick-actions-menu.active {
                display: flex;
                opacity: 1;
                transform: translateX(-50%) scale(1);
            }
            
            .action-item {
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 0.85rem 1rem;
                border-radius: 1rem;
                color: #475569;
                font-weight: 700;
                font-size: 0.85rem;
                transition: all 0.2s;
                text-decoration: none;
            }
            
            .dark .action-item {
                color: #cbd5e1;
            }
            
            .action-item:active {
                background: rgba(234, 88, 12, 0.1);
                color: #ea580c;
            }
            
            .action-item .material-symbols-outlined {
                font-size: 1.25rem;
                color: #ea580c;
            }
        }
        
        @media (max-width: 768px) {
            /* Fix tables escaping viewport and transform into cards */
            table {
                border: none !important;
                background: transparent !important;
            }
            thead {
                display: none;
            }
            tbody {
                display: block;
                width: 100%;
            }
            tr {
                display: block;
                margin-bottom: 1.5rem;
                background: white;
                border-radius: 1.25rem;
                padding: 0.75rem;
                box-shadow: 0 4px 12px rgba(0,0,0,0.03);
                border: 1px solid #f1f5f9 !important;
                overflow: hidden;
            }
            .dark tr {
                background: #1e293b;
                border-color: #334155 !important;
            }
            td {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                border: none !important;
                padding: 0.6rem 0.5rem !important;
                width: 100% !important;
                text-align: right !important;
                min-height: 2.5rem;
            }
            td:not(:last-child) {
                border-bottom: 1px solid #f8fafc !important;
            }
            .dark td:not(:last-child) {
                border-bottom-color: #334155 !important;
            }
            td:before {
                content: attr(data-label);
                font-size: 0.6rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #94a3b8;
                text-align: left;
                margin-right: 1rem;
            }
            
            /* Clean up spaces */
            main {
                padding-top: 5rem !important;
                padding-bottom: 6rem !important;
                padding-left: 1rem !important;
                padding-right: 1rem !important;
                margin-left: 0 !important;
            }

            /* Responsive Grid */
            .grid {
                gap: 1rem !important;
            }
        }
    `;
    document.head.appendChild(style);

    const aside = document.querySelector('aside');
    if (!aside) return;

    // Remove old header hamburger if it was added manually in the past
    // The bottom bar replaces it.
    
    // 2. Setup Background Overlay
    let overlay = document.querySelector('.mobile-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'mobile-overlay lg:hidden';
        document.body.appendChild(overlay);
    }

    // 3. Toggle Logic
    const toggleMenu = () => {
        const isOpen = aside.classList.contains('mobile-open');
        if (isOpen) {
            aside.classList.remove('mobile-open');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        } else {
            aside.classList.add('mobile-open');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; 
        }
    };

    overlay.addEventListener('click', toggleMenu);
    
    // Close menu if a sidebar link is clicked
    const links = aside.querySelectorAll('nav a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            if(window.innerWidth <= 1024) toggleMenu();
        });
    });

        // 4. Inject Quick Actions Menu
        const actionMenu = document.createElement('div');
        actionMenu.className = 'quick-actions-menu lg:hidden';
        actionMenu.id = 'quick-actions-menu';
        actionMenu.innerHTML = `
            <a href="nova-ordem.html" class="action-item">
                <span class="material-symbols-outlined">description</span>
                Nova Ordem de Serviço
            </a>
            <a href="cadastro-cliente.html" class="action-item">
                <span class="material-symbols-outlined">person_add</span>
                Novo Cliente
            </a>
            <a href="movimentacao-estoque.html" class="action-item">
                <span class="material-symbols-outlined">inventory</span>
                Nova Venda Peça
            </a>
        `;
        document.body.appendChild(actionMenu);

        // 5. Inject Bottom App Bar
        if (window.innerWidth <= 1024 && !document.querySelector('.bottom-app-bar')) {
            const bottomBar = document.createElement('nav');
            bottomBar.className = 'bottom-app-bar lg:hidden';
            
            const currentPath = window.location.pathname;
            const page = currentPath.split('/').pop() || 'home.html';
            const isActive = (path) => page.includes(path) ? 'active' : '';

            bottomBar.innerHTML = `
                <a href="home.html" class="bottom-bar-item ${isActive('home.html')}">
                    <span class="material-symbols-outlined">home</span>
                    <span>Início</span>
                </a>
                <a href="lista-ordem.html" class="bottom-bar-item ${isActive('lista-ordem')}">
                    <span class="material-symbols-outlined">description</span>
                    <span>Ordens</span>
                </a>
                <div class="fab-center">
                    <button id="fab-button" class="fab-button-main">
                        <span class="material-symbols-outlined">add</span>
                    </button>
                </div>
                <a href="lista-estoque.html" class="bottom-bar-item ${isActive('lista-estoque')}">
                    <span class="material-symbols-outlined">inventory_2</span>
                    <span>Estoque</span>
                </a>
                <button id="mobile-menu-btn" class="bottom-bar-item">
                    <span class="material-symbols-outlined">apps</span>
                    <span>Mais</span>
                </button>
            `;
            
            document.body.appendChild(bottomBar);

            // Bind FAB Button
            const fabBtn = document.getElementById('fab-button');
            const quickMenu = document.getElementById('quick-actions-menu');
            
            if (fabBtn && quickMenu) {
                fabBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isOpening = !quickMenu.classList.contains('active');
                    
                    if (isOpening) {
                        quickMenu.style.display = 'flex';
                        setTimeout(() => {
                            quickMenu.classList.add('active');
                            fabBtn.classList.add('active');
                        }, 10);
                    } else {
                        quickMenu.classList.remove('active');
                        fabBtn.classList.remove('active');
                        setTimeout(() => {
                            quickMenu.style.display = 'none';
                        }, 300);
                    }
                });
                
                // Close menu when clicking outside
                document.addEventListener('click', (e) => {
                    if (quickMenu.classList.contains('active') && !quickMenu.contains(e.target) && e.target !== fabBtn) {
                        quickMenu.classList.remove('active');
                        fabBtn.classList.remove('active');
                        setTimeout(() => {
                            quickMenu.style.display = 'none';
                        }, 300);
                    }
                });
            }

        // Bind All Menu Buttons (Header and Bottom Bar)
        const menuButtons = document.querySelectorAll('#mobile-menu-btn');
        menuButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMenu();
            });
        });
    }
}

