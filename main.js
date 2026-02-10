import { initializeSupabase, syncToServer, loadDataForUser, deleteCurrentUser, submitFeedback } from './api.js';
import { setupAuthListener, handleAuthSubmit, signOut } from './auth.js';
import { showModal, updateSaveStatus } from './ui.js';
import { setAppState, setCurrentUser, getAppState, getCurrentUser, getActiveClassData, getActiveSemesterData } from './state.js';
import { recalculateAndRenderAverages } from './calculations.js';
import { renderFullGradebookUI, updateUIFromState, renderGradebook, renderClassTabs, renderAccountPage, renderAttendanceSheet, renderStudentProfileModal,updateClassStats } from './render.js';
import * as actions from './actions.js'
import { startTutorial } from './tutorial.js';

// --- GLOBAL STATE & CONSTANTS ---
const SUPABASE_URL = 'https://pvwcdesafxxkosdrfjwa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2d2NkZXNhZnh4a29zZHJmandhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzY3NDIsImV4cCI6MjA3NDA1Mjc0Mn0.qaSGzdLMCbYNO1KQPCZJrCrk0AEtesKvt2kHXJ_IVH8';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

let supabaseClient;
let autoSaveTimer = null;
let inactivityTimer = null;
let draggedTab = null;

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

    // This logic now runs whether it's the initial load or a tab-back
    if (!data.full_name) {
        // User profile is incomplete, send to setup page.
        renderAccountPage(true); 
    } else {
        // User profile is complete.
        // Check if the user is currently on the "My Account" page.
        const isAccountPageVisible = !!document.getElementById('save-profile-btn');
        
        if (isAccountPageVisible && !isInitial) {
             // If they are on the account page AND this is a tab-back (not initial load),
             // just re-render the account page to refresh its data (e.g., last login).
            renderAccountPage(false);
        } else {
            // Otherwise (if it's initial load OR they are on the gradebook/attendance page),
            // render the full gradebook UI. This ensures we are on the main app screen.
            renderFullGradebookUI();
        }
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

        setTimeout(() => {
            handleDataLoad(newState, true); // This renders the gradebook
            // *** ADD THIS CHECK ***
            if (wasFirstTimeSetup) {
                startTutorial(); // Launch the tutorial!
            }
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
                closeModal(); 
            } else {
                showModal({ title: 'Deletion Canceled', content: '<p>The confirmation text did not match. Your account is safe.</p>', confirmText: null, cancelText: 'Close', modalWidth: 'max-w-xs' });
            }
        }
    });
}

function showFeedbackModal() {
    const appState = getAppState();
    const contextJson = {
        activeClassId: appState.gradebook_data?.activeClassId,
        activeUnitId: appState.gradebook_data?.activeUnitId,
        userAgent: navigator.userAgent
    };

    showModal({
        title: 'Report a Bug or Suggestion',
        content: `
            <div class="space-y-4">
                <div>
                    <label for="feedback-type" class="block text-sm font-medium">Report Type</label>
                    <select id="feedback-type" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                        <option value="Bug Report">Bug Report</option>
                        <option value="Suggestion">Suggestion</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div>
                    <label for="feedback-content" class="block text-sm font-medium">Details</label>
                    <textarea id="feedback-content" class="mt-1 block w-full h-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Please be as detailed as possible. What did you expect to happen? What actually happened?"></textarea>
                    <p id="feedback-error" class="text-red-600 text-sm mt-1 hidden"></p>
                </div>
            </div>
        `,
        confirmText: 'Submit Feedback',
        confirmClasses: 'bg-green-600 hover:bg-green-700',
        onAction: async (closeModal) => {
            const feedbackType = document.getElementById('feedback-type').value;
            const content = document.getElementById('feedback-content').value.trim();
            const errorEl = document.getElementById('feedback-error');
            const confirmBtn = document.getElementById('modal-confirm-btn');

            if (content.length <= 10) {
                errorEl.textContent = 'Please provide more detail (at least 10 characters).';
                errorEl.classList.remove('hidden');
                return; // Don't close the modal
            }
            
            errorEl.classList.add('hidden');
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Submitting...';

            try {
                await submitFeedback(feedbackType, content, contextJson);
                closeModal();
                // Show a success message
                showModal({
                    title: 'Feedback Submitted!',
                    content: '<p>Thank you for your help in making this app better.</p>',
                    confirmText: null,
                    cancelText: 'Close',
                    modalWidth: 'max-w-xs'
                });
            } catch (error) {
                console.error('Failed to submit feedback:', error);
                errorEl.textContent = `Error: ${error.message}`;
                errorEl.classList.remove('hidden');
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Submit Feedback';
            }
        }
    });
}



