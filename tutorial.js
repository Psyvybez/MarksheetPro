// --- State ---
let currentStep = 0;
let tutorialSteps = [];
let highlightedElement = null;
let modalObserver = null;

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
    if (modalObserver) {
        modalObserver.disconnect(); 
        modalObserver = null;
    }

    currentStep++;
    if (currentStep < tutorialSteps.length) {
        if (highlightedElement) {
            highlightedElement.classList.remove('tutorial-highlighted-element');
        }
        // container.innerHTML = ''; // <-- We removed the backdrop line
        
        setTimeout(renderCurrentStep, 300); 
    } else {
        endTutorial();
    }
}

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
// ...
    const rect = elementToHighlight.getBoundingClientRect();
    container.innerHTML = `
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
            isWaiting: true 
        },
        {
            selector: '#modal-confirm-btn', 
            title: 'Create Your Class',
            content: 'Now, give your new class a name (e..g., "Grade 10 Math") and click "Add Class".',
            isWaiting: true,
            waitForModalClose: true // <-- ADD THIS
        },
        {
            selector: '.tab-button.active:not([data-tab-id="instructions"])', 
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
            isWaiting: true
        },
        {
            selector: '#modal-confirm-btn', 
            title: 'Set Up Units',
            content: 'Add your units and their weights (they must total 100%). When you\'re finished, click "Save Changes".',
            isWaiting: true,
            waitForModalClose: true // <-- ADD THIS
        },
        {
            selector: '#addStudentBtn',
            title: 'Add Your Students',
            content: 'Click here to add students one-by-one, or use "Import Students" to paste a list.',
            isWaiting: true
        },
        {
            selector: '#modal-cancel-btn', 
            title: 'Add a Student',
            content: 'Enter a student\'s name and click "Add & Next". You can add as many as you want. Click "Done" when you\'re finished.',
            isWaiting: true,
            waitForModalClose: true // <-- ADD THIS
        },
        {
            selector: '#unitFilterDropdown',
            title: 'Select a Unit',
            content: 'To add assignments, you must first select the unit they belong to from this dropdown.',
            isWaiting: true,
            listenFor: 'change'
        },
        {
            selector: '#addAssignmentBtn',
            title: 'Manage Assignments',
            content: 'Perfect. Now click this button to add assignments (like tests or quizzes) to the unit you selected.',
            isWaiting: true
        },
        {
            selector: '#modal-confirm-btn', 
            title: 'Add Assignments',
            content: 'Click "+ Add Assignment", fill in the details, and then click "Save Changes".',
            isWaiting: true,
            waitForModalClose: true // <-- ADD THIS
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
    
    if (targetElement && (targetElement === e.target || targetElement.contains(e.target))) {
        // User clicked the correct thing!
        
        if (step.waitForModalClose) {
            // --- NEW LOGIC ---
            // Don't advance yet. Wait for the modal to be removed.
            waitForModalClose(() => {
                setTimeout(nextStep, 100); // Wait for UI to draw
            });
        } else {
            // --- OLD LOGIC ---
            // This is for clicks that DON'T close a modal
            setTimeout(() => {
                nextStep();
            }, 100); 
        }
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
/**
 * Waits for the modal to be removed from the DOM.
 */
function waitForModalClose(callback) {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) {
        callback();
        return;
    }

    // Disconnect any previous observer
    if (modalObserver) {
        modalObserver.disconnect();
    }

    modalObserver = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            // Check if nodes were removed
            if (mutation.removedNodes.length > 0) {
                // Check if one of the removed nodes is the modal
                let modalWasRemoved = false;
                mutation.removedNodes.forEach(node => {
                    if (node.id === 'custom-modal') {
                        modalWasRemoved = true;
                    }
                });

                if (modalWasRemoved) {
                    modalObserver.disconnect();
                    modalObserver = null;
                    callback();
                    return;
                }
            }
        }
    });

    modalObserver.observe(modalContainer, { childList: true });
}