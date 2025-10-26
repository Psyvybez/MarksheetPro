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

    // --- 1. Create Spotlight & Tooltip ---
    const rect = targetElement.getBoundingClientRect();
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

    // --- 2. Position Spotlight ---
    const spotlight = document.getElementById('tutorial-spotlight');
    spotlight.style.width = `${rect.width + 10}px`;
    spotlight.style.height = `${rect.height + 10}px`;
    spotlight.style.top = `${rect.top - 5}px`;
    spotlight.style.left = `${rect.left - 5}px`;

    // --- 3. Position Tooltip ---
    const tooltip = document.getElementById('tutorial-tooltip');
    let tooltipTop = rect.bottom + 15;
    let tooltipLeft = rect.left + (rect.width / 2) - 150; // 150 = half of 300px width

    // Adjust if off-screen
    if (tooltipTop + 150 > window.innerHeight) { 
        tooltipTop = rect.top - 150 - 15; // Place above
    }
    if (tooltipLeft < 10) tooltipLeft = 10;
    if (tooltipLeft + 300 > window.innerWidth) tooltipLeft = window.innerWidth - 310;

    tooltip.style.top = `${tooltipTop}px`;
    tooltip.style.left = `${tooltipLeft}px`;
    setTimeout(() => tooltip.classList.add('visible'), 50); // Fade in

    // --- 4. Highlight Target Element ---
    highlightedElement = targetElement;
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
            title: 'Welcome to Marksheet Pro!',
            content: 'Let\'s get you started. The first step is to create a class. Click this button.',
            isWaiting: true // Waits for a click on the element
        },
        {
            selector: '.tab-button.active', // After creating a class, it becomes active
            title: 'Your Class is Ready',
            content: 'Great! You are now inside your new class. This is the main gradebook view.',
            isWaiting: false
        },
        {
            selector: '#category-weights-container',
            title: 'Set Category Weights',
            content: 'Next, set your K/T/C/A weights. Make sure they add up to 100%.',
            isWaiting: false
        },
        {
            selector: '#editUnitsBtn',
            title: 'Create Your Units',
            content: 'Now, let\'s set up the units for your course (e.g., "Unit 1: Algebra"). Click here.',
            isWaiting: true
        },
        {
            selector: '#addStudentBtn',
            title: 'Add Your Students',
            content: 'Once your units are set up, add your students. Click here to add one by one, or use "Import Students" to paste a list.',
            isWaiting: true
        },
        {
            selector: '#unitFilterDropdown',
            title: 'Select a Unit',
            content: 'To add assignments, you must first select the unit they belong to from this dropdown.',
            isWaiting: true
        },
        {
            selector: '#addAssignmentBtn',
            title: 'Manage Assignments',
            content: 'Perfect. Now click this button to add assignments (like tests or quizzes) to the unit you selected.',
            isWaiting: true
        },
        {
            selector: '#gradebookTable tbody tr:first-child .grade-input:first-of-type',
            title: 'Enter Grades',
            content: 'After adding assignments, you can type grades directly into the grid. All changes are saved automatically.',
            isWaiting: true
        },
        {
            selector: '#account-management-btn',
            title: 'You\'re All Set!',
            content: 'That\'s it! You can explore other features like Attendance, PDF Exports, or manage your profile here. Enjoy!',
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