//
//
//
//
//
function setupEventListeners() {
    const contentWrapper = document.getElementById('content-wrapper');
    const authContainer = document.getElementById('auth-container');

    if (authContainer) {
        document.getElementById('auth-submit-btn')?.addEventListener('click', (e) => handleAuthSubmit(e, supabaseClient));
        document.getElementById('password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('auth-submit-btn')?.click(); }
        });
        document.getElementById('auth-toggle-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            const authTitle = document.getElementById('auth-title');
            const authSubmitBtn = document.getElementById('auth-submit-btn');
            const authToggleLink = document.getElementById('auth-toggle-link');
            const isCurrentlySignIn = authSubmitBtn.textContent === 'Sign in';
            if (isCurrentlySignIn) {
                authTitle.textContent = 'Create a new account';
                authSubmitBtn.textContent = 'Create account';
                authToggleLink.innerHTML = 'Already have an account? <span class="font-bold underline">Sign in</span>';
                authSubmitBtn.classList.remove('bg-primary', 'hover:bg-primary-dark');
                authSubmitBtn.classList.add('bg-accent', 'hover:bg-accent-dark');
                authTitle.classList.add('text-accent');
            } else {
                authTitle.textContent = 'Sign in to your account';
                authSubmitBtn.textContent = 'Sign in';
                authToggleLink.innerHTML = 'Or <span class="font-bold underline">create a new account</span>';
                authSubmitBtn.classList.remove('bg-accent', 'hover:bg-accent-dark');
                authSubmitBtn.classList.add('bg-primary', 'hover:bg-primary-dark');
                authTitle.classList.remove('text-accent');
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('custom-modal');
        if (modal && document.body.classList.contains('modal-open') && e.key === 'Enter') {
            const target = e.target;
            if ((target.tagName === 'INPUT' || target.tagName === 'SELECT') && modal.contains(target)) {
                e.preventDefault();
                handleModalEnter(modal, target);
            }
        }
    });

    if (contentWrapper) {
        contentWrapper.addEventListener('click', (e) => {
            const clickedElement = e.target;

            // Zoom logic
            if (clickedElement.id === 'zoomInBtn' || clickedElement.id === 'zoomOutBtn') {
                const contentArea = document.getElementById('main-content-area');
                const zoomText = document.getElementById('zoom-level-text');
                const appState = getAppState();
                let currentZoom = appState.gradebook_data.zoomLevel || 0.8;
                if (clickedElement.id === 'zoomInBtn') currentZoom += 0.1;
                if (clickedElement.id === 'zoomOutBtn') currentZoom -= 0.1;
                if (currentZoom < 0.5) currentZoom = 0.5;
                if (currentZoom > 1.5) currentZoom = 1.5;
                currentZoom = Math.round(currentZoom * 10) / 10;
                if(contentArea) contentArea.style.zoom = currentZoom;
                if(zoomText) zoomText.textContent = `${Math.round(currentZoom * 100)}%`;
                if (appState.gradebook_data) {
                    appState.gradebook_data.zoomLevel = currentZoom;
                    triggerAutoSave();
                }
                return;
            }

            const studentNameBtn = clickedElement.closest('.student-name-btn');
            if (studentNameBtn) {
                const studentId = studentNameBtn.closest('[data-student-id]')?.dataset.studentId;
                if (studentId) { renderStudentProfileModal(studentId); return; }
            }
            const deleteBtn = clickedElement.closest('.delete-btn');
            if (deleteBtn) {
                const studentId = deleteBtn.closest('[data-student-id]')?.dataset.studentId;
                if (studentId) { actions.deleteStudent(studentId); return; }
            }
            
            const target = clickedElement.closest('[id], [data-tab-id]');
            if (!target) return;
            const id = target.id;
            const tabId = target.dataset.tabId;

            if (id === 'back-to-gradebook-btn') { renderFullGradebookUI(); return; }
            if (id === 'back-to-app-btn') { handleDataLoad(getAppState(), true); return; }
            if(id === 'save-profile-btn') { saveProfile(); return; }
            if(id === 'delete-account-btn') { promptDeleteAccount(); return; }

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
                'attendanceBtn': () => renderAttendanceSheet(new Date().toISOString().slice(0, 10)),
                'savePresetBtn': actions.saveClassAsPreset,
                'exportMenuBtn': () => document.getElementById('exportMenuDropdown')?.classList.toggle('hidden'),
                'exportPdfBtn': () => { actions.showPdfExportOptionsModal(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); },
                'exportCsvBtn': () => { actions.exportToCSV(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); },
                'exportBlankPdfBtn': () => { actions.exportBlankMarksheet(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); },
                'exportStudentListBtn': () => { actions.exportStudentListPDF(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); },
                'exportContactListBtn': () => { actions.exportContactListPDF(); document.getElementById('exportMenuDropdown')?.classList.add('hidden'); },
                // --- NEW ACTION MAPPED HERE ---
                'moveClassBtn': actions.moveClassToSemester 
            };

            if (actionMap[id]) { e.preventDefault(); actionMap[id](); } 
            else if (tabId) { e.preventDefault(); actions.switchActiveClass(tabId); }
        });

        contentWrapper.addEventListener('input', (e) => {
            const target = e.target;
            const classData = getActiveClassData(); 

            // Assignment Total Editing Logic
            if (target.classList.contains('assignment-total-input')) {
                const unitId = target.dataset.unitId;
                const asgId = target.dataset.assignmentId;
                const cat = target.dataset.cat;
                const val = parseFloat(target.value) || 0;
                if (classData && unitId && asgId) {
                    const assignment = classData.units[unitId]?.assignments?.[asgId];
                    if (assignment) {
                        if (cat) { if (!assignment.categoryTotals) assignment.categoryTotals = {}; assignment.categoryTotals[cat] = val; } 
                        else { assignment.total = val; }
                        recalculateAndRenderAverages();
                        triggerAutoSave();
                    }
                }
                return;
            }

            // Category Renaming Logic
            if (target.classList.contains('cat-name-input')) {
                const cat = target.dataset.cat;
                const val = target.value.trim();
                if (classData && cat) {
                    if (!classData.categoryNames) classData.categoryNames = { k: 'Knowledge', t: 'Thinking', c: 'Communication', a: 'Application' };
                    classData.categoryNames[cat] = val || cat.toUpperCase();
                    renderGradebook(); 
                    triggerAutoSave();
                }
                return;
            }

            if (target.id === 'student-search-input') { renderGradebook(); return; }
            
            // Attendance Logic
            if (target.classList.contains('attendance-note-input')) {
                const studentRow = target.closest('.student-attendance-row');
                const datePicker = document.getElementById('attendance-date-picker');
                if (studentRow && datePicker && classData) {
                    const studentId = studentRow.dataset.studentId;
                    const selectedDate = datePicker.value;
                    const notes = target.value;
                    if (!classData.attendance[selectedDate]) classData.attendance[selectedDate] = {};
                    if (!classData.attendance[selectedDate][studentId]) {
                        const statusRadio = document.querySelector(`input[name="status-${studentId}"]:checked`);
                        const status = statusRadio ? statusRadio.value : 'present';
                        classData.attendance[selectedDate][studentId] = { status: status, notes: '' };
                    }
                    classData.attendance[selectedDate][studentId].notes = notes;
                    triggerAutoSave();
                }
                return; 
            }

            // Grade Input Logic
            if (target.classList.contains('grade-input')) {
                const studentId = target.dataset.studentId;
                const assignmentId = target.dataset.assignmentId;
                const category = target.dataset.cat;
                const rawValue = target.value.trim().toUpperCase();
                let storageValue;
                if (rawValue === '') { storageValue = null; } 
                else if (rawValue === 'M') { storageValue = 'M'; } 
                else { 
                    storageValue = parseFloat(rawValue); 
                    if (isNaN(storageValue)) { storageValue = null; } 
                }
                if (studentId && assignmentId && classData?.students?.[studentId]) {
                    if (!classData.students[studentId].grades) classData.students[studentId].grades = {};
                    if (!classData.students[studentId].grades[assignmentId]) classData.students[studentId].grades[assignmentId] = {};
                    let previousValue = null;
                    if (category) { previousValue = classData.students[studentId].grades[assignmentId][category]; }
                    const updateCell = (cat, val) => {
                        if (cat) { classData.students[studentId].grades[assignmentId][cat] = val; }
                        else { classData.students[studentId].grades[assignmentId].grade = val; }
                        const selector = cat 
                            ? `.grade-input[data-student-id="${studentId}"][data-assignment-id="${assignmentId}"][data-cat="${cat}"]`
                            : `.grade-input[data-student-id="${studentId}"][data-assignment-id="${assignmentId}"]`;
                        const inputEl = document.querySelector(selector);
                        if (inputEl) {
                            if (val === 'M' && inputEl.value !== 'M') inputEl.value = 'M';
                            else if (inputEl !== target) inputEl.value = val === null ? '' : val;
                            const parentTd = inputEl.closest('td');
                            if (parentTd) {
                                if (val === 0 || val === 'M') parentTd.classList.add('missing-cell');
                                else parentTd.classList.remove('missing-cell');
                            }
                        }
                    };
                    if (category) {
                        if (storageValue === 'M') { ['k', 't', 'c', 'a'].forEach(c => updateCell(c, 'M')); } 
                        else if (storageValue === null && previousValue === 'M') { ['k', 't', 'c', 'a'].forEach(c => updateCell(c, null)); }
                        else { updateCell(category, storageValue); }
                    } else { updateCell(null, storageValue); }
                    const unit = Object.values(classData.units || {}).find(u => u.assignments?.[assignmentId]);
                    const assignment = unit?.assignments?.[assignmentId];
                    let maxScore = Infinity;
                    if (unit?.isFinal) { maxScore = assignment?.total ?? Infinity; }
                    else if (category) { maxScore = assignment?.categoryTotals?.[category] ?? Infinity; }
                    const isValid = storageValue === 'M' || storageValue === null || (!isNaN(storageValue) && storageValue >= 0 && (maxScore === Infinity || storageValue <= maxScore));
                    target.classList.toggle('grade-input-error', !isValid && rawValue !== '');
                    recalculateAndRenderAverages(); 
                    triggerAutoSave();
                }
            }
           if (target.id === 'className' && classData) {
                 classData.name = target.textContent.trim();
                 triggerAutoSave(); 
            } else if (target.classList.contains('cat-weight-input') && classData) {
                 const cat = target.dataset.cat;
                 const value = parseFloat(target.value) || 0;
                 if (cat && classData.categoryWeights) {
                     classData.categoryWeights[cat] = value;
                     renderCategoryWeights(); 
                     renderGradebook(); 
                     triggerAutoSave(); 
                 }
            }     
        });
        
        contentWrapper.addEventListener('change', (e) => {
             if (e.target.id === 'unitFilterDropdown') {
                const appState = getAppState();
                if(appState.gradebook_data) appState.gradebook_data.activeUnitId = e.target.value;
                renderGradebook();
            }
            if (e.target.id === 'attendance-date-picker') { renderAttendanceSheet(e.target.value); }
            if (e.target.id === 'show-archived-checkbox') { renderClassTabs(); }
            if (e.target.classList.contains('iep-checkbox')) {
                const studentId = e.target.dataset.studentId;
                const classData = getActiveClassData(); 
                 if (studentId && classData?.students?.[studentId]) {
                     classData.students[studentId].iep = e.target.checked;
                     updateClassStats(); // Update stats
                     recalculateAndRenderAverages(); 
                     triggerAutoSave(); 
                 }
            }
           if (e.target.name.startsWith('status-')) {
                const classData = getActiveClassData();
                const studentRow = e.target.closest('.student-attendance-row');
                const datePicker = document.getElementById('attendance-date-picker');
                if (studentRow && datePicker && classData) {
                    const studentId = studentRow.dataset.studentId;
                    const status = e.target.value;
                    const selectedDate = datePicker.value;
                    if (!classData.attendance) classData.attendance = {};
                    if (!classData.attendance[selectedDate]) classData.attendance[selectedDate] = {};
                    const existingNotes = classData.attendance[selectedDate][studentId]?.notes || '';
                    classData.attendance[selectedDate][studentId] = { status: status, notes: existingNotes };
                    triggerAutoSave();
                }
            }
        });

        // Keydown/Drag listeners remain unchanged
        contentWrapper.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('grade-input')) { e.preventDefault(); e.target.blur(); }
            if (e.target.classList.contains('grade-input') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); handleGradebookNavigation(e.key, e.target); }
        });
        let draggedTab = null;
        contentWrapper.addEventListener('dragstart', (e) => {
            const target = e.target.closest('.tab-button');
            if (target) { draggedTab = target; setTimeout(() => { target.classList.add('dragging'); }, 0); }
        });
        contentWrapper.addEventListener('dragend', (e) => {
            if (draggedTab) {
                draggedTab.classList.remove('dragging');
                draggedTab = null;
                const appState = getAppState();
                const semesterData = getActiveSemesterData();
                if (!semesterData.classes) return;
                const classTabsContainer = document.getElementById('class-tabs-container');
                if (!classTabsContainer) return;
                const tabs = classTabsContainer.querySelectorAll('.tab-button');
                tabs.forEach((tab, index) => {
                    const classId = tab.dataset.classId;
                    if (semesterData.classes[classId]) { semesterData.classes[classId].order = index; }
                });
                triggerAutoSave();
            }
        });
        contentWrapper.addEventListener('dragover', (e) => {
            if (!draggedTab) return;
            e.preventDefault(); 
            const classTabsContainer = e.target.closest('#class-tabs-container');
            if (!classTabsContainer) return;
            const afterElement = getDragAfterElement(classTabsContainer, e.clientX);
            if (afterElement == null) { classTabsContainer.appendChild(draggedTab); } 
            else { classTabsContainer.insertBefore(draggedTab, afterElement); }
        });
        function getDragAfterElement(container, x) {
            const draggableElements = [...container.querySelectorAll('.tab-button:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = x - box.left - box.width / 2;
                if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; } 
                else { return closest; }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
    }

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('assignment-status-toggle')) {
            const unitId = e.target.dataset.unitId;
            const asgId = e.target.dataset.assignmentId;
            const isChecked = e.target.checked;
            const appState = getAppState();
            const activeClassId = appState.gradebook_data.activeClassId;
            if (appState.gradebook_data.semesters[appState.gradebook_data.activeSemester].classes[activeClassId].units[unitId].assignments[asgId]) {
                appState.gradebook_data.semesters[appState.gradebook_data.activeSemester].classes[activeClassId].units[unitId].assignments[asgId].isSubmitted = isChecked;
                triggerAutoSave();
                renderGradebook();
            }
        }
    });
    
    document.getElementById('sign-out-btn')?.addEventListener('click', () => signOut(supabaseClient));
    document.getElementById('account-management-btn')?.addEventListener('click', () => renderAccountPage(false));
    document.getElementById('backup-btn')?.addEventListener('click', backupData);
    document.getElementById('restore-btn')?.addEventListener('click', restoreData);
    document.getElementById('feedback-btn')?.addEventListener('click', showFeedbackModal);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#exportMenuBtn') && !e.target.closest('#exportMenuDropdown')) {
            document.getElementById('exportMenuDropdown')?.classList.add('hidden');
        }
    });
    ['mousemove', 'mousedown', 'keypress', 'click'].forEach(event => window.addEventListener(event, resetInactivityTimer));
}

