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

// Protect routes
async function checkAuth() {
    const { data: { session } } = await Auth.getSession();
    const isLoginPage = window.location.pathname.includes('login.html') ||
        window.location.pathname.includes('registro-conta-login.html') ||
        window.location.pathname.includes('index.html');

    if (!session && !isLoginPage) {
        window.location.href = 'login.html';
    } else if (session && isLoginPage) {
        // If already logged in and trying to access login/register/landing, go to home
        if (!window.location.pathname.includes('index.html')) {
            window.location.href = 'home.html';
        }
    }
}

// Global state for temporary objects
window.tempVehicles = [];

// Global exposure
window.AutoFlow = {
    Auth,
    DB,
    checkAuth,
    supabase: supabaseClient
};
