import { showModal } from './ui.js';
import { getAppState, getActiveClassData, getActiveSemesterData } from './state.js';
import { triggerAutoSave } from './main.js';
import { renderGradebook, updateUIFromState } from './render.js';
import { calculateStudentAverages } from './calculations.js';

function isValidWeightDistribution(state) {
    const termUnits = Object.values(state.units).filter(u => !u.isFinal);
    const totalWeight = termUnits.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);
    return Math.round(totalWeight) === 100;
}
// --- Class & Semester Actions ---

export function switchSemester(semester) {
    const appState = getAppState();
    if (!appState.gradebook_data) return;
    appState.gradebook_data.activeSemester = semester;
    const semesterData = getActiveSemesterData();
    const classIds = Object.keys(semesterData.classes || {});
    const sortedClassIds = classIds.sort((a, b) => semesterData.classes[a].name.localeCompare(semesterData.classes[b].name));
    appState.gradebook_data.activeClassId = classIds.length > 0 ? sortedClassIds[0] : null;
    updateUIFromState();
    triggerAutoSave();
}

export function switchActiveClass(classId) {
    const appState = getAppState();
    if (!appState.gradebook_data) return;
    appState.gradebook_data.activeClassId = classId;
    appState.gradebook_data.activeUnitId = 'all'; 
    updateUIFromState();
    triggerAutoSave();
}



export function archiveClass() {
    const classData = getActiveClassData();
    const appState = getAppState();
    if (!classData) return;

    showModal({
        title: 'Archive Class',
        content: `<p>Are you sure you want to archive "<strong>${classData.name}</strong>"?</p><p class="text-sm text-gray-500 mt-2">Archived classes can be viewed and restored later.</p>`,
        confirmText: 'Archive',
        confirmClasses: 'bg-yellow-500 hover:bg-yellow-600',
        onConfirm: () => {
            if (!appState.gradebook_data) return;
            classData.isArchived = true;
            const activeSemester = appState.gradebook_data.activeSemester;
            const classIds = Object.keys(appState.gradebook_data.semesters[activeSemester].classes).filter(id => !appState.gradebook_data.semesters[activeSemester].classes[id].isArchived);
            appState.gradebook_data.activeClassId = classIds.length > 0 ? classIds[0] : null;
            updateUIFromState();
            triggerAutoSave();
        }
    });
}

export function addStudent() {
    showModal({
        title: 'Add New Student',
        content: `<div class="space-y-4"><div><label for="student-firstname-input" class="block text-sm font-medium">First Name</label><input type="text" id="student-firstname-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"></div><div><label for="student-lastname-input" class="block text-sm font-medium">Last Name</label><input type="text" id="student-lastname-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"></div></div>`,
        confirmText: 'Add & Next', cancelText: 'Done', confirmClasses: 'bg-primary hover:bg-primary-dark',
        onAction: () => {
            const firstNameInput = document.getElementById('student-firstname-input');
            const lastNameInput = document.getElementById('student-lastname-input');
            const firstName = firstNameInput?.value.trim();
            const lastName = lastNameInput?.value.trim();

            if (firstName && lastName) {
                const classData = getActiveClassData();
                if (classData) {
                    const studentId = `student_${Date.now()}`;
                    if (!classData.students) classData.students = {};
                    classData.students[studentId] = { id: studentId, firstName, lastName, grades: {}, iep: false, midtermGrade: null, startingOverallMark: null, iepNotes: '', generalNotes: '', profilePicturePath: null, contacts: [] };
                    renderGradebook();
                    triggerAutoSave();
                    if(firstNameInput) firstNameInput.value = '';
                    if(lastNameInput) lastNameInput.value = '';
                    firstNameInput?.focus();
                }
            } else {
                if (!firstName) firstNameInput?.focus(); else lastNameInput?.focus();
            }
        }
    });
}

export function deleteStudent(studentId) {
    const classData = getActiveClassData();
    const student = classData?.students?.[studentId];
    if (!student) return;
    showModal({
        title: 'Delete Student',
        content: `<p>Are you sure you want to delete "<strong>${student.firstName} ${student.lastName}</strong>" and all their grades?</p>`,
        confirmClasses: 'bg-red-600 hover:bg-red-700',
        onConfirm: () => {
            delete classData.students[studentId];
            renderGradebook();
            triggerAutoSave();
        }
    });
}

