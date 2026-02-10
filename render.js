import { getAppState, getActiveSemesterData, getActiveClassData } from './state.js';
import { recalculateAndRenderAverages, calculateStudentAverages, calculateClassAverages } from './calculations.js';
import { getProfilePictureUrl, uploadProfilePicture } from './api.js';
import { showModal } from './ui.js';
import { triggerAutoSave } from './main.js';
import { exportStudentPDF, deleteStudent } from './actions.js';

let contentWrapper;
document.addEventListener('DOMContentLoaded', () => {
    contentWrapper = document.getElementById('content-wrapper');
});

function adjustStickyHeaders() {
    requestAnimationFrame(() => {
        const firstHeaderRow = document.querySelector('#gradebookTable thead tr:first-child');
        const secondHeaderRow = document.querySelector('#gradebookTable thead tr:nth-child(2)');

        if (firstHeaderRow && secondHeaderRow) {
            const height1 = firstHeaderRow.getBoundingClientRect().height;
            const height2 = secondHeaderRow.getBoundingClientRect().height;

            document.documentElement.style.setProperty('--header-row-1-height', `${height1}px`);
            document.documentElement.style.setProperty('--header-row-2-height', `${height1 + height2}px`);
        }
    });
}

export function renderClassTabs() {
    const classTabsContainer = document.getElementById('class-tabs-container');
    if (!classTabsContainer) return;

    const semesterData = getActiveSemesterData();
    const classes = semesterData.classes || {};
    const appState = getAppState();
    const activeClassId = appState.gradebook_data.activeClassId;
    const showArchived = document.getElementById('show-archived-checkbox')?.checked;

    classTabsContainer.innerHTML = '';
    Object.values(classes)
        .filter(classData => showArchived || !classData.isArchived)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach(classData => {
            const tabButton = document.createElement('button');
            const isArchived = classData.isArchived;
            tabButton.className = `tab-button shrink-0 py-4 px-1 border-b-2 font-medium text-sm ${classData.id === activeClassId ? 'active' : ''} ${isArchived ? 'text-gray-400 italic' : ''}`;
            tabButton.textContent = classData.name + (isArchived ? ' (Archived)' : '');
            tabButton.dataset.tabId = classData.id;
            tabButton.dataset.classId = classData.id;
            tabButton.draggable = true;
            classTabsContainer.appendChild(tabButton);
        });
}

export function renderUnitFilter() {
    const classData = getActiveClassData();
    const dropdown = document.getElementById('unitFilterDropdown');
    const appState = getAppState();
    if (!classData || !dropdown) {
        if (dropdown) dropdown.innerHTML = '';
        return;
    }

    const units = classData.units || {};
    let activeUnitId = appState.gradebook_data.activeUnitId = appState.gradebook_data.activeUnitId || 'all';

    let optionsHtml = `<option value="all">All Units</option>`;
    Object.values(units).filter(u => !u.isFinal).sort((a,b) => a.order - b.order).forEach(unit => {
         const displayTitle = unit.title ? `Unit ${unit.order}: ${unit.title}` : `Unit ${unit.order}`;
         optionsHtml += `<option value="${unit.id}" ${unit.id === activeUnitId ? 'selected' : ''}>${displayTitle}</option>`;
    });
    const finalUnit = Object.values(units).find(u => u.isFinal);
    if (finalUnit) {
         optionsHtml += `<option value="${finalUnit.id}" ${finalUnit.id === activeUnitId ? 'selected' : ''}>${finalUnit.title || 'Final Assessment'}</option>`;
    }
    dropdown.innerHTML = optionsHtml;
}

export function updateClassStats() {
    const classData = getActiveClassData();
    const statsContainer = document.getElementById('class-stats-container');
    if (!classData || !statsContainer) return;

    const students = classData.students || {};
    const totalStudents = Object.keys(students).length;
    const iepCount = Object.values(students).filter(s => s.iep).length;

    statsContainer.innerHTML = `
        <span class="text-gray-600">Students: <strong class="text-gray-800">${totalStudents}</strong></span>
        <span class="text-gray-300">|</span>
        <span class="text-gray-600">IEP: <strong class="text-indigo-600">${iepCount}</strong></span>
    `;
}

