import { showModal } from './ui.js';
import { getAppState, getActiveClassData, getActiveSemesterData, captureHistoryPoint } from './state.js';
import { triggerAutoSave } from './main.js';
import { renderGradebook, updateUIFromState } from './render.js';
import { calculateStudentAverages } from './calculations.js';

function getAppSettingsForExports() {
  const appSettings = getAppState()?.gradebook_data?.appSettings || {};
  return {
    attendanceEnabled: appSettings.attendanceEnabled !== false,
    gradeColorIntensity: ['subtle', 'standard', 'strong'].includes(appSettings.gradeColorIntensity)
      ? appSettings.gradeColorIntensity
      : 'standard',
  };
}

function getAttendanceSummaryForStudent(classData, studentId) {
  const attendance = classData?.attendance || {};
  let present = 0;
  let absent = 0;
  let late = 0;

  Object.values(attendance).forEach((dateData) => {
    const status = dateData?.[studentId]?.status;
    if (status === 'absent') absent += 1;
    else if (status === 'late') late += 1;
    else if (status === 'present') present += 1;
  });

  const trackedDays = present + absent + late;
  const attendancePct = trackedDays > 0 ? (present / trackedDays) * 100 : null;
  return { present, absent, late, trackedDays, attendancePct };
}

function getIntensityPaletteForPdf(intensity) {
  const palette = {
    subtle: {
      l4: { fill: [240, 253, 244], text: [21, 128, 61] },
      l3: { fill: [239, 246, 255], text: [29, 78, 216] },
      l2: { fill: [254, 252, 232], text: [161, 98, 7] },
      l1: { fill: [255, 247, 237], text: [194, 65, 12] },
      r: { fill: [254, 242, 242], text: [185, 28, 28] },
    },
    standard: {
      l4: { fill: [220, 252, 231], text: [22, 101, 52] },
      l3: { fill: [219, 234, 254], text: [30, 64, 175] },
      l2: { fill: [254, 249, 195], text: [133, 77, 14] },
      l1: { fill: [255, 237, 213], text: [154, 52, 18] },
      r: { fill: [254, 226, 226], text: [153, 27, 27] },
    },
    strong: {
      l4: { fill: [134, 239, 172], text: [20, 83, 45] },
      l3: { fill: [147, 197, 253], text: [30, 58, 138] },
      l2: { fill: [253, 224, 71], text: [113, 63, 18] },
      l1: { fill: [253, 186, 116], text: [124, 45, 18] },
      r: { fill: [252, 165, 165], text: [127, 29, 29] },
    },
  };
  return palette[intensity] || palette.standard;
}

function getColorBandForPercent(percent, intensity) {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return null;
  const palette = getIntensityPaletteForPdf(intensity);
  if (percent >= 80) return palette.l4;
  if (percent >= 70) return palette.l3;
  if (percent >= 60) return palette.l2;
  if (percent >= 50) return palette.l1;
  return palette.r;
}

function parsePercentCellValue(value) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(String(value).replace('%', '').trim());
  return Number.isFinite(num) ? num : null;
}
// --- Class & Semester Actions ---

function getAssignmentFactorForUnit(unit, classData) {
  const catWeights = classData.categoryWeights || { k: 25, t: 25, c: 25, a: 25 };
  const assignments = Object.values(unit.assignments || {});

  return assignments.reduce((sum, asg) => {
    const asgWeight = parseFloat(asg.weight) || 1;
    if (unit.isFinal) return sum + asgWeight;

    const categoryFactor = ['k', 't', 'c', 'a'].reduce((catSum, cat) => {
      const hasCategory = (parseFloat(asg.categoryTotals?.[cat]) || 0) > 0;
      if (!hasCategory) return catSum;
      return catSum + (parseFloat(catWeights[cat]) || 0) / 100;
    }, 0);

    return sum + asgWeight * categoryFactor;
  }, 0);
}

function normalizeWeightsToTarget(units, target = 100) {
  if (!units.length) return;
  const total = units.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);

  if (total <= 0) {
    const even = target / units.length;
    units.forEach((unit, idx) => {
      unit.weight = idx === units.length - 1 ? target - even * (units.length - 1) : even;
    });
    return;
  }

  let allocated = 0;
  units.forEach((unit, idx) => {
    if (idx === units.length - 1) {
      unit.weight = Math.max(0, target - allocated);
      return;
    }
    const nextWeight = (parseFloat(unit.weight) / total) * target;
    unit.weight = nextWeight;
    allocated += nextWeight;
  });
}

function applyAutoUnitWeights(classData) {
  if (!classData?.units) return;

  const termUnits = Object.values(classData.units)
    .filter((u) => !u.isFinal)
    .sort((a, b) => a.order - b.order);
  if (!termUnits.length) return;

  classData.unitWeightOverrides = classData.unitWeightOverrides || {};

  Object.keys(classData.unitWeightOverrides).forEach((unitId) => {
    if (!classData.units[unitId] || classData.units[unitId].isFinal) {
      delete classData.unitWeightOverrides[unitId];
    }
  });

  const lockedUnits = termUnits.filter((unit) => Boolean(classData.unitWeightOverrides[unit.id]));
  const unlockedUnits = termUnits.filter((unit) => !classData.unitWeightOverrides[unit.id]);
  const lockedTotal = lockedUnits.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);
  const remaining = Math.max(0, 100 - lockedTotal);

  if (!unlockedUnits.length) {
    normalizeWeightsToTarget(termUnits, 100);
    return;
  }

  const weightedFactors = unlockedUnits.map((unit) => ({
    unit,
    factor: getAssignmentFactorForUnit(unit, classData),
  }));
  const factorTotal = weightedFactors.reduce((sum, entry) => sum + entry.factor, 0);

  if (factorTotal <= 0) {
    const even = remaining / unlockedUnits.length;
    let allocated = 0;
    unlockedUnits.forEach((unit, idx) => {
      if (idx === unlockedUnits.length - 1) {
        unit.weight = Math.max(0, remaining - allocated);
      } else {
        unit.weight = even;
        allocated += even;
      }
    });
    return;
  }

  let allocated = 0;
  weightedFactors.forEach(({ unit, factor }, idx) => {
    if (idx === weightedFactors.length - 1) {
      unit.weight = Math.max(0, remaining - allocated);
      return;
    }
    const nextWeight = (factor / factorTotal) * remaining;
    unit.weight = nextWeight;
    allocated += nextWeight;
  });
}

export function switchSemester(semester) {
  const appState = getAppState();
  if (!appState.gradebook_data) return;
  appState.gradebook_data.activeSemester = semester;
  const semesterData = getActiveSemesterData();
  const classIds = Object.keys(semesterData.classes || {});
  const sortedClassIds = classIds.sort((a, b) =>
    semesterData.classes[a].name.localeCompare(semesterData.classes[b].name)
  );
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

  if (classData.isArchived) {
    showModal({
      title: 'Unarchive Class',
      content: `<p>Restore "<strong>${classData.name}</strong>" to active classes?</p>`,
      confirmText: 'Unarchive',
      confirmClasses: 'bg-secondary hover:bg-secondary-dark',
      onConfirm: () => {
        if (!appState.gradebook_data) return;
        captureHistoryPoint();
        classData.isArchived = false;
        updateUIFromState();
        triggerAutoSave();
      },
    });
    return;
  }

  showModal({
    title: 'Archive Class',
    content: `<p>Are you sure you want to archive "<strong>${classData.name}</strong>"?</p><p class="text-sm text-gray-500 mt-2">Archived classes can be viewed and restored later.</p>`,
    confirmText: 'Archive',
    confirmClasses: 'bg-yellow-500 hover:bg-yellow-600',
    onConfirm: () => {
      if (!appState.gradebook_data) return;
      captureHistoryPoint();
      classData.isArchived = true;
      const activeSemester = appState.gradebook_data.activeSemester;
      const classIds = Object.keys(appState.gradebook_data.semesters[activeSemester].classes).filter(
        (id) => !appState.gradebook_data.semesters[activeSemester].classes[id].isArchived
      );
      appState.gradebook_data.activeClassId = classIds.length > 0 ? classIds[0] : null;
      updateUIFromState();
      triggerAutoSave();
    },
  });
}

export function deleteClass() {
  const classData = getActiveClassData();
  const appState = getAppState();
  if (!classData || !appState.gradebook_data) return;

  if (classData.isArchived) {
    showModal({
      title: 'Delete Class Unavailable',
      content: '<p>Archived classes cannot be deleted. Unarchive this class first to delete it.</p>',
      confirmText: null,
      cancelText: 'Close',
      modalWidth: 'max-w-sm',
    });
    return;
  }

  showModal({
    title: 'Delete Class',
    content: `
      <div class="space-y-3">
        <p>Delete <strong>${classData.name}</strong> and all associated students, grades, and attendance records?</p>
        <p class="text-sm text-red-600 font-semibold">This permanently removes the class data from the semester.</p>
        <div>
          <label for="delete-class-confirm-input" class="block text-sm font-medium text-gray-700">Type <strong>DELETE</strong> to confirm</label>
          <input type="text" id="delete-class-confirm-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
          <p id="delete-class-confirm-error" class="hidden text-sm text-red-600 mt-1">Please type DELETE to continue.</p>
        </div>
      </div>
    `,
    confirmText: 'Delete Class',
    confirmClasses: 'bg-red-600 hover:bg-red-700',
    onConfirm: () => {
      const input = document.getElementById('delete-class-confirm-input');
      const errorEl = document.getElementById('delete-class-confirm-error');
      const typedValue = input?.value?.trim();

      if (typedValue !== 'DELETE') {
        if (errorEl) errorEl.classList.remove('hidden');
        input?.focus();
        return false;
      }

      const activeSemester = appState.gradebook_data.activeSemester;
      const semesterClasses = appState.gradebook_data.semesters?.[activeSemester]?.classes;
      const classId = appState.gradebook_data.activeClassId;
      if (!semesterClasses || !classId || !semesterClasses[classId]) return false;

      captureHistoryPoint();
      delete semesterClasses[classId];

      const remainingClassIds = Object.keys(semesterClasses).sort(
        (a, b) => (semesterClasses[a]?.order || 0) - (semesterClasses[b]?.order || 0)
      );
      appState.gradebook_data.activeClassId = remainingClassIds.length > 0 ? remainingClassIds[0] : null;

      updateUIFromState();
      triggerAutoSave();
      return true;
    },
  });
}

