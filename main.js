import { initializeSupabase, syncToServer, loadDataForUser, deleteCurrentUser } from './api.js';
import { setupAuthListener, handleAuthSubmit, signOut } from './auth.js';
import { showModal, updateSaveStatus } from './ui.js';
import { setAppState, setCurrentUser, getAppState, getCurrentUser, getActiveClassData } from './state.js';
import { recalculateAndRenderAverages } from './calculations.js';
import { renderFullGradebookUI, updateUIFromState, renderGradebook, renderClassTabs, renderAccountPage, renderAttendanceSheet, renderStudentProfileModal } from './render.js';import * as actions from './actions.js';

// --- GLOBAL STATE & CONSTANTS ---
const SUPABASE_URL = 'https://pvwcdesafxxkosdrfjwa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2d2NkZXNhZnh4a29zZHJmandhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzY3NDIsImV4cCI6MjA3NDA1Mjc0Mn0.qaSGzdLMCbYNO1KQPCZJrCrk0AEtesKvt2kHXJ_IVH8';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

let supabaseClient;
let autoSaveTimer = null;
let inactivityTimer = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const contentWrapper = document.getElementById('content-wrapper');
    if (SUPABASE_URL.includes('YOUR_SUPABASE_URL')) {
        console.error("INIT ERROR: Supabase URL or Key not set.");
        if(contentWrapper) contentWrapper.innerHTML = `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mt-8" role="alert"><p class="font-bold">Configuration Error</p><p>Please update the <strong>SUPABASE_URL</strong> and <strong>SUPABASE_ANON_KEY</strong> in the main.js file.</p></div>`;
        return;
    }

    supabaseClient = initializeSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
    setupEventListeners();

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        const userId = session?.user?.id;
        const wasLocalDataLoaded = loadLocalStateBeforeAuth(userId);
        setupAuthListener(supabaseClient, wasLocalDataLoaded);
    });
});

function loadLocalStateBeforeAuth(userId) {
    if (!userId) return false;
    const storageKey = `marksheetProData-${userId}`;
    const cachedData = localStorage.getItem(storageKey);
    
    if (cachedData) {
        try {
            const parsedData = JSON.parse(cachedData);
            if (parsedData && parsedData.gradebook_data) {
                setAppState(parsedData);
                document.getElementById('auth-container')?.classList.add('hidden');
                document.getElementById('app-container')?.classList.remove('hidden');
                return true;
            }
        } catch (e) {
            console.error("PRE-AUTH LOAD ERROR: Failed to parse local storage.", e);
        }
    }
    return false;
}

// In Frontend/main.js

// In Frontend/main.js

export function handleDataLoad(data, isInitial = true) {
    const userEmailDisplay = document.getElementById('user-email-display');

    setAppState(data);
    
    const currentUser = getCurrentUser();
    if (currentUser) {
        localStorage.setItem(`marksheetProData-${currentUser.id}`, JSON.stringify(data));
    }

    if (userEmailDisplay) {
        const title = data.title || '';
        const fullName = data.full_name || '';
        userEmailDisplay.textContent = fullName ? `Welcome, ${title} ${fullName}` : `Welcome, ${currentUser?.email}`;
    }

    if (isInitial) { 
        if (!data.full_name) {
            // New user: Send them to setup page.
            renderAccountPage(true); 
        } else {
            // Existing user: Render the main gradebook.
            renderFullGradebookUI();
        }
    } else {
        // This is just a data refresh, not an initial load.
        updateUIFromState();
    }
}

export function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(showSessionTimeoutModal, INACTIVITY_TIMEOUT_MS);
}

export function triggerAutoSave() {
    const appState = getAppState();
    const currentUser = getCurrentUser();
    if (appState.gradebook_data) {
        appState.gradebook_data.lastModified = new Date().toISOString();
    }
    if(currentUser) {
        localStorage.setItem(`marksheetProData-${currentUser.id}`, JSON.stringify(appState));
        updateSaveStatus('Saved locally', 'pending');
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => syncToServer(currentUser, appState, updateSaveStatus), 1500);
    }
}