//
//
//
//
export function renderCategoryWeights() {
    const classData = getActiveClassData();
    const container = document.getElementById('category-weights-container');
    if (!classData || !container) return;

    classData.categoryWeights = classData.categoryWeights || {};
    // Ensure default names are full words
    classData.categoryNames = classData.categoryNames || { k: 'Knowledge', t: 'Thinking', c: 'Communication', a: 'Application' };
    
    const defaults = { k: 25, t: 25, c: 25, a: 25 };
    const weights = { ...defaults, ...classData.categoryWeights };
    const names = classData.categoryNames;
    
    classData.categoryWeights = weights;

    // Helper: Card Layout (Name on top, Weight on bottom)
    const makeInput = (key, defaultPlaceholder) => `
        <div class="flex flex-col items-center justify-center p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <input type="text" 
                   data-cat="${key}" 
                   class="cat-name-input w-full text-center font-bold text-gray-600 text-sm mb-2 border-b-2 border-transparent hover:border-gray-200 focus:border-indigo-500 focus:outline-none transition-colors bg-transparent px-1" 
                   value="${names[key]}" 
                   placeholder="${defaultPlaceholder}">
            
            <div class="flex items-center justify-center bg-gray-50 rounded px-3 py-1 border border-gray-200">
                <input type="number" 
                       step="0.1" 
                       data-cat="${key}" 
                       class="cat-weight-input w-12 text-center font-bold text-gray-900 text-lg bg-transparent focus:outline-none" 
                       value="${weights[key]}">
                <span class="text-gray-500 font-bold ml-1">%</span>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="flex flex-col xl:flex-row items-stretch gap-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 flex-grow w-full">
                ${makeInput('k', 'Knowledge')}
                ${makeInput('t', 'Thinking')}
                ${makeInput('c', 'Communication')}
                ${makeInput('a', 'Application')}
            </div>
            
            <div class="flex items-center justify-center p-4 rounded-lg shadow-sm border min-w-[140px]" id="cat-weight-total-container">
                <span class="text-xl font-bold" id="cat-weight-total"></span>
            </div>
        </div>
    `;

    const updateTotal = () => {
        let total = 0;
        container.querySelectorAll('.cat-weight-input').forEach(input => {
            total += parseFloat(input.value) || 0;
        });
        const totalEl = document.getElementById('cat-weight-total');
        const totalContainer = document.getElementById('cat-weight-total-container');
        if(!totalEl || !totalContainer) return;

        totalEl.textContent = `Total: ${Number(total.toFixed(1))}%`;
        
        // Green if 100%, Red otherwise
        const isTotal100 = Math.abs(total - 100) < 0.1; 
        totalContainer.className = `flex items-center justify-center p-4 rounded-lg shadow-sm border min-w-[140px] transition-colors ${
            isTotal100 
            ? 'bg-green-50 text-green-700 border-green-200' 
            : 'bg-red-50 text-red-700 border-red-200'
        }`;
    };
    updateTotal();
}