export function addStudent() {
  showModal({
    title: 'Add New Student',
    content: `<div class="space-y-4"><div><label for="student-firstname-input" class="block text-sm font-medium">First Name</label><input type="text" id="student-firstname-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"></div><div><label for="student-lastname-input" class="block text-sm font-medium">Last Name</label><input type="text" id="student-lastname-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"></div></div>`,
    confirmText: 'Add & Next',
    cancelText: 'Done',
    confirmClasses: 'bg-primary hover:bg-primary-dark',
    onAction: () => {
      const firstNameInput = document.getElementById('student-firstname-input');
      const lastNameInput = document.getElementById('student-lastname-input');
      const firstName = firstNameInput?.value.trim();
      const lastName = lastNameInput?.value.trim();

      if (firstName && lastName) {
        const classData = getActiveClassData();
        if (classData) {
          captureHistoryPoint();
          const studentId = `student_${Date.now()}`;
          if (!classData.students) classData.students = {};
          classData.students[studentId] = {
            id: studentId,
            firstName,
            lastName,
            grades: {},
            iep: false,
            midtermGrade: null,
            startingOverallMark: null,
            iepNotes: '',
            generalNotes: '',
            profilePicturePath: null,
            contacts: [],
          };
          renderGradebook();
          triggerAutoSave();
          if (firstNameInput) firstNameInput.value = '';
          if (lastNameInput) lastNameInput.value = '';
          firstNameInput?.focus();
        }
      } else {
        if (!firstName) firstNameInput?.focus();
        else lastNameInput?.focus();
      }
    },
  });
}

export function deleteStudent(studentId) {
  const classData = getActiveClassData();
  const student = classData?.students?.[studentId];
  if (!student) return;

  if (!classData.trash) classData.trash = { students: {} };
  if (!classData.trash.students) classData.trash.students = {};

  showModal({
    title: 'Move Student to Trash',
    content: `<p>Move "<strong>${student.firstName} ${student.lastName}</strong>" to trash?</p><p class="text-sm text-gray-500 mt-2">You can restore this student later.</p>`,
    confirmText: 'Move to Trash',
    confirmClasses: 'bg-red-600 hover:bg-red-700',
    onConfirm: () => {
      captureHistoryPoint();
      classData.trash.students[studentId] = {
        ...student,
        deletedAt: new Date().toISOString(),
      };
      delete classData.students[studentId];
      renderGradebook();
      triggerAutoSave();
    },
  });
}

export function showRestoreStudentsModal() {
  const classData = getActiveClassData();
  if (!classData) return;

  if (!classData.trash) classData.trash = { students: {} };
  if (!classData.trash.students) classData.trash.students = {};

  const trashedStudents = Object.values(classData.trash.students);
  if (trashedStudents.length === 0) {
    showModal({
      title: 'Trash is Empty',
      content: '<p>No deleted students to restore.</p>',
      confirmText: null,
      cancelText: 'Close',
      modalWidth: 'max-w-xs',
    });
    return;
  }

  const sortedTrashedStudents = trashedStudents.sort((a, b) =>
    `${a.lastName || ''} ${a.firstName || ''}`.localeCompare(`${b.lastName || ''} ${b.firstName || ''}`)
  );

  const rows = sortedTrashedStudents
    .map((student) => {
      const deletedDate = student.deletedAt ? new Date(student.deletedAt).toLocaleString() : 'Unknown';
      return `<label class="flex items-start gap-3 p-2 border rounded-md hover:bg-gray-50"><input type="checkbox" class="restore-student-checkbox mt-1" value="${student.id}"><span><span class="font-medium text-gray-800">${student.firstName} ${student.lastName}</span><span class="block text-xs text-gray-500">Deleted: ${deletedDate}</span></span></label>`;
    })
    .join('');

  showModal({
    title: 'Restore Students',
    modalWidth: 'max-w-2xl',
    content: `
      <div class="space-y-3">
        <p class="text-sm text-gray-600">Select students to restore to this class.</p>
        <label class="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" id="restore-select-all" checked>
          Select all
        </label>
        <div class="max-h-72 overflow-y-auto space-y-2 pr-1">${rows}</div>
      </div>
    `,
    confirmText: 'Restore Selected',
    confirmClasses: 'bg-primary hover:bg-primary-dark',
    onConfirm: () => {
      const selectedIds = Array.from(document.querySelectorAll('.restore-student-checkbox:checked')).map(
        (checkbox) => checkbox.value
      );

      if (selectedIds.length === 0) {
        showModal({
          title: 'No Students Selected',
          content: '<p>Please select at least one student to restore.</p>',
          confirmText: null,
          cancelText: 'Close',
          modalWidth: 'max-w-xs',
        });
        return false;
      }

      captureHistoryPoint();
      selectedIds.forEach((studentId) => {
        const student = classData.trash.students[studentId];
        if (!student) return;
        const restoredStudent = { ...student };
        delete restoredStudent.deletedAt;
        classData.students[studentId] = restoredStudent;
        delete classData.trash.students[studentId];
      });

      renderGradebook();
      triggerAutoSave();
      return true;
    },
  });

  const selectAll = document.getElementById('restore-select-all');
  const checkboxes = Array.from(document.querySelectorAll('.restore-student-checkbox'));
  checkboxes.forEach((checkbox) => {
    checkbox.checked = true;
  });

  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      checkboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked;
      });
    });
  }
}