export function editUnits() {
    const classData = getActiveClassData();
    if (!classData) return;

    let draggedItem = null;

    function renderUnitsEditor(units, hasFinal, finalWeight) {
        const termUnits = Object.values(units).filter(u => !u.isFinal).sort((a,b) => a.order - b.order);
        let totalWeight = termUnits.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);
        // Use a tiny epsilon for float comparison
        const weightColor = Math.abs(totalWeight - 100) < 0.1 ? 'text-green-600' : 'text-red-600';

        let termUnitsHtml = termUnits.map(unit => `
            <div class="unit-item flex items-center gap-3 p-2 border rounded-md bg-gray-50" draggable="true" data-unit-id="${unit.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drag-handle cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                <span class="font-semibold text-gray-600">Unit ${unit.order}:</span>
                <input type="text" data-field="title" class="p-1 border rounded-md flex-grow" value="${unit.title || ''}" placeholder="Custom Title (e.g., Algebra)">
                <input type="text" data-field="subtitle" class="p-1 border rounded-md flex-grow" value="${unit.subtitle || ''}" placeholder="Subtitle (optional)">
                <input type="number" step="0.01" data-field="weight" class="p-1 border rounded-md w-24 text-right" value="${parseFloat(unit.weight).toFixed(2)}">
                <span class="font-medium">%</span>
                <button class="delete-unit-btn delete-btn" data-unit-id="${unit.id}">&times;</button>
            </div>
        `).join('');

        let finalUnitHtml = '';
        if (hasFinal) {
            finalUnitHtml = `
                <div class="mt-2 unit-item flex items-center gap-3 p-2 border-2 border-dashed rounded-md bg-gray-100 text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span class="font-bold flex-grow">Final Assessment</span>
                    <span>Weight: ${finalWeight}% of overall grade</span>
                </div>
            `;
        }

        return `
            <div id="units-editor" class="flex flex-col h-full">
                <div class="flex-grow overflow-y-auto pr-2">
                    <h4 class="text-md font-semibold mb-2">Term Units</h4>
                    <p class="text-sm text-gray-500 mb-3">Drag units to reorder. The sum of term unit weights should equal 100%.</p>
                    <div id="unit-list" class="space-y-2">${termUnitsHtml}</div>
                     ${finalUnitHtml}
                </div>
                <div class="flex-shrink-0 pt-4 border-t mt-4">
                    <div id="term-weight-total-display" class="text-right font-bold mb-4 ${weightColor}">Term Weight Total: ${totalWeight.toFixed(2)}%</div>
                    <h4 class="text-md font-semibold mb-2 text-right">Final Assessment Settings</h4>
                    <div class="flex items-center justify-end gap-4">
                        <label class="flex items-center gap-2">
                            <input type="checkbox" id="has-final-checkbox" class="h-5 w-5" ${hasFinal ? 'checked' : ''}>
                            Enable Final Assessment
                        </label>
                        <div id="final-weight-container" class="${hasFinal ? '' : 'hidden'}">
                            <label>Final Weight: <input type="number" step="0.1" id="final-weight-input" class="p-1 border rounded-md w-24" value="${finalWeight || 30}"> %</label>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function getStateFromModalDOM(modal) {
        const updatedUnits = {};
        const unitItems = modal.querySelectorAll('.unit-item[draggable="true"]');
        
        unitItems.forEach((item, index) => {
            const unitId = item.dataset.unitId;
            const originalUnit = classData.units[unitId] || {};
            updatedUnits[unitId] = {
                ...originalUnit, // Preserve assignments etc.
                id: unitId,
                order: index + 1,
                isFinal: false,
                title: item.querySelector('[data-field="title"]').value.trim(),
                subtitle: item.querySelector('[data-field="subtitle"]').value.trim(),
                weight: parseFloat(item.querySelector('[data-field="weight"]').value) || 0,
            };
        });

        const hasFinal = modal.querySelector('#has-final-checkbox').checked;
        const finalWeight = parseFloat(modal.querySelector('#final-weight-input').value) || 30;

        const existingFinal = Object.values(classData.units).find(u => u.isFinal);
        if (hasFinal) {
            const finalId = existingFinal ? existingFinal.id : `final_${classData.id}`;
            updatedUnits[finalId] = { ...(existingFinal || {}), id: finalId, title: 'Final Assessment', isFinal: true, order: 999, assignments: existingFinal?.assignments || {} };
        }

        return { units: updatedUnits, hasFinal: hasFinal, finalWeight: finalWeight };
    }

    showModal({
        title: 'Edit Units & Weights',
        modalWidth: 'max-w-4xl',
        content: renderUnitsEditor(classData.units, classData.hasFinal, classData.finalWeight),
        footerContent: `<button id="add-unit-btn" class="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Add Unit</button>`,
        confirmText: 'Save Changes',
        confirmClasses: 'bg-primary hover:bg-primary-dark',
        onConfirm: () => {
            const modal = document.getElementById('custom-modal');
            const newState = getStateFromModalDOM(modal);
            
            if (!newState || typeof newState.units !== 'object' || Array.isArray(newState.units)) {
                return false;
            }
            
            // Allow slight floating point errors
            const termUnits = Object.values(newState.units).filter(u => !u.isFinal);
            const totalWeight = termUnits.reduce((sum, unit) => sum + unit.weight, 0);

            if (Math.abs(totalWeight - 100) > 0.5) {
                showModal({
                    title: 'Invalid Weight Distribution',
                    content: `<p>The total weight of all term units is <strong>${totalWeight.toFixed(2)}%</strong>. It must equal 100%.</p>`,
                    confirmText: null,
                    cancelText: 'Close',
                    modalWidth: 'max-w-xs'
                });
                return false;
            }

            classData.units = newState.units;
            classData.hasFinal = newState.hasFinal;
            classData.finalWeight = newState.finalWeight;

            updateUIFromState();
            triggerAutoSave();
            return true;
        }
    });
    
    const modal = document.getElementById('custom-modal');
    if (!modal) return;

    const reRenderModalContent = (tempUnits, hasFinal, finalWeight) => {
        const modalContent = modal.querySelector('.modal-content-area');
        if(!modalContent) return;
        modalContent.innerHTML = renderUnitsEditor(tempUnits, hasFinal, finalWeight);
    };

    modal.addEventListener('input', e => {
        if (e.target.matches('.unit-item input[data-field="weight"]')) {
             const display = modal.querySelector('#term-weight-total-display');
             const state = getStateFromModalDOM(modal);
             const termUnits = Object.values(state.units).filter(u => !u.isFinal);
             const totalWeight = termUnits.reduce((sum, unit) => sum + unit.weight, 0);
             if (display) {
                display.textContent = `Term Weight Total: ${totalWeight.toFixed(2)}%`;
                display.className = `text-right font-bold mb-4 ${Math.abs(totalWeight - 100) < 0.1 ? 'text-green-600' : 'text-red-600'}`;
            }
        }
    });

    modal.addEventListener('change', e => {
        if (e.target.id === 'has-final-checkbox') {
             const state = getStateFromModalDOM(modal);
             reRenderModalContent(state.units, e.target.checked, state.finalWeight);
        }
    });

    modal.addEventListener('click', e => {
        if (e.target.id === 'add-unit-btn') {
            const state = getStateFromModalDOM(modal);
            const termUnits = Object.values(state.units).filter(u => !u.isFinal);
            
            // Logic: Add new unit -> Take evenly from others
            const count = termUnits.length;
            const newUnitWeight = 100 / (count + 1); // e.g. 100/4 = 25
            const weightToSubtractPerUnit = newUnitWeight / count; // e.g. 25/3 = 8.333

            // Update existing weights
            Object.keys(state.units).forEach(key => {
                if (!state.units[key].isFinal) {
                    state.units[key].weight = Math.max(0, state.units[key].weight - weightToSubtractPerUnit);
                }
            });

            // Add new unit
            const newId = `unit_${Date.now()}`;
            state.units[newId] = { 
                id: newId, 
                order: count + 1, 
                title: ``, 
                subtitle: '', 
                weight: newUnitWeight, 
                assignments: {} 
            };
            
            reRenderModalContent(state.units, state.hasFinal, state.finalWeight);

        } else if (e.target.classList.contains('delete-unit-btn')) {
            const unitIdToDelete = e.target.dataset.unitId;
            const state = getStateFromModalDOM(modal);
            const termUnits = Object.values(state.units).filter(u => !u.isFinal);
            
            // Logic: Delete unit -> Spread weight evenly to others
            const unitToDelete = state.units[unitIdToDelete];
            if (unitToDelete) {
                const weightToDistribute = unitToDelete.weight;
                const remainingCount = termUnits.length - 1;

                if (remainingCount > 0) {
                    const weightToAddPerUnit = weightToDistribute / remainingCount;
                    Object.keys(state.units).forEach(key => {
                        if (key !== unitIdToDelete && !state.units[key].isFinal) {
                            state.units[key].weight += weightToAddPerUnit;
                        }
                    });
                }
                
                delete state.units[unitIdToDelete];
                reRenderModalContent(state.units, state.hasFinal, state.finalWeight);
            }
        }
    });
    
    // Drag and Drop Logic
    modal.addEventListener('dragstart', e => {
        const unitItem = e.target.closest('.unit-item[draggable="true"]');
        if (!unitItem) return;

        if (!e.target.closest('.drag-handle')) {
            e.preventDefault();
            return;
        }

        draggedItem = unitItem;
        setTimeout(() => unitItem.classList.add('dragging'), 0);
    });

    modal.addEventListener('dragend', () => {
        if (!draggedItem) return;
        draggedItem.classList.remove('dragging');
        draggedItem = null;
        // Re-number visible units locally for visual consistency
        modal.querySelectorAll('#unit-list .unit-item').forEach((item, index) => {
            const orderSpan = item.querySelector('span:nth-of-type(1)');
            if (orderSpan) orderSpan.textContent = `Unit ${index + 1}:`;
        });
    });

    modal.addEventListener('dragover', e => {
        if (!draggedItem) return;
        const unitList = e.target.closest('#unit-list');
        if (!unitList) return;
        e.preventDefault();
        
        const afterElement = [...unitList.querySelectorAll('.unit-item:not(.dragging)')].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;

        if (afterElement == null) {
            unitList.appendChild(draggedItem);
        } else {
            unitList.insertBefore(draggedItem, afterElement);
        }
    });
}

