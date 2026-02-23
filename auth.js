// Frontend/auth.js

import { updateLastLogin, loadDataForUser } from './api.js';
import { handleDataLoad, resetInactivityTimer } from './main.js';
// We can remove renderFullGradebookUI as you correctly pointed out.
import { setCurrentUser, setAppState, getAppState, getCurrentUser } from './state.js';

// This flag will prevent the listener from firing twice on a page load
let hasHandledInitialLoad = false;
let authDebugSnapshot = {
  updatedAt: new Date().toISOString(),
  phase: 'init',
};
const AUTH_DEBUG_HISTORY_LIMIT = 20;
const authDebugHistory = [];

function pushAuthDebugHistory(entry = {}) {
  authDebugHistory.push({
    at: new Date().toISOString(),
    ...entry,
  });

  if (authDebugHistory.length > AUTH_DEBUG_HISTORY_LIMIT) {
    authDebugHistory.splice(0, authDebugHistory.length - AUTH_DEBUG_HISTORY_LIMIT);
  }
}

function updateAuthDebugSnapshot(patch = {}) {
  authDebugSnapshot = {
    ...authDebugSnapshot,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  pushAuthDebugHistory({
    phase: authDebugSnapshot.phase || 'unknown',
    event: authDebugSnapshot.event || null,
    sessionUserId: authDebugSnapshot.sessionUserId || null,
    currentUserId: authDebugSnapshot.currentUserId || null,
    shouldUseStartupLocalData: authDebugSnapshot.shouldUseStartupLocalData,
    hasFullName: authDebugSnapshot.hasFullName,
    errorMessage: authDebugSnapshot.errorMessage || null,
  });
}

function installAuthDebugHelpers() {
  if (typeof window === 'undefined') return;
  if (window.__marksheetAuthDebugHelpersInstalled) return;

  window.__marksheetAuthDebugHelpersInstalled = true;
  window.getAuthDebugSnapshot = () => ({ ...authDebugSnapshot });
  window.getAuthDebugHistory = () => authDebugHistory.map((entry) => ({ ...entry }));
  window.copyAuthDebugSnapshot = async () => {
    const snapshotText = JSON.stringify(window.getAuthDebugSnapshot(), null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(snapshotText);
        console.info('AUTH DEBUG: Snapshot copied to clipboard.');
        return true;
      }
    } catch (error) {
      console.warn('AUTH DEBUG: Clipboard write failed.', error);
    }

    console.info('AUTH DEBUG: Clipboard unavailable. Snapshot output below:');
    console.log(snapshotText);
    return false;
  };

  window.copyAuthDebugHistory = async () => {
    const historyText = JSON.stringify(window.getAuthDebugHistory(), null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(historyText);
        console.info('AUTH DEBUG: History copied to clipboard.');
        return true;
      }
    } catch (error) {
      console.warn('AUTH DEBUG: Clipboard write failed.', error);
    }

    console.info('AUTH DEBUG: Clipboard unavailable. History output below:');
    console.log(historyText);
    return false;
  };

  window.getAuthDebugReport = () => ({
    snapshot: window.getAuthDebugSnapshot(),
    history: window.getAuthDebugHistory(),
    generatedAt: new Date().toISOString(),
  });

  window.copyAuthDebugReport = async () => {
    const reportText = JSON.stringify(window.getAuthDebugReport(), null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportText);
        console.info('AUTH DEBUG: Full report copied to clipboard.');
        return true;
      }
    } catch (error) {
      console.warn('AUTH DEBUG: Clipboard write failed.', error);
    }

    console.info('AUTH DEBUG: Clipboard unavailable. Full report output below:');
    console.log(reportText);
    return false;
  };
}

function isAuthDebugEnabled() {
  if (typeof window === 'undefined') return false;
  const host = window.location?.hostname || '';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  return isLocalHost || localStorage.getItem('marksheetProDebugAuth') === '1';
}

function authDebugLog(message, details = null) {
  if (!isAuthDebugEnabled()) return;
  if (details) {
    console.debug(`AUTH DEBUG: ${message}`, details);
  } else {
    console.debug(`AUTH DEBUG: ${message}`);
  }
}

