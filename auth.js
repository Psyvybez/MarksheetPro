// Frontend/auth.js

import { updateLastLogin, loadDataForUser } from './api.js';
import { handleDataLoad, resetInactivityTimer } from './main.js';
// We can remove renderFullGradebookUI as you correctly pointed out.
import { setCurrentUser, setAppState, getAppState, getCurrentUser } from './state.js';

// This flag will prevent the listener from firing twice on a page load
let hasHandledInitialLoad = false;

//
export function setupAuthListener(supabaseClient, wasLocalDataLoaded) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app-container');
        const verifyContainer = document.getElementById('verify-email-container'); // Get the verification screen
        const updatePasswordContainer = document.getElementById('update-password-container');
        const loadingOverlay = document.getElementById('loading-overlay');

        if (event === 'PASSWORD_RECOVERY') {
            authContainer?.classList.add('hidden');
            appContainer?.classList.add('hidden');
            verifyContainer?.classList.add('hidden');
            updatePasswordContainer?.classList.remove('hidden');
            loadingOverlay?.classList.add('hidden');
            return;
        }

        if (event === 'SIGNED_OUT' || !session) {
            hasHandledInitialLoad = false; // Reset flag on sign out
            const currentUser = getCurrentUser();
            if (currentUser) localStorage.removeItem(`marksheetProData-${currentUser.id}`);
            setCurrentUser(null);
            setAppState({});
            
            // Show Login, Hide App & Verify Screen
            authContainer?.classList.remove('hidden');
            appContainer?.classList.add('hidden');
            verifyContainer?.classList.add('hidden');
            updatePasswordContainer?.classList.add('hidden');
            loadingOverlay?.classList.add('hidden');
            return;
        }

        // Handle Page Refresh (INITIAL_SESSION) OR Email Link Click (SIGNED_IN)
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            const currentUser = getCurrentUser();
            const isSameUser = !!currentUser && currentUser.id === user?.id;

            // Supabase can emit duplicate SIGNED_IN events (e.g. on tab focus/session refresh).
            // Ignore duplicates once initial state is already handled for the same user.
            if (event === 'SIGNED_IN' && hasHandledInitialLoad && isSameUser) {
                resetInactivityTimer();
                loadingOverlay?.classList.add('hidden');
                return;
            }

            hasHandledInitialLoad = true;
            setCurrentUser(user);
            
            // Hide Auth & Verify Screens, Show App
            authContainer?.classList.add('hidden');
            verifyContainer?.classList.add('hidden'); // <--- IMPORTANT: Hide the standby screen
            updatePasswordContainer?.classList.add('hidden');
            appContainer?.classList.remove('hidden');
            resetInactivityTimer();

            // CLEANUP: Remove the ugly hash from the URL (access_token=...)
            if (window.location.hash && window.location.hash.includes('access_token')) {
                window.history.replaceState(null, '', window.location.pathname);
            }

            if (wasLocalDataLoaded) {
                console.log("AUTH: Resuming session from local state.");
                handleDataLoad(getAppState(), true);
                loadingOverlay?.classList.add('hidden');
            } else {
                console.log("AUTH: Fetching fresh data from server...");
                loadingOverlay?.classList.remove('hidden');

                try {
                    updateLastLogin(user.id);
                    // Fetch profile from Supabase (creates one if it doesn't exist)
                    const { data, error } = await loadDataForUser(user.id, getAppState(), false);
                    if (error) throw error;
                    
                    handleDataLoad(data, true);
                } catch (e) {
                    console.error("AUTH ERROR:", e);
                    // Only sign out if the server fetch actually FAILS
                    signOut(supabaseClient, true);
                } finally {
                    loadingOverlay?.classList.add('hidden');
                }
            }
        }
    });
}

//
// Update handleAuthSubmit
export async function handleAuthSubmit(e, supabaseClient) {
    e.preventDefault();
    if (!supabaseClient) return;

    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authError = document.getElementById('auth-error');
    const loadingOverlay = document.getElementById('loading-overlay');

    if(authError) authError.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');

    try {
        const mode = authSubmitBtn.textContent; // "Sign in", "Create account", or "Send Reset Link"

        if (mode === 'Send Reset Link') {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin, // Important: Redirects back to your app
            });
            if (error) throw error;
            alert('Password reset link sent! Check your email.');
            // Optional: Switch back to Sign In mode here
        } 
        else if (mode === 'Sign in') {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } 
        else {
            // Sign Up Logic
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            if (data.user && !data.session) {
                document.getElementById('auth-container').classList.add('hidden');
                document.getElementById('verify-email-container').classList.remove('hidden');
                document.getElementById('verify-email-address').textContent = email;
            }
        }
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