// --- Assignment Actions ---
export function manageAssignments() {
    const appState = getAppState();
    const classData = getActiveClassData();
    let activeUnitId = appState.gradebook_data?.activeUnitId;

    if (!classData) {
        return;
    }

    if (!activeUnitId || activeUnitId === 'all') {
        const firstUnit = Object.values(classData.units || {}).sort((a, b) => a.order - b.order)[0];
        if (!firstUnit) return;
        activeUnitId = firstUnit.id;
        if (appState.gradebook_data) {
            appState.gradebook_data.activeUnitId = activeUnitId;
        }
        const unitDropdown = document.getElementById('unitFilterDropdown');
        if (unitDropdown) {
            unitDropdown.value = activeUnitId;
        }
    }

    const unit = classData.units[activeUnitId];
    if (!unit) return;

    let draggedItem = null;

    // Ensure order/weight exist
    Object.values(unit.assignments || {}).forEach((asg, index) => {
        if (asg.order === undefined) asg.order = index;
        if (asg.weight === undefined) asg.weight = 1;
        if (!unit.isFinal && !asg.categoryTotals) {
            asg.categoryTotals = { k: 0, t: 0, c: 0, a: 0 };
        }
    });

    function renderAssignmentsEditor(currentUnit) {
        const isFinal = currentUnit.isFinal;
        const assignments = Object.values(currentUnit.assignments || {}).sort((a,b) => a.order - b.order);

        const assignmentsHtml = assignments.map(asg => {
            if (isFinal) {
                return `
                    <div class="assignment-item grid grid-cols-[auto,1fr,5rem,6rem,auto] items-center gap-2 p-2 bg-white rounded border" draggable="true" data-asg-id="${asg.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drag-handle cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                        <input data-field="name" type="text" class="p-1 border rounded-md w-full" value="${asg.name || ''}" placeholder="Assessment Name">
                        <input data-field="weight" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.weight || 1}" placeholder="x1">
                        <input data-field="total" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.total || 0}" placeholder="Total Score">
                        <button class="delete-asg-btn delete-btn" data-asg-id="${asg.id}">&times;</button>
                    </div>`;
            } else {
                return `
                    <div class="assignment-item grid grid-cols-[auto,1fr,5rem,4rem,4rem,4rem,4rem,auto] items-center gap-2 p-2 bg-white rounded border" draggable="true" data-asg-id="${asg.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drag-handle cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                        <input data-field="name" type="text" class="p-1 border rounded-md w-full" value="${asg.name || ''}" placeholder="Assignment Name">
                        <input data-field="weight" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.weight || 1}" placeholder="x1">
                        <input data-field="k" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.categoryTotals?.k || 0}" placeholder="K">
                        <input data-field="t" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.categoryTotals?.t || 0}" placeholder="T">
                        <input data-field="c" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.categoryTotals?.c || 0}" placeholder="C">
                        <input data-field="a" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.categoryTotals?.a || 0}" placeholder="A">
                        <button class="delete-asg-btn delete-btn" data-asg-id="${asg.id}">&times;</button>
                    </div>`;
            }
        }).join('');

        const headerHtml = isFinal ? `
            <div class="grid grid-cols-[auto,1fr,5rem,6rem,auto] items-center gap-2 text-sm font-semibold text-gray-500 px-2">
                <span></span>
                <span class="text-left pl-1">Name</span>
                <span class="text-center">Weight</span>
                <span class="text-center">Total</span>
                <span></span>
            </div>
        ` : `
            <div class="grid grid-cols-[auto,1fr,5rem,4rem,4rem,4rem,4rem,auto] items-center gap-2 text-sm font-semibold text-gray-500 px-2">
                <span></span>
                <span class="text-left pl-1">Name</span>
                <span class="text-left">Weight</span>
                <span class="text-left">K</span>
                <span class="text-left">T</span>
                <span class="text-left">C</span>
                <span class="text-left">A</span>
                <span></span>
            </div>
        `;

        return `
            <div id="assignments-editor">
                ${headerHtml}
                <div class="assignment-list space-y-2 mt-1">${assignmentsHtml}</div>
                <button class="add-asg-btn mt-3 text-sm text-blue-600 hover:underline">+ Add Assignment</button>
            </div>`;
    }

    function getStateFromModalDOM(modal) {
        const updatedAssignments = {};
        modal.querySelectorAll('.assignment-item').forEach((item, index) => {
            const asgId = item.dataset.asgId;
            const originalAsg = unit.assignments[asgId] || {};
            
            updatedAssignments[asgId] = {
                ...originalAsg,
                id: asgId,
                name: item.querySelector('[data-field="name"]').value,
                order: index,
                weight: parseFloat(item.querySelector('[data-field="weight"]').value) || 1
            };

            if (unit.isFinal) {
                updatedAssignments[asgId].total = parseFloat(item.querySelector('[data-field="total"]').value) || 0;
            } else {
                updatedAssignments[asgId].categoryTotals = {
                    k: parseFloat(item.querySelector('[data-field="k"]').value) || 0,
                    t: parseFloat(item.querySelector('[data-field="t"]').value) || 0,
                    c: parseFloat(item.querySelector('[data-field="c"]').value) || 0,
                    a: parseFloat(item.querySelector('[data-field="a"]').value) || 0,
                };
            }
        });
        return updatedAssignments;
    }

    showModal({
        title: `Manage Assignments for ${unit.title || `Unit ${unit.order}`}`,
        modalWidth: 'max-w-5xl',
        content: renderAssignmentsEditor(unit),
        confirmText: 'Save Changes',
        confirmClasses: 'bg-primary hover:bg-primary-dark',
        onConfirm: () => {
            const modal = document.getElementById('custom-modal');
            classData.units[activeUnitId].assignments = getStateFromModalDOM(modal);
            updateUIFromState();
            triggerAutoSave();
        }
    });

    const editor = document.getElementById('assignments-editor');
    if (!editor) return;

// Add/Delete Assignment Logic
    editor.addEventListener('click', e => {
        const modal = e.target.closest('#custom-modal');
        
        if (e.target.classList.contains('add-asg-btn')) {
            const assignmentsState = getStateFromModalDOM(modal);
            const newAsgId = `asg_${Date.now()}`;
            const newOrder = Object.keys(assignmentsState).length;
            
            const newAsg = { id: newAsgId, name: 'New Assignment', order: newOrder, weight: 1 };

            if (unit.isFinal) {
                newAsg.total = 100;
            } else {
                newAsg.categoryTotals = { k: 10, t: 10, c: 10, a: 10 }; // Default non-zero for convenience
            }
            assignmentsState[newAsgId] = newAsg;
            unit.assignments = assignmentsState;
            editor.innerHTML = renderAssignmentsEditor(unit);
        } 
        else if (e.target.classList.contains('delete-asg-btn')) {
            const asgId = e.target.dataset.asgId;
            const assignmentsState = getStateFromModalDOM(modal);
            if (assignmentsState[asgId]) {
                delete assignmentsState[asgId];
                unit.assignments = assignmentsState;
                editor.innerHTML = renderAssignmentsEditor(unit);
            }
        }
    });
    
    // Assignment Drag and Drop Logic
    editor.addEventListener('dragstart', e => {
        const assignmentItem = e.target.closest('.assignment-item');
        if (!assignmentItem) return;

        if (!e.target.closest('.drag-handle')) {
            e.preventDefault();
            return;
        }

        draggedItem = assignmentItem;
        setTimeout(() => assignmentItem.classList.add('dragging'), 0);
    });

    editor.addEventListener('dragend', () => { draggedItem?.classList.remove('dragging'); draggedItem = null; });
    editor.addEventListener('dragover', e => {
        if (!draggedItem) return;
        e.preventDefault();
        const list = e.target.closest('.assignment-list');
        if (!list) return;
        const afterElement = [...list.querySelectorAll('.assignment-item:not(.dragging)')].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; } else { return closest; }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
        if (afterElement == null) { list.appendChild(draggedItem); } else { list.insertBefore(draggedItem, afterElement); }
    });
}