//
export function renderGradebook() {
    const classData = getActiveClassData();
    const table = document.getElementById('gradebookTable');
    const classNameEl = document.getElementById('className');
    const appState = getAppState();

    if (!classData || !table || !classNameEl) return;

    // --- 1. APPLY ZOOM (Default 80%) ---
    // Change default from 1 to 0.8
    const savedZoom = appState.gradebook_data.zoomLevel || 0.8; 
    
    // Apply to the MAIN CONTAINER, not just the table
    const contentArea = document.getElementById('main-content-area');
    if (contentArea) contentArea.style.zoom = savedZoom;

    const zoomText = document.getElementById('zoom-level-text');
    if(zoomText) zoomText.textContent = `${Math.round(savedZoom * 100)}%`;
    // -------------------------------------

    // 2. Stats & Basic UI
    updateClassStats(); // Ensure this helper function exists in your file
    document.body.classList.toggle('has-final', classData.hasFinal);
    document.body.classList.toggle('no-final', !classData.hasFinal);
    classNameEl.textContent = classData.name;

    const students = classData.students || {};
    const allUnits = classData.units || {};
    
    // 3. Category Names
    const catNames = classData.categoryNames || { k: 'Knowledge', t: 'Thinking', c: 'Communication', a: 'Application' };
    
    // Helper: Gets "K" from "Knowledge"
    const getLet = (key) => {
        const name = catNames[key];
        return (name && name.length > 0) ? name.trim().charAt(0).toUpperCase() : key.toUpperCase();
    };

    let activeUnitId = appState.gradebook_data?.activeUnitId;
    let unitsToDisplay = allUnits;
    if (activeUnitId && activeUnitId !== 'all') {
        if (allUnits[activeUnitId]) {
            unitsToDisplay = { [activeUnitId]: allUnits[activeUnitId] };
        } else {
            activeUnitId = 'all';
            if (appState.gradebook_data) appState.gradebook_data.activeUnitId = 'all';
        }
    }

    // 4. Build Headers
    const studentInfoHeaders = `
        <th class="student-info-header p-3 text-left">Student Name</th>
        <th class="student-info-header p-3 text-center">IEP</th>
        <th class="student-info-header p-3 text-center">Overall</th>
        <th class="student-info-header p-3 text-center">Term</th>
        <th class="student-info-header p-3 text-center">Midterm</th>
        ${classData.hasFinal ? `<th class="student-info-header p-3 text-center">Final</th>` : ''}
        <th class="p-3 text-center" title="${catNames.k}">${getLet('k')}%</th>
        <th class="p-3 text-center" title="${catNames.t}">${getLet('t')}%</th>
        <th class="p-3 text-center" title="${catNames.c}">${getLet('c')}%</th>
        <th class="p-3 text-center" title="${catNames.a}">${getLet('a')}%</th>`;
        
    const studentInfoColCount = classData.hasFinal ? 6 : 5;
    const nonStickyColCount = 4;

    const thead = table.querySelector('thead');
    let headerHtml1 = `<tr class="bg-gray-50"><th class="student-info-header-blank" colspan="${studentInfoColCount}"></th><th colspan="${nonStickyColCount}"></th>`;
    let headerHtml2 = `<tr><th class="student-info-header-blank" colspan="${studentInfoColCount}"></th><th colspan="${nonStickyColCount}"></th>`;
    let headerHtml3 = `<tr class="bg-gray-50">${studentInfoHeaders}`;

    Object.values(unitsToDisplay).sort((a,b) => a.order - b.order).forEach(unit => {
        const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
        const colspan = unit.isFinal ? assignments.length : assignments.length * 4;
        
        const titleText = unit.title ? `: ${unit.title}` : '';
        const subtitleText = unit.subtitle ? ` - ${unit.subtitle}` : '';
        const displayTitle = unit.isFinal ? 'Final Assessment' : `Unit ${unit.order}${titleText}${subtitleText}`;

        headerHtml1 += `<th colspan="${colspan || 1}" class="p-3 text-sm font-semibold tracking-wide text-center border-l-2 border-gray-400">${displayTitle}</th>`;

        if(assignments.length === 0){
            headerHtml2 += `<td colspan="${colspan || 1}" class="p-3 text-center text-xs text-gray-400 border-l-2 border-gray-400 italic">No assignments</td>`;
            headerHtml3 += `<td colspan="${colspan || 1}" class="border-l-2 border-gray-400"></td>`;
        } else {
            assignments.forEach(asg => {
                const weightText = asg.weight && asg.weight !== 1 ? `<span class="text-xs font-normal text-gray-500">(x${asg.weight})</span>` : '';
                const isSubmitted = asg.isSubmitted || false;
                const submittedClass = isSubmitted ? 'submitted-assignment-col' : '';
                const checked = isSubmitted ? 'checked' : '';
                
                const toggleHtml = `<div class="mt-1 flex items-center justify-center gap-1"><input type="checkbox" class="assignment-status-toggle" data-unit-id="${unit.id}" data-assignment-id="${asg.id}" ${checked}><label class="text-[9px] text-blue-600 font-bold uppercase cursor-pointer">Submitted</label></div>`;

                if(unit.isFinal) {
                    headerHtml2 += `<th class="p-3 text-xs font-medium text-gray-500 tracking-wider text-center border-l-2 border-gray-400 ${submittedClass}">${asg.name}<br>${weightText}${toggleHtml}</th>`;
                    headerHtml3 += `<th class="p-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-center border-l-2 border-gray-400 assignment-header-cell ${submittedClass}">Score<br><span class="font-normal">${asg.total || 0}</span></th>`;
                } else {
                    headerHtml2 += `<th colspan="4" class="p-3 text-xs font-medium text-gray-500 tracking-wider text-center border-l-2 border-gray-400 ${submittedClass}">${asg.name}<br>${weightText}${toggleHtml}</th>`;
                    ['k','t','c','a'].forEach(cat => {
                        const borderClass = cat === 'k' ? 'border-l-2 border-gray-400' : 'border-l';
                        headerHtml3 += `<th class="p-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-center ${borderClass} assignment-header-cell ${submittedClass}" title="${catNames[cat]}">${getLet(cat)}<br><span class="font-normal">${asg.categoryTotals?.[cat] || 0}</span></th>`;
                    });
                }
            });
        }
    });
    thead.innerHTML = headerHtml1 + '</tr>' + headerHtml2 + '</tr>' + headerHtml3 + '</tr>';

    const tbody = table.querySelector('tbody');
    const searchTerm = document.getElementById('student-search-input')?.value.toLowerCase() || '';
    const studentIds = Object.keys(students).filter(id => {
        const student = students[id];
        const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
        return fullName.includes(searchTerm);
    });

    if (studentIds.length === 0) {
        const message = Object.keys(students).length === 0 ? "No students yet. Click '+ Add Student' to get started." : "No students match your search.";
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center p-8 text-gray-500">${message}</td></tr>`;
    } else {
        tbody.innerHTML = studentIds.sort((a, b) => {
            const lastNameA = String(students[a]?.lastName || '');
            const lastNameB = String(students[b]?.lastName || '');
            return lastNameA.localeCompare(lastNameB);
        }).map(studentId => {
            const student = students[studentId];
            const midtermDisplayValue = (student.midtermGrade !== null && student.midtermGrade !== undefined) ? student.midtermGrade.toFixed(1) : '';
            const midtermDisplayScore = midtermDisplayValue !== '' ? `${midtermDisplayValue}%` : '--';
            const profilePicUrl = student.profilePicturePath ? getProfilePictureUrl(student.profilePicturePath) : null;
            const profilePicHtml = profilePicUrl
                ? `<img src="${profilePicUrl}" class="w-8 h-8 rounded-full mr-2 object-cover">`
                : `<div class="w-8 h-8 rounded-full mr-2 bg-gray-300 flex items-center justify-center text-white font-bold">${student.firstName.charAt(0)}${student.lastName.charAt(0)}</div>`;
            const hasNotes = student.generalNotes && student.generalNotes.trim().length > 0;
            const noteIndicator = hasNotes ? `<span class="text-accent text-xl leading-none ml-1 relative top-1" title="Has General Note">*</span>` : '';

            let rowHtml = `<tr class="student-row" data-student-id="${studentId}">
                <td class="p-0 border-t border-gray-200">
                    <div class="flex items-center pl-2 h-full">
                        <button class="delete-btn text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 mr-2 rounded transition-colors" title="Delete Student" style="background: none; width: auto; height: auto;">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <button class="student-name-btn flex items-center p-2 flex-grow text-left hover:bg-gray-50 rounded">
                            ${profilePicHtml}<span class="font-medium text-gray-700">${student.lastName}, ${student.firstName}</span>${noteIndicator}
                        </button>
                    </div>
                </td>
                <td class="p-3 text-center"><input type="checkbox" class="iep-checkbox h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" data-student-id="${studentId}" ${student.iep ? 'checked' : ''}></td>
                <td class="p-3 text-center font-semibold student-overall">--%</td>
                <td class="p-3 text-center font-semibold student-term-mark">--%</td>
                <td class="p-3 text-center font-semibold student-midterm">${midtermDisplayScore}</td>
                ${classData.hasFinal ? `<td class="p-3 text-center font-semibold student-final">--%</td>` : ''}
                <td class="p-3 text-center font-semibold student-cat-k">--%</td>
                <td class="p-3 text-center font-semibold student-cat-t">--%</td>
                <td class="p-3 text-center font-semibold student-cat-c">--%</td>
                <td class="p-3 text-center font-semibold student-cat-a">--%</td>`;
            
            Object.values(unitsToDisplay).sort((a,b) => a.order - b.order).forEach(unit => {
                const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
                if(assignments.length === 0) {
                    rowHtml += `<td class="border-l-2 border-gray-400"></td>`;
                } else {
                    assignments.forEach(asg => {
                        const isSubmitted = asg.isSubmitted || false;
                        const subClass = isSubmitted ? 'submitted-assignment-col' : '';
                        const getCellClass = (val) => {
                             if (!val && val !== 0) return '';
                             const s = String(val).toUpperCase();
                             return (s === 'M' || s === '0') ? 'missing-cell' : '';
                        };

                        if (unit.isFinal) {
                            const score = student.grades?.[asg.id]?.grade ?? '';
                            rowHtml += `<td class="p-0 border-l-2 border-gray-400 ${subClass} ${getCellClass(score)}"><input type="text" class="grade-input" data-student-id="${studentId}" data-assignment-id="${asg.id}" value="${score}"></td>`;
                        } else {
                            ['k','t','c','a'].forEach(cat => {
                                const score = student.grades?.[asg.id]?.[cat] ?? '';
                                const borderClass = cat === 'k' ? 'border-l-2 border-gray-400' : 'border-l';
                                rowHtml += `<td class="p-0 ${borderClass} ${subClass} ${getCellClass(score)}"><input type="text" class="grade-input" data-student-id="${studentId}" data-assignment-id="${asg.id}" data-cat="${cat}" value="${score}"></td>`;
                            });
                        }
                    });
                }
            });
            return rowHtml + `</tr>`;
        }).join('');
    }

    const tfoot = table.querySelector('tfoot');
    let footerCells = [`<td class="p-3 text-left">Class Average</td>`, `<td></td>`, `<td class="class-overall text-center">--%</td>`, `<td class="class-term-mark text-center">--%</td>`, `<td></td>`];
    if (classData.hasFinal) footerCells.push(`<td class="class-final text-center">--%</td>`);
    footerCells.push(`<td></td>`, `<td></td>`, `<td></td>`, `<td></td>`);
    let footerHtml = `<tr class="bg-gray-50 font-semibold">${footerCells.join('')}`;

    Object.values(unitsToDisplay).sort((a,b) => a.order - b.order).forEach(unit => {
        const assignments = Object.values(unit.assignments || {});
        const colspan = unit.isFinal ? (assignments.length || 1) : (assignments.length * 4 || 1);
        footerHtml += `<td colspan="${colspan}" class="p-3 border-l-2 border-gray-400"></td>`;
    });
    tfoot.innerHTML = footerHtml + `</tr>`;

    adjustStickyHeaders();
    recalculateAndRenderAverages();
}