export function editUnits() {
  const classData = getActiveClassData();
  if (!classData) return;

  const workingUnits = JSON.parse(JSON.stringify(classData.units || {}));
  const workingState = {
    ...classData,
    units: workingUnits,
    unitWeightOverrides: { ...(classData.unitWeightOverrides || {}) },
  };
  applyAutoUnitWeights(workingState);
  const unitWeightOverrides = { ...workingState.unitWeightOverrides };

  let draggedItem = null;
  let dragArmedUnitItem = null;

  function renderUnitsEditor(units, hasFinal, finalWeight) {
    const termUnits = Object.values(units)
      .filter((u) => !u.isFinal)
      .sort((a, b) => a.order - b.order);
    let totalWeight = termUnits.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);
    // Use a tiny epsilon for float comparison
    const weightColor = Math.abs(totalWeight - 100) < 0.1 ? 'text-green-600' : 'text-red-600';

    let termUnitsHtml = termUnits
      .map(
        (unit) => `
            <div class="unit-item flex items-center gap-3 p-2 border rounded-md bg-gray-50" draggable="false" data-unit-id="${unit.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drag-handle cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                <span class="font-semibold text-gray-600">Unit ${unit.order}:</span>
                <input type="text" data-field="title" class="p-1 border rounded-md flex-grow" value="${unit.title || ''}" placeholder="Custom Title (e.g., Algebra)">
                <input type="text" data-field="subtitle" class="p-1 border rounded-md flex-grow" value="${unit.subtitle || ''}" placeholder="Subtitle (optional)">
                <input type="number" step="0.01" data-field="weight" class="p-1 border rounded-md w-24 text-right" value="${parseFloat(unit.weight).toFixed(2)}">
                <span class="text-[10px] ${unitWeightOverrides[unit.id] ? 'text-amber-600' : 'text-gray-400'}">${unitWeightOverrides[unit.id] ? 'Manual' : 'Auto'}</span>
                <span class="font-medium">%</span>
                <button class="delete-unit-btn delete-btn" data-unit-id="${unit.id}">&times;</button>
            </div>
        `
      )
      .join('');

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
    const unitItems = modal.querySelectorAll('#unit-list .unit-item');

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

    const existingFinal = Object.values(classData.units).find((u) => u.isFinal);
    if (hasFinal) {
      const finalId = existingFinal ? existingFinal.id : `final_${classData.id}`;
      updatedUnits[finalId] = {
        ...(existingFinal || {}),
        id: finalId,
        title: 'Final Assessment',
        isFinal: true,
        order: 999,
        assignments: existingFinal?.assignments || {},
      };
    }

    return { units: updatedUnits, hasFinal: hasFinal, finalWeight: finalWeight };
  }

  showModal({
    title: 'Edit Units & Weights',
    modalWidth: 'max-w-4xl',
    content: renderUnitsEditor(workingState.units, classData.hasFinal, classData.finalWeight),
    footerContent: `
      <div class="flex flex-wrap gap-2">
        <button id="reset-unit-weights-auto-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg text-sm">Reset All to Auto</button>
        <button id="add-unit-btn" class="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Add Unit</button>
      </div>
    `,
    confirmText: 'Save Changes',
    confirmClasses: 'bg-primary hover:bg-primary-dark',
    onConfirm: () => {
      const modal = document.getElementById('custom-modal');
      const newState = getStateFromModalDOM(modal);

      if (!newState || typeof newState.units !== 'object' || Array.isArray(newState.units)) {
        return false;
      }

      // Allow slight floating point errors
      const termUnits = Object.values(newState.units).filter((u) => !u.isFinal);
      const totalWeight = termUnits.reduce((sum, unit) => sum + unit.weight, 0);

      if (Math.abs(totalWeight - 100) > 0.5) {
        showModal({
          title: 'Invalid Weight Distribution',
          content: `<p>The total weight of all term units is <strong>${totalWeight.toFixed(2)}%</strong>. It must equal 100%.</p>`,
          confirmText: null,
          cancelText: 'Close',
          modalWidth: 'max-w-xs',
        });
        return false;
      }

      const existingUnitsState = JSON.stringify(classData.units || {});
      const nextUnitsState = JSON.stringify(newState.units || {});
      const unitsChanged =
        existingUnitsState !== nextUnitsState ||
        Boolean(classData.hasFinal) !== Boolean(newState.hasFinal) ||
        Number(classData.finalWeight || 0) !== Number(newState.finalWeight || 0) ||
        JSON.stringify(classData.unitWeightOverrides || {}) !== JSON.stringify(unitWeightOverrides || {});

      if (!unitsChanged) return true;

      captureHistoryPoint();
      classData.units = newState.units;
      classData.hasFinal = newState.hasFinal;
      classData.finalWeight = newState.finalWeight;
      classData.unitWeightOverrides = { ...unitWeightOverrides };

      updateUIFromState();
      triggerAutoSave();
      return true;
    },
  });

  const modal = document.getElementById('custom-modal');
  if (!modal) return;

  const reRenderModalContent = (tempUnits, hasFinal, finalWeight) => {
    const modalContent = modal.querySelector('.modal-content-area');
    if (!modalContent) return;
    modalContent.innerHTML = renderUnitsEditor(tempUnits, hasFinal, finalWeight);
  };

  const updateTermWeightTotalDisplay = (modalState) => {
    const display = modal.querySelector('#term-weight-total-display');
    if (!display) return;
    const termUnits = Object.values(modalState.units).filter((u) => !u.isFinal);
    const totalWeight = termUnits.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);
    display.textContent = `Term Weight Total: ${totalWeight.toFixed(2)}%`;
    display.className = `text-right font-bold mb-4 ${Math.abs(totalWeight - 100) < 0.1 ? 'text-green-600' : 'text-red-600'}`;
  };

  const rebalanceWeightsAfterManualInput = (modalState, changedUnitId, changedWeight) => {
    const termUnits = Object.values(modalState.units).filter((u) => !u.isFinal);
    const changedUnit = termUnits.find((u) => u.id === changedUnitId);
    if (!changedUnit) return;

    const clampedChangedWeight = Math.max(0, Math.min(100, changedWeight));
    changedUnit.weight = clampedChangedWeight;

    const otherUnits = termUnits.filter((u) => u.id !== changedUnitId);
    if (!otherUnits.length) return;

    const remaining = Math.max(0, 100 - clampedChangedWeight);
    const otherTotal = otherUnits.reduce((sum, u) => sum + (parseFloat(u.weight) || 0), 0);

    if (otherTotal <= 0) {
      const even = remaining / otherUnits.length;
      let allocated = 0;
      otherUnits.forEach((unit, idx) => {
        if (idx === otherUnits.length - 1) {
          unit.weight = Math.max(0, remaining - allocated);
        } else {
          unit.weight = even;
          allocated += even;
        }
      });
      return;
    }

    let allocated = 0;
    otherUnits.forEach((unit, idx) => {
      if (idx === otherUnits.length - 1) {
        unit.weight = Math.max(0, remaining - allocated);
      } else {
        const nextWeight = ((parseFloat(unit.weight) || 0) / otherTotal) * remaining;
        unit.weight = nextWeight;
        allocated += nextWeight;
      }
    });
  };

  const syncWeightInputsFromState = (modalState, skipUnitId = null) => {
    const rows = modal.querySelectorAll('#unit-list .unit-item');
    rows.forEach((row) => {
      const unitId = row.dataset.unitId;
      const unit = modalState.units[unitId];
      const input = row.querySelector('input[data-field="weight"]');
      if (!input || !unit) return;
      if (skipUnitId && unitId === skipUnitId) return;
      input.value = (parseFloat(unit.weight) || 0).toFixed(2);
    });
  };

  modal.addEventListener('input', (e) => {
    if (e.target.matches('.unit-item input[data-field="weight"]')) {
      const state = getStateFromModalDOM(modal);
      const unitItem = e.target.closest('.unit-item');
      const changedUnitId = unitItem?.dataset.unitId;
      const changedWeight = parseFloat(e.target.value) || 0;
      if (!changedUnitId) return;

      unitWeightOverrides[changedUnitId] = true;
      rebalanceWeightsAfterManualInput(state, changedUnitId, changedWeight);
      syncWeightInputsFromState(state, changedUnitId);
      updateTermWeightTotalDisplay(state);
    }
  });

  modal.addEventListener('change', (e) => {
    if (e.target.id === 'has-final-checkbox') {
      const state = getStateFromModalDOM(modal);
      reRenderModalContent(state.units, e.target.checked, state.finalWeight);
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target.id === 'reset-unit-weights-auto-btn') {
      const state = getStateFromModalDOM(modal);
      Object.values(state.units)
        .filter((u) => !u.isFinal)
        .forEach((unit) => {
          unitWeightOverrides[unit.id] = false;
        });

      const tempClassData = {
        ...classData,
        units: state.units,
        unitWeightOverrides,
      };
      applyAutoUnitWeights(tempClassData);

      reRenderModalContent(state.units, state.hasFinal, state.finalWeight);
    } else if (e.target.id === 'add-unit-btn') {
      const state = getStateFromModalDOM(modal);
      const termUnits = Object.values(state.units).filter((u) => !u.isFinal);
      const count = termUnits.length;

      // Add new unit
      const newId = `unit_${Date.now()}`;
      state.units[newId] = {
        id: newId,
        order: count + 1,
        title: ``,
        subtitle: '',
        weight: 0,
        assignments: {},
      };

      unitWeightOverrides[newId] = false;
      const tempClassData = {
        ...classData,
        units: state.units,
        unitWeightOverrides,
      };
      applyAutoUnitWeights(tempClassData);

      reRenderModalContent(state.units, state.hasFinal, state.finalWeight);
    } else if (e.target.classList.contains('delete-unit-btn')) {
      const unitIdToDelete = e.target.dataset.unitId;
      const state = getStateFromModalDOM(modal);
      if (!state.units[unitIdToDelete]) return;

      delete state.units[unitIdToDelete];
      delete unitWeightOverrides[unitIdToDelete];

      const tempClassData = {
        ...classData,
        units: state.units,
        unitWeightOverrides,
      };
      applyAutoUnitWeights(tempClassData);

      reRenderModalContent(state.units, state.hasFinal, state.finalWeight);
    }
  });

  // Drag and Drop Logic
  modal.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    const unitItem = e.target.closest('.unit-item[draggable="false"], .unit-item[draggable="true"]');
    if (!handle || !unitItem) return;
    unitItem.draggable = true;
    dragArmedUnitItem = unitItem;
  });

  modal.addEventListener('dragstart', (e) => {
    const unitItem = e.target.closest('.unit-item[draggable="true"]');
    if (!unitItem) return;

    if (unitItem !== dragArmedUnitItem) {
      e.preventDefault();
      return;
    }

    draggedItem = unitItem;
    setTimeout(() => unitItem.classList.add('dragging'), 0);
  });

  const disarmUnitDrag = () => {
    if (dragArmedUnitItem) {
      dragArmedUnitItem.draggable = false;
      dragArmedUnitItem = null;
    }
  };

  modal.addEventListener('pointerup', disarmUnitDrag);
  modal.addEventListener('pointercancel', disarmUnitDrag);

  modal.addEventListener('dragend', () => {
    if (!draggedItem) return;
    draggedItem.classList.remove('dragging');
    draggedItem.draggable = false;
    draggedItem = null;
    disarmUnitDrag();
    // Re-number visible units locally for visual consistency
    modal.querySelectorAll('#unit-list .unit-item').forEach((item, index) => {
      const orderSpan = item.querySelector('span:nth-of-type(1)');
      if (orderSpan) orderSpan.textContent = `Unit ${index + 1}:`;
    });
  });

  modal.addEventListener('dragover', (e) => {
    if (!draggedItem) return;
    const unitList = e.target.closest('#unit-list');
    if (!unitList) return;
    e.preventDefault();

    const afterElement = [...unitList.querySelectorAll('.unit-item:not(.dragging)')].reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;

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
  let dragArmedAssignmentItem = null;

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
    const assignments = Object.values(currentUnit.assignments || {}).sort((a, b) => a.order - b.order);

    const assignmentsHtml = assignments
      .map((asg) => {
        if (isFinal) {
          return `
                    <div class="assignment-item grid grid-cols-[auto,1fr,5rem,6rem,auto] items-center gap-2 p-2 bg-white rounded border" draggable="false" data-asg-id="${asg.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drag-handle cursor-grab text-gray-400"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                        <input data-field="name" type="text" class="p-1 border rounded-md w-full" value="${asg.name || ''}" placeholder="Assessment Name">
                        <input data-field="weight" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.weight || 1}" placeholder="x1">
                        <input data-field="total" type="number" step="0.1" class="p-1 border rounded-md text-center w-full" value="${asg.total || 0}" placeholder="Total Score">
                        <button class="delete-asg-btn delete-btn" data-asg-id="${asg.id}">&times;</button>
                    </div>`;
        } else {
          return `
                    <div class="assignment-item grid grid-cols-[auto,1fr,5rem,4rem,4rem,4rem,4rem,auto] items-center gap-2 p-2 bg-white rounded border" draggable="false" data-asg-id="${asg.id}">
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
      })
      .join('');

    const headerHtml = isFinal
      ? `
            <div class="grid grid-cols-[auto,1fr,5rem,6rem,auto] items-center gap-2 text-sm font-semibold text-gray-500 px-2">
                <span></span>
                <span class="text-left pl-1">Name</span>
                <span class="text-center">Weight</span>
                <span class="text-center">Total</span>
                <span></span>
            </div>
        `
      : `
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
        weight: parseFloat(item.querySelector('[data-field="weight"]').value) || 1,
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
      const nextAssignments = getStateFromModalDOM(modal);
      const existingAssignments = classData.units[activeUnitId].assignments || {};

      if (JSON.stringify(existingAssignments) === JSON.stringify(nextAssignments)) return true;

      captureHistoryPoint();
      classData.units[activeUnitId].assignments = nextAssignments;
      applyAutoUnitWeights(classData);
      updateUIFromState();
      triggerAutoSave();
    },
  });

  const editor = document.getElementById('assignments-editor');
  if (!editor) return;

  // Add/Delete Assignment Logic
  editor.addEventListener('click', (e) => {
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
      captureHistoryPoint();
      assignmentsState[newAsgId] = newAsg;
      unit.assignments = assignmentsState;
      editor.innerHTML = renderAssignmentsEditor(unit);
    } else if (e.target.classList.contains('delete-asg-btn')) {
      const asgId = e.target.dataset.asgId;
      const assignmentsState = getStateFromModalDOM(modal);
      if (assignmentsState[asgId]) {
        captureHistoryPoint();
        delete assignmentsState[asgId];
        unit.assignments = assignmentsState;
        editor.innerHTML = renderAssignmentsEditor(unit);
      }
    }
  });

  // Assignment Drag and Drop Logic
  editor.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    const assignmentItem = e.target.closest('.assignment-item[draggable="false"], .assignment-item[draggable="true"]');
    if (!handle || !assignmentItem) return;
    assignmentItem.draggable = true;
    dragArmedAssignmentItem = assignmentItem;
  });

  editor.addEventListener('dragstart', (e) => {
    const assignmentItem = e.target.closest('.assignment-item[draggable="true"]');
    if (!assignmentItem) return;

    if (assignmentItem !== dragArmedAssignmentItem) {
      e.preventDefault();
      return;
    }

    draggedItem = assignmentItem;
    setTimeout(() => assignmentItem.classList.add('dragging'), 0);
  });

  const disarmAssignmentDrag = () => {
    if (dragArmedAssignmentItem) {
      dragArmedAssignmentItem.draggable = false;
      dragArmedAssignmentItem = null;
    }
  };

  editor.addEventListener('pointerup', disarmAssignmentDrag);
  editor.addEventListener('pointercancel', disarmAssignmentDrag);

  editor.addEventListener('dragend', () => {
    if (draggedItem) {
      draggedItem.classList.remove('dragging');
      draggedItem.draggable = false;
      draggedItem = null;
    }
    disarmAssignmentDrag();
  });
  editor.addEventListener('dragover', (e) => {
    if (!draggedItem) return;
    e.preventDefault();
    const list = e.target.closest('.assignment-list');
    if (!list) return;
    const afterElement = [...list.querySelectorAll('.assignment-item:not(.dragging)')].reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
    if (afterElement == null) {
      list.appendChild(draggedItem);
    } else {
      list.insertBefore(draggedItem, afterElement);
    }
  });
}