// --- General Actions ---

//

export function addClass() {
    const appState = getAppState();
    // Ensure presets object exists
    if (!appState.gradebook_data.presets) appState.gradebook_data.presets = {};
    
    const presets = appState.gradebook_data.presets;
    const presetOptions = Object.keys(presets).length > 0 
        ? Object.keys(presets).map(id => `<option value="${id}">${presets[id].name}</option>`).join('')
        : '<option value="" disabled>No presets saved yet</option>';

    showModal({
        title: 'Add New Class',
        content: `
            <div class="space-y-4">
                <div>
                    <label for="class-name-input" class="block text-sm font-medium">Class Name</label>
                    <input type="text" id="class-name-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="e.g., Grade 10 Math">
                </div>
                <div>
                    <label for="class-preset-select" class="block text-sm font-medium">Use a Preset (Optional)</label>
                    <select id="class-preset-select" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                        <option value="">Start from scratch</option>
                        ${presetOptions}
                    </select>
                </div>
            </div>`,
        confirmText: 'Add Class',
        confirmClasses: 'bg-primary hover:bg-primary-dark',
        onConfirm: () => {
            const newClassName = document.getElementById('class-name-input').value.trim();
            const presetId = document.getElementById('class-preset-select').value;
            
            if (newClassName && appState.gradebook_data) {
                const newClassId = `class_${Date.now()}`;
                const activeSemester = appState.gradebook_data.activeSemester;
                
                // Ensure semester structure exists
                if (!appState.gradebook_data.semesters[activeSemester]) {
                    appState.gradebook_data.semesters[activeSemester] = { classes: {} };
                }
                const semesterClasses = appState.gradebook_data.semesters[activeSemester].classes;
                const newOrder = Object.keys(semesterClasses).length;

                let newClassData;

                if (presetId && presets[presetId]) {
                    // LOAD PRESET LOGIC
                    const preset = presets[presetId];
                    
                    // Deep copy the preset to avoid reference issues
                    newClassData = JSON.parse(JSON.stringify(preset));
                    
                    // Overwrite unique fields
                    newClassData.id = newClassId;
                    newClassData.name = newClassName;
                    newClassData.order = newOrder;
                    newClassData.students = {}; // Always start with empty students
                    newClassData.attendance = {};
                    
                    // Reset Unit IDs so they are unique to this class
                    // (Otherwise editing units in one class might affect another if they shared IDs)
                    const oldUnits = newClassData.units || {};
                    newClassData.units = {};
                    Object.values(oldUnits).forEach(u => {
                        const newUnitId = `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        newClassData.units[newUnitId] = {
                            ...u,
                            id: newUnitId,
                            assignments: {} // assignments are templates, but we usually want fresh copies or empty? 
                            // Let's keep the assignments structure but give them new IDs too if we want a true template.
                            // For simplicity V1: Keep the units/weights, but clear assignments? 
                            // Usually teachers want the assignments structure too. Let's keep assignments but regen IDs.
                        };
                        
                        // Deep copy assignments and give new IDs
                        const oldAsgs = u.assignments || {};
                        newClassData.units[newUnitId].assignments = {};
                        Object.values(oldAsgs).forEach(a => {
                            const newAsgId = `asg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                            newClassData.units[newUnitId].assignments[newAsgId] = {
                                ...a,
                                id: newAsgId
                            };
                        });
                    });

                } else {
                    // START FROM SCRATCH LOGIC
                    const units = {};
                    for (let i = 1; i <= 5; i++) {
                        const unitId = `unit_${Date.now()}_${i}`;
                        units[unitId] = { id: unitId, order: i, title: ``, subtitle: '', weight: 20, assignments: {} };
                    }
                    newClassData = {
                        id: newClassId, 
                        name: newClassName, 
                        hasFinal: false, 
                        finalWeight: 30, 
                        midtermsRecorded: false,
                        order: newOrder, 
                        isArchived: false, 
                        attendance: {},
                        categoryWeights: { k: 25, t: 25, c: 25, a: 25 }, 
                        units, 
                        students: {}
                    };
                }
                
                appState.gradebook_data.semesters[activeSemester].classes[newClassId] = newClassData;
                appState.gradebook_data.activeClassId = newClassId;
                updateUIFromState();
                triggerAutoSave();
            }
        }
    });
}