export function updateUIFromState() {
    const appState = getAppState();
    if(!appState.gradebook_data) return;
    
    const semesterBtn1 = document.getElementById('semesterBtn1');
    const semesterBtn2 = document.getElementById('semesterBtn2');
    const mainContent = document.getElementById('main-content-area');
    const instructionsContent = document.getElementById('content-instructions');
    const instructionsTab = document.querySelector('[data-tab-id="instructions"]');
    if (!semesterBtn1 || !semesterBtn2 || !mainContent || !instructionsContent || !instructionsTab) return;

    const activeSemester = appState.gradebook_data.activeSemester || '1';
    const activeClassId = appState.gradebook_data.activeClassId;
    const semesterData = getActiveSemesterData();
    const hasClasses = Object.keys(semesterData.classes || {}).length > 0;

    semesterBtn1.classList.toggle('active', activeSemester === '1');
    semesterBtn2.classList.toggle('active', activeSemester === '2');
    renderClassTabs();
    
    const noClassContent = document.getElementById('no-class-content');
    if (noClassContent) noClassContent.classList.toggle('hidden', hasClasses);

    const hasActiveClass = activeClassId && semesterData.classes?.[activeClassId];
    mainContent.classList.toggle('hidden', !hasActiveClass);
    instructionsContent.classList.toggle('hidden', hasActiveClass || !hasClasses);
    instructionsTab.classList.toggle('active', !hasActiveClass);
    
    if (hasActiveClass) {
        renderUnitFilter();
        renderCategoryWeights();
        renderGradebook();
    }
}

