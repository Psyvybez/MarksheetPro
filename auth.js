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

        // --- NEW, OPTIMIZED LOGIC ---

        // Handle a page refresh (INITIAL_SESSION)
        if (event === 'INITIAL_SESSION') {
            setCurrentUser(user);
            authContainer?.classList.add('hidden');
            appContainer?.classList.remove('hidden');
            resetInactivityTimer();

            // The data was already loaded from local storage in main.js
            // We just need to render the UI with the state we already have.
            if (wasLocalDataLoaded) {
                console.log("AUTH: Resuming session from local state.");
                handleDataLoad(getAppState(), true); // Render from local data
            } else {
                // Fallback: local data failed to load, so we must fetch from server
                console.log("AUTH: No local data, fetching initial session from server.");
                loadingOverlay?.classList.remove('hidden');
                try {
                    const { data, error } = await loadDataForUser(user.id, getAppState(), false);
                    if (error) throw error;
                    handleDataLoad(data, true);
                } catch (e) {
                    console.error("AUTH LISTENER FATAL (INITIAL_SESSION):", e);
                    signOut(supabaseClient, true);
                } finally {
                    loadingOverlay?.classList.add('hidden');
                }
            }
        }

        // Handle a fresh login (SIGNED_IN)
        if (event === 'SIGNED_IN') {
            setCurrentUser(user);
            loadingOverlay?.classList.remove('hidden'); // Show loading overlay
            
            try {
                updateLastLogin(user.id);
                
                authContainer?.classList.add('hidden');
                appContainer?.classList.remove('hidden');
                resetInactivityTimer();
                
                // This is a new sign-in, so we MUST fetch from the server
                // to get the freshest data.
                console.log("AUTH: New sign-in, fetching from server.");
                const { data, error } = await loadDataForUser(user.id, getAppState(), false); // 'false' forces server check
                if (error) throw error;

                handleDataLoad(data, true);
            } catch (e) {
                console.error("AUTH LISTENER FATAL (SIGNED_IN):", e);
                signOut(supabaseClient, true);
            } finally {
                loadingOverlay?.classList.add('hidden');
            }
        }
        // --- END NEW LOGIC ---
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