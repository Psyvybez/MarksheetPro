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

export function addClass() {
    const appState = getAppState();
    const presets = appState.gradebook_data.presets || {};
    const presetOptions = Object.keys(presets).map(id => `<option value="${id}">${presets[id].name}</option>`).join('');

    showModal({
        title: 'Add New Class',
        content: `
            <div class="space-y-4">
                <div>
                    <label for="class-name-input" class="block text-sm font-medium">Class Name</label>
                    <input type="text" id="class-name-input" class="mt-1 block w-full" placeholder="e.g., Grade 10 Math">
                </div>
                <div>
                    <label for="class-preset-select" class="block text-sm font-medium">Use a Preset (Optional)</label>
                    <select id="class-preset-select" class="mt-1 block w-full">
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
                const semesterClasses = appState.gradebook_data.semesters[activeSemester]?.classes || {};
                const newOrder = Object.keys(semesterClasses).length;

                let newClassData;
                if (presetId && presets[presetId]) {
                    newClassData = {
                        ...presets[presetId],
                        id: newClassId,
                        name: newClassName,
                        order: newOrder,
                        students: {},
                        attendance: {}
                    };
                } else {
                    const units = {};
                    for (let i = 1; i <= 5; i++) {
                        const unitId = `unit_${Date.now()}_${i}`;
                        units[unitId] = { id: unitId, order: i, title: ``, subtitle: '', weight: 20, assignments: {} };
                    }
                    newClassData = {
                        id: newClassId, name: newClassName, hasFinal: false, finalWeight: 30, midtermsRecorded: false,
                        order: newOrder, isArchived: false, attendance: {},
                        categoryWeights: { k: 25, t: 25, c: 25, a: 25 }, units, students: {}
                    };
                }
                
                if (!appState.gradebook_data.semesters[activeSemester]) appState.gradebook_data.semesters[activeSemester] = { classes: {} };
                appState.gradebook_data.semesters[activeSemester].classes[newClassId] = newClassData;
                appState.gradebook_data.activeClassId = newClassId;
                updateUIFromState();
                triggerAutoSave();
            }
        }
    });
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
        content: `<div class="space-y-4"><div><label for="student-firstname-input" class="block text-sm font-medium">First Name</label><input type="text" id="student-firstname-input" class="mt-1 block w-full"></div><div><label for="student-lastname-input" class="block text-sm font-medium">Last Name</label><input type="text" id="student-lastname-input" class="mt-1 block w-full"></div></div>`,
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
                    classData.students[studentId] = { id: studentId, firstName, lastName, grades: {}, iep: false, midtermGrade: null, iepNotes: '', generalNotes: '', profilePicturePath: null, contacts: [] };
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
        const weightColor = totalWeight === 100 ? 'text-green-600' : 'text-red-600';

        let termUnitsHtml = termUnits.map(unit => `
            <div class="unit-item flex items-center gap-3 p-2 border rounded-md bg-gray-50" draggable="true" data-unit-id="${unit.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                <span class="font-semibold text-gray-600">Unit ${unit.order}:</span>
                <input type="text" data-field="title" class="p-1 border rounded-md flex-grow" value="${unit.title || ''}" placeholder="Custom Title (e.g., Algebra)">
                <input type="text" data-field="subtitle" class="p-1 border rounded-md flex-grow" value="${unit.subtitle || ''}" placeholder="Subtitle (optional)">
                <input type="number" step="0.1" data-field="weight" class="p-1 border rounded-md w-24 text-right" value="${unit.weight}">
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
                    <div id="term-weight-total-display" class="text-right font-bold mb-4 ${weightColor}">Term Weight Total: ${totalWeight}%</div>
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
        modal.querySelectorAll('.unit-item[draggable="true"]').forEach((item, index) => {
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
                console.error("Invalid state retrieved from modal"); 
                return false;
            }
            
            if (!isValidWeightDistribution(newState)) {
                showModal({
                title: 'Invalid Weight Distribution',
                content: '<p>The total weight of all term units must equal 100%.</p>',
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

    const updateTotalWeightDisplay = () => {
        const state = getStateFromModalDOM(modal);
        const termUnits = Object.values(state.units).filter(u => !u.isFinal);
        const totalWeight = termUnits.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);
        const display = modal.querySelector('#term-weight-total-display');
        if (display) {
            display.textContent = `Term Weight Total: ${totalWeight}%`;
            display.className = `text-right font-bold mb-4 ${Math.round(totalWeight) === 100 ? 'text-green-600' : 'text-red-600'}`;
        }
    };

    const reRenderModalContent = () => {
        const modalContent = modal.querySelector('.modal-content-area');
        if(!modalContent) return;
        const state = getStateFromModalDOM(modal);
        modalContent.innerHTML = renderUnitsEditor(state.units, state.hasFinal, state.finalWeight);
    };

    modal.addEventListener('input', e => {
        if (e.target.matches('.unit-item input[data-field="weight"]')) {
            updateTotalWeightDisplay();
        }
    });

    modal.addEventListener('change', e => {
        if (e.target.id === 'has-final-checkbox') {
            reRenderModalContent();
        }
    });

    modal.addEventListener('click', e => {
        if (e.target.id === 'add-unit-btn') {
            const state = getStateFromModalDOM(modal);
            const newId = `unit_${Date.now()}`;
            const newOrder = Object.values(state.units).filter(u => !u.isFinal).length + 1;
            state.units[newId] = { id: newId, order: newOrder, title: ``, subtitle: '', weight: 0, assignments: {} };
            reRenderModalContent();
        } else if (e.target.classList.contains('delete-unit-btn')) {
            e.target.closest('.unit-item').remove();
            updateTotalWeightDisplay();
        }
    });
    
    modal.addEventListener('dragstart', e => {
        if (e.target.classList.contains('unit-item')) {
            draggedItem = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        }
    });

    modal.addEventListener('dragend', () => {
        if (!draggedItem) return;
        draggedItem.classList.remove('dragging');
        draggedItem = null;
        
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

export function manageAssignments() {
    const appState = getAppState();
    const classData = getActiveClassData();
    const activeUnitId = appState.gradebook_data?.activeUnitId;

    if (!classData || !activeUnitId || activeUnitId === 'all') {
        return;
    }

    const unit = classData.units[activeUnitId];
    if (!unit) return;

    let draggedItem = null;

    Object.values(unit.assignments || {}).forEach((asg, index) => {
        if (asg.order === undefined) asg.order = index;
        if (asg.weight === undefined) asg.weight = 1;
    });

    function renderAssignmentsEditor(currentUnit) {
        const isFinal = currentUnit.isFinal;
        const assignments = Object.values(currentUnit.assignments || {}).sort((a,b) => a.order - b.order);

        const assignmentsHtml = assignments.map(asg => {
            if (isFinal) {
                return `
                    <div class="assignment-item grid grid-cols-[auto,1fr,5rem,6rem,auto] items-center gap-2 p-2 bg-white rounded border" draggable="true" data-asg-id="${asg.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                        <input data-field="name" type="text" class="p-1 border rounded-md w-full" value="${asg.name || ''}" placeholder="Assessment Name">
                        <input data-field="weight" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.weight || 1}" placeholder="x1">
                        <input data-field="total" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.total || 0}" placeholder="Total Score">
                        <button class="delete-asg-btn delete-btn" data-asg-id="${asg.id}">&times;</button>
                    </div>`;
            } else {
                return `
                    <div class="assignment-item grid grid-cols-[auto,1fr,5rem,4rem,4rem,4rem,4rem,auto] items-center gap-2 p-2 bg-white rounded border" draggable="true" data-asg-id="${asg.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
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
            const name = item.querySelector('[data-field="name"]').value;
            const weight = parseFloat(item.querySelector('[data-field="weight"]').value) || 1;
            
            updatedAssignments[asgId] = {
                ...originalAsg,
                id: asgId,
                name: name,
                order: index,
                weight: weight
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
                newAsg.categoryTotals = { k: 0, t: 0, c: 0, a: 0 };
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
    
    editor.addEventListener('dragstart', e => {
        if (e.target.classList.contains('assignment-item')) {
            draggedItem = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        }
    });

    editor.addEventListener('dragend', () => {
        draggedItem?.classList.remove('dragging');
        draggedItem = null;
    });
    editor.addEventListener('dragover', e => {
        if (!draggedItem) return;
        e.preventDefault();
        const list = e.target.closest('.assignment-list');
        if (!list) return;

        const afterElement = [...list.querySelectorAll('.assignment-item:not(.dragging)')].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;

        if (afterElement == null) {
            list.appendChild(draggedItem);
        } else {
            list.insertBefore(draggedItem, afterElement);
        }
    });
}

// --- General Actions ---

export function saveClassAsPreset() {
    const classData = getActiveClassData();
    if (!classData) {
        alert("No active class to save as a preset.");
        return;
    }

    showModal({
        title: 'Save Class Preset',
        content: `<label for="preset-name-input" class="block text-sm font-medium">Preset Name</label><input type="text" id="preset-name-input" class="mt-1 block w-full" value="${classData.name} Preset">`,
        confirmText: 'Save Preset',
        confirmClasses: 'bg-secondary hover:bg-secondary-dark',
        onConfirm: () => {
            const appState = getAppState();
            const presetName = document.getElementById('preset-name-input').value.trim();
            if (presetName) {
                const presetId = `preset_${Date.now()}`;
                
                const presetData = JSON.parse(JSON.stringify(classData));
                delete presetData.students;
                delete presetData.attendance;
                delete presetData.id;
                delete presetData.name;
                delete presetData.order;

                presetData.name = presetName;

                if (!appState.gradebook_data.presets) {
                    appState.gradebook_data.presets = {};
                }
                appState.gradebook_data.presets[presetId] = presetData;
                triggerAutoSave();
                showModal({title: 'Preset Saved!', content: `<p>"${presetName}" has been saved.</p>`, confirmText: null, cancelText: 'Close'});
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

export function importStudentsCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const csv = event.target.result;
                const lines = csv.split('\n').filter(line => line);
                const headers = lines.shift().split(',').map(h => h.trim().toLowerCase());
                const firstNameIndex = headers.indexOf('firstname');
                const lastNameIndex = headers.indexOf('lastname');

                if (firstNameIndex === -1 || lastNameIndex === -1) {
                    throw new Error("CSV must contain 'FirstName' and 'LastName' columns.");
                }

                const studentsToImport = lines.map(line => {
                    const data = line.split(',');
                    return {
                        firstName: data[firstNameIndex].trim(),
                        lastName: data[lastNameIndex].trim(),
                    };
                });

                showModal({
                    title: 'Confirm Student Import',
                    content: `<p>Found ${studentsToImport.length} students. Do you want to add them to the class?</p>
                              <ul class="mt-2 text-sm text-gray-600">${studentsToImport.map(s => `<li>${s.lastName}, ${s.firstName}</li>`).join('')}</ul>`,
                    confirmText: 'Import',
                    confirmClasses: 'bg-green-600 hover:bg-green-700',
                    onConfirm: () => {
                        const classData = getActiveClassData();
                        if (!classData.students) classData.students = {};
                        studentsToImport.forEach(s => {
                            if (s.firstName && s.lastName) {
                                const studentId = `student_${Date.now()}_${Math.random()}`;
                                classData.students[studentId] = { id: studentId, ...s, grades: {}, iep: false, midtermGrade: null, iepNotes: '', generalNotes: '', profilePicturePath: null, contacts: [] };
                            }
                        });
                        renderGradebook();
                        triggerAutoSave();
                    }
                });

            } catch (error) {
                showModal({ title: 'Import Failed', content: `<p>${error.message}</p>`, confirmText: null, cancelText: 'Close' });
            }
        };
        reader.readAsText(file);
    };
    input.click();
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

// Replace the existing exportBlankMarksheet function in Frontend/actions.js with this

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
export function exportStudentListCSV() {
    const classData = getActiveClassData();
    if (!classData) {
        alert("No class data to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const students = Object.values(classData.students || {}).sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));

    const headers = ["LastName", "FirstName"];
    csvContent += headers.join(",") + "\r\n";

    students.forEach(student => {
        const row = [
            `"${(student.lastName || '').replace(/"/g, '""')}"`,
            `"${(student.firstName || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${classData.name}_student_list.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function exportContactListCSV() {
    const classData = getActiveClassData();
    if (!classData) {
        alert("No class data to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const students = Object.values(classData.students || {}).sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));

    const headers = ["LastName", "FirstName", "ContactName", "ContactInfo", "IsParentGuardian"];
    csvContent += headers.join(",") + "\r\n";

    students.forEach(student => {
        const contacts = student.contacts || [];
        if (contacts.length > 0) {
            contacts.forEach(contact => {
                const row = [
                    `"${(student.lastName || '').replace(/"/g, '""')}"`,
                    `"${(student.firstName || '').replace(/"/g, '""')}"`,
                    `"${(contact.name || '').replace(/"/g, '""')}"`,
                    `"${(contact.info || '').replace(/"/g, '""')}"`,
                    `"${contact.isParent ? "YES" : "NO"}"`
                ];
                csvContent += row.join(",") + "\r\n";
            });
        } else {
            // Include student even if they have no contacts
            const row = [
                `"${(student.lastName || '').replace(/"/g, '""')}"`,
                `"${(student.firstName || '').replace(/"/g, '""')}"`,
                "\"\"", "\"\"", "\"\""
            ];
            csvContent += row.join(",") + "\r\n";
        }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${classData.name}_contact_list.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}