//
//
//
export function renderFullGradebookUI() {
    if (!contentWrapper) return;
    contentWrapper.innerHTML = `
        <div class="mb-4">
            <div class="border-b border-gray-200"><nav class="flex items-center space-x-8"><button id="semesterBtn1" class="semester-button py-3 px-1 border-b-2 border-transparent font-medium text-lg text-gray-500 hover:text-gray-700">Semester 1</button><button id="semesterBtn2" class="semester-button py-3 px-1 border-b-2 border-transparent font-medium text-lg text-gray-500 hover:text-gray-700">Semester 2</button></nav></div>
            <div class="border-b border-gray-200 mt-2"><nav class="flex items-center space-x-4"><button data-tab-id="instructions" class="tab-button shrink-0 py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700">Instructions</button><div id="class-tabs-container" class="flex items-center space-x-4 overflow-x-auto"></div><button id="addClassBtn" class="ml-2 shrink-0 bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold py-2 px-3 rounded-lg text-sm">+ Add Class</button><div class="ml-auto flex items-center"><input type="checkbox" id="show-archived-checkbox" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"><label for="show-archived-checkbox" class="ml-2 block text-sm text-gray-900">Show Archived</label></div></nav></div>
        </div>
        <div id="no-class-content" class="hidden text-center p-8 bg-white rounded-lg shadow-md"><h2 class="text-2xl font-semibold mb-4 text-gray-700">No classes yet for this semester.</h2><p class="text-gray-500">Click the "+ Add Class" button to create your first class.</p></div>
        
        <div id="content-instructions" class="tab-content hidden fade-in bg-white p-6 rounded-lg shadow-md">
            <h2 class="text-2xl font-semibold mb-6 text-gray-800">Welcome to Marksheet Pro!</h2>
            <div class="space-y-6">
                 <div>
                    <h3 class="text-lg font-semibold text-primary mb-2">Getting Started: Your First Class</h3>
                    <ol class="list-decimal list-inside space-y-1 text-gray-700">
                        <li>Use the <strong>Semester 1 / Semester 2</strong> tabs to select a semester.</li>
                        <li>Click the <strong>"+ Add Class"</strong> button to create your first class (e.g., "Grade 10 Math").</li>
                        <li>The new class tab will appear. Click on it to open your gradebook.</li>
                    </ol>
                </div>
                <div>
                    <h3 class="text-lg font-semibold text-primary mb-2">Setting Up Your Gradebook</h3>
                    <ul class="list-disc list-inside space-y-1 text-gray-700">
                        <li><strong>Category Weights:</strong> Set the K/T/C/A weights for your class. Make sure they total 100%.</li>
                        <li><strong>Units:</strong> Click <strong>"Edit Units"</strong> to set up your units for the term (e.g., "Unit 1: Algebra"). Make sure their term weights also total 100%.</li>
                        <li><strong>Students:</strong> Click <strong>"+ Add Student"</strong> to add students one-by-one. Use <strong>"Import Students"</strong> to copy and paste a list of names from a document, spreadsheet, or PDF.</li>
                        <li><strong>Assignments:</strong> First, select a unit from the <strong>"All Units"</strong> dropdown. Then, click <strong>"Manage Assignments"</strong> to add your assessments for that unit.</li>
                    </ul>
                </div>
            </div>
        </div>

        <div id="main-content-area" class="tab-content hidden fade-in">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
                <div class="flex items-center gap-4"><div contenteditable="true" id="className" class="text-2xl font-bold text-gray-700 p-2 rounded-md transition-shadow"></div><div class="flex items-center gap-2"><span id="save-status-icon"></span><span id="saveStatus" class="text-sm"></span></div></div>
                <div class="mt-2 sm:mt-0 flex flex-wrap items-center justify-end gap-2">
                    <button id="savePresetBtn" class="bg-secondary hover:bg-secondary-dark text-white font-bold py-2 px-4 rounded-lg">Save Class as Preset</button>
                    <button id="importStudentsBtn" class="bg-secondary hover:bg-secondary-dark text-white font-bold py-2 px-4 rounded-lg">Import Students</button>
                    <button id="recordMidtermsBtn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Record Midterms</button>
                    <button id="archiveClassBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg">Archive Class</button>
                    <div class="relative">
                        <button id="exportMenuBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                            Export <span>&#9662;</span>
                        </button>
                        <div id="exportMenuDropdown" class="hidden absolute right-0 mt-2 w-60 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                            <a href="#" id="exportCsvBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Export Full Gradebook (CSV)</a>
                            <a href="#" id="exportPdfBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Export Student Reports (PDF)</a>
                            <a href="#" id="exportBlankPdfBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Export Blank Marksheet (PDF)</a>
                            <div class="border-t border-gray-100 my-1"></div>
                            <a href="#" id="exportStudentListBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Export Student List (PDF)</a>
                            <a href="#" id="exportContactListBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Export Student Contact List (PDF)</a>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="category-weights-container" class="bg-white p-4 rounded-lg shadow-md"></div>

        <div class="my-2 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-2 w-full sm:w-auto">
                <div class="relative flex-grow sm:flex-grow-0"><input type="text" id="student-search-input" placeholder="Search students..." class="py-2 px-4 w-full border border-gray-300 rounded-md shadow-sm transition-all focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200"></div>
                <div id="class-stats-container" class="text-sm text-gray-500 font-medium flex items-center gap-3 px-2"></div>

                <button id="addStudentBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg whitespace-nowrap">+ Add Student</button>
                <button id="attendanceBtn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Attendance</button>
            </div>

            <div class="flex page-center gap-2">
                <div class="relative"><button id="editUnitsBtn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Edit Units</button></div>
                <button id="addAssignmentBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg">Manage Assignments</button>
                <select id="unitFilterDropdown" class="bg-white border border-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 shadow-sm"></select>
            </div>
        </div>
                
            <div id="table-wrapper" class="bg-white rounded-lg shadow-md"><table id="gradebookTable" class="w-full text-sm text-gray-500"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>
        </div>
    `;
    updateUIFromState();
}

