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
    document.body.style.overflow = 'hidden'; // <-- LOCK SCROLLING
    currentStep = 0;
    defineSteps();
    renderCurrentStep();
    // Use 'true' for capture phase to intercept clicks
    document.addEventListener('click', handleTutorialClick, true);
    document.addEventListener('change', handleTutorialChange, true);
    document.addEventListener('input', handleTutorialInput, true);
    document.addEventListener('keydown', handleTutorialKeydown, true); 
    document.addEventListener('blur', handleTutorialBlur, true);     
}

/**
 * Cleans up all tutorial elements and listeners.
 */
function endTutorial() {
    if (highlightedElement) {
        highlightedElement.classList.remove('tutorial-highlighted-element');
    }
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    if (modalConfirmBtn) {
        modalConfirmBtn.disabled = false;
    }
    document.body.style.overflow = '';
    container.innerHTML = '';
    document.removeEventListener('click', handleTutorialClick, true);
    document.removeEventListener('change', handleTutorialChange, true);
    document.removeEventListener('input', handleTutorialInput, true); 
    document.removeEventListener('keydown', handleTutorialKeydown, true);
    document.removeEventListener('blur', handleTutorialBlur, true);
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
        const modalElement = highlightedElement.closest('#custom-modal');
        if (modalElement) {
            modalElement.style.zIndex = 50; // Reset to original
        }
            highlightedElement.classList.remove('tutorial-highlighted-element');
        }
        
        setTimeout(renderCurrentStep, 300); 
    } else {
        endTutorial();
    }
}

/**
 * Renders the current step's spotlight and tooltip.
 */
function handleTutorialClick(e) {
    // Check if tutorial is active and get step data immediately
    if (currentStep >= tutorialSteps.length) return;
    const step = tutorialSteps[currentStep];
    if (!step) return; // Safety check

    // Ignore clicks if not a waiting step or waiting for a different event type
    if (!step.isWaiting || step.listenFor === 'change' || step.listenFor === 'input' || step.listenFor === 'enter-or-blur') {
        return;
    }

    const targetElement = document.querySelector(step.selector);

    // Check if the click was on the highlighted element
    if (targetElement && (targetElement === e.target || targetElement.contains(e.target))) {
        
        // --- Prevent the default action (like opening the modal) for NOW ---
        e.stopPropagation();
        e.preventDefault();

        // --- Logic to advance ---
        if (step.waitForModalClose) {
            // This case shouldn't happen for Step 1, but keep for robustness
            waitForModalClose(() => {
                setTimeout(nextStep, 100); 
            });
        } else {
            // For Step 1 (and others without waitForModalClose):
            // 1. Advance the tutorial state in the next event cycle
            setTimeout(() => {
                nextStep(); 
                
                // 2. AFTER advancing, manually trigger the original button's action
                //    We need to find the element again as it might have been re-rendered
                const originalTarget = document.querySelector(step.selector);
                if (originalTarget) {
                    originalTarget.click(); // Now open the modal
                }
            }, 0); // Use 0ms timeout
        }
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
            selector: '#class-name-input', // Step 2: Highlight the input
            title: 'Name Your Class',
            content: 'First, enter a name for your class (e.g., "Grade 10 Math").',
            isWaiting: true,
            listenFor: 'enter-or-blur'
        },
        {
            selector: '#modal-confirm-btn', // Step 3: Highlight the button
            title: 'Create Your Class',
            content: 'Great! Now click "Add Class" to create it.',
            isWaiting: true,
            waitForModalClose: true
        },
        {
            selector: '.tab-button.active:not([data-tab-id="instructions"])', 
            title: 'Your Class is Ready',
            content: 'You are now inside your new class. This is the main gradebook view.',
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
            waitForModalClose: true,
            tooltipPosition: 'left' // <-- HINT FOR TOOLTIP PLACEMENT
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
            waitForModalClose: true
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
            waitForModalClose: true
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
if (step.listenFor === 'enter-or-blur') return;
    const step = tutorialSteps[currentStep];
    
    if (!step.isWaiting) return; 
    if (step.listenFor === 'change') return;
    if (step.listenFor === 'input') return; // <-- ADD THIS

    const targetElement = document.querySelector(step.selector);
    
    if (targetElement && (targetElement === e.target || targetElement.contains(e.target))) {
        if (step.waitForModalClose) {
            waitForModalClose(() => {
                setTimeout(nextStep, 100); 
            });
        } else {
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
    if (step.listenFor === 'enter-or-blur') return;
    if (currentStep >= tutorialSteps.length) return;
    const step = tutorialSteps[currentStep];

    if (!step.isWaiting || step.listenFor !== 'change') return; 
    if (step.listenFor === 'input') return; // <-- ADD THIS

    const targetElement = document.querySelector(step.selector);
    
    if (targetElement && (targetElement === e.target)) {
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
/**
 * Global input listener to advance "waiting" steps.
 */
/**
 * Global input listener to advance "waiting" steps.
 */
function handleTutorialInput(e) {
    if (currentStep >= tutorialSteps.length) return;
    const step = tutorialSteps[currentStep];

    // We no longer advance on 'input', but we still need to
    // stop 'input' from being processed by other listeners.
    if (!step.isWaiting) return;
    if (step.listenFor === 'input') {
        // This block is now just a placeholder in case you
        // want to add 'input' listeners back later.
    }
}
/**
 * Global keydown listener for 'Enter' key.
 */
function handleTutorialKeydown(e) {
    if (currentStep >= tutorialSteps.length) return;
    const step = tutorialSteps[currentStep];

    // Only act on the 'enter-or-blur' step and if 'Enter' was pressed
    if (!step.isWaiting || step.listenFor !== 'enter-or-blur' || e.key !== 'Enter') {
        return;
    }

    const targetElement = document.querySelector(step.selector);
    if (targetElement && (targetElement === e.target)) {
        if (targetElement.value.trim() !== '') {
            e.preventDefault(); // Stop 'Enter' from submitting a form
            nextStep();
        }
    }
}

/**
 * Global blur listener for clicking off an element.
 */
function handleTutorialBlur(e) {
    if (currentStep >= tutorialSteps.length) return;
    const step = tutorialSteps[currentStep];

    // Only act on the 'enter-or-blur' step
    if (!step.isWaiting || step.listenFor !== 'enter-or-blur') {
        return;
    }

    const targetElement = document.querySelector(step.selector);
    if (targetElement && (targetElement === e.target)) {
        if (targetElement.value.trim() !== '') {
            nextStep();
        }
    }
}