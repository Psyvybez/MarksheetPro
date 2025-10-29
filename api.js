import { showModal } from './ui.js';
import { getCurrentUser } from './state.js';

let supabaseClient;

export function initializeSupabase(url, key) {
    if (supabaseClient) return supabaseClient;
    // The `supabase` variable is available globally from the script tag in index.html
    supabaseClient = supabase.createClient(url, key, {
        auth: {
            storage: localStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    });
    return supabaseClient;
}

export async function loadDataForUser(userId, appState, wasLocalDataLoaded) {
    console.log(`DATA: Fetching from server for user ${userId}.`);
    try {
        const { data: serverProfileRows, error, status } = await supabaseClient.from('profiles').select('*').eq('id', userId);
        if (error && status !== 406) throw error;
        
        const profileData = serverProfileRows?.[0];

        if (profileData) {
            const localTimestamp = appState.gradebook_data?.lastModified;
            const serverTimestamp = profileData.gradebook_data?.lastModified;
            if (!localTimestamp || (serverTimestamp && new Date(serverTimestamp) > new Date(localTimestamp))) {
                console.log("DATA: Server data is newer. Applying server state.");
                return { data: profileData, needsFullRender: !wasLocalDataLoaded };
            } else {
                console.log("DATA: Local data is up-to-date. No server data applied.");
                return { data: appState, needsFullRender: true }; 
            }
        } else {
            console.log("DATA: No profile found on server, creating new one.");
            const newGradebookData = { 
                semesters: { '1': { classes: {} }, '2': { classes: {} } }, 
                presets: {}, activeSemester: '1', activeClassId: null,
                lastModified: new Date().toISOString()
            };
            const { data: newData, error: newError } = await supabaseClient.from('profiles').insert({ id: userId, gradebook_data: newGradebookData }).select().single();
            if (newError) throw newError;
            return { data: newData, needsFullRender: true };
        }
    } catch (error) {
        console.error('DATA FATAL: Failed to load or create user profile.', error);
        return { error };
    }
}

export async function syncToServer(currentUser, appState, updateSaveStatus, isExplicitSave = false) {
    if (!currentUser || !supabaseClient) {
        if (!isExplicitSave) updateSaveStatus('Offline', 'pending');
        return;
    }
    updateSaveStatus('Syncing...', 'saving');
    
    const fullProfileUpdate = {
        title: appState.title,
        full_name: appState.full_name,
        school_board: appState.school_board,
        school_name: appState.school_name,
        room_number: appState.room_number,
        birthday: appState.birthday, 
        gradebook_data: appState.gradebook_data 
    };

    const { error } = await supabaseClient
        .from('profiles')
        .update(fullProfileUpdate)
        .eq('id', currentUser.id);

    if (error) {
        console.error('Error syncing data to Supabase:', error);
        updateSaveStatus('Sync failed!', 'error');
        showModal({
            title: 'Synchronization Error',
            content: `<p>Your latest changes could not be saved to the server. Please check your internet connection.</p><p class="mt-2 text-sm text-gray-500">You can continue working, and the app will attempt to sync again later.</p>`,
            confirmText: 'Retry',
            confirmClasses: 'bg-blue-600 hover:bg-blue-700',
            cancelText: 'Dismiss',
            onConfirm: () => syncToServer(currentUser, appState, updateSaveStatus, true),
        });
    } else {
        updateSaveStatus('Synced!', 'success');
    }
}

export async function updateUserPassword(newPassword) {
    if (!supabaseClient) throw new Error("Not connected.");
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
}

export async function updateLastLogin(userId) {
    if (!supabaseClient) return;
    supabaseClient.from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', userId)
        .then(({ error }) => {
            if (error) console.error("Error updating last login:", error);
        });
}

export async function uploadProfilePicture(file, studentId) {
    const currentUser = getCurrentUser();
    if (!supabaseClient || !currentUser) throw new Error("Not authenticated.");
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}/${studentId}.${fileExt}`;
    const { error } = await supabaseClient.storage.from('profile-pictures').upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
    });
    if (error) throw error;
    return fileName;
}

export function getProfilePictureUrl(path) {
        const currentUser = getCurrentUser();
    if (!supabaseClient || !path) return null;
    const { data } = supabaseClient.storage.from('profile-pictures').getPublicUrl(path);
    return data.publicUrl;
}

export async function deleteCurrentUser() {
    const currentUser = getCurrentUser();
    if (!supabaseClient || !currentUser) throw new Error("Not authenticated.");

    const { error } = await supabaseClient.rpc('delete_user_account');
    if (error) throw error;
}

export async function submitFeedback(feedbackType, content, contextJson) {
    const currentUser = getCurrentUser();
    if (!supabaseClient || !currentUser) throw new Error("Not authenticated.");

    const { error } = await supabaseClient
        .from('feedback')
        .insert({
            user_id: currentUser.id,
            feedback_type: feedbackType,
            content: content,
            context_json: contextJson
        });

    if (error) throw error;
    return true;
}