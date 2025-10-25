// Frontend/auth.js

import { updateLastLogin, loadDataForUser } from './api.js';
import { handleDataLoad, resetInactivityTimer } from './main.js';
import { renderFullGradebookUI } from './render.js';
import { setCurrentUser, setAppState, getAppState, getCurrentUser } from './state.js';

export function setupAuthListener(supabaseClient, wasLocalDataLoaded) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app-container');
        const loadingOverlay = document.getElementById('loading-overlay');

        if (event === 'SIGNED_OUT' || !session) {
            const currentUser = getCurrentUser();
            if (currentUser) localStorage.removeItem(`marksheetProData-${currentUser.id}`);
            setCurrentUser(null);
            setAppState({});
            authContainer?.classList.remove('hidden');
            appContainer?.classList.add('hidden');
            loadingOverlay?.classList.add('hidden');
            return;
        }

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            setCurrentUser(user);

            if (!wasLocalDataLoaded) loadingOverlay?.classList.remove('hidden');
            
            try {
                if (event === 'SIGNED_IN') updateLastLogin(user.id);
                
                authContainer?.classList.add('hidden');
                appContainer?.classList.remove('hidden');
                resetInactivityTimer();
                
                // ... (inside setupAuthListener)
                
                // loadDataForUser will get the latest data.
                const { data, error } = await loadDataForUser(user.id, getAppState(), wasLocalDataLoaded);
                if (error) throw error;

                // handleDataLoad will now correctly decide what to render:
                // - If data.full_name is missing -> renderAccountPage(true)
                // - If data.full_name exists -> renderFullGradebookUI()
                handleDataLoad(data, true);
// ...
            } catch (e) {
                console.error("AUTH LISTENER FATAL:", e);
                signOut(supabaseClient, true);
            } finally {
                loadingOverlay?.classList.add('hidden');
            }
        }
    });
}

export async function handleAuthSubmit(e, supabaseClient) {
    e.preventDefault();
    if (!supabaseClient) return;

    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;
    const authError = document.getElementById('auth-error');
    const loadingOverlay = document.getElementById('loading-overlay');
    const authSubmitBtn = document.getElementById('auth-submit-btn');

    if(authError) authError.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');
   
    try {
        let isLoginMode = authSubmitBtn.textContent === 'Sign in';
        const { error } = isLoginMode 
            ? await supabaseClient.auth.signInWithPassword({ email, password })
            : await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
    } catch (error) {
        if (authError) {
            authError.textContent = error.message;
            authError.classList.remove('hidden');
        }
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

export function signOut(supabaseClient, isForced = false) {
    const currentUser = getCurrentUser();
    if (currentUser) {
        console.log("SIGN OUT: Clearing local browser storage.");
        const storageKey = `marksheetProData-${currentUser.id}`;
        localStorage.removeItem(storageKey);
    }
    supabaseClient?.auth.signOut();
    
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loadingOverlay = document.getElementById('loading-overlay');

     
        authContainer?.classList.remove('hidden');
        appContainer?.classList.add('hidden');
        loadingOverlay?.classList.add('hidden');
    

    // Reset the auth form to the default "Sign in" state
    const authTitle = document.getElementById('auth-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const authError = document.getElementById('auth-error');

    if(authError) authError.classList.add('hidden');
    if (authTitle) authTitle.textContent = 'Sign in to your account';
    if (authSubmitBtn) authSubmitBtn.textContent = 'Sign in';
    if (authToggleLink) authToggleLink.innerHTML = 'Or create a new account';
}