function showSessionTimeoutModal() {
    let countdown = 10;
    let countdownInterval; // Declare here

    // 1. Get the closeModal function from showModal
    const closeModal = showModal({
        title: 'Are you still there?',
        content: `<p>You've been inactive for a while.</p><p class="mt-2">For your security, you will be automatically signed out in <span id="session-countdown" class="font-bold">${countdown}</span> seconds.</p>`,
        confirmText: 'Stay Signed In',
        confirmClasses: 'bg-blue-600 hover:bg-blue-700',
        onConfirm: () => {
            clearInterval(countdownInterval);
            resetInactivityTimer();
            // closeModal() is called automatically by ui.js on confirm
        },
        onCancel: () => {
            clearInterval(countdownInterval);
            signOut(supabaseClient, true);
            // closeModal() is called automatically by ui.js on cancel
        }
    });

    // 2. Start the interval *after* the modal exists
    countdownInterval = setInterval(() => {
        countdown--;
        const countdownEl = document.getElementById('session-countdown');
        if (countdownEl) {
            countdownEl.textContent = countdown;
        }
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            signOut(supabaseClient, true);
            closeModal(); // 3. Call closeModal here to close the modal
        }
    }, 1000);
}

function backupData() {
    const appState = getAppState();
    if (!appState.gradebook_data) {
        showModal({ title: 'Backup Failed', content: `<p>No data found to create a backup file.</p>`, confirmText: null, cancelText: 'Close', modalWidth: 'max-w-xs' });
        return;
    }
    try {
        const dataStr = JSON.stringify(appState, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marksheet-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showModal({ title: 'Backup Successful', content: `<p>Your data has been downloaded as <strong>${a.download}</strong>.</p>`, confirmText: null, cancelText: 'Close', modalWidth: 'max-w-xs' });
    } catch (error) {
        console.error("Backup failed:", error);
        showModal({ title: 'Backup Failed', content: `<p>Could not create backup file due to an error.</p>`, confirmText: null, cancelText: 'Close', modalWidth: 'max-w-xs' });
    }
}

function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const restoredState = JSON.parse(event.target.result);
                if (restoredState && restoredState.gradebook_data && restoredState.gradebook_data.semesters) {
                    showModal({
                        title: 'Confirm Restore',
                        content: '<p>Are you sure you want to restore from this backup? This will overwrite your current data.</p>',
                        confirmText: 'Restore',
                        confirmClasses: 'bg-green-600 hover:bg-green-700',
                        onConfirm: () => {
                            setAppState(restoredState);
                            handleDataLoad(restoredState, true);
                            triggerAutoSave();
                            showModal({ title: 'Restore Successful', content: `<p>Data restored successfully!</p>`, confirmText: null, cancelText: 'Close', modalWidth: 'max-w-xs' });
                        }
                    });
                } else {
                    throw new Error("Invalid or corrupted backup file.");
                }
            } catch (error) {
                console.error("Restore failed:", error);
                showModal({ title: 'Restore Failed', content: `<p>Error reading backup file: ${error.message}</p>`, confirmText: null, cancelText: 'Close', modalWidth: 'max-w-sm' });
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// In Frontend/main.js

async function saveProfile() {
    const currentUser = getCurrentUser();
    if (!currentUser || !supabaseClient) {
        const feedbackEl = document.getElementById('account-feedback');
        feedbackEl.textContent = 'Error: Not signed in or offline.';
        feedbackEl.className = 'p-3 rounded-md bg-red-100 text-red-700';
        feedbackEl.classList.remove('hidden');
        return;
    }

    const title = document.getElementById('title-input').value.trim();
    const fullName = document.getElementById('full-name-input').value.trim();
    const schoolBoard = document.getElementById('school-board-input').value.trim();
    const schoolName = document.getElementById('school-name-input').value.trim();
    const roomNumber = document.getElementById('room-number-input').value.trim();
    const birthday = document.getElementById('birthday-input').value; 
    const newPassword = document.getElementById('new-password-input').value;
    const feedbackEl = document.getElementById('account-feedback');

    feedbackEl.classList.add('hidden');
    feedbackEl.textContent = '';

    const appState = getAppState();
    const updates = { title, full_name: fullName, school_board: schoolBoard, school_name: schoolName, room_number: roomNumber, birthday: birthday || null };
    const newState = { ...appState, ...updates };
    setAppState(newState);
    
    clearTimeout(autoSaveTimer); 
    
    if (currentUser) {
        const storageKey = `marksheetProData-${currentUser.id}`;
        localStorage.setItem(storageKey, JSON.stringify(newState));
        updateSaveStatus('Saved locally', 'pending');
    }

    let passwordUpdated = false;
    try {
        if (newPassword) {
            const { error: passwordError } = await supabaseClient.auth.updateUser({ password: newPassword });
            if (passwordError) throw new Error(`Password Update Failed: ${passwordError.message}`);
            passwordUpdated = true;
        }
        
        await syncToServer(currentUser, newState, updateSaveStatus, true);

        document.getElementById('new-password-input').value = '';
        
        // Check if this was the first-time setup
        const wasFirstTimeSetup = !appState.full_name && newState.full_name;

        let successMessage = 'Profile data saved!';
        if (passwordUpdated) {
            successMessage = 'Password updated and profile saved!';
        }
        if (wasFirstTimeSetup) {
            successMessage = 'Profile created! Loading your gradebook...';
        }

        feedbackEl.textContent = successMessage;
        feedbackEl.className = 'p-3 rounded-md bg-green-100 text-green-700';
        feedbackEl.classList.remove('hidden');

        // Reload the app state. This will trigger handleDataLoad, which
        // will now see the user's full_name and render the gradebook.
        setTimeout(() => {
            handleDataLoad(newState, true);
        }, 800); // Delay so user can read the success message

    } catch (error) {
        console.error('Error saving profile:', error);
        feedbackEl.textContent = `Error: ${error.message}`;
        feedbackEl.className = 'p-3 rounded-md bg-red-100 text-red-700';
        feedbackEl.classList.remove('hidden');
    }
}

function promptDeleteAccount() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    showModal({
        title: 'Are you absolutely sure?',
        content: `
            <p>This action is irreversible. All your data, including classes, students, and grades, will be permanently deleted.</p>
            <p class="mt-4">To confirm, please type <strong>DELETE</strong> in the box below:</p>
            <input type="text" id="delete-confirm-input" class="mt-2 block w-full border border-gray-300 rounded-md shadow-sm">
        `,
        confirmText: 'Delete My Account',
        confirmClasses: 'bg-red-600 hover:bg-red-700',
        onAction: async (closeModal) => {
            const input = document.getElementById('delete-confirm-input');
            if (input && input.value === 'DELETE') {
                try {
                    await deleteCurrentUser();
                    showModal({ title: 'Account Deleted', content: '<p>Your account has been permanently deleted.</p>', confirmText: null, cancelText: 'Close' });
                    signOut(supabaseClient, true);
                } catch (error) {
                    console.error('Failed to delete account:', error);
                    showModal({ title: 'Error', content: `<p>Could not delete account: ${error.message}</p>`, confirmText: null, cancelText: 'Close' });
                }
                closeModal(); // Close the confirmation modal
            } else {
                showModal({ title: 'Deletion Canceled', content: '<p>The confirmation text did not match. Your account is safe.</p>', confirmText: null, cancelText: 'Close', modalWidth: 'max-w-xs' });
            }
        }
    });
}

