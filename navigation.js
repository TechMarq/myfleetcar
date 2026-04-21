// Common navigation and UI logic for AutoFlow SaaS
// Apply fixes immediately to avoid flickering or missed DOMContentLoaded
if (typeof applyGlobalResponsiveFixes === 'function') {
    applyGlobalResponsiveFixes();
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Protect the route immediately
    if (window.AutoFlow && window.AutoFlow.checkAuth) {
        await window.AutoFlow.checkAuth();
    }

    setupSidebar();
    updateUserProfile();
});

function setupSidebar() {
    const sidebarLinks = document.querySelectorAll('aside nav a');
    const currentPath = window.location.pathname;

    sidebarLinks.forEach(link => {
        const href = link.getAttribute('href');
        
        const isDeactivated = href && (href.includes('agendamento') || href.includes('estoque'));
        
        if (isDeactivated) {
            link.classList.add('opacity-40', 'grayscale', 'cursor-not-allowed', 'pointer-events-none', 'select-none');
            link.title = "Módulo Em Breve";
            link.removeAttribute('href');
            link.onclick = (e) => { e.preventDefault(); return false; };
            // Clean up original hover effects if possible or just rely on pointer-events-none
            link.classList.remove('hover:text-orange-50', 'active:scale-95');
            return; // Don't apply active state to deactivated links
        }
        // Active state logic
        if (href && href !== '#' && currentPath.includes(href)) {
            link.classList.add('text-orange-600', 'dark:text-orange-400', 'border-r-4', 'border-orange-600', 'dark:border-orange-500', 'bg-orange-50/50', 'dark:bg-orange-950/10', 'font-semibold');
        }
    });
}

/**
 * Updates the sidebar/header user profile info if logged in
 */
async function updateUserProfile() {
    if (!window.AutoFlow || !window.AutoFlow.Auth) return;
    
    const { data: { user } } = await window.AutoFlow.Auth.getUser();
    if (user) {
        // Update user name in sidebar if element exists (ID based on our templates)
        const nameElements = document.querySelectorAll('.user-name-display');
        nameElements.forEach(el => {
            el.textContent = user.user_metadata.owner_name || user.email;
        });

        const workshopElements = document.querySelectorAll('.workshop-name-display');
        workshopElements.forEach(el => {
            el.textContent = user.user_metadata.workshop_name || 'Minha Oficina';
        });
        // 3. Handle Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (window.AutoFlow && window.AutoFlow.Auth) {
                    await window.AutoFlow.Auth.signOut();
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
                background: rgba(15, 23, 42, 0.9);
                border-top-color: rgba(255,255,255,0.05);
            }
            
            .bottom-bar-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #64748b;
                font-size: 0.65rem;
                font-weight: 600;
                padding: 0.5rem;
                gap: 0.25rem;
                transition: all 0.2s;
                text-decoration: none;
                width: 20%;
            }
            
            .dark .bottom-bar-item {
                color: #94a3b8;
            }
            
            .bottom-bar-item.active {
                color: #ea580c;
            }
            
            .bottom-bar-item .material-symbols-outlined {
                font-size: 1.5rem;
            }

            .bottom-bar-item.fab-button {
                transform: translateY(-1rem);
            }
            
            .bottom-bar-item.fab-button .fab-circle {
                background: linear-gradient(135deg, #ea580c, #f97316);
                border-radius: 50%;
                width: 3.5rem;
                height: 3.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3);
            }
        }
        
        @media (max-width: 768px) {
            /* Fix tables escaping viewport */
            .overflow-x-auto {
                max-width: 100vw !important;
                margin-left: -2rem;
                margin-right: -2rem;
                padding-left: 2rem;
                padding-right: 2rem;
                border-radius: 0 !important;
            }
            
            /* Prevent iOS Zoom */
            input, select, textarea {
                font-size: 16px !important; 
            }
            
            /* Clean up header spaces */
            .space-y-8 > :not([hidden]) ~ :not([hidden]) {
                margin-top: 1.5rem !important;
            }
            .p-8 { padding: 1.5rem !important; }
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

    // 4. Inject Bottom App Bar
    if (window.innerWidth <= 1024 && !document.querySelector('.bottom-app-bar')) {
        const bottomBar = document.createElement('nav');
        bottomBar.className = 'bottom-app-bar lg:hidden';
        
        const currentPath = window.location.pathname;
        const isActive = (path) => currentPath.includes(path) ? 'active' : '';

        bottomBar.innerHTML = `
            <a href="home.html" class="bottom-bar-item ${isActive('home.html')}">
                <span class="material-symbols-outlined">home</span>
                <span>Início</span>
            </a>
            <a href="lista-ordem.html" class="bottom-bar-item ${isActive('lista-ordem')}">
                <span class="material-symbols-outlined">build</span>
                <span>Ordens</span>
            </a>
            <a href="nova-ordem.html" class="bottom-bar-item fab-button">
                <div class="fab-circle">
                    <span class="material-symbols-outlined pb">add</span>
                </div>
            </a>
            <a href="lista-clientes.html" class="bottom-bar-item ${isActive('lista-clientes')}">
                <span class="material-symbols-outlined">group</span>
                <span>Clientes</span>
            </a>
            <button id="mobile-menu-btn" class="bottom-bar-item">
                <span class="material-symbols-outlined">apps</span>
                <span>Módulos</span>
            </button>
        `;
        
        document.body.appendChild(bottomBar);

        // Bind Menu Button
        document.getElementById('mobile-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });
    }
}

