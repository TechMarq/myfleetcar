/**
 * Auth Logic for MyFleetCar SaaS
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
                const { data, error } = await MyFleetCar.Auth.signUp(email, password, {
                    workshop_name: workshopName,
                    owner_name: ownerName,
                    phone: phone
                });

                if (error) throw error;

                // Create/Update profile record explicitly to ensure data is there for Admin
                if (data.user) {
                    await MyFleetCar.DB.update('profiles', {
                        workshop_name: workshopName,
                        owner_name: ownerName,
                        phone: phone,
                        email: email,
                        status: 'trial' // Define explicitamente o plano de teste ao criar a conta
                    }, { id: data.user.id });
                }

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
                const { data, error } = await MyFleetCar.Auth.signIn(email, password);

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
            await MyFleetCar.Auth.signOut();
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

    // 5. Handle Password Recovery Mode Toggle
    const btnEmailMode = document.getElementById('btn-email-mode');
    const btnPhoneMode = document.getElementById('btn-phone-mode');
    const recoveryModeInput = document.getElementById('recovery-mode');
    const emailGroup = document.getElementById('email-group');
    const phoneGroup = document.getElementById('phone-group');
    const otpGroup = document.getElementById('otp-group');
    const submitBtn = document.getElementById('submit-recovery');
    const btnText = document.getElementById('btn-text');

    if (btnEmailMode && btnPhoneMode) {
        btnEmailMode.addEventListener('click', () => {
            recoveryModeInput.value = 'email';
            btnEmailMode.classList.add('bg-white', 'shadow-sm', 'text-primary');
            btnEmailMode.classList.remove('text-secondary');
            btnPhoneMode.classList.remove('bg-white', 'shadow-sm', 'text-primary');
            btnPhoneMode.classList.add('text-secondary');
            emailGroup.classList.remove('hidden');
            phoneGroup.classList.add('hidden');
            otpGroup.classList.add('hidden');
            btnText.textContent = 'Enviar link de recuperação';
        });

        btnPhoneMode.addEventListener('click', () => {
            recoveryModeInput.value = 'phone';
            btnPhoneMode.classList.add('bg-white', 'shadow-sm', 'text-primary');
            btnPhoneMode.classList.remove('text-secondary');
            btnEmailMode.classList.remove('bg-white', 'shadow-sm', 'text-primary');
            btnEmailMode.classList.add('text-secondary');
            phoneGroup.classList.remove('hidden');
            emailGroup.classList.add('hidden');
            otpGroup.classList.add('hidden');
            btnText.textContent = 'Enviar código SMS';
        });
    }

    // 6. Handle Recovery Submission
    const recoveryForm = document.getElementById('recovery-form');
    if (recoveryForm) {
        recoveryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mode = (recoveryModeInput ? recoveryModeInput.value : 'email');
            const originalBtnText = btnText ? btnText.textContent : 'Enviar';
            
            if (submitBtn) submitBtn.disabled = true;
            if (btnText) btnText.textContent = 'Processando...';

            try {
                if (mode === 'email') {
                    const emailInput = document.getElementById('email');
                    if (!emailInput) return;
                    const { error } = await MyFleetCar.Auth.resetPassword(emailInput.value);
                    if (error) throw error;
                    alert('Link de recuperação enviado para o seu e-mail!');
                } else if (mode === 'phone') {
                    // Script still exists but mode is hidden in HTML
                    const countryCodeEl = document.getElementById('country-code');
                    const phoneInput = document.getElementById('phone');
                    if (!countryCodeEl || !phoneInput) return;

                    const countryCode = countryCodeEl.value;
                    const localPhone = phoneInput.value.replace(/\D/g, '');
                    const fullPhone = countryCode + localPhone;
                    
                    if (!localPhone) {
                        alert('Por favor, insira o número do celular!');
                        if (submitBtn) submitBtn.disabled = false;
                        if (btnText) btnText.textContent = originalBtnText;
                        return;
                    }

                    if (otpGroup && otpGroup.classList.contains('hidden')) {
                        const { error } = await MyFleetCar.Auth.signInWithOtp(fullPhone);
                        if (error) throw error;
                        otpGroup.classList.remove('hidden');
                        if (btnText) btnText.textContent = 'Verificar Código e Entrar';
                        alert('Código enviado para o seu celular!');
                    } else if (otpGroup) {
                        const otpInput = document.getElementById('otp');
                        if (!otpInput) return;
                        const otp = otpInput.value;
                        const { error } = await MyFleetCar.supabase.auth.verifyOtp({
                            phone: fullPhone,
                            token: otp,
                            type: 'sms'
                        });
                        
                        if (error) throw error;
                        alert('Autenticado com sucesso! Redirecionando...');
                        window.location.href = 'nova-senha.html';
                    }
                }
            } catch (err) {
                console.error(err);
                alert('Erro: ' + err.message);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
                if (btnText) btnText.textContent = originalBtnText;
            }
        });
    }
});