// --- HELPER FUNCTIONS ---

function handleModalEnter(modal, currentInput) {
    // Get all visible, enabled inputs in the modal
    const inputs = Array.from(modal.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled])'));
    const currentIndex = inputs.indexOf(currentInput);

    if (currentIndex > -1 && currentIndex < inputs.length - 1) {
        // Focus the next input
        inputs[currentIndex + 1].focus();
    } else {
        // If it's the last input, trigger the Save/Confirm button
        const confirmBtn = document.getElementById('modal-confirm-btn');
        if (confirmBtn) confirmBtn.click();
    }
}

function handleGradebookNavigation(key, currentInput) {
    // Get all student rows
    const rows = Array.from(document.querySelectorAll('.student-row'));
    const currentRow = currentInput.closest('tr');
    const currentRowIndex = rows.indexOf(currentRow);

    // Get all inputs in the current row
    const currentInputs = Array.from(currentRow.querySelectorAll('.grade-input'));
    const currentInputIndex = currentInputs.indexOf(currentInput);

    if (key === 'ArrowRight') {
        if (currentInputIndex < currentInputs.length - 1) {
            currentInputs[currentInputIndex + 1].focus();
        }
    } else if (key === 'ArrowLeft') {
        if (currentInputIndex > 0) {
            currentInputs[currentInputIndex - 1].focus();
        }
    } else if (key === 'ArrowDown') {
        if (currentRowIndex < rows.length - 1) {
            const nextRow = rows[currentRowIndex + 1];
            const inputsInNextRow = Array.from(nextRow.querySelectorAll('.grade-input'));
            if (inputsInNextRow[currentInputIndex]) {
                inputsInNextRow[currentInputIndex].focus();
            }
        }
    } else if (key === 'ArrowUp') {
        if (currentRowIndex > 0) {
            const prevRow = rows[currentRowIndex - 1];
            const inputsInPrevRow = Array.from(prevRow.querySelectorAll('.grade-input'));
            if (inputsInPrevRow[currentInputIndex]) {
                inputsInPrevRow[currentInputIndex].focus();
            }
        }
    }
}