export function saveClassAsPreset() {
    const classData = getActiveClassData();
    if (!classData) {
        alert("No active class to save as a preset.");
        return;
    }

    showModal({
        title: 'Save Class Preset',
        content: `
            <p class="text-sm text-gray-500 mb-4">This will save the current Category Weights, Units, and Assignments as a template for future classes.</p>
            <div>
                <label for="preset-name-input" class="block text-sm font-medium">Preset Name</label>
                <input type="text" id="preset-name-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${classData.name} Template">
            </div>`,
        confirmText: 'Save Preset',
        confirmClasses: 'bg-secondary hover:bg-secondary-dark',
        onConfirm: () => {
            const appState = getAppState();
            const presetName = document.getElementById('preset-name-input').value.trim();
            if (presetName) {
                const presetId = `preset_${Date.now()}`;
                
                // Deep copy the class data
                const presetData = JSON.parse(JSON.stringify(classData));
                
                // Clean up specific instance data
                delete presetData.students;
                delete presetData.attendance;
                delete presetData.id;
                delete presetData.name; // We use the preset name instead
                delete presetData.order;
                delete presetData.isArchived;

                presetData.name = presetName;

                if (!appState.gradebook_data.presets) {
                    appState.gradebook_data.presets = {};
                }
                
                appState.gradebook_data.presets[presetId] = presetData;
                triggerAutoSave();
                
                showModal({
                    title: 'Preset Saved!', 
                    content: `<p><strong>"${presetName}"</strong> has been saved.</p><p class="text-sm text-gray-500 mt-2">You can now select this template when creating a new class.</p>`, 
                    confirmText: null, 
                    cancelText: 'Close',
                    modalWidth: 'max-w-sm'
                });
            }
        }
    });
}

export function recordMidterms() {
    const classData = getActiveClassData();
    if (!classData || classData.midtermsRecorded) return;

    showModal({
        title: 'Confirm Midterm Recording',
        content: `<p>Are you sure you want to officially record the current Term Mark as the Midterm Grade for all students?</p><p class="mt-3 font-semibold text-red-600">This action cannot be undone.</p>`,
        confirmText: 'Record Marks',
        confirmClasses: 'bg-accent hover:bg-accent-dark',
        onConfirm: () => {
            const students = classData.students || {};
            let recordedCount = 0;

            Object.values(students).forEach(student => {
                const avgs = calculateStudentAverages(student, classData);
                if (avgs.termMark !== null) {
                    student.midtermGrade = avgs.termMark;
                    recordedCount++;
                }
            });

            classData.midtermsRecorded = true;
            
            updateUIFromState();
            triggerAutoSave();
            
            showModal({
                title: 'Midterm Marks Recorded',
                content: `<p>Successfully recorded midterm grades for ${recordedCount} students.</p>`,
                confirmText: null,
                cancelText: 'Close',
                modalWidth: 'max-w-xs'
            });
        }
    });
}

export function exportStudentPDF(studentId) {
    const classData = getActiveClassData();
    const student = classData?.students?.[studentId];
    if (!classData || !student) {
        alert("Could not find student data to export.");
        return;
    }
    
    exportClassPDF({
        studentIds: [studentId],
        includeMissingAssignments: true,
    });
}