//
export function setupAuthListener(supabaseClient, wasLocalDataLoaded, initialLocalDataUserId = null) {
  installAuthDebugHelpers();

  let canUseStartupLocalData = !!wasLocalDataLoaded;
  let startupLocalDataUserId = initialLocalDataUserId;

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const verifyContainer = document.getElementById('verify-email-container'); // Get the verification screen
    const updatePasswordContainer = document.getElementById('update-password-container');
    const loadingOverlay = document.getElementById('loading-overlay');

    updateAuthDebugSnapshot({
      phase: 'auth_event',
      event,
      sessionUserId: user?.id || null,
      currentUserId: getCurrentUser()?.id || null,
      hasHandledInitialLoad,
      canUseStartupLocalData,
      startupLocalDataUserId,
      hasAppStateGradebook: !!getAppState()?.gradebook_data,
    });

    authDebugLog('onAuthStateChange fired', {
      event,
      sessionUserId: user?.id || null,
      currentUserId: getCurrentUser()?.id || null,
      hasHandledInitialLoad,
      canUseStartupLocalData,
      startupLocalDataUserId,
      hasAppStateGradebook: !!getAppState()?.gradebook_data,
    });

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
      canUseStartupLocalData = false;
      startupLocalDataUserId = null;
      updateAuthDebugSnapshot({
        phase: 'signed_out',
        canUseStartupLocalData,
        startupLocalDataUserId,
        hasHandledInitialLoad,
      });
      authDebugLog('SIGNED_OUT or no session: reset startup local-data gate');
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
        updateAuthDebugSnapshot({ phase: 'duplicate_signed_in_ignored', isSameUser });
        authDebugLog('Duplicate SIGNED_IN ignored for same user');
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

      const shouldUseStartupLocalData =
        canUseStartupLocalData &&
        !!getAppState()?.gradebook_data &&
        !!startupLocalDataUserId &&
        startupLocalDataUserId === user?.id;

      authDebugLog('Resolved data source for auth load', {
        shouldUseStartupLocalData,
        canUseStartupLocalData,
        startupLocalDataUserId,
        signedInUserId: user?.id || null,
      });

      updateAuthDebugSnapshot({
        phase: 'resolved_data_source',
        shouldUseStartupLocalData,
        signedInUserId: user?.id || null,
      });

      if (shouldUseStartupLocalData) {
        console.log('AUTH: Resuming session from local state.');
        handleDataLoad(getAppState(), true);
        canUseStartupLocalData = false;
        updateAuthDebugSnapshot({
          phase: 'loaded_from_startup_local_data',
          canUseStartupLocalData,
        });
        authDebugLog('Used startup local data and disabled reuse');
        loadingOverlay?.classList.add('hidden');
      } else {
        console.log('AUTH: Fetching fresh data from server...');
        loadingOverlay?.classList.remove('hidden');

        try {
          updateLastLogin(user.id);
          // Fetch profile from Supabase (creates one if it doesn't exist)
          const { data, error } = await loadDataForUser(user.id, getAppState(), false);
          if (error) throw error;

          handleDataLoad(data, true);
          updateAuthDebugSnapshot({
            phase: 'loaded_from_server',
            loadedUserId: user?.id || null,
            hasFullName: !!data?.full_name,
          });
          authDebugLog('Server profile load complete', {
            loadedUserId: user?.id || null,
            hasFullName: !!data?.full_name,
          });
        } catch (e) {
          console.error('AUTH ERROR:', e);
          updateAuthDebugSnapshot({
            phase: 'server_load_failed',
            errorMessage: e?.message || String(e),
          });
          authDebugLog('Server profile load failed', { message: e?.message || String(e) });
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

  const authContainer = document.getElementById('auth-container');
  const mode = authContainer?.dataset.authMode || 'signin';
  const authError = document.getElementById('auth-error');
  const loadingOverlay = document.getElementById('loading-overlay');

  if (authError) authError.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');

  try {
    if (mode === 'forgot') {
      const email = document.getElementById('reset-email-address')?.value?.trim();
      if (!email) throw new Error('Please enter your email address.');

      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin, // Important: Redirects back to your app
      });
      if (error) throw error;
      alert('Password reset link sent! Check your email.');
      return;
    }

    if (mode === 'signin') {
      const email = document.getElementById('email-address')?.value?.trim();
      const password = document.getElementById('password')?.value;
      if (!email || !password) throw new Error('Please enter email and password.');

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return;
    }

    if (mode === 'signup') {
      const email = document.getElementById('signup-email-address')?.value?.trim();
      const password = document.getElementById('signup-password')?.value;
      const confirmPassword = document.getElementById('signup-password-confirm')?.value;

      if (!email || !password || !confirmPassword) {
        throw new Error('Please complete all sign up fields.');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user && !data.session) {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('verify-email-container').classList.remove('hidden');
        document.getElementById('verify-email-address').textContent = email;
      }
      return;
    }

    throw new Error('Unknown authentication mode.');
  } catch (error) {
    if (authError) {
      authError.textContent = error.message;
      authError.classList.remove('hidden');
    }
  } finally {
    loadingOverlay.classList.add('hidden');
  }
}

export function signOut(supabaseClient, _isForced = false) {
  hasHandledInitialLoad = false; // Reset flag on sign out
  updateAuthDebugSnapshot({
    phase: 'signout_called',
    hasHandledInitialLoad,
    currentUserId: getCurrentUser()?.id || null,
  });
  const currentUser = getCurrentUser();
  if (currentUser) {
    console.log('SIGN OUT: Clearing local browser storage.');
    const storageKey = `marksheetProData-${currentUser.id}`;
    localStorage.removeItem(storageKey);
  }
  supabaseClient?.auth.signOut();

  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');
  const verifyContainer = document.getElementById('verify-email-container');
  const updatePasswordContainer = document.getElementById('update-password-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const authError = document.getElementById('auth-error');

  const signInPanel = document.getElementById('auth-signin-panel');
  const signUpPanel = document.getElementById('auth-signup-panel');
  const resetPanel = document.getElementById('auth-reset-panel');

  if (authContainer) authContainer.dataset.authMode = 'signin';
  signInPanel?.classList.remove('hidden');
  signUpPanel?.classList.add('hidden');
  resetPanel?.classList.add('hidden');
  verifyContainer?.classList.add('hidden');
  updatePasswordContainer?.classList.add('hidden');

  if (authError) authError.classList.add('hidden');
  authContainer?.classList.remove('hidden');
  appContainer?.classList.add('hidden');
  loadingOverlay?.classList.add('hidden');
}
