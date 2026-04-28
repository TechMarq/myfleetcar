// Supabase configuration and client initialization
const SUPABASE_URL = 'https://mgmqkehkznxwpzodrhcy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nbXFrZWhrem54d3B6b2RyaGN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDAyMjIsImV4cCI6MjA5MTg3NjIyMn0.akhF3DhPLzP9R4nRGGjF5f0aMNPh-9UHSdBAQj6DqZU';

// This is a placeholder for the Supabase client. 
// In a real application, you would include the Supabase CDN script in your HTML:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error('Supabase library not found. Make sure the CDN script is included before this config file.');
}


/**
 * Authentication Module
 */
const Auth = {
    async signUp(email, password, metadata = {}) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: metadata
            }
        });
        return { data, error };
    },

    async signIn(email, password) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
        });
        return { data, error };
    },

    async resetPassword(email) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/nova-senha.html',
        });
        return { data, error };
    },

    async signInWithOtp(phone) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        const { data, error } = await supabaseClient.auth.signInWithOtp({
            phone: phone,
        });
        return { data, error };
    },

    async signOut() {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        const { error } = await supabaseClient.auth.signOut();
        if (!error) {
            window.location.href = 'login.html';
        }
        return { error };
    },

    async getSession() {
        if (!supabaseClient) return { data: { session: null }, error: null };
        return await supabaseClient.auth.getSession();
    },

    async getUser() {
        if (!supabaseClient) return { data: { user: null }, error: null };
        return await supabaseClient.auth.getUser();
    }
};

/**
 * Database Module (Generic CRUD)
 */
const DB = {
    async insert(table, content) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        return await supabaseClient.from(table).insert([content]).select();
    },

    async select(table, query = {}) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        let request = supabaseClient.from(table).select(query.select || '*');

        if (query.match) request = request.match(query.match);
        if (query.ilike) {
            for (const [col, val] of Object.entries(query.ilike)) {
                request = request.ilike(col, val);
            }
        }
        if (query.or) {
            request = request.or(query.or);
        }
        if (query.gte) {
            for (const [col, val] of Object.entries(query.gte)) {
                request = request.gte(col, val);
            }
        }
        if (query.lte) {
            for (const [col, val] of Object.entries(query.lte)) {
                request = request.lte(col, val);
            }
        }
        if (query.gt) {
            for (const [col, val] of Object.entries(query.gt)) {
                request = request.gt(col, val);
            }
        }
        if (query.lt) {
            for (const [col, val] of Object.entries(query.lt)) {
                request = request.lt(col, val);
            }
        }
        if (query.in) {
            for (const [col, val] of Object.entries(query.in)) {
                request = request.in(col, val);
            }
        }
        if (query.order) request = request.order(query.order.column, { ascending: query.order.ascending });
        if (query.limit) request = request.limit(query.limit);

        return await request;
    },

    async update(table, content, match) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        return await supabaseClient.from(table).update(content).match(match).select();
    },

    async delete(table, match) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        return await supabaseClient.from(table).delete().match(match);
    }
};

/**
 * Storage Module
 */
const Storage = {
    async uploadFile(bucket, path, file) {
        if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
        return await supabaseClient.storage.from(bucket).upload(path, file, {
            upsert: true
        });
    },

    getPublicUrl(bucket, path) {
        if (!supabaseClient) return null;
        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        return data?.publicUrl;
    }
};

// Protect routes
async function checkAuth() {
    const { data: { session } } = await Auth.getSession();
    const path = window.location.pathname;
    
    const isLoginPage = path.includes('login.html') || 
                       path.includes('registro-conta-login.html') || 
                       path.includes('index.html');
    
    const isPublicPage = isLoginPage || 
                        path.includes('master-admin') || 
                        path.includes('suspensao.html');

    if (!session) {
        if (!isPublicPage) window.location.href = 'login.html';
    } else {
        // Logged in: Check for suspension or Trial Expiration
        try {
            const workshopId = session.user.user_metadata?.workshop_id || session.user.id;
            const { data: profile } = await DB.select('profiles', { match: { id: workshopId } });
            
            if (profile && profile.length > 0) {
                const p = profile[0];
                const status = p.status || 'trial'; // Default to trial
                const createdAt = new Date(p.created_at);
                const now = new Date();
                
                // Calculate Trial
                const diffTime = Math.abs(now - createdAt);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const trialExpired = diffDays > 7;

                // BLOCK LOGIC:
                // 1. Explicitly suspended
                // 2. Status is still 'trial' but more than 7 days have passed
                // 3. 'active' and 'free' are NOT blocked
                if (status === 'suspended' || (status === 'trial' && trialExpired)) {
                    if (!path.includes('suspensao.html')) {
                        window.location.href = 'suspensao.html' + (trialExpired ? '?reason=trial' : '');
                    }
                    return;
                }
            }
        } catch (e) {
            console.error('Auth verification error:', e);
        }

        if (isLoginPage && !path.includes('index.html')) {
            window.location.href = 'home.html';
        }
    }
}

// Global state for temporary objects
window.tempVehicles = [];

// Global exposure
window.MyFleetCar = {
    Auth,
    DB,
    Storage,
    checkAuth,
    supabase: supabaseClient
};