export function renderAccountPage(isSetupMode = false) {
    // ... (No changes here)
    const appState = getAppState();
    if(!contentWrapper) return;

    const currentTitle = appState.title || '';
    const currentFullName = appState.full_name || '';
    const currentSchoolName = appState.school_name || '';
    const currentSchoolBoard = appState.school_board || '';
    const currentRoomNumber = appState.room_number || '';
    const currentBirthday = appState.birthday || ''; 

    const creationDate = appState.created_at ? new Date(appState.created_at).toLocaleDateString() : 'N/A';
    const lastLogin = appState.last_login ? new Date(appState.last_login).toLocaleString() : 'N/A';

    contentWrapper.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto fade-in">
            ${isSetupMode
                ? `<h2 class="text-2xl font-bold text-primary mb-2">Welcome to Marksheet Pro!</h2><p class="text-gray-600 mb-6">Please set up your profile to get started.</p>`
                : `<h2 class="text-2xl font-bold text-gray-800 mb-6">My Account</h2>`
            }
            <div id="account-feedback" class="hidden mb-4 p-3 rounded-md"></div>
            <div class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="md:col-span-1"><label for="title-input" class="block text-sm font-medium text-gray-700">Title</label><input type="text" id="title-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentTitle}" placeholder="e.g., Mr."></div>
                    <div class="md:col-span-2"><label for="full-name-input" class="block text-sm font-medium text-gray-700">Full Name</label><input type="text" id="full-name-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentFullName}" placeholder="e.g., John Smith"></div>
                </div>
                <div><label for="school-board-input" class="block text-sm font-medium text-gray-700">School Board</label><input type="text" id="school-board-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentSchoolBoard}" placeholder="e.g., TCDSB"></div>
                <div><label for="school-name-input" class="block text-sm font-medium text-gray-700">School Name</label><input type="text" id="school-name-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentSchoolName}" placeholder="e.g., Maplewood High School"></div>
                <div><label for="room-number-input" class="block text-sm font-medium text-gray-700">Room Number</label><input type="text" id="room-number-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentRoomNumber}" placeholder="e.g., 204B"></div>
                <div><label for="birthday-input" class="block text-sm font-medium text-gray-700">Birthday</label><input type="date" id="birthday-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentBirthday}"></div>
                <div><label for="new-password-input" class="block text-sm font-medium text-gray-700">New Password</label><input type="password" id="new-password-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Leave blank to keep current password"></div>
            </div>
            <hr class="my-8">
            <div>
                <h3 class="text-lg font-semibold text-gray-700 mb-4">Account Information</h3>
                <div class="text-sm text-gray-600 space-y-2">
                    <p><strong>Account Created:</strong> <span id="creation-date">${creationDate}</span></p>
                    <p><strong>Last Login:</strong> <span id="last-login">${lastLogin}</span></p>
                </div>
            </div>
            <hr class="my-8">
            <div>
                <h3 class="text-lg font-semibold text-red-700 mb-2">Danger Zone</h3>
                <p class="text-sm text-gray-600 mb-4">Deleting your account is permanent and cannot be undone. All of your classes, students, and grade data will be lost forever.</p>
                <button id="delete-account-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm">Delete My Account</button>
            </div>
            <div class="mt-8 flex justify-between items-center">
                ${isSetupMode
                    ? `<div></div>` 
                    : `<button id="back-to-app-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg shadow-sm">&larr; Back to Gradebook</button>`
                }
                <button id="save-profile-btn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg shadow-sm">Save Changes</button>
            </div>
        </div>
    `;
}

export function renderAttendanceSheet(dateString) {
    // ... (No changes here)
    const classData = getActiveClassData();
    if (!classData) return;

    const selectedDate = dateString || new Date().toISOString().slice(0, 10);
    const students = Object.values(classData.students || {}).sort((a,b) => (a.lastName || '').localeCompare(b.lastName || ''));

    if (!classData.attendance) classData.attendance = {};
    if (!classData.attendance[selectedDate]) classData.attendance[selectedDate] = {};
    const attendanceForDate = classData.attendance[selectedDate];

    const studentRows = students.map(student => {
        const studentAttendance = attendanceForDate[student.id] || { status: 'present', notes: '' };
        const status = studentAttendance.status;
        const notes = studentAttendance.notes || '';

        // Calculate Term Summary
        let lateCount = 0;
        let absentCount = 0;
        Object.values(classData.attendance || {}).forEach(dateData => {
            const record = dateData[student.id];
            if (record) {
                if (record.status === 'late') lateCount++;
                if (record.status === 'absent') absentCount++;
            }
        });
        const summaryHtml = `
            <span class="text-xs text-red-600">Abs: ${absentCount}</span>
            <span class="text-xs text-yellow-600 ml-2">Late: ${lateCount}</span>
        `;

        return `
            <tr class="student-attendance-row border-b" data-student-id="${student.id}">
                <td class="p-3">${student.lastName}, ${student.firstName}</td>
                <td class="p-3 whitespace-nowrap">${summaryHtml}</td>
                <td class="p-3">
                    <div class="flex items-center gap-4">
                        <label><input type="radio" name="status-${student.id}" value="present" ${status === 'present' ? 'checked' : ''}> Present</label>
                        <label><input type="radio" name="status-${student.id}" value="absent" ${status === 'absent' ? 'checked' : ''}> Absent</label>
                        <label><input type="radio" name="status-${student.id}" value="late" ${status === 'late' ? 'checked' : ''}> Late</label>
                    </div>
                </td>
                <td class="p-3">
                    <input type="text" class="attendance-note-input w-full p-1 border rounded" value="${notes}" placeholder="Add note...">
                </td>
            </tr>
        `;
    }).join('');

    contentWrapper.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-6">
            <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-4">
                    <h2 class="text-2xl font-bold">Attendance</h2>
                    <input type="date" id="attendance-date-picker" value="${selectedDate}" class="p-2 border rounded-md">
                </div>
                <button id="back-to-gradebook-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">&larr; Back to Gradebook</button>
            </div>
            <table class="w-full">
                <thead>
                    <tr class="border-b">
                        <th class="text-left p-3">Student</th>
                        <th class="text-left p-3">Term Summary</th>
                        <th class="text-left p-3">Status</th>
                        <th class="text-left p-3">Notes</th>
                    </tr>
                </thead>
                <tbody>${studentRows}</tbody>
            </table>
        </div>
    `;
}

