// Frontend/auth.js

import { updateLastLogin, loadDataForUser } from './api.js';
import { handleDataLoad, resetInactivityTimer } from './main.js';
// We can remove renderFullGradebookUI as you correctly pointed out.
import { setCurrentUser, setAppState, getAppState, getCurrentUser } from './state.js';

// This flag will prevent the listener from firing twice on a page load
let hasHandledInitialLoad = false;

export function setupAuthListener(supabaseClient, wasLocalDataLoaded) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app-container');
        const loadingOverlay = document.getElementById('loading-overlay');

        if (event === 'SIGNED_OUT' || !session) {
            hasHandledInitialLoad = false; // Reset flag on sign out
            const currentUser = getCurrentUser();
            if (currentUser) localStorage.removeItem(`marksheetProData-${currentUser.id}`);
            setCurrentUser(null);
            setAppState({});
            authContainer?.classList.remove('hidden');
            appContainer?.classList.add('hidden');
            loadingOverlay?.classList.add('hidden');
            return;
        }

        // --- NEW LOGIC TO PREVENT DOUBLE-LOAD ---

        // Handle a page refresh (INITIAL_SESSION)
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') { 
            hasHandledInitialLoad = true;
   
            setCurrentUser(user);
            authContainer?.classList.add('hidden');
            appContainer?.classList.remove('hidden');
            resetInactivityTimer();

            if (wasLocalDataLoaded) {
                // We have local data, so just render it. NO server fetch.
                console.log("AUTH: Resuming session from local state.");
                handleDataLoad(getAppState(), true);
                loadingOverlay?.classList.add('hidden');
            } else {
                // FIX: Do NOT sign out. Fetch from server instead.
                // This handles new users (Email Verification) or new devices.
                console.log("AUTH: No local data (New User/Device). Fetching from server...");
                loadingOverlay?.classList.remove('hidden');

                try {
                    updateLastLogin(user.id);
                    // Fetch profile from Supabase (creates one if it doesn't exist)
                    const { data, error } = await loadDataForUser(user.id, getAppState(), false);
                    if (error) throw error;
                    
                    handleDataLoad(data, true);
                } catch (e) {
                    console.error("AUTH ERROR (INITIAL_SESSION):", e);
                    // Only sign out if the server fetch actually FAILS
                    signOut(supabaseClient, true);
                } finally {
                    loadingOverlay?.classList.add('hidden');
                }
            }
        }
        // --- END NEW LOGIC ---
    });
}

export async function handleAuthSubmit(e, supabaseClient) {
    e.preventDefault();
    if (!supabaseClient) return;

    // Reset the flag on a manual login attempt
    hasHandledInitialLoad = false; 

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
    hasHandledInitialLoad = false; // Reset flag on sign out
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