export function exportToCSV() {
    const classData = getActiveClassData();
    if (!classData) {
        alert("No class data to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const students = Object.values(classData.students || {}).sort((a,b) => (a.lastName || '').localeCompare(b.lastName || ''));
    const units = Object.values(classData.units || {}).sort((a,b) => a.order - b.order);

    const headers = ["LastName", "FirstName", "IEP", "Overall", "Term", "Final", "K", "T", "C", "A"];
    units.forEach(unit => {
        Object.values(unit.assignments || {}).sort((a,b) => a.order - b.order).forEach(asg => {
            if (unit.isFinal) {
                headers.push(`${asg.name} (Score)`);
            } else {
                headers.push(`${asg.name} (K)`, `${asg.name} (T)`, `${asg.name} (C)`, `${asg.name} (A)`);
            }
        });
    });
    csvContent += headers.join(",") + "\r\n";

    students.forEach(student => {
        const avgs = calculateStudentAverages(student, classData);
        const row = [
            student.lastName,
            student.firstName,
            student.iep ? "YES" : "NO",
            avgs.overallGrade?.toFixed(2) || '',
            avgs.termMark?.toFixed(2) || '',
            avgs.finalMark?.toFixed(2) || '',
            avgs.categories.k?.toFixed(2) || '',
            avgs.categories.t?.toFixed(2) || '',
            avgs.categories.c?.toFixed(2) || '',
            avgs.categories.a?.toFixed(2) || '',
        ];

        units.forEach(unit => {
            Object.values(unit.assignments || {}).sort((a,b) => a.order - b.order).forEach(asg => {
                const grade = student.grades?.[asg.id];
                if (unit.isFinal) {
                    row.push(grade?.grade ?? '');
                } else {
                    row.push(grade?.k ?? '', grade?.t ?? '', grade?.c ?? '', grade?.a ?? '');
                }
            });
        });
        csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${classData.name}_grades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

//

export function importStudentsCSV() { 
    const classData = getActiveClassData();
    if (!classData) return;

    // 1. The Content for the Modal (Now with File Upload)
    const modalContent = `
        <div class="space-y-4">
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="text-sm text-blue-800">
                    <strong>Option 1: Scan a Photo</strong><br>
                    Upload a picture of a class list (paper or screen).
                </div>
                <label class="cursor-pointer bg-white text-blue-600 font-bold py-2 px-4 rounded border border-blue-300 hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span>Upload Photo</span>
                    <input type="file" id="student-list-photo" accept="image/*" class="hidden">
                </label>
            </div>

            <div id="ocr-progress-container" class="hidden">
                <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div id="ocr-progress-bar" class="bg-blue-600 h-2.5 rounded-full" style="width: 0%"></div>
                </div>
                <p id="ocr-status-text" class="text-xs text-center text-gray-500 mt-1">Processing image...</p>
            </div>

            <div>
                 <p class="text-gray-600 text-sm mb-1"><strong>Option 2: Paste List</strong></p>
                 <textarea id="import-student-textarea" class="w-full h-48 p-3 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Paste names here...&#10;John Smith&#10;Jane Doe&#10;..."></textarea>
            </div>
            
            <div class="flex items-center gap-2">
                <input type="checkbox" id="reverse-names-check" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                <label for="reverse-names-check" class="text-sm text-gray-700">Force "Last, First" format (if no commas)</label>
            </div>

            <div id="import-preview-area" class="hidden bg-gray-50 p-3 rounded border border-gray-200 text-sm max-h-40 overflow-y-auto">
                <p class="font-bold text-gray-500 mb-2">Preview:</p>
                <ul id="import-preview-list" class="list-disc list-inside text-gray-700"></ul>
            </div>
            <p id="import-count" class="text-right text-xs text-gray-400 font-medium"></p>
        </div>
    `;

    // 2. Helper to Parse the Text
    const parseStudents = (text, forceReverse) => {
        if (!text) return [];
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                let firstName, lastName;
                
                // Detect "Last, First" (Comma is the strongest signal)
                if (line.includes(',')) {
                    const parts = line.split(',');
                    lastName = parts[0].trim();
                    firstName = parts.slice(1).join(' ').trim();
                } 
                // Detect "First Last" (Space separated)
                else {
                    const parts = line.split(/\s+/);
                    if (parts.length === 1) {
                        firstName = parts[0];
                        lastName = ''; // Mononym?
                    } else if (forceReverse) {
                         // User checked "Force Last, First" but there were no commas
                        lastName = parts[0];
                        firstName = parts.slice(1).join(' ');
                    } else {
                        // Standard "John Smith"
                        firstName = parts[0];
                        lastName = parts.slice(1).join(' ');
                    }
                }
                // Capitalize nicely
                const capitalize = (s) => (s && s.length > 0) ? s.charAt(0).toUpperCase() + s.slice(1) : '';
                return { 
                    firstName: capitalize(firstName), 
                    lastName: capitalize(lastName) 
                };
            });
    };

    // 3. Show the Modal
    showModal({
        title: 'Import Students',
        content: modalContent,
        confirmText: 'Import Students',
        confirmClasses: 'bg-green-600 hover:bg-green-700 text-white',
        onConfirm: () => {
            const text = document.getElementById('import-student-textarea').value;
            const forceReverse = document.getElementById('reverse-names-check').checked;
            const studentsToAdd = parseStudents(text, forceReverse); // Changed function name call

            if (studentsToAdd.length === 0) return;

            // Add them to the class data
            studentsToAdd.forEach(s => {
                const newId = `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                if (!classData.students) classData.students = {};
                classData.students[newId] = {
                    id: newId,
                    firstName: s.firstName,
                    lastName: s.lastName,
                    iep: false,
                    grades: {} // Init empty grades
                };
            });

            renderGradebook();
            triggerAutoSave();
        }
    });

    // 4. Attach Live Preview & OCR Listeners
    setTimeout(() => {
        const textarea = document.getElementById('import-student-textarea');
        const checkbox = document.getElementById('reverse-names-check');
        const previewArea = document.getElementById('import-preview-area');
        const previewList = document.getElementById('import-preview-list');
        const countLabel = document.getElementById('import-count');
        const fileInput = document.getElementById('student-list-photo');
        const progressBar = document.getElementById('ocr-progress-bar');
        const progressContainer = document.getElementById('ocr-progress-container');
        const statusText = document.getElementById('ocr-status-text');

        const updatePreview = () => {
            const text = textarea.value;
            const forceReverse = checkbox.checked;
            const parsed = parseStudents(text, forceReverse); // Changed function name call

            if (parsed.length > 0) {
                previewArea.classList.remove('hidden');
                previewList.innerHTML = parsed.slice(0, 5).map(s => `<li>${s.firstName} <strong>${s.lastName}</strong></li>`).join('');
                if (parsed.length > 5) previewList.innerHTML += `<li class="text-gray-400 italic">...and ${parsed.length - 5} more</li>`;
                countLabel.textContent = `Found ${parsed.length} student${parsed.length === 1 ? '' : 's'}`;
            } else {
                previewArea.classList.add('hidden');
                countLabel.textContent = '';
            }
        };

        // --- OCR LOGIC ---
        fileInput.addEventListener('change', async (e) => {
            if (!e.target.files || e.target.files.length === 0) return;
            
            const file = e.target.files[0];
            progressContainer.classList.remove('hidden');
            textarea.disabled = true;

            try {
                // Tesseract.js is loaded from CDN in index.html
                const worker = await Tesseract.createWorker({
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const pct = Math.round(m.progress * 100);
                            progressBar.style.width = `${pct}%`;
                            statusText.textContent = `Reading text... ${pct}%`;
                        } else {
                            statusText.textContent = m.status;
                        }
                    }
                });

                await worker.loadLanguage('eng');
                await worker.initialize('eng');
                
                const { data: { text } } = await worker.recognize(file);
                
                await worker.terminate();

                // Populate textarea with result
                textarea.value = text;
                textarea.disabled = false;
                progressContainer.classList.add('hidden');
                
                // Trigger preview update
                updatePreview();

            } catch (err) {
                console.error("OCR Error:", err);
                statusText.textContent = "Error reading image. Please try again or type manually.";
                statusText.classList.add('text-red-500');
                textarea.disabled = false;
            }
        });

        textarea.addEventListener('input', updatePreview);
        checkbox.addEventListener('change', updatePreview);
    }, 50); 
}

export function showPdfExportOptionsModal() {
    const classData = getActiveClassData();
    if (!classData) return;

    const students = Object.values(classData.students || {}).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

    const studentCheckboxes = students.map(student => `
        <label class="flex items-center">
            <input type="checkbox" class="student-export-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${student.id}" checked>
            <span class="ml-2 text-sm text-gray-700">${student.lastName}, ${student.firstName}</span>
        </label>
    `).join('');

    showModal({
        title: 'PDF Export Options',
        content: `
            <div>
                <h4 class="text-md font-semibold mb-2">Select Students</h4>
                <div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
                    ${studentCheckboxes}
                </div>
            </div>
            <div class="mt-4">
                <h4 class="text-md font-semibold mb-2">Include</h4>
                <div class="space-y-2">
                    <label class="flex items-center">
                        <input type="checkbox" id="include-missing-assignments" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                        <span class="ml-2 text-sm text-gray-700">Missing Assignments</span>
                    </label>
                </div>
            </div>
        `,
        confirmText: 'Export PDF',
        confirmClasses: 'bg-blue-600 hover:bg-blue-700',
        onConfirm: () => {
            const selectedStudentIds = Array.from(document.querySelectorAll('.student-export-checkbox:checked')).map(cb => cb.value);
            const includeMissingAssignments = document.getElementById('include-missing-assignments').checked;
            
            exportClassPDF({
                studentIds: selectedStudentIds,
                includeMissingAssignments,
            });
        }
    });
}

function exportClassPDF({ studentIds = [], includeMissingAssignments = false }) {
    const classData = getActiveClassData();
    const appState = getAppState();
    const profile = {
        name: appState.full_name || 'Teacher',
        school: appState.school_name || 'School',
        class: classData.name || 'Class',
    };

    if (!classData) return;

    // We need jsPDF and autoTable, which are loaded from index.html
    const { jsPDF } = window.jspdf;
    
    try {
        const doc = new jsPDF();
        const selectedStudents = studentIds.map(id => classData.students[id]).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

        selectedStudents.forEach((student, index) => {
            const avgs = calculateStudentAverages(student, classData);

            if (index > 0) doc.addPage();

            // --- Header ---
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            doc.text(profile.school, 14, 20);
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.text(`Teacher: ${profile.name}`, 14, 26);
            doc.text(`Class: ${profile.class}`, 14, 32);

            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.text(`Student Report: ${student.firstName} ${student.lastName}`, doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });

            // --- Summary ---
            doc.autoTable({
                startY: 45,
                body: [
                    ['Overall Mark', avgs.overallGrade !== null ? `${avgs.overallGrade.toFixed(1)}%` : 'N/A'],
                    ['Term Mark', avgs.termMark !== null ? `${avgs.termMark.toFixed(1)}%` : 'N/A'],
                    ['Final Mark', classData.hasFinal ? (avgs.finalMark !== null ? `${avgs.finalMark.toFixed(1)}%` : 'N/A') : 'N/A'],
                ],
                theme: 'grid',
                styles: { fontSize: 10, cellPadding: 2, fontStyle: 'bold' },
                columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'normal' } }
            });

            // --- Unit & Assignment Breakdown ---
            const units = Object.values(classData.units || {}).sort((a, b) => a.order - b.order);
            let finalY = doc.autoTable.previous.finalY + 10;

            units.forEach(unit => {
                const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
                if (assignments.length === 0) return;

                const body = [];
                assignments.forEach(asg => {
                    const grade = student.grades?.[asg.id];
                    if (unit.isFinal) {
                        const score = grade?.grade ?? 'N/A';
                        if (includeMissingAssignments || score !== 'N/A') {
                            body.push([asg.name, `${score} / ${asg.total || 0}`]);
                        }
                    } else {
                        const k = grade?.k ?? 'N/A';
                        const t = grade?.t ?? 'N/A';
                        const c = grade?.c ?? 'N/A';
                        const a = grade?.a ?? 'N/A';
                        if (includeMissingAssignments || [k, t, c, a].some(m => m !== 'N/A')) {
                            body.push([
                                asg.name,
                                `${k} / ${asg.categoryTotals?.k || 0}`,
                                `${t} / ${asg.categoryTotals?.t || 0}`,
                                `${c} / ${asg.categoryTotals?.c || 0}`,
                                `${a} / ${asg.categoryTotals?.a || 0}`,
                            ]);
                        }
                    }
                });

                if (body.length > 0) {
                    const head = unit.isFinal 
                        ? [[{ content: unit.title || `Unit ${unit.order}`, colSpan: 2, styles: { halign: 'center', fillColor: [230, 230, 230] } }], ['Assignment', 'Score']]
                        : [[{ content: unit.title || `Unit ${unit.order}`, colSpan: 5, styles: { halign: 'center', fillColor: [230, 230, 230] } }], ['Assignment', 'K', 'T', 'C', 'A']];
                    
                    doc.autoTable({
                        startY: finalY,
                        head: head,
                        body: body,
                        theme: 'grid',
                        styles: { fontSize: 9, cellPadding: 1.5 },
                        headStyles: { fontStyle: 'bold' }
                    });
                    finalY = doc.autoTable.previous.finalY + 8;
                }
            });
        });

        doc.save(`${profile.class}_Student_Reports.pdf`);
    } catch (error) {
        console.error("PDF Export failed:", error);
        showModal({
            title: 'PDF Export Failed',
            content: `<p>An error occurred while generating the PDF. See the console for details.</p>`,
            confirmText: null,
            cancelText: 'Close'
        });
    }
}

export function exportBlankMarksheet() {
    const classData = getActiveClassData(); // Use state getter
    const appState = getAppState(); // Use state getter
    const profile = {
        name: appState.full_name || 'Teacher',
        school: appState.school_name || 'School',
        class: classData?.name || 'Class', // Safely access class name
    };

    if (!classData) {
        showModal({ title: 'Error', content: '<p>No active class selected.</p>', confirmText: null, cancelText: 'Close' }); // Use existing showModal
        return;
    }

    const { jsPDF } = window.jspdf; // Get jsPDF library
    const doc = new jsPDF({ orientation: 'landscape' }); // Use landscape orientation

    // --- Build Headers ---
    const head = [[], []]; // 2 header rows
    const categoryHeaders = ['K', 'T', 'C', 'A'];
    const defaultAssignmentCount = 6; // *** Default to 6 assignment columns ***
    const totalAssignmentPlaceholders = defaultAssignmentCount;
    const totalAssignmentCols = totalAssignmentPlaceholders * categoryHeaders.length; // Total K/T/C/A columns

    // Row 1: Student Name + Blank Assignment Title spaces
    head[0].push({ content: 'Student Name', rowSpan: 2, styles: { halign: 'left', valign: 'middle', fontStyle: 'bold' } }); // Student Name spans 2 rows

    // Add a blank, spanned cell for each assignment placeholder
    for (let i = 0; i < totalAssignmentPlaceholders; i++) {
        head[0].push({ content: '', colSpan: categoryHeaders.length, styles: { halign: 'center', minCellHeight: 6, fillColor: [255, 255, 255] } });
    }

    // Row 2: Category Headers (K, T, C, A repeated)
    for (let i = 0; i < totalAssignmentPlaceholders; i++) {
        head[1].push(...categoryHeaders.map(cat => ({ content: cat, styles: { halign: 'center', minCellWidth: 10, fontSize: 9 } })));
    }

    // --- Build Body (Student Names + Empty Cells) ---
    const students = Object.values(classData.students || {}).sort((a, b) => { // Get sorted students
        const lastNameA = String(a?.lastName || '');
        const lastNameB = String(b?.lastName || '');
        const firstNameA = String(a?.firstName || '');
        const firstNameB = String(b?.firstName || '');
        return lastNameA.localeCompare(lastNameB) || firstNameA.localeCompare(firstNameB);
    });

    const totalCols = head[1].length + 1; // Use head[1] for column count now

    // *** Create rows WITH student names and empty grade cells ***
    const body = students.map(student => {
        return Array(totalCols).fill('').map((_, i) => i === 0 ? `${student.lastName}, ${student.firstName}` : ''); // Student name in first cell
    });

    // Add extra blank rows for additional students (e.g., up to 20 total rows)
    const desiredRowCount = 20; // *** Desired total rows in the marksheet ***
    const blankRowsToAdd = Math.max(0, desiredRowCount - students.length);
    for (let i = 0; i < blankRowsToAdd; i++) {
         body.push(Array(totalCols).fill('')); // Add empty rows
    }

    // --- Generate PDF ---
    try {
        // *** Add Title and Subtitle (Teacher/School/Class info) ***
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text(`${profile.class} - Blank Marksheet`, 14, 15);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Teacher: ${profile.name} | School: ${profile.school}`, 14, 21);

       // Draw the table using autoTable
        doc.autoTable({
            startY: 25,
            head: head,
            body: body,
            theme: 'grid',
            tableWidth: 'auto', // Auto-fit columns
            styles: {
                fontSize: 7,
                cellPadding: 1,
                lineWidth: 0.1,
                valign: 'middle',
                minCellHeight: 8,
            },
            headStyles: {
                fontStyle: 'bold',
                halign: 'center',
                fillColor: [180, 180, 180], // *** Darker Gray Header ***
                textColor: [0, 0, 0], // Ensure text is black for contrast
                fontSize: 8,
                cellPadding: { top: 2, right: 1, bottom: 2, left: 1 },
            },
            columnStyles: {
                0: { // Student Name column
                    fontStyle: 'bold',
                    halign: 'left',
                    cellWidth: 40, // Keep fixed width for student names
                },
                 // K/T/C/A columns will auto-size
            },
            didParseCell: function (data) {
                 if (data.row.section === 'head') {
                     if (data.column.index === 0) { // Student Name Header
                         data.cell.styles.valign = 'middle';
                         data.cell.styles.fontSize = 8;
                         data.cell.styles.textColor = [0, 0, 0]; // Ensure black text
                     }
                     if (data.row.index === 0 && data.column.index > 0) { // Blank Header Cells
                        data.cell.styles.minCellHeight = 5;
                        data.cell.styles.fillColor = [255, 255, 255]; // Keep blank cells white
                     }
                      if (data.row.index === 1 && data.column.index > 0) { // K/T/C/A Header Cells
                         data.cell.styles.fontSize = 7;
                         data.cell.styles.textColor = [0, 0, 0]; // Ensure black text
                     }
                 }
                 if (data.row.section === 'body') {
                    data.cell.styles.minCellHeight = 8;
                 }
            },
            margin: { left: 10, right: 10, top: 25, bottom: 15 }
        });

        // Save the PDF
        doc.save(`${profile.class}_Blank_Marksheet.pdf`);

    } catch (error) {
         console.error("Blank PDF Export failed:", error);
         showModal({ title: 'Export Failed', content: `<p>An error occurred while generating the blank marksheet PDF. See console for details.</p>`, confirmText: null, cancelText: 'Close' });
    }
}
export function exportStudentListPDF() {
    const classData = getActiveClassData();
    if (!classData) {
        alert("No class data to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const students = Object.values(classData.students || {}).sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));

    const margin = 20;
    const lineHeight = 8;
    const pageHeight = doc.internal.pageSize.height;
    let currentY = 30; // Start lower for the title

    // --- Title ---
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(`${classData.name} - Student List`, margin, 20);
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');

    // --- Student Loop ---
    students.forEach((student, index) => {
        // Check for page break *before* printing
        if (currentY > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
        }

        const studentName = `${index + 1}. ${student.lastName || ''}, ${student.firstName || ''}`;
        doc.text(studentName, margin, currentY);
        currentY += lineHeight;
    });

    doc.save(`${classData.name}_student_list.pdf`);
}

export function exportContactListPDF() {
    const classData = getActiveClassData();
    if (!classData) {
        alert("No class data to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const students = Object.values(classData.students || {}).sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));

    const margin = 20;
    const lineHeight = 7;
    const indent = 10;
    const pageHeight = doc.internal.pageSize.height;
    const pageBottom = pageHeight - margin;
    let currentY = 30; // Start lower for title

    // --- Title ---
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(`${classData.name} - Student Contact List`, margin, 20);
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');

    // --- Student Loop ---
    students.forEach((student) => {
        const contacts = student.contacts || [];
        const studentName = `${student.lastName || ''}, ${student.firstName || ''}`;
        
        // --- Calculate block height to prevent splitting a student's info ---
        let blockHeight = lineHeight; // 1 line for name
        if (contacts.length > 0) {
            blockHeight += contacts.length * lineHeight;
        } else {
            blockHeight += lineHeight; // 1 line for "no contacts"
        }
        blockHeight += 5; // 5 units of spacing after the block

        // Check for page break *before* printing the whole block
        if (currentY + blockHeight > pageBottom) {
            doc.addPage();
            currentY = margin;
        }

        // --- Print Student Name ---
        doc.setFont(undefined, 'bold');
        doc.text(studentName, margin, currentY);
        currentY += lineHeight;
        doc.setFont(undefined, 'normal');

        // --- Print Contacts ---
        if (contacts.length > 0) {
            contacts.forEach(contact => {
                const contactType = contact.isParent ? "(Parent/Guardian)" : "";
                const contactInfo = `${contact.name}: ${contact.info} ${contactType}`;
                doc.text(contactInfo, margin + indent, currentY);
                currentY += lineHeight;
            });
        } else {
            doc.text("(No contacts on file)", margin + indent, currentY);
            currentY += lineHeight;
        }
        
        // Add spacing after the block
        currentY += 5; 
    });

    doc.save(`${classData.name}_contact_list.pdf`);
}

// --- NEW FUNCTION: Move Class ---
//

export function moveClassToSemester() {
    const appState = getAppState();
    const classData = getActiveClassData();
    
    if (!classData) return;

    const currentSem = appState.gradebook_data.activeSemester || '1';
    const targetSem = currentSem === '1' ? '2' : '1';
    const classId = appState.gradebook_data.activeClassId;

    if (confirm(`Are you sure you want to move "${classData.name}" to Semester ${targetSem}?`)) {
        // 1. Ensure target semester classes object exists
        if (!appState.gradebook_data.semesters[targetSem]) {
             appState.gradebook_data.semesters[targetSem] = { classes: {} };
        }
        if (!appState.gradebook_data.semesters[targetSem].classes) {
            appState.gradebook_data.semesters[targetSem].classes = {};
        }

        // 2. Move data: Copy to target
        appState.gradebook_data.semesters[targetSem].classes[classId] = classData;
        
        // 3. Delete from source (Current Semester)
        delete appState.gradebook_data.semesters[currentSem].classes[classId];

        // 4. Update Active Class Logic
        // Since the active class is gone, pick the next available one in the CURRENT semester (or null)
        const remainingClasses = Object.keys(appState.gradebook_data.semesters[currentSem].classes || {});
        appState.gradebook_data.activeClassId = remainingClasses.length > 0 ? remainingClasses[0] : null;

        // 5. Force UI Update
        // This function refreshes the tabs (making the moved one disappear) and the content area
        updateUIFromState(); 
        triggerAutoSave();
    }
}