export async function renderStudentProfileModal(studentId) {
    const classData = getActiveClassData();
    const student = classData?.students?.[studentId];
    if (!student) return;

    if (!student.contacts) student.contacts = [];

    const profilePicUrl = student.profilePicturePath ? getProfilePictureUrl(student.profilePicturePath) : null;
    const profilePicHtml = profilePicUrl 
        ? `<img src="${profilePicUrl}" id="profile-pic-preview" class="w-24 h-24 rounded-full mx-auto object-cover mb-4">` 
        : `<div id="profile-pic-preview" class="w-24 h-24 rounded-full mx-auto bg-gray-300 flex items-center justify-center text-white text-3xl font-bold mb-4">${student.firstName.charAt(0)}${student.lastName.charAt(0)}</div>`;

    const renderContacts = () => {
        return student.contacts.map((contact, index) => `
            <div class="contact-item flex items-center gap-2 p-2 bg-gray-100 rounded">
                <div class="flex-grow">
                    <p class="font-semibold">${contact.name} <span class="text-xs text-gray-500">${contact.isParent ? '(Parent/Guardian)' : '(Student)'}</span></p>
                    <p class="text-sm text-gray-600">${contact.info}</p>
                </div>
                <button class="delete-contact-btn delete-btn" data-index="${index}">&times;</button>
            </div>
        `).join('') || '<p class="text-sm text-gray-500">No contacts added yet.</p>';
    };

    const modalContent = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-1 flex flex-col items-center">
                ${profilePicHtml}
                <input type="file" id="student-picture-upload" class="hidden" accept="image/*">
                <button id="upload-pic-btn" class="text-sm text-blue-600 hover:underline">Upload Picture</button>
                <button id="download-student-report-btn" class="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-indigo-100 text-indigo-700 font-semibold transition-all hover:bg-indigo-600 hover:text-white mt-4">Download Report</button>
            </div>
            <div class="md:col-span-2 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="student-firstname-edit" class="block text-sm font-medium">First Name</label>
                        <input type="text" id="student-firstname-edit" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${student.firstName}">
                    </div>
                    <div>
                        <label for="student-lastname-edit" class="block text-sm font-medium">Last Name</label>
                        <input type="text" id="student-lastname-edit" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${student.lastName}">
                    </div>
                </div>
                <div>
                    <label for="student-starting-mark-edit" class="block text-sm font-medium">Starting Overall Mark (Optional)</label>
                    <p class="text-xs text-gray-500 mb-1">Enter the student's current overall grade if they joined mid-semester. Leave blank to calculate from scratch.</p>
                    <input type="number" id="student-starting-mark-edit" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" min="0" max="100" step="0.1" placeholder="e.g., 85" value="${student.startingOverallMark !== null && student.startingOverallMark !== undefined ? student.startingOverallMark : ''}">
                </div>
                 <div>
                    <h4 class="text-md font-semibold mb-2">Contact Info</h4>
                    <div id="contact-list" class="space-y-2">${renderContacts()}</div>
                    <button id="add-contact-btn" class="mt-2 text-sm text-blue-600 hover:underline">+ Add Contact</button>
                </div>
                <div>
                    <label for="student-iep-notes" class="block text-sm font-medium">IEP Notes</label>
                    <textarea id="student-iep-notes" class="mt-1 block w-full h-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm">${student.iepNotes || ''}</textarea>
                </div>
                <div>
                    <label for="student-general-notes" class="block text-sm font-medium">General Notes</label>
                    <textarea id="student-general-notes" class="mt-1 block w-full h-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm">${student.generalNotes || ''}</textarea>
                </div>
            </div>
        </div>
    `;

    showModal({
        title: 'Edit Student Profile',
        modalWidth: 'max-w-3xl',
        content: modalContent,
        // Added Delete Button to Footer
        footerContent: `<button id="modal-delete-student-btn" class="text-red-600 hover:text-red-800 font-medium text-sm px-3 py-2 border border-transparent hover:border-red-200 rounded transition-colors">Delete Student</button>`,
        confirmText: 'Save Changes',
        confirmClasses: 'bg-primary hover:bg-primary-dark',
        onConfirm: async (closeModal) => {
            student.firstName = document.getElementById('student-firstname-edit').value.trim();
            student.lastName = document.getElementById('student-lastname-edit').value.trim();
            student.iepNotes = document.getElementById('student-iep-notes').value.trim();
            student.generalNotes = document.getElementById('student-general-notes').value.trim();
            
            const startingMarkInput = document.getElementById('student-starting-mark-edit').value.trim();
            student.startingOverallMark = startingMarkInput ? parseFloat(startingMarkInput) : null;
            
            const fileInput = document.getElementById('student-picture-upload');
            const file = fileInput.files[0];

            if (file) {
                try {
                    const path = await uploadProfilePicture(file, student.id);
                    student.profilePicturePath = path;
                } catch (error) {
                    console.error('Failed to upload profile picture:', error);
                    showModal({ title: 'Upload Failed', content: `<p>${error.message}</p>`, confirmText: null, cancelText: 'Close' });
                    return; 
                }
            }
            
            renderGradebook();
            triggerAutoSave();
            closeModal();
        }
    });

    const modalElement = document.getElementById('custom-modal');

    // Listener for the new Delete button in the modal
    const modalDeleteBtn = document.getElementById('modal-delete-student-btn');
    if (modalDeleteBtn) {
        modalDeleteBtn.addEventListener('click', () => {
            // Trigger the delete action (which opens a confirmation modal)
            deleteStudent(student.id);
        });
    }

    modalElement.addEventListener('click', e => {
        if (e.target.id === 'upload-pic-btn') {
            document.getElementById('student-picture-upload').click();
        }

        if (e.target.id === 'download-student-report-btn') {
            exportStudentPDF(student.id);
        }

        if (e.target.id === 'add-contact-btn') {
            showModal({
                title: 'Add Contact',
                content: `
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium">Name</label>
                                <input type="text" id="contact-name-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                            </div>
                            <div>
                                <label class="block text-sm font-medium">Email / Phone</label>
                                <input type="text" id="contact-info-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                            </div>
                        </div>
                        <label class="flex items-center"><input type="checkbox" id="is-parent-checkbox" class="h-4 w-4"> <span class="ml-2">Is Parent/Guardian</span></label>
                    </div>`,
                confirmText: 'Add',
                onConfirm: () => {
                    const name = document.getElementById('contact-name-input').value.trim();
                    const info = document.getElementById('contact-info-input').value.trim();
                    const isParent = document.getElementById('is-parent-checkbox').checked;
                    if (name && info) {
                        student.contacts.push({ name, info, isParent });
                        document.getElementById('contact-list').innerHTML = renderContacts();
                    }
                }
            });
        }
        
        if (e.target.classList.contains('delete-contact-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            student.contacts.splice(index, 1);
            document.getElementById('contact-list').innerHTML = renderContacts();
        }
    });

    document.getElementById('student-picture-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('profile-pic-preview');
                if (preview.tagName === 'IMG') {
                    preview.src = e.target.result;
                } else {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.id = 'profile-pic-preview';
                    img.className = 'w-24 h-24 rounded-full mx-auto object-cover mb-4';
                    preview.replaceWith(img);
                }
            };
            reader.readAsDataURL(file);
        }
    });
}