// Replace the setupEventListeners function in Frontend/main.js

function setupEventListeners() {
    const contentWrapper = document.getElementById('content-wrapper');
    const authContainer = document.getElementById('auth-container');

    if (authContainer) {
document.getElementById('auth-submit-btn')?.addEventListener('click', (e) => handleAuthSubmit(e, supabaseClient));
        document.getElementById('auth-toggle-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            const authTitle = document.getElementById('auth-title');
            const authSubmitBtn = document.getElementById('auth-submit-btn');
            const authToggleLink = document.getElementById('auth-toggle-link');
            let isLoginMode = authSubmitBtn.textContent === 'Sign in';
            isLoginMode = !isLoginMode;
            authTitle.textContent = isLoginMode ? 'Sign in to your account' : 'Create a new account';
            authSubmitBtn.textContent = isLoginMode ? 'Sign in' : 'Create account';
            authToggleLink.innerHTML = isLoginMode ? 'Or create a new account' : 'Already have an account? Sign in';
        });
    }

    if (contentWrapper) {
        contentWrapper.addEventListener('click', (e) => {
            const target = e.target.closest('[id], [data-tab-id], [data-student-id]');
            if (!target) return;

            const id = target.id;
            const tabId = target.dataset.tabId;
            const studentId = target.dataset.studentId;

            if (target.classList.contains('delete-btn')) {
                actions.deleteStudent(studentId);
                return;
            }
            if (target.classList.contains('student-name-btn')) {
                renderStudentProfileModal(studentId);
                return;
            }
             if (id === 'back-to-gradebook-btn') {
                renderFullGradebookUI();
                return;
            }
            if (id === 'back-to-app-btn') {
                handleDataLoad(getAppState(), true);
                return;
            }
            if(id === 'save-profile-btn') {
                saveProfile();
                return;
            }

            if(id === 'delete-account-btn') {
                promptDeleteAccount();
                return;
            }

            const actionMap = {
                'semesterBtn1': () => actions.switchSemester('1'),
                'semesterBtn2': () => actions.switchSemester('2'),
                'addClassBtn': actions.addClass,
                'archiveClassBtn': actions.archiveClass,
                'addStudentBtn': actions.addStudent,
                'importStudentsBtn': actions.importStudentsCSV,
                'addAssignmentBtn': actions.manageAssignments,
                'editUnitsBtn': actions.editUnits,
                'recordMidtermsBtn': actions.recordMidterms,
                'attendanceBtn': renderAttendanceSheet,
                'savePresetBtn': actions.saveClassAsPreset,
                'exportMenuBtn': () => document.getElementById('exportMenuDropdown')?.classList.toggle('hidden'),
                'exportPdfBtn': () => { actions.showPdfExportOptionsModal(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); },
                'exportCsvBtn': () => { actions.exportToCSV(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); },
                'exportBlankPdfBtn': () => { actions.exportBlankMarksheet(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); }
            };

            if (actionMap[id]) {
                e.preventDefault();
                actionMap[id]();
            } else if (tabId) {
                e.preventDefault();
                actions.switchActiveClass(tabId);
            }
        });

        contentWrapper.addEventListener('input', (e) => {
            const target = e.target;
            const classData = getActiveClassData(); // Get current class data

            if (target.id === 'student-search-input') {
                renderGradebook(); // Search still needs direct render for filtering
                return;
            }

            // Handle grade input changes
            if (target.classList.contains('grade-input')) {
                const studentId = target.dataset.studentId;
                const assignmentId = target.dataset.assignmentId;
                const category = target.dataset.cat;
                const value = target.value.trim();

                // --- Refined Parsing ---
                let numericValue;
                if (value === '') { numericValue = null; }
                else { numericValue = parseFloat(value); if (isNaN(numericValue)) { numericValue = null; } }
                // --- End Refined Parsing ---

                if (studentId && assignmentId && classData?.students?.[studentId]) {
                    // --- 1. Update State Logic ---
                    if (!classData.students[studentId].grades) classData.students[studentId].grades = {};
                    if (!classData.students[studentId].grades[assignmentId]) classData.students[studentId].grades[assignmentId] = {};
                    if (category) { classData.students[studentId].grades[assignmentId][category] = numericValue; }
                    else { classData.students[studentId].grades[assignmentId].grade = numericValue; }
                    // --- End State Update ---

                    // --- 2. Validation ---
                    const unit = Object.values(classData.units || {}).find(u => u.assignments?.[assignmentId]);
                    const assignment = unit?.assignments?.[assignmentId];
                    let maxScore = Infinity;
                    if (unit?.isFinal) { maxScore = assignment?.total ?? Infinity; }
                    else if (category) { maxScore = assignment?.categoryTotals?.[category] ?? Infinity; }
                    const isValid = numericValue === null || (!isNaN(numericValue) && numericValue >= 0 && (maxScore === Infinity || numericValue <= maxScore));
                    target.classList.toggle('grade-input-error', !isValid && value !== '');
                    // --- End Validation ---

                    // --- 3. Recalculate & Update Averages in DOM FIRST ---
                    recalculateAndRenderAverages(); // Call the specific update function

                    // --- 4. Trigger Save/Sync AFTER UI update ---
                    triggerAutoSave();
                }
            }

            // --- Handle other inputs (IEP, Class Name, Category Weights) ---
            // Keep the logic for these as is
            if (target.classList.contains('iep-checkbox')) {
                const studentId = target.dataset.studentId;
                 if (studentId && classData?.students?.[studentId]) {
                     classData.students[studentId].iep = target.checked;
                     triggerAutoSave(); // Save happens after checkbox change
                 }
            } else if (target.id === 'className' && classData) {
                 classData.name = target.textContent.trim();
                 triggerAutoSave(); // Save happens after name change
            } else if (target.classList.contains('cat-weight-input') && classData) {
                 const cat = target.dataset.cat;
                 const value = parseFloat(target.value) || 0;
                 if (cat && classData.categoryWeights) {
                     classData.categoryWeights[cat] = value;
                     renderCategoryWeights(); // Re-render category weights section immediately
                     renderGradebook(); // *** Re-render gradebook immediately after weight change ***
                     triggerAutoSave(); // Save happens after UI updates
                 }
                }     
        });
        
        contentWrapper.addEventListener('change', (e) => {
             if (e.target.id === 'unitFilterDropdown') {
                const appState = getAppState();
                if(appState.gradebook_data) appState.gradebook_data.activeUnitId = e.target.value;
                renderGradebook();
            }
            if (e.target.id === 'show-archived-checkbox') {
                renderClassTabs();
            }
        });

        contentWrapper.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('grade-input')) {
                e.preventDefault();
                e.target.blur(); 
            }
        });
    }
    
    document.getElementById('sign-out-btn')?.addEventListener('click', () => signOut(supabaseClient));
    document.getElementById('account-management-btn')?.addEventListener('click', () => renderAccountPage(false));
    document.getElementById('backup-btn')?.addEventListener('click', backupData);
    document.getElementById('restore-btn')?.addEventListener('click', restoreData);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#exportMenuBtn') && !e.target.closest('#exportMenuDropdown')) {
            document.getElementById('exportMenuDropdown')?.classList.add('hidden');
        }
    });

    ['mousemove', 'mousedown', 'keypress', 'click'].forEach(evt => window.addEventListener(evt, resetInactivityTimer));
   // Replace the existing visibilitychange listener in Frontend/main.js

    window.addEventListener('visibilitychange', async () => { // Make the handler async
    const currentUser = getCurrentUser();
    const loadingOverlay = document.getElementById('loading-overlay'); // Get the loading overlay element

    // Check if the tab is now visible AND the user is logged in
            if (document.visibilityState === 'visible' && currentUser && supabaseClient) {
                console.log("Tab refocused. Checking for data updates...");
                loadingOverlay?.classList.remove('hidden'); // Show the loading spinner

            try {
            // Optional: Refresh session just in case it expired while tab was hidden
            await supabaseClient.auth.getSession();

            // *** Explicitly re-load data from the server ***
            // Pass wasLocalDataLoaded = false, indicating this isn't the initial page load
            const { data, error } = await loadDataForUser(currentUser.id, getAppState(), false);

            if (error) {
                console.error("Error reloading data on tab focus:", error);
                // Optional: Show a user-friendly error message via showModal if needed
            } else if (data) {
                console.log("Data reloaded on tab focus. Updating UI...");
                // *** Update the UI with the latest data, passing isInitial = false ***
                handleDataLoad(data, false);
            }
            } catch (e) {
            console.error("Unexpected error during visibility change handling:", e);
            // Optional: Handle unexpected errors
            } finally {
            loadingOverlay?.classList.add('hidden'); // Always hide spinner when done
            }
        }
    });
}