// --- General Actions ---

//

export function addClass() {
  const appState = getAppState();
  // Ensure presets object exists
  if (!appState.gradebook_data.presets) appState.gradebook_data.presets = {};

  const presets = appState.gradebook_data.presets;
  const renderPresetOptions = () => {
    if (Object.keys(presets).length === 0) return '<option value="" disabled>No presets saved yet</option>';
    return Object.keys(presets)
      .map((id) => `<option value="${id}">${presets[id].name}</option>`)
      .join('');
  };

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
                    ${renderPresetOptions()}
                    </select>
                  <button id="delete-selected-preset-btn" type="button" class="mt-2 text-sm text-red-600 hover:underline">Delete Selected Preset</button>
                </div>
            </div>`,
    confirmText: 'Add Class',
    confirmClasses: 'bg-primary hover:bg-primary-dark',
    onConfirm: () => {
      const newClassName = document.getElementById('class-name-input').value.trim();
      const presetId = document.getElementById('class-preset-select').value;

      if (newClassName && appState.gradebook_data) {
        captureHistoryPoint();
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
          Object.values(oldUnits).forEach((u) => {
            const newUnitId = `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            newClassData.units[newUnitId] = {
              ...u,
              id: newUnitId,
              assignments: {}, // assignments are templates, but we usually want fresh copies or empty?
              // Let's keep the assignments structure but give them new IDs too if we want a true template.
              // For simplicity V1: Keep the units/weights, but clear assignments?
              // Usually teachers want the assignments structure too. Let's keep assignments but regen IDs.
            };

            // Deep copy assignments and give new IDs
            const oldAsgs = u.assignments || {};
            newClassData.units[newUnitId].assignments = {};
            Object.values(oldAsgs).forEach((a) => {
              const newAsgId = `asg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
              newClassData.units[newUnitId].assignments[newAsgId] = {
                ...a,
                id: newAsgId,
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
            students: {},
          };
        }

        appState.gradebook_data.semesters[activeSemester].classes[newClassId] = newClassData;
        appState.gradebook_data.activeClassId = newClassId;
        updateUIFromState();
        triggerAutoSave();
      }
    },
  });

  setTimeout(() => {
    const deletePresetBtn = document.getElementById('delete-selected-preset-btn');
    const presetSelect = document.getElementById('class-preset-select');
    if (!deletePresetBtn || !presetSelect) return;

    const syncDeleteButtonState = () => {
      const hasPresetSelected = !!presetSelect.value;
      deletePresetBtn.disabled = !hasPresetSelected;
      deletePresetBtn.classList.toggle('opacity-50', !hasPresetSelected);
      deletePresetBtn.classList.toggle('cursor-not-allowed', !hasPresetSelected);
    };

    presetSelect.addEventListener('change', syncDeleteButtonState);
    syncDeleteButtonState();

    deletePresetBtn.addEventListener('click', () => {
      const selectedPresetId = presetSelect.value;
      if (!selectedPresetId || !presets[selectedPresetId]) return;

      const presetName = presets[selectedPresetId].name || 'this preset';
      const shouldDelete = confirm(`Delete preset "${presetName}"?`);
      if (!shouldDelete) return;

      captureHistoryPoint();
      delete presets[selectedPresetId];

      presetSelect.innerHTML = `<option value="">Start from scratch</option>${renderPresetOptions()}`;
      presetSelect.value = '';
      syncDeleteButtonState();
      triggerAutoSave();
    });
  }, 0);
}

export function saveClassAsPreset() {
  const classData = getActiveClassData();
  if (!classData) {
    alert('No active class to save as a preset.');
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
        captureHistoryPoint();
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
          modalWidth: 'max-w-sm',
        });
      }
    },
  });
}

export function recordMidterms() {
  const classData = getActiveClassData();
  if (!classData || classData.midtermsRecorded) return;

  showModal({
    title: 'Confirm Midterm Recording',
    content: `<p>Are you sure you want to officially record the current Term Mark as the Midterm Grade for all students?</p><p class="mt-3 font-semibold text-amber-700">You can undo this action if needed.</p>`,
    confirmText: 'Record Marks',
    confirmClasses: 'bg-accent hover:bg-accent-dark',
    onConfirm: () => {
      captureHistoryPoint();
      const students = classData.students || {};
      let recordedCount = 0;

      Object.values(students).forEach((student) => {
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
        modalWidth: 'max-w-xs',
      });
    },
  });
}

export function exportStudentPDF(studentId) {
  const classData = getActiveClassData();
  const student = classData?.students?.[studentId];
  if (!classData || !student) {
    alert('Could not find student data to export.');
    return;
  }

  exportClassPDF({
    studentIds: [studentId],
    includeMissingAssignments: true,
  });
}

function buildCsvPayload({ classData, selectedStudents, attendanceEnabled }) {
  const units = Object.values(classData.units || {}).sort((a, b) => a.order - b.order);
  const headers = ['LastName', 'FirstName', 'IEP', 'Overall', 'Term', 'Final', 'K', 'T', 'C', 'A'];
  if (attendanceEnabled) {
    headers.push('Present', 'Absent', 'Late', 'Attendance %');
  }

  units.forEach((unit) => {
    Object.values(unit.assignments || {})
      .sort((a, b) => a.order - b.order)
      .forEach((asg) => {
        if (unit.isFinal) {
          headers.push(`${asg.name} (Score)`);
        } else {
          headers.push(`${asg.name} (K)`, `${asg.name} (T)`, `${asg.name} (C)`, `${asg.name} (A)`);
        }
      });
  });

  const rows = selectedStudents.map((student) => {
    const avgs = calculateStudentAverages(student, classData);
    const row = [
      student.lastName,
      student.firstName,
      student.iep ? 'YES' : 'NO',
      avgs.overallGrade?.toFixed(2) || '',
      avgs.termMark?.toFixed(2) || '',
      avgs.finalMark?.toFixed(2) || '',
      avgs.categories.k?.toFixed(2) || '',
      avgs.categories.t?.toFixed(2) || '',
      avgs.categories.c?.toFixed(2) || '',
      avgs.categories.a?.toFixed(2) || '',
    ];

    if (attendanceEnabled) {
      const attendance = getAttendanceSummaryForStudent(classData, student.id);
      row.push(
        String(attendance.present),
        String(attendance.absent),
        String(attendance.late),
        attendance.attendancePct !== null ? attendance.attendancePct.toFixed(1) : ''
      );
    }

    units.forEach((unit) => {
      Object.values(unit.assignments || {})
        .sort((a, b) => a.order - b.order)
        .forEach((asg) => {
          const grade = student.grades?.[asg.id];
          if (unit.isFinal) {
            row.push(grade?.grade ?? '');
          } else {
            row.push(grade?.k ?? '', grade?.t ?? '', grade?.c ?? '', grade?.a ?? '');
          }
        });
    });

    return row;
  });

  const csvRows = [headers, ...rows];
  const csvContent = csvRows
    .map((row) =>
      row
        .map((value) => {
          const safe = value === null || value === undefined ? '' : String(value);
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\r\n');

  return { headers, rowCount: rows.length, csvContent };
}

export function showCsvExportOptionsModal() {
  const classData = getActiveClassData();
  if (!classData) return;

  const { attendanceEnabled } = getAppSettingsForExports();
  const students = Object.values(classData.students || {}).sort((a, b) =>
    (a.lastName || '').localeCompare(b.lastName || '')
  );

  const studentCheckboxes = students
    .map(
      (student) => `
        <label class="flex items-center">
            <input type="checkbox" class="csv-student-export-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${student.id}" checked>
            <span class="ml-2 text-sm text-gray-700">${student.lastName}, ${student.firstName}</span>
        </label>
    `
    )
    .join('');

  showModal({
    title: 'CSV Export Options',
    content: `
      <div>
        <h4 class="text-md font-semibold mb-2">Select Students</h4>
        <div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
          ${studentCheckboxes}
        </div>
      </div>
      <div class="mt-4 p-3 border rounded-md bg-slate-50">
        <h4 class="text-md font-semibold mb-2">CSV Preview</h4>
        <p class="text-xs text-gray-500 mb-2">Preview of what will be exported.</p>
        <div id="csv-export-preview" class="text-sm text-gray-700"></div>
      </div>
    `,
    confirmText: 'Export CSV',
    confirmClasses: 'bg-emerald-600 hover:bg-emerald-700',
    onConfirm: () => {
      const selectedStudentIds = Array.from(document.querySelectorAll('.csv-student-export-checkbox:checked')).map(
        (cb) => cb.value
      );
      exportToCSV({ studentIds: selectedStudentIds });
    },
  });

  setTimeout(() => {
    const previewEl = document.getElementById('csv-export-preview');
    if (!previewEl) return;

    const renderPreview = () => {
      const selectedStudentIds = Array.from(document.querySelectorAll('.csv-student-export-checkbox:checked')).map(
        (cb) => cb.value
      );
      const selectedStudents = selectedStudentIds
        .map((id) => classData.students?.[id])
        .filter(Boolean)
        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
      const { headers, rowCount } = buildCsvPayload({ classData, selectedStudents, attendanceEnabled });

      previewEl.innerHTML = `
        <div class="space-y-2">
          <div><span class="font-medium">Students Selected:</span> ${selectedStudents.length}</div>
          <div><span class="font-medium">Rows to Export:</span> ${rowCount}</div>
          <div><span class="font-medium">Attendance Columns:</span> ${attendanceEnabled ? 'Included' : 'Not included'}</div>
          <div>
            <span class="font-medium">Columns:</span>
            <div class="mt-1 flex flex-wrap gap-1 max-h-28 overflow-auto">
              ${headers.map((col) => `<span class="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded">${col}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    };

    document.querySelectorAll('.csv-student-export-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', renderPreview);
    });

    renderPreview();
  }, 50);
}

export function exportToCSV({ studentIds = null } = {}) {
  const classData = getActiveClassData();
  if (!classData) {
    alert('No class data to export.');
    return;
  }

  const { attendanceEnabled } = getAppSettingsForExports();

  const students = (
    studentIds
      ? studentIds.map((id) => classData.students?.[id]).filter(Boolean)
      : Object.values(classData.students || {})
  ).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  if (students.length === 0) {
    showModal({
      title: 'Export Cancelled',
      content: '<p>Please select at least one student to export.</p>',
      confirmText: null,
      cancelText: 'Close',
      modalWidth: 'max-w-xs',
    });
    return;
  }

  const { csvContent } = buildCsvPayload({ classData, selectedStudents: students, attendanceEnabled });
  const encodedUri = encodeURI(`data:text/csv;charset=utf-8,${csvContent}`);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${classData.name}_grades.csv`);
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
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
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
        const capitalize = (s) => (s && s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : '');
        return {
          firstName: capitalize(firstName),
          lastName: capitalize(lastName),
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
      captureHistoryPoint();
      studentsToAdd.forEach((s) => {
        const newId = `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        if (!classData.students) classData.students = {};
        classData.students[newId] = {
          id: newId,
          firstName: s.firstName,
          lastName: s.lastName,
          iep: false,
          grades: {}, // Init empty grades
        };
      });

      renderGradebook();
      triggerAutoSave();
    },
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
        previewList.innerHTML = parsed
          .slice(0, 5)
          .map((s) => `<li>${s.firstName} <strong>${s.lastName}</strong></li>`)
          .join('');
        if (parsed.length > 5)
          previewList.innerHTML += `<li class="text-gray-400 italic">...and ${parsed.length - 5} more</li>`;
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
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const pct = Math.round(m.progress * 100);
              progressBar.style.width = `${pct}%`;
              statusText.textContent = `Reading text... ${pct}%`;
            } else {
              statusText.textContent = m.status;
            }
          },
        });

        await worker.loadLanguage('eng');
        await worker.initialize('eng');

        const {
          data: { text },
        } = await worker.recognize(file);

        await worker.terminate();

        // Populate textarea with result
        textarea.value = text;
        textarea.disabled = false;
        progressContainer.classList.add('hidden');

        // Trigger preview update
        updatePreview();
      } catch (err) {
        console.error('OCR Error:', err);
        statusText.textContent = 'Error reading image. Please try again or type manually.';
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
  const { attendanceEnabled, gradeColorIntensity } = getAppSettingsForExports();

  const students = Object.values(classData.students || {}).sort((a, b) =>
    (a.lastName || '').localeCompare(b.lastName || '')
  );

  const studentCheckboxes = students
    .map(
      (student) => `
        <label class="flex items-center">
            <input type="checkbox" class="student-export-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" value="${student.id}" checked>
            <span class="ml-2 text-sm text-gray-700">${student.lastName}, ${student.firstName}</span>
        </label>
    `
    )
    .join('');

  showModal({
    title: 'PDF Export Options',
    content: `
        <div>
          <h4 class="text-md font-semibold mb-2">Export Type</h4>
          <div class="space-y-2">
            <label class="flex items-center">
              <input type="radio" name="pdf-export-type" value="gradebook" class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500" checked>
              <span class="ml-2 text-sm text-gray-700">Gradebook Overview (table)</span>
            </label>
            <label class="flex items-center">
              <input type="radio" name="pdf-export-type" value="student-reports" class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500">
              <span class="ml-2 text-sm text-gray-700">Student Progress Reports (one page per student)</span>
            </label>
          </div>
        </div>
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
            <div class="mt-4 p-3 border rounded-md bg-slate-50">
              <h4 class="text-md font-semibold mb-2">Export Preview</h4>
              <p class="text-xs text-gray-500 mb-2">Quick snapshot of what will be included in this export.</p>
              <div id="pdf-export-preview" class="text-sm text-gray-700"></div>
            </div>
        `,
    confirmText: 'Export PDF',
    confirmClasses: 'bg-blue-600 hover:bg-blue-700',
    onConfirm: () => {
      const selectedStudentIds = Array.from(document.querySelectorAll('.student-export-checkbox:checked')).map(
        (cb) => cb.value
      );
      const selectedType = document.querySelector('input[name="pdf-export-type"]:checked')?.value || 'gradebook';
      const includeMissingAssignments = document.getElementById('include-missing-assignments').checked;

      if (selectedType === 'student-reports') {
        exportClassPDF({
          studentIds: selectedStudentIds,
          includeMissingAssignments,
        });
        return;
      }

      exportGradebookPDF({
        studentIds: selectedStudentIds,
      });
    },
  });

  setTimeout(() => {
    const previewEl = document.getElementById('pdf-export-preview');
    if (!previewEl) return;

    const intensityBadges = {
      subtle: ['bg-green-50', 'bg-blue-50', 'bg-yellow-50', 'bg-orange-50', 'bg-red-50'],
      standard: ['bg-green-100', 'bg-blue-100', 'bg-yellow-100', 'bg-orange-100', 'bg-red-100'],
      strong: ['bg-green-300', 'bg-blue-300', 'bg-yellow-300', 'bg-orange-300', 'bg-red-300'],
    };

    const renderPreview = () => {
      const selectedType = document.querySelector('input[name="pdf-export-type"]:checked')?.value || 'gradebook';
      const selectedCount = document.querySelectorAll('.student-export-checkbox:checked').length;
      const includeMissingAssignments = document.getElementById('include-missing-assignments')?.checked;
      const baseColumns =
        selectedType === 'gradebook'
          ? ['Last Name', 'First Name', 'Overall', 'Term', 'Final', 'K', 'T', 'C', 'A']
          : ['Assignment', 'Scores', 'Summary'];
      const columns =
        attendanceEnabled && selectedType === 'gradebook' ? [...baseColumns, 'Abs', 'Late', 'Att%'] : baseColumns;

      const swatches = (intensityBadges[gradeColorIntensity] || intensityBadges.standard)
        .map((cls) => `<span class="inline-block w-4 h-4 rounded border border-gray-300 ${cls}"></span>`)
        .join('');

      previewEl.innerHTML = `
        <div class="space-y-2">
          <div><span class="font-medium">Type:</span> ${selectedType === 'gradebook' ? 'Gradebook Overview' : 'Student Reports'}</div>
          <div><span class="font-medium">Students Selected:</span> ${selectedCount}</div>
          <div><span class="font-medium">Missing Assignments:</span> ${includeMissingAssignments ? 'Included' : 'Hidden unless graded'}</div>
          <div><span class="font-medium">Attendance Fields:</span> ${attendanceEnabled && selectedType === 'gradebook' ? 'Included' : 'Not included'}</div>
          <div><span class="font-medium">Grade Intensity:</span> ${gradeColorIntensity} <span class="inline-flex items-center gap-1 ml-2 align-middle">${swatches}</span></div>
          <div>
            <span class="font-medium">Columns:</span>
            <div class="mt-1 flex flex-wrap gap-1">
              ${columns.map((col) => `<span class="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded">${col}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    };

    document.querySelectorAll('input[name="pdf-export-type"]').forEach((radio) => {
      radio.addEventListener('change', renderPreview);
    });
    document.querySelectorAll('.student-export-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', renderPreview);
    });
    document.getElementById('include-missing-assignments')?.addEventListener('change', renderPreview);

    renderPreview();
  }, 50);
}

function exportGradebookPDF({ studentIds = [] }) {
  const classData = getActiveClassData();
  const appState = getAppState();
  const { attendanceEnabled, gradeColorIntensity } = getAppSettingsForExports();
  if (!classData) return;

  if (!window.jspdf?.jsPDF) {
    showModal({
      title: 'PDF Export Failed',
      content: '<p>PDF library is unavailable. Please reload and try again.</p>',
      confirmText: null,
      cancelText: 'Close',
      modalWidth: 'max-w-sm',
    });
    return;
  }

  const selectedStudents = studentIds
    .map((id) => classData.students?.[id])
    .filter(Boolean)
    .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

  if (selectedStudents.length === 0) {
    showModal({
      title: 'Export Cancelled',
      content: '<p>Please select at least one student to export.</p>',
      confirmText: null,
      cancelText: 'Close',
      modalWidth: 'max-w-xs',
    });
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const generatedAt = new Date().toLocaleString();
  const teacherName = appState.full_name || 'Teacher';
  const schoolName = appState.school_name || 'School';
  const className = classData.name || 'Class';

  const formatPercent = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const units = Object.values(classData.units || {}).sort((a, b) => a.order - b.order);

  const summaryHeaders = ['#', 'Last Name', 'First Name', 'IEP', 'Overall', 'Term', 'Final', 'K', 'T', 'C', 'A'];
  if (attendanceEnabled) {
    summaryHeaders.push('Abs', 'Late', 'Att%');
  }

  const renderHeader = (unitLabel, chunkIndex, totalChunks) => {
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, pageWidth, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Marksheet Pro', 12, 11);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(generatedAt, pageWidth - 12, 11, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Gradebook Overview', 12, 30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139);
    const unitSuffix = totalChunks > 1 ? ` | ${unitLabel} (${chunkIndex + 1}/${totalChunks})` : ` | ${unitLabel}`;
    doc.text(`${schoolName} | ${className} | Teacher: ${teacherName}${unitSuffix}`, 12, 36);
  };

  const summaryColumnStyles = {
    0: { cellWidth: 10, halign: 'right' },
    1: { cellWidth: 30 },
    2: { cellWidth: 24 },
    3: { cellWidth: 12, halign: 'center' },
    4: { cellWidth: 14, halign: 'right' },
    5: { cellWidth: 12, halign: 'right' },
    6: { cellWidth: 12, halign: 'right' },
    7: { cellWidth: 10, halign: 'right' },
    8: { cellWidth: 10, halign: 'right' },
    9: { cellWidth: 10, halign: 'right' },
    10: { cellWidth: 10, halign: 'right' },
  };
  if (attendanceEnabled) {
    summaryColumnStyles[11] = { cellWidth: 10, halign: 'right' };
    summaryColumnStyles[12] = { cellWidth: 10, halign: 'right' };
    summaryColumnStyles[13] = { cellWidth: 12, halign: 'right' };
  }

  const summaryColumnsWidth = Object.values(summaryColumnStyles).reduce((sum, col) => sum + col.cellWidth, 0);
  const usableTableWidth = pageWidth - 24;
  const dynamicColumnWidth = 16;
  const maxDynamicColumnsPerPage = Math.max(
    1,
    Math.floor((usableTableWidth - summaryColumnsWidth) / dynamicColumnWidth)
  );

  const unitSections = units
    .map((unit) => {
      const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
      if (assignments.length === 0) return null;

      const titleText = unit.title ? `: ${unit.title}` : '';
      const subtitleText = unit.subtitle ? ` - ${unit.subtitle}` : '';
      const unitLabel = unit.isFinal ? 'Final Assessment' : `Unit ${unit.order}${titleText}${subtitleText}`;
      const columns = [];

      assignments.forEach((asg) => {
        if (unit.isFinal) {
          columns.push({
            headerTitle: asg.name,
            headerSubtitle: '(Score)',
            getValue: (student) => {
              const value = student.grades?.[asg.id]?.grade;
              return value === undefined || value === null ? '' : String(value);
            },
          });
          return;
        }

        columns.push({
          headerTitle: asg.name,
          headerSubtitle: '(K/T/C/A)',
          getValue: (student) => {
            const grade = student.grades?.[asg.id] || {};
            const formatCat = (value) => {
              if (value === 'M') return 'M';
              if (value === undefined || value === null || value === '') return '-';
              return String(value);
            };

            const k = formatCat(grade.k);
            const t = formatCat(grade.t);
            const c = formatCat(grade.c);
            const a = formatCat(grade.a);
            return `${k}/${t}/${c}/${a}`;
          },
        });
      });

      const chunks = [];
      for (let i = 0; i < columns.length; i += maxDynamicColumnsPerPage) {
        chunks.push(columns.slice(i, i + maxDynamicColumnsPerPage));
      }

      return { unitLabel, chunks };
    })
    .filter(Boolean);

  const sectionsToRender = unitSections.length ? unitSections : [{ unitLabel: 'No Units', chunks: [[]] }];
  let pageCounter = 0;

  sectionsToRender.forEach((section) => {
    section.chunks.forEach((chunk, chunkIndex) => {
      if (pageCounter > 0) doc.addPage();
      pageCounter += 1;
      renderHeader(section.unitLabel, chunkIndex, section.chunks.length);

      const tableBody = selectedStudents.map((student, index) => {
        const avgs = calculateStudentAverages(student, classData);
        const row = [
          String(index + 1),
          student.lastName || '',
          student.firstName || '',
          student.iep ? 'Yes' : 'No',
          formatPercent(avgs.overallGrade),
          formatPercent(avgs.termMark),
          classData.hasFinal ? formatPercent(avgs.finalMark) : 'N/A',
          formatPercent(avgs.categories?.k),
          formatPercent(avgs.categories?.t),
          formatPercent(avgs.categories?.c),
          formatPercent(avgs.categories?.a),
        ];

        if (attendanceEnabled) {
          const attendance = getAttendanceSummaryForStudent(classData, student.id);
          row.push(
            String(attendance.absent),
            String(attendance.late),
            attendance.attendancePct !== null ? `${attendance.attendancePct.toFixed(1)}%` : 'N/A'
          );
        }

        chunk.forEach((column) => {
          row.push(column.getValue(student));
        });

        return row;
      });

      const baseWidths = {};
      Object.entries(summaryColumnStyles).forEach(([key, style]) => {
        baseWidths[key] = style.cellWidth;
      });
      chunk.forEach((_, idx) => {
        baseWidths[summaryHeaders.length + idx] = dynamicColumnWidth;
      });

      // Make student name columns slightly wider for readability.
      const widthBias = {
        1: 1.25, // Last Name
        2: 1.15, // First Name
      };

      const adjustedWidths = {};
      Object.entries(baseWidths).forEach(([key, width]) => {
        adjustedWidths[key] = width * (widthBias[key] || 1);
      });

      const adjustedTotalWidth = Object.values(adjustedWidths).reduce((sum, width) => sum + width, 0);
      const widthScale = adjustedTotalWidth > 0 ? usableTableWidth / adjustedTotalWidth : 1;

      const columnStyles = {};
      Object.entries(summaryColumnStyles).forEach(([key, style]) => {
        columnStyles[key] = {
          ...style,
          cellWidth: Math.round(adjustedWidths[key] * widthScale * 100) / 100,
        };
      });

      chunk.forEach((_, idx) => {
        const key = String(summaryHeaders.length + idx);
        columnStyles[summaryHeaders.length + idx] = {
          cellWidth: Math.round(adjustedWidths[key] * widthScale * 100) / 100,
          halign: 'right',
        };
      });

      doc.autoTable({
        startY: 42,
        head: [[...summaryHeaders, ...chunk.map((column) => `${column.headerTitle}\n${column.headerSubtitle}`)]],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          overflow: 'linebreak',
          minCellHeight: 34,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: {
          fontSize: 9,
          cellPadding: 1.8,
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          overflow: 'linebreak',
        },
        columnStyles,
        didParseCell: (hookData) => {
          if (hookData.section === 'head' && hookData.column.index >= summaryHeaders.length) {
            // Custom-draw dynamic headers so title can be angled while subtitle stays horizontal.
            hookData.cell.text = [''];
            return;
          }

          if (hookData.section === 'body') {
            const gradeColumns = new Set([4, 5, 6, 7, 8, 9, 10]);
            if (!gradeColumns.has(hookData.column.index)) return;
            const percent = parsePercentCellValue(hookData.cell.raw);
            const band = getColorBandForPercent(percent, gradeColorIntensity);
            if (!band) return;
            hookData.cell.styles.fillColor = band.fill;
            hookData.cell.styles.textColor = band.text;
            hookData.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawCell: (hookData) => {
          if (hookData.section !== 'head' || hookData.column.index < summaryHeaders.length) return;

          const dynamicIndex = hookData.column.index - summaryHeaders.length;
          const col = chunk[dynamicIndex];
          if (!col) return;

          const rawTitle = String(col.headerTitle || '').trim();
          const subtitle = String(col.headerSubtitle || '').trim();

          const titleLinesRaw = hookData.doc.splitTextToSize(rawTitle, Math.max(8, hookData.cell.width * 1.1));
          const maxTitleLines = 3;
          const titleLines = titleLinesRaw.slice(0, maxTitleLines);
          if (titleLinesRaw.length > maxTitleLines && titleLines.length) {
            titleLines[titleLines.length - 1] = `${titleLines[titleLines.length - 1]}...`;
          }

          const titleX = hookData.cell.x + 1.2;
          const titleLineGap = 2.8;
          const titleY = hookData.cell.y + hookData.cell.height - 12 - (titleLines.length - 1) * titleLineGap;
          const subtitleX = hookData.cell.x + hookData.cell.width / 2;
          const subtitleY = hookData.cell.y + hookData.cell.height - 1.2;

          hookData.doc.setTextColor(255, 255, 255);
          hookData.doc.setFont(undefined, 'bold');
          hookData.doc.setFontSize(6);
          titleLines.forEach((line, index) => {
            hookData.doc.text(line, titleX, titleY + index * titleLineGap, {
              angle: 55,
              align: 'left',
            });
          });

          hookData.doc.setFont(undefined, 'normal');
          hookData.doc.setFontSize(6);
          hookData.doc.text(subtitle, subtitleX, subtitleY, {
            align: 'center',
          });
        },
        didDrawPage: () => {
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.2);
          doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(`${className} - Gradebook Overview`, 12, pageHeight - 7.5);
          const pageInfo = doc.internal.getCurrentPageInfo();
          doc.text(`Page ${pageInfo.pageNumber}`, pageWidth - 12, pageHeight - 7.5, {
            align: 'right',
          });
        },
      });
    });
  });

  doc.save(`${className}_Gradebook_Overview.pdf`);
}

function exportClassPDF({ studentIds = [], includeMissingAssignments = false }) {
  const classData = getActiveClassData();
  const appState = getAppState();
  const { attendanceEnabled, gradeColorIntensity } = getAppSettingsForExports();
  const profile = {
    name: appState.full_name || 'Teacher',
    school: appState.school_name || 'School',
    class: classData.name || 'Class',
  };

  if (!classData) return;

  const { jsPDF } = window.jspdf;
  const schoolLogoDataUrl = appState?.gradebook_data?.branding?.schoolLogoDataUrl || null;

  const drawSchoolLogo = (doc, logoDataUrl, x, y, width, height) => {
    if (!logoDataUrl) return;
    const formatMatch = logoDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,/i);
    const format = formatMatch ? formatMatch[1].toUpperCase().replace('JPG', 'JPEG') : 'PNG';
    try {
      doc.addImage(logoDataUrl, format, x, y, width, height, undefined, 'FAST');
    } catch (error) {
      console.warn('Failed to render school logo in PDF:', error);
    }
  };

  const theme = {
    primary: [30, 64, 175],
    secondary: [71, 85, 105],
    headerBg: [241, 245, 249],
    border: [203, 213, 225],
    muted: [100, 116, 139],
  };

  const generatedAt = new Date().toLocaleString();

  const drawStandardHeader = (doc, title, subtitle) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(...theme.primary);
    doc.rect(0, 0, pageWidth, 18, 'F');
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Marksheet Pro', 12, 11);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(generatedAt, pageWidth - 12, 11, { align: 'right' });

    drawSchoolLogo(doc, schoolLogoDataUrl, pageWidth - 36, 20, 24, 12);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(17);
    doc.setFont(undefined, 'bold');
    doc.text(title, 12, 28);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...theme.muted);
    doc.text(subtitle, 12, 34);
  };

  const addPageFooters = (doc, leftText) => {
    const totalPages = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      doc.setPage(pageNumber);
      doc.setDrawColor(...theme.border);
      doc.setLineWidth(0.2);
      doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
      doc.setFontSize(8);
      doc.setTextColor(...theme.muted);
      doc.text(leftText, 12, pageHeight - 7.5);
      doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 12, pageHeight - 7.5, { align: 'right' });
    }
  };

  try {
    const doc = new jsPDF();
    const selectedStudents = studentIds
      .map((id) => classData.students[id])
      .filter(Boolean)
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

    // Pre-compute class-wide averages for the chart
    const allClassStudents = Object.values(classData.students || {});
    const _clsSums = { overall: 0, term: 0, final: 0, k: 0, t: 0, c: 0, a: 0 };
    const _clsCounts = { overall: 0, term: 0, final: 0, k: 0, t: 0, c: 0, a: 0 };
    allClassStudents.forEach((s) => {
      const a = calculateStudentAverages(s, classData);
      const pushIf = (key, val) => {
        if (val !== null) {
          _clsSums[key] += val;
          _clsCounts[key]++;
        }
      };
      pushIf('overall', a.overallGrade);
      pushIf('term', a.termMark);
      pushIf('final', a.finalMark);
      pushIf('k', a.categories.k);
      pushIf('t', a.categories.t);
      pushIf('c', a.categories.c);
      pushIf('a', a.categories.a);
    });
    const classAvgData = {};
    Object.keys(_clsSums).forEach((k) => {
      classAvgData[k] = _clsCounts[k] > 0 ? _clsSums[k] / _clsCounts[k] : null;
    });

    if (selectedStudents.length === 0) {
      showModal({
        title: 'Export Cancelled',
        content: '<p>Please select at least one student to export.</p>',
        confirmText: null,
        cancelText: 'Close',
        modalWidth: 'max-w-xs',
      });
      return;
    }

    selectedStudents.forEach((student, index) => {
      const avgs = calculateStudentAverages(student, classData);
      if (index > 0) doc.addPage();

      drawStandardHeader(
        doc,
        'Student Progress Report',
        `${profile.school} | ${profile.class} | Teacher: ${profile.name}`
      );

      const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`Student: ${studentName || 'Unnamed Student'}`, 12, 42);

      // --- Performance Summary Bar Chart ---
      const chartMetrics = [
        { label: 'Overall', studentVal: avgs.overallGrade, classVal: classAvgData.overall },
        { label: 'Term', studentVal: avgs.termMark, classVal: classAvgData.term },
        {
          label: 'Final',
          studentVal: classData.hasFinal ? avgs.finalMark : null,
          classVal: classData.hasFinal ? classAvgData.final : null,
        },
        { label: 'K', studentVal: avgs.categories.k, classVal: classAvgData.k },
        { label: 'T/I', studentVal: avgs.categories.t, classVal: classAvgData.t },
        { label: 'C', studentVal: avgs.categories.c, classVal: classAvgData.c },
        { label: 'A', studentVal: avgs.categories.a, classVal: classAvgData.a },
      ];

      const pageWidth = doc.internal.pageSize.getWidth();
      const studentBarColor = [30, 64, 175];
      const classBarColor = [148, 163, 184];

      // --- Vertical grouped bar chart ---
      const chartX = 12; // left margin
      const chartW = pageWidth - 24; // full usable width
      const chartTopY = 56;
      const chartH = 52; // height of the plot area (bars grow upward from baseline)
      const baselineY = chartTopY + chartH;

      const n = chartMetrics.length;
      const groupW = chartW / n;
      const barPairGap = 1.2;
      const barW = (groupW - barPairGap * 3) / 2;

      // Section heading
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...theme.secondary);
      doc.text('Performance Summary', chartX, chartTopY - 3);

      // Horizontal grid lines at 0, 25, 50, 75, 100 %
      doc.setLineWidth(0.15);
      [0, 25, 50, 75, 100].forEach((pct) => {
        const y = baselineY - (pct / 100) * chartH;
        doc.setDrawColor(220, 227, 237);
        doc.line(chartX, y, chartX + chartW, y);
        doc.setFontSize(6);
        doc.setTextColor(...theme.muted);
        doc.text(`${pct}%`, chartX - 1, y + 1, { align: 'right' });
      });

      // Baseline
      doc.setDrawColor(...theme.border);
      doc.setLineWidth(0.3);
      doc.line(chartX, baselineY, chartX + chartW, baselineY);

      // Bars
      chartMetrics.forEach((metric, idx) => {
        const groupX = chartX + idx * groupW;
        const sBarX = groupX + barPairGap;
        const cBarX = sBarX + barW + barPairGap;

        // Student bar
        if (metric.studentVal !== null) {
          const h = Math.max((metric.studentVal / 100) * chartH, 0.5);
          doc.setFillColor(...studentBarColor);
          doc.rect(sBarX, baselineY - h, barW, h, 'F');
          doc.setFontSize(6.2);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(...studentBarColor);
          doc.text(`${metric.studentVal.toFixed(1)}%`, sBarX + barW / 2, baselineY - h - 1.2, { align: 'center' });
        }

        // Class average bar
        if (metric.classVal !== null) {
          const h = Math.max((metric.classVal / 100) * chartH, 0.5);
          doc.setFillColor(...classBarColor);
          doc.rect(cBarX, baselineY - h, barW, h, 'F');
          doc.setFontSize(6.2);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(`${metric.classVal.toFixed(1)}%`, cBarX + barW / 2, baselineY - h - 1.2, { align: 'center' });
        }

        // X-axis label
        doc.setFontSize(7.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(metric.label, groupX + groupW / 2, baselineY + 4.5, { align: 'center' });
      });

      // Legend (below x-axis labels)
      const legendY = baselineY + 10;
      doc.setFillColor(...studentBarColor);
      doc.rect(chartX, legendY - 2.5, 6, 3, 'F');
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text('Student', chartX + 8, legendY);
      doc.setFillColor(...classBarColor);
      doc.rect(chartX + 36, legendY - 2.5, 6, 3, 'F');
      doc.text('Class Average', chartX + 44, legendY);

      // Attendance (right-aligned in legend row)
      if (attendanceEnabled) {
        const attendance = getAttendanceSummaryForStudent(classData, student.id);
        const attendanceText = `Absent: ${attendance.absent}  Late: ${attendance.late}  Attendance: ${attendance.attendancePct !== null ? attendance.attendancePct.toFixed(1) + '%' : 'N/A'}`;
        doc.setFontSize(7.5);
        doc.setTextColor(...theme.muted);
        doc.text(attendanceText, chartX + chartW, legendY, { align: 'right' });
      }

      const units = Object.values(classData.units || {}).sort((a, b) => a.order - b.order);
      let cursorY = legendY + 7;

      units.forEach((unit) => {
        const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
        if (assignments.length === 0) return;

        const body = [];
        assignments.forEach((asg) => {
          const grade = student.grades?.[asg.id];
          if (unit.isFinal) {
            const score = grade?.grade ?? 'N/A';
            if (includeMissingAssignments || score !== 'N/A') body.push([asg.name, `${score} / ${asg.total || 0}`]);
          } else {
            const k = grade?.k ?? 'N/A';
            const t = grade?.t ?? 'N/A';
            const c = grade?.c ?? 'N/A';
            const a = grade?.a ?? 'N/A';
            if (includeMissingAssignments || [k, t, c, a].some((m) => m !== 'N/A')) {
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

        if (body.length === 0) return;

        const unitTitle = unit.isFinal
          ? 'Final Assignment'
          : `Unit ${unit.order}${unit.title ? `: ${unit.title}` : ''}${unit.subtitle ? ` - ${unit.subtitle}` : ''}`;
        doc.setFillColor(...theme.headerBg);
        doc.setDrawColor(...theme.border);
        doc.roundedRect(12, cursorY - 1.5, doc.internal.pageSize.getWidth() - 24, 7, 1.5, 1.5, 'FD');
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(unitTitle, 14, cursorY + 3);

        doc.autoTable({
          startY: cursorY + 8,
          head: [unit.isFinal ? ['Assignment', 'Score'] : ['Assignment', 'K', 'T', 'C', 'A']],
          body,
          theme: 'grid',
          headStyles: { fillColor: theme.secondary, textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: theme.border, lineWidth: 0.2 },
        });
        cursorY = doc.autoTable.previous.finalY + 7;
      });
    });

    addPageFooters(doc, `${profile.class} - Student Reports`);
    doc.save(`${profile.class}_Student_Reports.pdf`);
  } catch (error) {
    console.error('PDF Export failed:', error);
    showModal({
      title: 'PDF Export Failed',
      content: `<p>An error occurred while generating the PDF. See the console for details.</p>`,
      confirmText: null,
      cancelText: 'Close',
    });
  }
}

export function exportBlankMarksheet() {
  const classData = getActiveClassData();
  const appState = getAppState();
  const profile = {
    name: appState.full_name || 'Teacher',
    school: appState.school_name || 'School',
    class: classData?.name || 'Class',
  };

  if (!classData) {
    showModal({ title: 'Error', content: '<p>No active class selected.</p>', confirmText: null, cancelText: 'Close' });
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const schoolLogoDataUrl = appState?.gradebook_data?.branding?.schoolLogoDataUrl || null;

  const drawSchoolLogo = (logoDataUrl) => {
    if (!logoDataUrl) return;
    const formatMatch = logoDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,/i);
    const format = formatMatch ? formatMatch[1].toUpperCase().replace('JPG', 'JPEG') : 'PNG';
    try {
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.addImage(logoDataUrl, format, pageWidth - 42, 21, 30, 12, undefined, 'FAST');
    } catch (error) {
      console.warn('Failed to render school logo in blank marksheet PDF:', error);
    }
  };

  const theme = {
    primary: [30, 64, 175],
    secondary: [71, 85, 105],
    border: [203, 213, 225],
    muted: [100, 116, 139],
  };

  const generatedAt = new Date().toLocaleString();

  const drawHeader = () => {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(...theme.primary);
    doc.rect(0, 0, pageWidth, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Marksheet Pro', 12, 11);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(generatedAt, pageWidth - 12, 11, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(17);
    doc.setFont(undefined, 'bold');
    doc.text('Blank Marksheet Template', 12, 28);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...theme.muted);
    doc.text(`${profile.class} | ${profile.school} | Teacher: ${profile.name}`, 12, 34);

    drawSchoolLogo(schoolLogoDataUrl);
  };

  const addFooter = () => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...theme.border);
    doc.setLineWidth(0.2);
    doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
    doc.setFontSize(8);
    doc.setTextColor(...theme.muted);
    doc.text(`${profile.class} - Blank Marksheet`, 12, pageHeight - 7.5);
    doc.text('Page 1 of 1', pageWidth - 12, pageHeight - 7.5, { align: 'right' });
  };

  const head = [[], []];
  const categoryHeaders = ['K', 'T', 'C', 'A'];
  const defaultAssignmentCount = 6;
  const totalAssignmentPlaceholders = defaultAssignmentCount;

  head[0].push({
    content: 'Student Name',
    rowSpan: 2,
    styles: { halign: 'left', valign: 'middle', fontStyle: 'bold' },
  });

  for (let i = 0; i < totalAssignmentPlaceholders; i++) {
    head[0].push({
      content: '',
      colSpan: categoryHeaders.length,
      styles: { halign: 'center', minCellHeight: 6, fillColor: [255, 255, 255] },
    });
  }

  for (let i = 0; i < totalAssignmentPlaceholders; i++) {
    head[1].push(
      ...categoryHeaders.map((cat) => ({ content: cat, styles: { halign: 'center', minCellWidth: 10, fontSize: 9 } }))
    );
  }

  const students = Object.values(classData.students || {}).sort((a, b) => {
    const lastNameA = String(a?.lastName || '');
    const lastNameB = String(b?.lastName || '');
    const firstNameA = String(a?.firstName || '');
    const firstNameB = String(b?.firstName || '');
    return lastNameA.localeCompare(lastNameB) || firstNameA.localeCompare(firstNameB);
  });

  const totalCols = head[1].length + 1;

  const body = students.map((student) => {
    return Array(totalCols)
      .fill('')
      .map((_, i) => (i === 0 ? `${student.lastName}, ${student.firstName}` : ''));
  });

  const desiredRowCount = 20;
  const blankRowsToAdd = Math.max(0, desiredRowCount - students.length);
  for (let i = 0; i < blankRowsToAdd; i++) {
    body.push(Array(totalCols).fill(''));
  }

  try {
    drawHeader();

    doc.autoTable({
      startY: 40,
      head: head,
      body: body,
      theme: 'grid',
      tableWidth: 'auto',
      styles: {
        fontSize: 7,
        cellPadding: 1.1,
        lineWidth: 0.2,
        lineColor: theme.border,
        valign: 'middle',
        minCellHeight: 8,
      },
      headStyles: {
        fontStyle: 'bold',
        halign: 'center',
        fillColor: theme.secondary,
        textColor: [255, 255, 255],
        fontSize: 8,
        cellPadding: { top: 2, right: 1, bottom: 2, left: 1 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: {
          fontStyle: 'bold',
          halign: 'left',
          cellWidth: 40,
        },
      },
      didParseCell(data) {
        if (data.row.section === 'head') {
          if (data.column.index === 0) {
            data.cell.styles.valign = 'middle';
            data.cell.styles.fontSize = 8;
          }
          if (data.row.index === 0 && data.column.index > 0) {
            data.cell.styles.minCellHeight = 5;
            data.cell.styles.fillColor = [255, 255, 255];
            data.cell.styles.textColor = [71, 85, 105];
          }
          if (data.row.index === 1 && data.column.index > 0) {
            data.cell.styles.fontSize = 7;
          }
        }
      },
      margin: { left: 10, right: 10, top: 40, bottom: 16 },
    });

    addFooter();
    doc.save(`${profile.class}_Blank_Marksheet.pdf`);
  } catch (error) {
    console.error('Blank PDF Export failed:', error);
    showModal({
      title: 'Export Failed',
      content: `<p>An error occurred while generating the blank marksheet PDF. See console for details.</p>`,
      confirmText: null,
      cancelText: 'Close',
    });
  }
}
export function exportStudentListPDF() {
  const classData = getActiveClassData();
  const appState = getAppState();
  if (!classData) {
    alert('No class data to export.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const schoolLogoDataUrl = appState?.gradebook_data?.branding?.schoolLogoDataUrl || null;

  const drawSchoolLogo = (logoDataUrl) => {
    if (!logoDataUrl) return;
    const formatMatch = logoDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,/i);
    const format = formatMatch ? formatMatch[1].toUpperCase().replace('JPG', 'JPEG') : 'PNG';
    try {
      doc.addImage(logoDataUrl, format, pageWidth - 36, 20, 24, 12, undefined, 'FAST');
    } catch (error) {
      console.warn('Failed to render school logo in student list PDF:', error);
    }
  };
  const profile = {
    name: appState.full_name || 'Teacher',
    school: appState.school_name || 'School',
  };

  const theme = {
    primary: [30, 64, 175],
    border: [203, 213, 225],
    muted: [100, 116, 139],
  };

  const generatedAt = new Date().toLocaleString();

  const students = Object.values(classData.students || {}).sort(
    (a, b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || '')
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Marksheet Pro', 12, 11);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(generatedAt, pageWidth - 12, 11, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(17);
  doc.setFont(undefined, 'bold');
  doc.text('Student List', 12, 28);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...theme.muted);
  doc.text(`${classData.name} | ${profile.school} | Teacher: ${profile.name}`, 12, 34);
  drawSchoolLogo(schoolLogoDataUrl);

  const tableBody = students.map((student, index) => [
    `${index + 1}`,
    student.lastName || '',
    student.firstName || '',
    student.iep ? 'Yes' : 'No',
  ]);

  doc.autoTable({
    startY: 40,
    head: [['#', 'Last Name', 'First Name', 'IEP']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: theme.primary, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 9.5, cellPadding: 2.1, lineColor: theme.border, lineWidth: 0.2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 18 },
    },
  });

  const totalPages = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    doc.setPage(pageNumber);
    doc.setDrawColor(...theme.border);
    doc.setLineWidth(0.2);
    doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
    doc.setFontSize(8);
    doc.setTextColor(...theme.muted);
    doc.text(`${classData.name} - Student List`, 12, pageHeight - 7.5);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 12, pageHeight - 7.5, { align: 'right' });
  }

  doc.save(`${classData.name}_student_list.pdf`);
}

export function exportContactListPDF() {
  const classData = getActiveClassData();
  const appState = getAppState();
  if (!classData) {
    alert('No class data to export.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const schoolLogoDataUrl = appState?.gradebook_data?.branding?.schoolLogoDataUrl || null;

  const drawSchoolLogo = (logoDataUrl) => {
    if (!logoDataUrl) return;
    const formatMatch = logoDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,/i);
    const format = formatMatch ? formatMatch[1].toUpperCase().replace('JPG', 'JPEG') : 'PNG';
    try {
      doc.addImage(logoDataUrl, format, pageWidth - 36, 20, 24, 12, undefined, 'FAST');
    } catch (error) {
      console.warn('Failed to render school logo in contact list PDF:', error);
    }
  };
  const profile = {
    name: appState.full_name || 'Teacher',
    school: appState.school_name || 'School',
  };

  const theme = {
    primary: [30, 64, 175],
    border: [203, 213, 225],
    muted: [100, 116, 139],
  };

  const generatedAt = new Date().toLocaleString();
  const students = Object.values(classData.students || {}).sort(
    (a, b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || '')
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Marksheet Pro', 12, 11);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(generatedAt, pageWidth - 12, 11, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(17);
  doc.setFont(undefined, 'bold');
  doc.text('Student Contact List', 12, 28);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...theme.muted);
  doc.text(`${classData.name} | ${profile.school} | Teacher: ${profile.name}`, 12, 34);
  drawSchoolLogo(schoolLogoDataUrl);

  const bodyRows = [];
  students.forEach((student) => {
    const studentName = `${student.lastName || ''}, ${student.firstName || ''}`;
    const contacts = student.contacts || [];

    if (contacts.length === 0) {
      bodyRows.push([studentName, '-', 'No contacts on file', '-']);
      return;
    }

    contacts.forEach((contact) => {
      bodyRows.push([
        studentName,
        contact.name || '-',
        contact.info || '-',
        contact.isParent ? 'Parent/Guardian' : 'Contact',
      ]);
    });
  });

  doc.autoTable({
    startY: 40,
    head: [['Student', 'Contact Name', 'Contact Info', 'Relationship']],
    body: bodyRows,
    theme: 'grid',
    headStyles: { fillColor: theme.primary, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 9, cellPadding: 2, lineColor: theme.border, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: 'bold' },
      1: { cellWidth: 45 },
      2: { cellWidth: 70 },
      3: { cellWidth: 28, halign: 'center' },
    },
  });

  const totalPages = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    doc.setPage(pageNumber);
    doc.setDrawColor(...theme.border);
    doc.setLineWidth(0.2);
    doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
    doc.setFontSize(8);
    doc.setTextColor(...theme.muted);
    doc.text(`${classData.name} - Student Contact List`, 12, pageHeight - 7.5);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 12, pageHeight - 7.5, { align: 'right' });
  }

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
    captureHistoryPoint();
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
