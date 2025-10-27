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
    document.addEventListener('input', handleTutorialInput, true); // <-- ADD INPUT LISTENER
}

/**
 * Cleans up all tutorial elements and listeners.
 */
function endTutorial() {
    if (highlightedElement) {
        highlightedElement.classList.remove('tutorial-highlighted-element');
    }
    document.body.style.overflow = ''; // <-- UNLOCK SCROLLING
    container.innerHTML = '';
    document.removeEventListener('click', handleTutorialClick, true);
    document.removeEventListener('change', handleTutorialChange, true);
    document.removeEventListener('input', handleTutorialInput, true); // <-- REMOVE INPUT LISTENER
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
    
    // --- NEW: SCROLL TO ELEMENT FIRST ---
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll to finish before drawing
    setTimeout(() => {
        const modalElement = targetElement.closest('#custom-modal');
        const elementToHighlight = modalElement || targetElement; 

        // Get rect *after* scrolling
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

        // Position Spotlight
        const spotlight = document.getElementById('tutorial-spotlight');
        spotlight.style.width = `${rect.width + 10}px`;
        spotlight.style.height = `${rect.height + 10}px`;
        spotlight.style.top = `${rect.top - 5}px`;
        spotlight.style.left = `${rect.left - 5}px`;

        // Position Tooltip
        const tooltip = document.getElementById('tutorial-tooltip');
        const targetRect = targetElement.getBoundingClientRect(); 
        
        let tooltipTop, tooltipLeft;

        // --- NEW: TOOLTIP POSITION LOGIC ---
        if (step.tooltipPosition === 'left') {
            tooltipLeft = targetRect.left - 300 - 15; // 300 = tooltip width
            tooltipTop = targetRect.top;
        } else {
            // Default logic
            tooltipTop = targetRect.bottom + 15;
            tooltipLeft = targetRect.left + (targetRect.width / 2) - 150;
        }

        // Adjust if off-screen (keep this)
        if (tooltipTop < 10) tooltipTop = 10;
        if (tooltipLeft < 10) tooltipLeft = 10;
        if (tooltipTop + 150 > window.innerHeight) { 
             tooltipTop = targetRect.top - 150 - 15; // Place above
        }
        if (tooltipLeft + 300 > window.innerWidth) {
            tooltipLeft = window.innerWidth - 310;
        }

        tooltip.style.top = `${tooltipTop}px`;
        tooltip.style.left = `${tooltipLeft}px`;
        setTimeout(() => tooltip.classList.add('visible'), 50);

        // Highlight Target Element
        highlightedElement = elementToHighlight;
        highlightedElement.classList.add('tutorial-highlighted-element');

        // Add Event Listeners
        document.getElementById('tutorial-skip-btn').addEventListener('click', endTutorial);
        const nextBtn = document.getElementById('tutorial-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', nextStep);
        }
    }, 300); // 300ms for smooth scroll
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
            listenFor: 'input' // Wait for user to type
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
    if (currentStep >= tutorialSteps.length) return;
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
function handleTutorialInput(e) {
    if (currentStep >= tutorialSteps.length) return;
    const step = tutorialSteps[currentStep];

    if (!step.isWaiting || step.listenFor !== 'input') return;

    const targetElement = document.querySelector(step.selector);
    
    // Check if the input was *on* the highlighted element
    if (targetElement && (targetElement === e.target)) {
        // Advance only if the input is not empty
        if (targetElement.value.trim() !== '') {
            setTimeout(() => {
                nextStep();
            }, 100);
        }
    }
}