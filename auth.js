/**
 * Auth Logic for AutoFlow SaaS
 * Handles Login and Registration forms
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Handle Registration
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const workshopName = document.getElementById('workshop-name').value;
            const ownerName = document.getElementById('owner-name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (password !== confirmPassword) {
                alert('As senhas não coincidem!');
                return;
            }

            const btn = registerForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = 'Criando conta...';

            try {
                const { data, error } = await AutoFlow.Auth.signUp(email, password, {
                    workshop_name: workshopName,
                    owner_name: ownerName,
                    phone: phone
                });

                if (error) throw error;

                alert('Conta criada com sucesso! Verifique seu e-mail para confirmar o cadastro.');
                window.location.href = 'login.html';
            } catch (err) {
                console.error(err);
                alert('Erro ao criar conta: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // 2. Handle Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            const btn = loginForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = 'Entrando...';

            try {
                const { data, error } = await AutoFlow.Auth.signIn(email, password);

                if (error) throw error;

                // Sign in successful
                window.location.href = 'home.html';
            } catch (err) {
                console.error(err);
                alert('Erro ao entrar: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // 3. Handle Logout (if there's a logout button with ID logout-btn)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await AutoFlow.Auth.signOut();
        });
    }
    // 4. Handle Password Visibility Toggle
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const passwordInput = document.getElementById('password');
            const toggleIcon = document.getElementById('toggle-password-icon');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                if (toggleIcon) toggleIcon.textContent = 'visibility_off';
            } else {
                passwordInput.type = 'password';
                if (toggleIcon) toggleIcon.textContent = 'visibility';
            }
        });
    }
});
