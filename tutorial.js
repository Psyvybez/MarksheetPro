// --- State ---
let currentStep = 0;
let tutorialSteps = [];
let highlightedElement = null;

// --- DOM Elements ---
const container = document.getElementById('tutorial-container');

// --- Core Functions ---

/**
 * Starts the tutorial.
 */
export function startTutorial() {
    if (!container) return;
    console.log("Starting tutorial...");
    currentStep = 0;
    defineSteps();
    renderCurrentStep();
    // Use 'true' for capture phase to intercept clicks
    document.addEventListener('click', handleTutorialClick, true);
    document.addEventListener('change', handleTutorialChange, true);
}

/**
 * Cleans up all tutorial elements and listeners.
 */
function endTutorial() {
    if (highlightedElement) {
        highlightedElement.classList.remove('tutorial-highlighted-element');
    }
    container.innerHTML = '';
    document.removeEventListener('click', handleTutorialClick, true);
    document.removeEventListener('change', handleTutorialChange, true);
    console.log("Tutorial ended.");
}

/**
 * Moves to the next step or ends the tutorial.
 */
function nextStep() {
    currentStep++;
    if (currentStep < tutorialSteps.length) {
        // Clear old UI before finding new element
        if (highlightedElement) {
            highlightedElement.classList.remove('tutorial-highlighted-element');
        }
        container.innerHTML = '<div id="tutorial-backdrop"></div>'; // Keep backdrop

        // Wait for UI to update (e.g., modal to close, new tab to render)
        setTimeout(renderCurrentStep, 300); 
    } else {
        endTutorial();
    }
}

/**
 * Renders the current step's spotlight and tooltip.
 */
/**
 * Renders the current step's spotlight and tooltip.
 */
/**
 * Renders the current step's spotlight and tooltip.
 */
function renderCurrentStep() {
    if (highlightedElement) {
        highlightedElement.classList.remove('tutorial-highlighted-element');
    }

    const step = tutorialSteps[currentStep];
    const targetElement = document.querySelector(step.selector);

    // If element isn't on the page yet, wait and try again.
    if (!targetElement) {
        setTimeout(() => {
            if (document.querySelector(step.selector)) {
                renderCurrentStep();
            } else {
                console.warn(`Tutorial: Element "${step.selector}" not found. Skipping.`);
                nextStep(); // Skip if still not found
            }
        }, 500);
        return;
    }
    
    // Check if target is in a modal
    const modalElement = targetElement.closest('#custom-modal');
    const elementToHighlight = modalElement || targetElement; 

    // --- 1. Create Spotlight & Tooltip ---
    // *** FIX: Get RECT for the element to highlight (modal or button) ***
    const rect = elementToHighlight.getBoundingClientRect();
    
    container.innerHTML = `
        <div id="tutorial-backdrop"></div>
        <div id="tutorial-spotlight"></div>
        <div id="tutorial-tooltip">
            <h4 class="font-bold mb-2">${step.title}</h4>
            <p class="text-sm">${step.content}</p>
            <div class="mt-4 flex justify-between items-center">
                <span class="text-xs text-gray-500">Step ${currentStep + 1} of ${tutorialSteps.length}</span>
                <div>
                    ${step.isWaiting ? '' : '<button id="tutorial-next-btn" class="bg-primary hover:bg-primary-dark text-white py-1 px-3 rounded-md text-sm">Next</button>'}
                    <button id="tutorial-skip-btn" class="ml-2 text-gray-500 hover:text-gray-800 text-sm">Skip</button>
                </div>
            </div>
        </div>
    `;

    // --- 2. Position Spotlight (based on elementToHighlight) ---
    const spotlight = document.getElementById('tutorial-spotlight');
    spotlight.style.width = `${rect.width + 10}px`;
    spotlight.style.height = `${rect.height + 10}px`;
    spotlight.style.top = `${rect.top - 5}px`;
    spotlight.style.left = `${rect.left - 5}px`;

    // --- 3. Position Tooltip (based on original targetElement) ---
    const tooltip = document.getElementById('tutorial-tooltip');
    
    // *** FIX: Get a NEW rect just for the original target button ***
    const targetRect = targetElement.getBoundingClientRect(); 
    
    let tooltipTop = targetRect.bottom + 15; // Use targetRect
    let tooltipLeft = targetRect.left + (targetRect.width / 2) - 150; // Use targetRect

    // Adjust if off-screen
    if (tooltipTop + 150 > window.innerHeight) { 
        tooltipTop = targetRect.top - 150 - 15; // Use targetRect
    }
    if (tooltipLeft < 10) tooltipLeft = 10;
    if (tooltipLeft + 300 > window.innerWidth) tooltipLeft = window.innerWidth - 310;

    tooltip.style.top = `${tooltipTop}px`;
    tooltip.style.left = `${tooltipLeft}px`;
    setTimeout(() => tooltip.classList.add('visible'), 50); // Fade in

    // --- 4. Highlight Target Element ---
    highlightedElement = elementToHighlight; // Highlight the modal
    highlightedElement.classList.add('tutorial-highlighted-element');

    // --- 5. Add Event Listeners ---
    document.getElementById('tutorial-skip-btn').addEventListener('click', endTutorial);
    const nextBtn = document.getElementById('tutorial-next-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextStep);
    }
}

/**
 * Defines the steps for the tutorial.
 */
function defineSteps() {
    tutorialSteps = [
        {
            selector: '#addClassBtn',
            title: 'Welcome!',
            content: 'Let\'s get you started. The first step is to create a class. Click this button.',
            isWaiting: true // Waits for a click on #addClassBtn
        },
        {
            selector: '#modal-confirm-btn', // The "Add Class" button INSIDE the modal
            title: 'Create Your Class',
            content: 'Now, give your new class a name (e..g., "Grade 10 Math") and click "Add Class".',
            isWaiting: true // Waits for a click on the modal's confirm button
        },
        {
            selector: '.tab-button.active:not([data-tab-id="instructions"])', // The new active class tab
            title: 'Your Class is Ready',
            content: 'Great! You are now inside your new class. This is the main gradebook view.',
            isWaiting: false
        },
        {
            selector: '#category-weights-container',
            title: 'Set Category Weights',
            content: 'Next, set your K/T/C/A weights. Make sure they add up to 100%. Click "Next" when you\'re done.',
            isWaiting: false
        },
        {
            selector: '#editUnitsBtn',
            title: 'Create Your Units',
            content: 'Now, let\'s set up the units for your course (e.g., "Unit 1: Algebra"). Click here.',
            isWaiting: true // Waits for click on #editUnitsBtn
        },
        {
            selector: '#modal-confirm-btn', // The "Save Changes" button in the Edit Units modal
            title: 'Set Up Units',
            content: 'Add your units and their weights (they must total 100%). When you\'re finished, click "Save Changes".',
            isWaiting: true // Waits for click on modal's confirm button
        },
        {
            selector: '#addStudentBtn',
            title: 'Add Your Students',
            content: 'Click here to add students one-by-one, or use "Import Students" to paste a list.',
            isWaiting: true // Waits for click on #addStudentBtn
        },
        {
            selector: '#modal-cancel-btn', // The "Done" button in the Add Student modal
            title: 'Add a Student',
            content: 'Enter a student\'s name and click "Add & Next". You can add as many as you want. Click "Done" when you\'re finished.',
            isWaiting: true // Waits for click on modal's CANCEL button
        },
        {
            selector: '#unitFilterDropdown',
            title: 'Select a Unit',
            content: 'To add assignments, you must first select the unit they belong to from this dropdown.',
            isWaiting: true,
            listenFor: 'change' // Special case: wait for a 'change' event
        },
        {
            selector: '#addAssignmentBtn',
            title: 'Manage Assignments',
            content: 'Perfect. Now click this button to add assignments (like tests or quizzes) to the unit you selected.',
            isWaiting: true // Waits for click on #addAssignmentBtn
        },
        {
            selector: '#modal-confirm-btn', // The "Save Changes" in the assignments modal
            title: 'Add Assignments',
            content: 'Click "+ Add Assignment", fill in the details, and then click "Save Changes".',
            isWaiting: true // Waits for click on modal's confirm button
        },
        {
            selector: '#gradebookTable tbody tr:first-child .grade-input:first-of-type',
            title: 'Enter Grades',
            content: 'Now you can type grades directly into the grid. All changes are saved automatically. Click "Next" to finish.',
            isWaiting: false
        },
        {
            selector: '#account-management-btn',
            title: 'You\'re All Set!',
            content: 'That\'s it! You can explore other features like Attendance or PDF Exports. Click "My Account" to manage your profile.',
            isWaiting: false
        }
    ];
}

/**
 * Global click listener to advance "waiting" steps.
 */
function handleTutorialClick(e) {
    if (currentStep >= tutorialSteps.length) return; // Tutorial is over
    
    const step = tutorialSteps[currentStep];
    
    if (!step.isWaiting) return; // Not a waiting step
    if (step.listenFor === 'change') return; // This step is waiting for a change, not a click

    const targetElement = document.querySelector(step.selector);
    
    // Check if the click was *on* or *inside* the highlighted element
    if (targetElement && (targetElement === e.target || targetElement.contains(e.target))) {
        // User clicked the correct thing!
        // Let the original click event finish...
        setTimeout(() => {
            nextStep();
        }, 100); // Small delay to let the UI react to the click (e.g., modal opening)
    }
}
/**
 * Global change listener to advance "waiting" steps.
 */
function handleTutorialChange(e) {
    if (currentStep >= tutorialSteps.length) return; // Tutorial is over
    
    const step = tutorialSteps[currentStep];
    if (!step.isWaiting || step.listenFor !== 'change') return; // Not a waiting 'change' step

    const targetElement = document.querySelector(step.selector);
    
    // Check if the change was *on* the highlighted element
    if (targetElement && (targetElement === e.target)) {
        // User changed the correct thing!
        setTimeout(() => {
            nextStep();
        }, 100); 
    }
}