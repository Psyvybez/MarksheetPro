import { getAppState, getActiveSemesterData, getActiveClassData, canUndoHistory, canRedoHistory } from './state.js';
import { recalculateAndRenderAverages, calculateClassStats } from './calculations.js';
import { getProfilePictureUrl, uploadProfilePicture } from './api.js';
import { showModal } from './ui.js';
import { triggerAutoSave } from './main.js';
import { exportStudentPDF, deleteStudent } from './actions.js';

let contentWrapper;
document.addEventListener('DOMContentLoaded', () => {
  contentWrapper = document.getElementById('content-wrapper');
});

const UPDATES_FEED = [
  {
    id: '2026-03-major-platform-update',
    title: 'March 2026 - Major Platform Update',
    tag: 'Latest',
    items: [
      'Added Undo/Redo controls with keyboard shortcuts (<strong>Ctrl/Cmd + Z</strong>, <strong>Ctrl/Cmd + Y</strong>).',
      'Student deletion now uses Trash with restore options.',
      'Added class status badge (Active/Archived) beside the class title.',
      'Archived classes can now be unarchived directly from the class toolbar.',
      'Added protected class deletion with typed confirmation (<strong>DELETE</strong>).',
      "Added a <strong>What's New</strong> first-login update notification and a <strong>New</strong> badge on Instructions until updates are viewed.",
      'PDF exports were redesigned with a professional layout: branded headers, metadata lines, cleaner tables, and page footers.',
      'Added school logo upload (with preview and remove) in Account settings for branded PDF exports.',
      'Added school logo validation for file type (PNG/JPG/WEBP) and size limit (5MB).',
      'Unit headings in reports now include full context (for example: <strong>Unit 1: Title - Subtitle</strong>).',
      "Gradebook now shows each assignment's approximate contribution to its unit percentage.",
      'Analytics now includes unit-weight and assignment-weight percentage charts with filter controls.',
      'Unit weights can now auto-calculate from assignments by default, with manual override support.',
      'Manual unit-weight edits now rebalance other units proportionally, and <strong>Reset All to Auto</strong> restores assignment-based distribution.',
    ],
  },
];

const UPDATES_IMPACT_ITEMS = [
  'Safer daily workflows with stronger recovery, deletion protections, and clearer class state controls.',
  'Better reporting quality with professional exports and school branding support.',
  'More transparent grading structure through assignment/unit percentage visibility and analytics filters.',
  'Faster setup and maintenance with assignment-based auto unit weighting plus manual override tools.',
];

export function getLatestUpdateMeta() {
  if (!UPDATES_FEED.length) return null;
  const latest = UPDATES_FEED[0];
  return {
    id: latest.id,
    title: latest.title,
  };
}

function renderUpdatesSection() {
  const cardsHtml = UPDATES_FEED.map((update) => {
    const listItems = update.items.map((item) => `<li>${item}</li>`).join('');
    return `
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h4 class="font-semibold text-gray-800">${update.title}</h4>
          ${update.tag ? `<span class="text-xs font-medium text-gray-500">${update.tag}</span>` : ''}
        </div>
        <ul class="text-sm text-gray-600 list-disc list-inside space-y-1">${listItems}</ul>
      </div>
    `;
  }).join('');

  const impactList = UPDATES_IMPACT_ITEMS.map((item) => `<li>${item}</li>`).join('');

  return `
    <div id="updates-page" class="mt-10 border-t border-gray-100 pt-8">
      <div class="mb-5">
        <h3 class="text-2xl font-bold text-gray-800">Updates</h3>
        <p class="text-sm text-gray-500 mt-1">Recent improvements and changes in Marksheet Pro.</p>
      </div>
      <div class="space-y-4">
        ${cardsHtml}
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 class="font-semibold text-gray-800 mb-2">What this means for you</h4>
          <ul class="text-sm text-gray-600 list-disc list-inside space-y-1">${impactList}</ul>
        </div>
      </div>
    </div>
  `;
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
    .filter((classData) => showArchived || !classData.isArchived)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((classData) => {
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
  let activeUnitId = (appState.gradebook_data.activeUnitId = appState.gradebook_data.activeUnitId || 'all');

  let optionsHtml = `<option value="all">All Units</option>`;
  Object.values(units)
    .filter((u) => !u.isFinal)
    .sort((a, b) => a.order - b.order)
    .forEach((unit) => {
      const displayTitle = unit.title ? `Unit ${unit.order}: ${unit.title}` : `Unit ${unit.order}`;
      optionsHtml += `<option value="${unit.id}" ${unit.id === activeUnitId ? 'selected' : ''}>${displayTitle}</option>`;
    });
  const finalUnit = Object.values(units).find((u) => u.isFinal);
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
  const iepCount = Object.values(students).filter((s) => s.iep).length;

  statsContainer.innerHTML = `
        <span class="text-gray-600">Students: <strong class="text-gray-800">${totalStudents}</strong></span>
        <span class="text-gray-300">|</span>
        <span class="text-gray-600">IEP: <strong class="text-indigo-600">${iepCount}</strong></span>
    `;
}

export function renderCategoryWeights() {
  const classData = getActiveClassData();
  const container = document.getElementById('category-weights-container');
  if (!classData || !container) return;

  classData.categoryWeights = classData.categoryWeights || {};
  const defaults = { k: 25, t: 25, c: 25, a: 25 };
  const weights = { ...defaults, ...classData.categoryWeights };
  classData.categoryWeights = weights;

  container.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-700 mb-3">Category Weights</h3>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
            <div>
                <label class="block text-sm font-medium text-gray-500">Knowledge %</label>
                <input type="number" step="0.1" data-cat="k" class="cat-weight-input mt-1 p-2 border rounded-md w-full" value="${weights.k}">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-500">Thinking/Inquiry %</label>
                <input type="number" step="0.1" data-cat="t" class="cat-weight-input mt-1 p-2 border rounded-md w-full" value="${weights.t}">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-500">Communication %</label>
                <input type="number" step="0.1" data-cat="c" class="cat-weight-input mt-1 p-2 border rounded-md w-full" value="${weights.c}">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-500">Application %</label>
                <input type="number" step="0.1" data-cat="a" class="cat-weight-input mt-1 p-2 border rounded-md w-full" value="${weights.a}">
            </div>
            <div class="mt-5 text-center p-2 rounded-lg" id="cat-weight-total-container">
                <span class="text-xl font-bold" id="cat-weight-total"></span>
            </div>
        </div>
    `;

  const updateTotal = () => {
    let total = 0;
    container.querySelectorAll('.cat-weight-input').forEach((input) => {
      total += parseFloat(input.value) || 0;
    });
    const totalEl = document.getElementById('cat-weight-total');
    const totalContainer = document.getElementById('cat-weight-total-container');
    if (!totalEl || !totalContainer) return;

    totalEl.textContent = `Total: ${total}%`;
    const isTotal100 = Math.round(total) === 100;
    totalContainer.className = `mt-5 text-center p-2 rounded-lg ${isTotal100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
  };
  updateTotal();
}

function roundToOneDecimal(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function computeAssignmentFactor(unit, assignment, categoryWeights) {
  const assignmentWeight = parseFloat(assignment?.weight) || 1;
  if (unit?.isFinal) return assignmentWeight;

  const categoryFactor = ['k', 't', 'c', 'a'].reduce((sum, cat) => {
    const hasCategory = (parseFloat(assignment?.categoryTotals?.[cat]) || 0) > 0;
    if (!hasCategory) return sum;
    return sum + (parseFloat(categoryWeights?.[cat]) || 0) / 100;
  }, 0);

  return categoryFactor > 0 ? assignmentWeight * categoryFactor : 0;
}

function computeWeightBreakdown(classData) {
  const units = Object.values(classData?.units || {}).sort((a, b) => a.order - b.order);
  const termUnits = units.filter((unit) => !unit.isFinal);
  const finalUnit = units.find((unit) => unit.isFinal) || null;
  const categoryWeights = classData?.categoryWeights || { k: 25, t: 25, c: 25, a: 25 };

  const configuredFinalWeight = Math.max(0, Math.min(100, parseFloat(classData?.finalWeight) || 30));
  const hasFinalUnit = Boolean(finalUnit);
  const termContributionPct = hasFinalUnit ? 100 - configuredFinalWeight : 100;
  const finalContributionPct = hasFinalUnit ? configuredFinalWeight : 0;

  const totalTermUnitWeight = termUnits.reduce((sum, unit) => sum + (parseFloat(unit.weight) || 0), 0);
  const defaultTermUnitPct = termUnits.length > 0 ? 100 / termUnits.length : 0;

  const unitRows = [];
  const assignmentRows = [];

  termUnits.forEach((unit) => {
    const normalizedUnitTermPct =
      totalTermUnitWeight > 0 ? ((parseFloat(unit.weight) || 0) / totalTermUnitWeight) * 100 : defaultTermUnitPct;
    const unitOverallPct = normalizedUnitTermPct * (termContributionPct / 100);

    unitRows.push({
      unitId: unit.id,
      unitLabel: unit.title ? `Unit ${unit.order}: ${unit.title}` : `Unit ${unit.order}`,
      pctTerm: roundToOneDecimal(normalizedUnitTermPct),
      pctOverall: roundToOneDecimal(unitOverallPct),
      isFinal: false,
    });

    const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
    const assignmentFactors = assignments.map((assignment) => ({
      assignment,
      factor: computeAssignmentFactor(unit, assignment, categoryWeights),
    }));
    const totalFactor = assignmentFactors.reduce((sum, entry) => sum + entry.factor, 0);
    const evenPct = assignments.length > 0 ? 100 / assignments.length : 0;

    assignmentFactors.forEach(({ assignment, factor }) => {
      const assignmentPctUnit = totalFactor > 0 ? (factor / totalFactor) * 100 : evenPct;
      const assignmentPctTerm = assignmentPctUnit * (normalizedUnitTermPct / 100);
      const assignmentPctOverall = assignmentPctUnit * (unitOverallPct / 100);

      assignmentRows.push({
        assignmentId: assignment.id,
        assignmentName: assignment.name,
        unitId: unit.id,
        unitLabel: unit.title ? `Unit ${unit.order}: ${unit.title}` : `Unit ${unit.order}`,
        pctUnit: roundToOneDecimal(assignmentPctUnit),
        pctTerm: roundToOneDecimal(assignmentPctTerm),
        pctOverall: roundToOneDecimal(assignmentPctOverall),
        isFinal: false,
      });
    });
  });

  if (finalUnit) {
    unitRows.push({
      unitId: finalUnit.id,
      unitLabel: finalUnit.title || 'Final Assessment',
      pctTerm: null,
      pctOverall: roundToOneDecimal(finalContributionPct),
      isFinal: true,
    });

    const assignments = Object.values(finalUnit.assignments || {}).sort((a, b) => a.order - b.order);
    const assignmentFactors = assignments.map((assignment) => ({
      assignment,
      factor: computeAssignmentFactor(finalUnit, assignment, categoryWeights),
    }));
    const totalFactor = assignmentFactors.reduce((sum, entry) => sum + entry.factor, 0);
    const evenPct = assignments.length > 0 ? 100 / assignments.length : 0;

    assignmentFactors.forEach(({ assignment, factor }) => {
      const assignmentPctUnit = totalFactor > 0 ? (factor / totalFactor) * 100 : evenPct;
      const assignmentPctOverall = assignmentPctUnit * (finalContributionPct / 100);

      assignmentRows.push({
        assignmentId: assignment.id,
        assignmentName: assignment.name,
        unitId: finalUnit.id,
        unitLabel: finalUnit.title || 'Final Assessment',
        pctUnit: roundToOneDecimal(assignmentPctUnit),
        pctTerm: null,
        pctOverall: roundToOneDecimal(assignmentPctOverall),
        isFinal: true,
      });
    });
  }

  return { unitRows, assignmentRows };
}

export function renderWeightBreakdownModal() {
  const classData = getActiveClassData();
  if (!classData) return;

  const breakdown = computeWeightBreakdown(classData);
  const unitOptions = [
    '<option value="all">All Units</option>',
    ...breakdown.unitRows.map(
      (unit) => `<option value="${unit.unitId}">${unit.unitLabel}${unit.isFinal ? ' (Final)' : ''}</option>`
    ),
  ].join('');

  const content = `
    <div class="space-y-4">
      <p class="text-sm text-gray-600">View how each unit and assignment contributes to unit marks, term marks, and the overall course mark.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="text-sm font-medium text-gray-700">
          View
          <select id="weight-breakdown-type" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 bg-white">
            <option value="assignments" selected>Assignments</option>
            <option value="units">Units</option>
          </select>
        </label>
        <label class="text-sm font-medium text-gray-700">
          Unit Filter
          <select id="weight-breakdown-unit-filter" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 bg-white">
            ${unitOptions}
          </select>
        </label>
      </div>
      <div id="weight-breakdown-results" class="max-h-[55vh] overflow-auto border border-gray-200 rounded-lg"></div>
    </div>
  `;

  showModal({
    title: `Weight Breakdown: ${classData.name}`,
    content,
    modalWidth: 'max-w-5xl',
    confirmText: null,
    cancelText: 'Close',
  });

  const formatPct = (value) => (value === null || value === undefined ? '--' : `${value.toFixed(1)}%`);

  const renderRows = () => {
    const modeEl = document.getElementById('weight-breakdown-type');
    const unitFilterEl = document.getElementById('weight-breakdown-unit-filter');
    const resultsEl = document.getElementById('weight-breakdown-results');
    if (!modeEl || !unitFilterEl || !resultsEl) return;

    const mode = modeEl.value;
    const unitFilter = unitFilterEl.value;

    if (mode === 'units') {
      const filteredUnits =
        unitFilter === 'all' ? breakdown.unitRows : breakdown.unitRows.filter((unit) => unit.unitId === unitFilter);

      if (!filteredUnits.length) {
        resultsEl.innerHTML = '<p class="text-sm text-gray-500 p-4">No units match the selected filter.</p>';
        return;
      }

      const rowsHtml = filteredUnits
        .map(
          (unit) => `
            <tr class="border-t border-gray-100">
              <td class="p-3 font-medium text-gray-700">${unit.unitLabel}</td>
              <td class="p-3 text-center text-gray-600">${formatPct(unit.pctTerm)}</td>
              <td class="p-3 text-center text-gray-700 font-semibold">${formatPct(unit.pctOverall)}</td>
            </tr>
          `
        )
        .join('');

      resultsEl.innerHTML = `
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
            <tr>
              <th class="p-3 text-left">Unit</th>
              <th class="p-3 text-center">% of Term</th>
              <th class="p-3 text-center">% of Overall</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
      return;
    }

    const filteredAssignments =
      unitFilter === 'all'
        ? breakdown.assignmentRows
        : breakdown.assignmentRows.filter((assignment) => assignment.unitId === unitFilter);

    if (!filteredAssignments.length) {
      resultsEl.innerHTML = '<p class="text-sm text-gray-500 p-4">No assignments match the selected filter.</p>';
      return;
    }

    const rowsHtml = filteredAssignments
      .map(
        (assignment) => `
          <tr class="border-t border-gray-100">
            <td class="p-3 font-medium text-gray-700">${assignment.assignmentName}</td>
            <td class="p-3 text-gray-600">${assignment.unitLabel}</td>
            <td class="p-3 text-center text-gray-600">${formatPct(assignment.pctUnit)}</td>
            <td class="p-3 text-center text-gray-600">${formatPct(assignment.pctTerm)}</td>
            <td class="p-3 text-center text-gray-700 font-semibold">${formatPct(assignment.pctOverall)}</td>
          </tr>
        `
      )
      .join('');

    resultsEl.innerHTML = `
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
          <tr>
            <th class="p-3 text-left">Assignment</th>
            <th class="p-3 text-left">Unit</th>
            <th class="p-3 text-center">% of Unit</th>
            <th class="p-3 text-center">% of Term</th>
            <th class="p-3 text-center">% of Overall</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  };

  document.getElementById('weight-breakdown-type')?.addEventListener('change', renderRows);
  document.getElementById('weight-breakdown-unit-filter')?.addEventListener('change', renderRows);
  renderRows();
}

// This file handles rendering the gradebook table and related UI based on the current state
export function renderGradebook() {
  const classData = getActiveClassData();
  const table = document.getElementById('gradebookTable');
  const classNameEl = document.getElementById('className');
  const appState = getAppState();

  if (!classData || !table || !classNameEl) return;

  const savedZoom = appState.gradebook_data.zoomLevel || 0.8;
  const contentArea = document.getElementById('main-content-area');
  if (contentArea) contentArea.style.zoom = savedZoom;
  const zoomText = document.getElementById('zoom-level-text');
  if (zoomText) zoomText.textContent = `${Math.round(savedZoom * 100)}%`;

  updateClassStats();
  document.body.classList.toggle('has-final', classData.hasFinal);
  document.body.classList.toggle('no-final', !classData.hasFinal);
  classNameEl.textContent = classData.name;
  const classStatusBadge = document.getElementById('class-status-badge');
  const archiveClassBtn = document.getElementById('archiveClassBtn');
  const deleteClassBtn = document.getElementById('deleteClassBtn');
  if (classStatusBadge) {
    if (classData.isArchived) {
      classStatusBadge.textContent = 'Archived';
      classStatusBadge.className = 'text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800';
    } else {
      classStatusBadge.textContent = 'Active';
      classStatusBadge.className = 'text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700';
    }
  }
  if (archiveClassBtn) {
    const isArchived = Boolean(classData.isArchived);
    archiveClassBtn.textContent = isArchived ? 'Unarchive Class' : 'Archive Class';
    archiveClassBtn.className = isArchived
      ? 'bg-secondary hover:bg-secondary-dark text-white font-bold py-2 px-4 rounded-lg'
      : 'bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg';
    archiveClassBtn.title = isArchived ? 'Restore this class to active classes' : 'Archive this class';
  }
  if (deleteClassBtn) {
    const isArchived = Boolean(classData.isArchived);
    deleteClassBtn.disabled = isArchived;
    deleteClassBtn.title = isArchived
      ? 'Archived classes cannot be deleted. Unarchive this class first to delete it.'
      : 'Delete this class permanently';
  }

  const students = classData.students || {};
  const allUnits = classData.units || {};

  const catNames = classData.categoryNames || { k: 'Knowledge', t: 'Thinking', c: 'Communication', a: 'Application' };
  const getLet = (key) => {
    const name = catNames[key];
    return name && name.length > 0 ? name.trim().charAt(0).toUpperCase() : key.toUpperCase();
  };
  const toNumericScore = (value) => {
    if (value === 'M') return 0;
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formatTooltipNumber = (value) => {
    const rounded = Math.round((toNumericScore(value) + Number.EPSILON) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };
  const buildAssignmentTooltip = (student, assignment, isFinal) => {
    if (isFinal) {
      const earned = toNumericScore(student.grades?.[assignment.id]?.grade);
      const possible = toNumericScore(assignment.total);
      return `${formatTooltipNumber(earned)} out of ${formatTooltipNumber(possible)}`;
    }

    const cats = ['k', 't', 'c', 'a'];
    const earned = cats.reduce((sum, cat) => sum + toNumericScore(student.grades?.[assignment.id]?.[cat]), 0);
    const possible = cats.reduce((sum, cat) => sum + toNumericScore(assignment.categoryTotals?.[cat]), 0);
    return `${formatTooltipNumber(earned)} out of ${formatTooltipNumber(possible)}`;
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

  const headerBg = 'bg-gray-100';
  const bodyBg = 'bg-white';
  const stickyName =
    'sticky left-0 z-20 border-r border-gray-300 w-[10rem] min-w-[10rem] max-w-[10rem] md:w-[15rem] md:min-w-[15rem] md:max-w-[15rem] shadow-[4px_0_5px_-2px_rgba(0,0,0,0.1)] md:shadow-none';
  const stickyIep =
    'z-10 md:z-20 border-r border-gray-300 w-[3rem] min-w-[3rem] max-w-[3rem] md:w-[4rem] md:min-w-[4rem] md:max-w-[4rem] md:sticky md:left-[15rem]';
  const stickyOverall =
    'z-10 md:z-20 border-r-2 border-gray-400 w-[5rem] min-w-[5rem] max-w-[5rem] md:w-[6rem] md:min-w-[6rem] md:max-w-[6rem] md:sticky md:left-[19rem] md:shadow-[4px_0_5px_-2px_rgba(0,0,0,0.1)]';

  const studentInfoHeaders = `
        <th class="${stickyName} ${headerBg} p-3 text-left z-30">Student Name</th>
        <th class="${stickyIep} ${headerBg} p-3 text-center z-30">IEP</th>
        <th class="${stickyOverall} ${headerBg} p-3 text-center z-30">Overall</th>
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

  const weightBreakdown = computeWeightBreakdown(classData);
  const assignmentOverallPercentById = {};
  weightBreakdown.assignmentRows.forEach((row) => {
    assignmentOverallPercentById[`${row.unitId}:${row.assignmentId}`] = row.pctOverall;
  });

  let headerHtml1 = `<tr class="bg-gray-50">
        <th class="${stickyName} ${headerBg} z-30" rowspan="2"></th>
        <th class="${stickyIep} ${headerBg} z-30" rowspan="2"></th>
        <th class="${stickyOverall} ${headerBg} z-30" rowspan="2"></th>
        <th class="student-info-header-blank" colspan="${studentInfoColCount - 3}"></th>
        <th colspan="${nonStickyColCount}"></th>`;

  let headerHtml2 = `<tr>
        <th class="student-info-header-blank" colspan="${studentInfoColCount - 3}"></th>
        <th colspan="${nonStickyColCount}"></th>`;

  let headerHtml3 = `<tr class="bg-gray-50">${studentInfoHeaders}`;

  Object.values(unitsToDisplay)
    .sort((a, b) => a.order - b.order)
    .forEach((unit) => {
      const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
      const colspan = unit.isFinal ? assignments.length : assignments.length * 4;

      const titleText = unit.title ? `: ${unit.title}` : '';
      const subtitleText = unit.subtitle ? ` - ${unit.subtitle}` : '';
      const displayTitle = unit.isFinal ? 'Final Assessment' : `Unit ${unit.order}${titleText}${subtitleText}`;

      const unitWtBadge =
        !unit.isFinal && unit.weight != null
          ? `<span class="block text-[10px] font-normal text-blue-400 mt-0.5">${parseFloat(unit.weight).toFixed(1)}% of term</span>`
          : '';

      headerHtml1 += `<th colspan="${colspan || 1}" class="p-3 text-sm font-semibold tracking-wide text-center border-l-2 border-gray-400">${displayTitle}${unitWtBadge}</th>`;

      if (assignments.length === 0) {
        headerHtml2 += `<td colspan="${colspan || 1}" class="p-3 text-center text-xs text-gray-400 border-l-2 border-gray-400 italic">No assignments</td>`;
        headerHtml3 += `<td colspan="${colspan || 1}" class="border-l-2 border-gray-400"></td>`;
      } else {
        assignments.forEach((asg) => {
          const weightText =
            asg.weight && asg.weight !== 1
              ? `<span class="text-xs font-normal text-gray-500">(x${asg.weight})</span>`
              : '';
          const isSubmitted = asg.isSubmitted || false;
          const submittedClass = isSubmitted ? 'submitted-assignment-col' : '';
          const checked = isSubmitted ? 'checked' : '';

          const toggleHtml = `<div class="mt-1 flex items-center justify-center gap-1"><input type="checkbox" class="assignment-status-toggle" data-unit-id="${unit.id}" data-assignment-id="${asg.id}" ${checked}><label class="text-[9px] text-blue-600 font-bold uppercase cursor-pointer">Submitted</label></div>`;

          if (unit.isFinal) {
            const asgPctFinal = assignmentOverallPercentById[`${unit.id}:${asg.id}`];
            const asgPctTagFinal =
              asgPctFinal != null
                ? `<span class="block text-[9px] font-bold text-teal-600">${asgPctFinal.toFixed(1)}% overall</span>`
                : '';
            headerHtml2 += `<th class="p-3 text-xs font-medium text-gray-500 tracking-wider text-center border-l-2 border-gray-400 ${submittedClass}">${asg.name}<br>${weightText}${asgPctTagFinal}${toggleHtml}</th>`;
            headerHtml3 += `<th class="p-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-center border-l-2 border-gray-400 assignment-header-cell ${submittedClass}">Score<br><input type="number" class="assignment-total-input font-normal w-12 text-center bg-transparent border-b border-transparent hover:border-gray-400 focus:border-blue-500 p-0" data-unit-id="${unit.id}" data-assignment-id="${asg.id}" value="${asg.total || 0}"></th>`;
          } else {
            const asgPct = assignmentOverallPercentById[`${unit.id}:${asg.id}`];
            const asgPctTag =
              asgPct != null
                ? `<span class="block text-[9px] font-bold text-teal-600">${asgPct.toFixed(1)}% overall</span>`
                : '';
            headerHtml2 += `<th colspan="4" class="p-3 text-xs font-medium text-gray-500 tracking-wider text-center border-l-2 border-gray-400 ${submittedClass}">${asg.name}<br>${weightText}${asgPctTag}${toggleHtml}</th>`;
            ['k', 't', 'c', 'a'].forEach((cat) => {
              const borderClass = cat === 'k' ? 'border-l-2 border-gray-400' : 'border-l';
              const catTotal = asg.categoryTotals?.[cat] || 0;
              headerHtml3 += `<th class="p-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-center ${borderClass} assignment-header-cell ${submittedClass}" title="${catNames[cat]}">${getLet(cat)}<br><input type="number" class="assignment-total-input font-normal w-10 text-center bg-transparent border-b border-transparent hover:border-gray-400 focus:border-blue-500 p-0 text-xs" data-unit-id="${unit.id}" data-assignment-id="${asg.id}" data-cat="${cat}" value="${catTotal}"></th>`;
            });
          }
        });
      }
    });
  thead.innerHTML = headerHtml1 + '</tr>' + headerHtml2 + '</tr>' + headerHtml3 + '</tr>';

  const tbody = table.querySelector('tbody');
  const searchTerm = document.getElementById('student-search-input')?.value.toLowerCase() || '';
  const studentIds = Object.keys(students).filter((id) => {
    const student = students[id];
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    return fullName.includes(searchTerm);
  });

  if (studentIds.length === 0) {
    const message =
      Object.keys(students).length === 0
        ? "No students yet. Click '+ Add Student' to get started."
        : 'No students match your search.';
    tbody.innerHTML = `<tr><td colspan="100%" class="text-center p-8 text-gray-500">${message}</td></tr>`;
  } else {
    tbody.innerHTML = studentIds
      .sort((a, b) => {
        const lastNameA = String(students[a]?.lastName || '');
        const lastNameB = String(students[b]?.lastName || '');
        return lastNameA.localeCompare(lastNameB);
      })
      .map((studentId) => {
        const student = students[studentId];
        const midtermDisplayValue =
          student.midtermGrade !== null && student.midtermGrade !== undefined ? student.midtermGrade.toFixed(1) : '';
        const midtermDisplayScore = midtermDisplayValue !== '' ? `${midtermDisplayValue}%` : '--';
        const profilePicUrl = student.profilePicturePath ? getProfilePictureUrl(student.profilePicturePath) : null;
        const profilePicHtml = profilePicUrl
          ? `<img src="${profilePicUrl}" class="w-8 h-8 rounded-full mr-2 object-cover shrink-0">`
          : `<div class="w-8 h-8 rounded-full mr-2 bg-gray-300 flex items-center justify-center text-white font-bold shrink-0">${student.firstName.charAt(0)}${student.lastName.charAt(0)}</div>`;
        const hasNotes = student.generalNotes && student.generalNotes.trim().length > 0;
        const noteIndicator = hasNotes
          ? `<span class="text-accent text-xl leading-none ml-1 relative top-1" title="Has General Note">*</span>`
          : '';

        let rowHtml = `<tr class="student-row hover:bg-gray-50 transition-colors" data-student-id="${studentId}">
                <td class="${stickyName} ${bodyBg} p-0 border-t border-gray-200">
                    <div class="flex items-center pl-2 h-full">
                        <button class="delete-btn text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 mr-2 rounded transition-colors" title="Delete Student" style="background: none; width: auto; height: auto;">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <button class="student-name-btn flex items-start p-2 flex-grow min-w-0 text-left hover:bg-gray-50 rounded">
                          ${profilePicHtml}<span class="font-medium text-gray-700 min-w-0 whitespace-normal break-words leading-tight">${student.lastName}, ${student.firstName}</span>${noteIndicator}
                        </button>
                    </div>
                </td>
                <td class="${stickyIep} ${bodyBg} p-3 text-center"><input type="checkbox" class="iep-checkbox h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" data-student-id="${studentId}" ${student.iep ? 'checked' : ''}></td>
                <td class="${stickyOverall} ${bodyBg} p-3 text-center font-bold text-gray-800 student-overall">--%</td>
                
                <td class="p-3 text-center font-semibold student-term-mark">--%</td>
                <td class="p-3 text-center font-semibold student-midterm">${midtermDisplayScore}</td>
                ${classData.hasFinal ? `<td class="p-3 text-center font-semibold student-final">--%</td>` : ''}
                <td class="p-3 text-center font-semibold student-cat-k">--%</td>
                <td class="p-3 text-center font-semibold student-cat-t">--%</td>
                <td class="p-3 text-center font-semibold student-cat-c">--%</td>
                <td class="p-3 text-center font-semibold student-cat-a">--%</td>`;

        Object.values(unitsToDisplay)
          .sort((a, b) => a.order - b.order)
          .forEach((unit) => {
            const assignments = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
            if (assignments.length === 0) {
              rowHtml += `<td class="border-l-2 border-gray-400"></td>`;
            } else {
              assignments.forEach((asg) => {
                const isSubmitted = asg.isSubmitted || false;
                const subClass = isSubmitted ? 'submitted-assignment-col' : '';

                if (unit.isFinal) {
                  const score = student.grades?.[asg.id]?.grade ?? '';
                  const tooltipText = buildAssignmentTooltip(student, asg, true);

                  // UPDATED LOGIC: Only color if 0 or M
                  const isZeroOrMissing = score === 0 || String(score).toUpperCase() === 'M';
                  const colorClass = isZeroOrMissing ? '!bg-red-300 !text-red-900' : '';

                  rowHtml += `<td class="p-0 border-l-2 border-gray-400 ${subClass} ${colorClass}"><input type="text" class="grade-input" title="${tooltipText}" aria-label="${tooltipText}" data-student-id="${studentId}" data-assignment-id="${asg.id}" value="${score}"></td>`;
                } else {
                  const tooltipText = buildAssignmentTooltip(student, asg, false);
                  ['k', 't', 'c', 'a'].forEach((cat) => {
                    const score = student.grades?.[asg.id]?.[cat] ?? '';
                    const borderClass = cat === 'k' ? 'border-l-2 border-gray-400' : 'border-l';

                    // UPDATED LOGIC: Only color if 0 or M
                    const isZeroOrMissing = score === 0 || String(score).toUpperCase() === 'M';
                    const colorClass = isZeroOrMissing ? '!bg-red-300 !text-red-900' : '';

                    rowHtml += `<td class="p-0 ${borderClass} ${subClass} ${colorClass}"><input type="text" class="grade-input" title="${tooltipText}" aria-label="${tooltipText}" data-student-id="${studentId}" data-assignment-id="${asg.id}" data-cat="${cat}" value="${score}"></td>`;
                  });
                }
              });
            }
          });
        return rowHtml + `</tr>`;
      })
      .join('');
  }

  const tfoot = table.querySelector('tfoot');

  let footerCells = [
    `<td class="${stickyName} ${headerBg} p-3 text-left font-bold z-20">Class Average</td>`,
    `<td class="${stickyIep} ${headerBg} z-20"></td>`,
    `<td class="${stickyOverall} ${headerBg} class-overall text-center font-bold z-20">--%</td>`,
    `<td class="class-term-mark text-center">--%</td>`,
    `<td></td>`,
  ];

  if (classData.hasFinal) footerCells.push(`<td class="class-final text-center">--%</td>`);
  footerCells.push(`<td></td>`, `<td></td>`, `<td></td>`, `<td></td>`);
  let footerHtml = `<tr class="bg-gray-50 font-semibold">${footerCells.join('')}`;

  Object.values(unitsToDisplay)
    .sort((a, b) => a.order - b.order)
    .forEach((unit) => {
      const assignments = Object.values(unit.assignments || {});
      const colspan = unit.isFinal ? assignments.length || 1 : assignments.length * 4 || 1;
      footerHtml += `<td colspan="${colspan}" class="p-3 border-l-2 border-gray-400"></td>`;
    });
  tfoot.innerHTML = footerHtml + `</tr>`;

  recalculateAndRenderAverages();
}

//

export function updateUIFromState() {
  const appState = getAppState();
  if (!appState.gradebook_data) return;

  const semesterBtn1 = document.getElementById('semesterBtn1');
  const semesterBtn2 = document.getElementById('semesterBtn2');
  const mainContent = document.getElementById('main-content-area');
  const instructionsContent = document.getElementById('content-instructions');
  const instructionsTab = document.querySelector('[data-tab-id="instructions"]');
  const updatesNewBadge = document.getElementById('updates-new-badge');

  if (!semesterBtn1 || !semesterBtn2 || !mainContent || !instructionsContent || !instructionsTab) return;

  const activeSemester = appState.gradebook_data.activeSemester || '1';
  const activeClassId = appState.gradebook_data.activeClassId;
  const semesterData = getActiveSemesterData();
  const hasClasses = Object.keys(semesterData.classes || {}).length > 0;
  const latestUpdate = getLatestUpdateMeta();
  const hasUnseenUpdates = Boolean(latestUpdate?.id && appState.gradebook_data.lastSeenUpdateId !== latestUpdate.id);

  // 1. Update Semester Tabs
  semesterBtn1.classList.toggle('active', activeSemester === '1');
  semesterBtn2.classList.toggle('active', activeSemester === '2');

  // 2. DYNAMIC LABEL FIX: Update button text based on CURRENT active semester
  const moveClassBtn = document.getElementById('moveClassBtn');
  if (moveClassBtn) {
    // If we are in Sem 1, target is 2. If in Sem 2, target is 1.
    const targetSem = activeSemester === '1' ? '2' : '1';
    moveClassBtn.textContent = `Move to Sem ${targetSem}`;
  }

  renderClassTabs();

  const noClassContent = document.getElementById('no-class-content');
  if (noClassContent) noClassContent.classList.toggle('hidden', hasClasses);

  const hasActiveClass = activeClassId && semesterData.classes?.[activeClassId];
  mainContent.classList.toggle('hidden', !hasActiveClass);
  instructionsContent.classList.toggle('hidden', hasActiveClass || !hasClasses);
  instructionsTab.classList.toggle('active', !hasActiveClass);
  if (updatesNewBadge) updatesNewBadge.classList.toggle('hidden', !hasUnseenUpdates);

  if (hasActiveClass) {
    renderUnitFilter();
    renderCategoryWeights();
    renderGradebook();
  }
}

//

export function renderFullGradebookUI() {
  if (!contentWrapper) return;

  // Calculate initial target semester for the Move button
  const appState = getAppState();
  const currentSem = appState.gradebook_data?.activeSemester || '1';
  const targetSem = currentSem === '1' ? '2' : '1';

  contentWrapper.innerHTML = `
        <div class="mb-4">
            <div class="border-b border-gray-200"><nav class="flex items-center space-x-8"><button id="semesterBtn1" class="semester-button py-3 px-1 border-b-2 border-transparent font-medium text-lg text-gray-500 hover:text-gray-700">Semester 1</button><button id="semesterBtn2" class="semester-button py-3 px-1 border-b-2 border-transparent font-medium text-lg text-gray-500 hover:text-gray-700">Semester 2</button></nav></div>
        <div class="border-b border-gray-200 mt-2"><nav class="flex items-center space-x-4"><button data-tab-id="instructions" class="tab-button shrink-0 py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-2">Instructions <span id="updates-new-badge" class="hidden bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">New</span></button><div id="class-tabs-container" class="flex items-center space-x-4 overflow-x-auto"></div><button id="addClassBtn" class="ml-2 shrink-0 bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold py-2 px-3 rounded-lg text-sm">+ Add Class</button><div class="ml-auto flex items-center"><input type="checkbox" id="show-archived-checkbox" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"><label for="show-archived-checkbox" class="ml-2 block text-sm text-gray-900">Show Archived</label></div></nav></div>
        </div>
        <div id="no-class-content" class="hidden text-center p-8 bg-white rounded-lg shadow-md"><h2 class="text-2xl font-semibold mb-4 text-gray-700">No classes yet for this semester.</h2><p class="text-gray-500">Click the "+ Add Class" button to create your first class.</p></div>
        
        <div id="content-instructions" class="tab-content hidden fade-in bg-white p-8 rounded-lg shadow-md max-w-4xl mx-auto">
            <div class="text-center mb-8">
                <h2 class="text-3xl font-extrabold text-gray-800">Welcome to Marksheet Pro</h2>
                <p class="text-gray-500 mt-2">Your professional grade management solution.</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-blue-600 flex items-center gap-2">
                        <span class="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm">1</span>
                        Class Setup
                    </h3>
                    <ul class="space-y-2 text-gray-600 text-sm list-disc list-inside ml-2">
                        <li><strong>Create a Class:</strong> Click the <span class="bg-gray-200 px-1 rounded font-bold text-xs">+ Add Class</span> button above.</li>
                        <li><strong>Semesters:</strong> Switch between Semester 1 and 2 tabs to organize your year.</li>
                        <li><strong>Move Classes:</strong> Created a class in the wrong semester? Open the class and click <span class="bg-gray-500 text-white px-1 rounded font-bold text-xs">Move to Sem X</span> to instantly transfer it.</li>
                        <li><strong>Archive Class:</strong> Use the <span class="bg-accent text-white px-1 rounded font-bold text-xs">Archive Class</span> button to hide old classes while keeping the data intact.</li>
                    </ul>
                </div>

                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-green-600 flex items-center gap-2">
                        <span class="bg-green-100 text-green-600 rounded-full w-8 h-8 flex items-center justify-center text-sm">2</span>
                        Manage Students
                    </h3>
                    <ul class="space-y-2 text-gray-600 text-sm list-disc list-inside ml-2">
                        <li><strong>Quick Add:</strong> Click <span class="bg-accent text-white px-1 rounded font-bold text-xs">+ Add Student</span> to add one by one.</li>
                        <li><strong>Smart Import:</strong> Click <strong>Import Students</strong> to paste a list of names. We auto-detect "First Last" or "Last, First" formats.</li>
                        <li><strong>Photo Scan:</strong> In the Import menu, upload a photo of a paper class list to automatically extract student names!</li>
                        <li><strong>Edit Student:</strong> Click a student's name in the gradebook to open their profile, add photos, notes, and contact information.</li>
                    </ul>
                </div>

                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-purple-600 flex items-center gap-2">
                        <span class="bg-purple-100 text-purple-600 rounded-full w-8 h-8 flex items-center justify-center text-sm">3</span>
                        Grading & Weights
                    </h3>
                    <ul class="space-y-2 text-gray-600 text-sm list-disc list-inside ml-2">
                        <li><strong>Weights:</strong> Adjust the K/T/C/A category percentages at the top of the gradebook. Ensure they total 100%.</li>
                        <li><strong>Add Work:</strong> Use <span class="bg-accent text-white px-1 rounded font-bold text-xs">Manage Assignments</span> to create tasks and set weightings.</li>
                        <li><strong>Edit Units:</strong> Click <span class="bg-primary text-white px-1 rounded font-bold text-xs">Edit Units</span> to organize your course into units and create a final assessment.</li>
                        <li><strong>Edit Totals:</strong> <em>Pro Tip:</em> You can edit an assignment's total score directly by clicking the number in the table header!</li>
                        <li><strong>Missing Work:</strong> Type <strong>'M'</strong> in any grade cell to mark it as missing (calculates as 0).</li>
                    </ul>
                </div>

                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-red-600 flex items-center gap-2">
                        <span class="bg-red-100 text-red-600 rounded-full w-8 h-8 flex items-center justify-center text-sm">4</span>
                        Student Profiles
                    </h3>
                    <ul class="space-y-2 text-gray-600 text-sm list-disc list-inside ml-2">
                        <li><strong>Student Notes:</strong> Add general notes or specific IEP notes to any student by clicking their name.</li>
                        <li><strong>Student Contacts:</strong> Store parent/guardian contact information right in their profile.</li>
                        <li><strong>Profile Picture:</strong> Upload or generate a profile picture for each student.</li>
                        <li><strong>Mid-Semester Entry:</strong> Set a starting overall mark for students who joined partway through the term.</li>
                        <li><strong>Download Reports:</strong> Export individual student reports with a single click.</li>
                    </ul>
                </div>

                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-indigo-600 flex items-center gap-2">
                        <span class="bg-indigo-100 text-indigo-600 rounded-full w-8 h-8 flex items-center justify-center text-sm">5</span>
                        Tracking & Analytics
                    </h3>
                    <ul class="space-y-2 text-gray-600 text-sm list-disc list-inside ml-2">
                        <li><strong>Attendance:</strong> Click <span class="bg-primary text-white px-1 rounded font-bold text-xs">Attendance</span> to track present, absent, and late records for any date.</li>
                        <li><strong>Midterms:</strong> Use <span class="bg-primary text-white px-1 rounded font-bold text-xs">Record Midterms</span> to store midterm grades separately from regular assignments.</li>
                        <li><strong>Analytics:</strong> Click <span class="bg-indigo-600 text-white px-1 rounded font-bold text-xs">Analytics</span> to visualize grade distribution and category performance across your class.</li>
                        <li><strong>Search:</strong> Use the search bar at the top to quickly find any student in your class.</li>
                    </ul>
                </div>

                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-orange-600 flex items-center gap-2">
                        <span class="bg-orange-100 text-orange-600 rounded-full w-8 h-8 flex items-center justify-center text-sm">6</span>
                        Tools & Exports
                    </h3>
                    <ul class="space-y-2 text-gray-600 text-sm list-disc list-inside ml-2">
                        <li><strong>Save as Preset:</strong> Click <span class="bg-secondary text-white px-1 rounded font-bold text-xs">Save Class as Preset</span> to reuse units and assignments for future classes.</li>
                        <li><strong>Export Options:</strong> Use the <strong>Export</strong> menu to download PDFs for report cards, student lists, contact lists, or CSV backups.</li>
                        <li><strong>Blank Marksheet:</strong> Export a blank printing-ready marksheet.</li>
                        <li><strong>Zoom:</strong> Use the <span class="font-bold border px-1 rounded">- / +</span> controls to adjust the view size for better readability.</li>
                        <li><strong>Backup & Restore:</strong> Click <strong>Backup</strong> to download your data, or <strong>Restore</strong> to upload a backup file.</li>
                        <li><strong>Auto-Save:</strong> All changes are saved automatically to the cloud.</li>
                    </ul>
                </div>
            </div>

            ${renderUpdatesSection()}
            
            <div class="mt-8 text-center pt-6 border-t border-gray-100">
                <p class="text-sm text-gray-400">Need help? Click the "Report Bug" button at the top if you encounter any issues.</p>
            </div>
        </div>
        <div id="main-content-area" class="tab-content hidden fade-in">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
                <div class="flex items-center gap-4"><div class="flex items-center gap-2"><div contenteditable="true" id="className" class="text-2xl font-bold text-gray-700 p-2 rounded-md transition-shadow"></div><span id="class-status-badge" class="hidden text-xs font-semibold px-2 py-1 rounded-full"></span></div><div class="flex items-center gap-2"><span id="save-status-icon"></span><span id="saveStatus" class="text-sm"></span></div></div>
                <div class="mt-2 sm:mt-0 flex flex-wrap items-center justify-end gap-2">
                    <button id="savePresetBtn" class="bg-secondary hover:bg-secondary-dark text-white font-bold py-2 px-4 rounded-lg">Save Class as Preset</button>
                    <button id="importStudentsBtn" class="bg-secondary hover:bg-secondary-dark text-white font-bold py-2 px-4 rounded-lg">Import Students</button>
                    <button id="recordMidtermsBtn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Record Midterms</button>

                    <button id="analyticsBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        Analytics
                    </button>

                    <button id="weightsBreakdownBtn" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg">Weight Breakdown</button>
                    
                    <button id="moveClassBtn" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">Move to Sem ${targetSem}</button>
                    
                    <button id="archiveClassBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg">Archive Class</button>
                    <button id="deleteClassBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600">Delete Class</button>
                    <div class="relative">
                        <button id="exportMenuBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                            Export <span>&#9662;</span>
                        </button>
                        <div id="exportMenuDropdown" class="hidden absolute right-0 mt-2 w-60 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                            <a href="#" id="exportCsvBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Export Full Gradebook (CSV)</a>
                            <a href="#" id="exportPdfBtn" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Export Gradebook / Reports (PDF)</a>
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
                
                <div class="flex items-center gap-1 bg-white rounded-lg border border-gray-300 px-2 py-1 shadow-sm mr-2 select-none">
                    <button id="zoomOutBtn" class="text-gray-500 hover:text-gray-700 font-bold px-2 text-lg leading-none" title="Zoom Out">&minus;</button>
                    <span id="zoom-level-text" class="text-xs text-gray-600 font-medium w-10 text-center">80%</span>
                    <button id="zoomInBtn" class="text-gray-500 hover:text-gray-700 font-bold px-2 text-lg leading-none" title="Zoom In">&plus;</button>
                </div>

                <div id="class-stats-container" class="text-sm text-gray-500 font-medium flex items-center gap-3 px-2"></div>

                <button id="undoBtn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-3 rounded-lg whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed" ${canUndoHistory() ? '' : 'disabled'}>Undo</button>
                <button id="redoBtn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-3 rounded-lg whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed" ${canRedoHistory() ? '' : 'disabled'}>Redo</button>
                <button id="addStudentBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg whitespace-nowrap">+ Add Student</button>
                <button id="restoreStudentsBtn" class="bg-secondary hover:bg-secondary-dark text-white font-bold py-2 px-4 rounded-lg whitespace-nowrap">Restore Students</button>
                ${appState.gradebook_data?.appSettings?.attendanceEnabled !== false ? `<button id="attendanceBtn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Attendance</button>` : ''}
            </div>

            <div class="flex page-center gap-2">
                <div class="relative"><button id="editUnitsBtn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Edit Units</button></div>
                <button id="addAssignmentBtn" class="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-lg">Manage Assignments</button>
                <select id="unitFilterDropdown" class="bg-white border border-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 shadow-sm"></select>
            </div>
        </div>
                
            <div id="table-wrapper" class="bg-white rounded-lg shadow-md"><table id="gradebookTable" class="w-full text-md text-gray-500"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>
        </div>
    `;
  updateUIFromState();
}

export function renderAccountPage(isSetupMode = false) {
  const appState = getAppState();
  if (!contentWrapper) return;

  const currentTitle = appState.title || '';
  const currentFullName = appState.full_name || '';
  const currentSchoolName = appState.school_name || '';
  const currentSchoolBoard = appState.school_board || '';
  const currentRoomNumber = appState.room_number || '';
  const currentBirthday = appState.birthday || '';
  const profilePicPath = appState.profilePicturePath || '';
  const profilePicUrl = profilePicPath ? getProfilePictureUrl(profilePicPath) : null;
  const schoolLogoDataUrl = appState.gradebook_data?.branding?.schoolLogoDataUrl || '';

  const creationDate = appState.created_at ? new Date(appState.created_at).toLocaleDateString() : 'N/A';
  const lastLogin = appState.last_login ? new Date(appState.last_login).toLocaleString() : 'N/A';

  const profilePicHtml = profilePicUrl
    ? `<img src="${profilePicUrl}" id="profile-pic-preview" class="w-32 h-32 rounded-full mx-auto object-cover mb-4">`
    : `<div id="profile-pic-preview" class="w-32 h-32 rounded-full mx-auto bg-gray-300 flex items-center justify-center text-white text-5xl font-bold mb-4">${currentFullName ? currentFullName.charAt(0) : 'U'}</div>`;

  const appSettings = appState.gradebook_data?.appSettings || {};
  const attendanceEnabled = appSettings.attendanceEnabled !== false;
  const darkModeEnabled = !!appSettings.darkMode;
  const densityMode = appSettings.densityMode === 'compact' ? 'compact' : 'comfortable';
  const fontSizeMode =
    appSettings.fontSizeMode === 'small' || appSettings.fontSizeMode === 'large' ? appSettings.fontSizeMode : 'default';
  const highContrastEnabled = !!appSettings.highContrastMode;
  const reducedMotionEnabled = !!appSettings.reducedMotion;
  const gradeColorIntensity = ['subtle', 'standard', 'strong'].includes(appSettings.gradeColorIntensity)
    ? appSettings.gradeColorIntensity
    : 'standard';
  const themePreset = ['default', 'ocean', 'forest', 'sunset'].includes(appSettings.themePreset)
    ? appSettings.themePreset
    : 'default';
  const autoSaveSettingsEnabled = !!appSettings.autoSaveSettings;

  // ── Profile tab ───────────────────────────────────────────────
  const profilePanelHtml = `
    <div id="account-feedback" class="hidden mb-4 p-3 rounded-md"></div>
    <div class="space-y-6">
      <div class="flex flex-col items-center">
        ${profilePicHtml}
        <input type="file" id="profile-picture-upload" class="hidden" accept="image/*">
        <button id="upload-profile-pic-btn" class="text-sm text-blue-600 hover:underline">Upload Photo</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-1"><label for="title-input" class="block text-sm font-medium text-gray-700">Title</label><input type="text" id="title-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentTitle}" placeholder="e.g., Mr."></div>
        <div class="md:col-span-2"><label for="full-name-input" class="block text-sm font-medium text-gray-700">Full Name</label><input type="text" id="full-name-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentFullName}" placeholder="e.g., John Smith"></div>
      </div>
      <div><label for="school-board-input" class="block text-sm font-medium text-gray-700">School Board</label><input type="text" id="school-board-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentSchoolBoard}" placeholder="e.g., TCDSB"></div>
      <div><label for="school-name-input" class="block text-sm font-medium text-gray-700">School Name</label><input type="text" id="school-name-input" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${currentSchoolName}" placeholder="e.g., Maplewood High School"></div>
      <div>
        <label class="block text-sm font-medium text-gray-700">School Logo (for PDF exports)</label>
        <div class="mt-2 flex items-center gap-4">
          <div id="school-logo-preview-wrap" class="w-28 h-16 border border-gray-300 rounded bg-gray-50 flex items-center justify-center overflow-hidden">
            ${schoolLogoDataUrl ? `<img id="school-logo-preview" src="${schoolLogoDataUrl}" class="max-w-full max-h-full object-contain">` : `<span id="school-logo-placeholder" class="text-[11px] text-gray-400">No Logo</span>`}
          </div>
          <div class="flex flex-col gap-2">
            <input type="file" id="school-logo-upload" class="hidden" accept="image/png,image/jpeg,image/webp">
            <input type="hidden" id="school-logo-data-url">
            <button id="upload-school-logo-btn" type="button" class="text-sm text-blue-600 hover:underline text-left">Upload Logo</button>
            <button id="remove-school-logo-btn" type="button" class="text-sm text-gray-500 hover:text-red-600 text-left">Remove Logo</button>
            <p class="text-[11px] text-gray-500">Accepted: PNG, JPG, WEBP up to 5MB.</p>
          </div>
        </div>
      </div>
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
      ${isSetupMode ? '<div></div>' : '<button id="back-to-app-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg shadow-sm">&larr; Back to Gradebook</button>'}
      <button id="save-profile-btn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg shadow-sm">Save Changes</button>
    </div>`;

  // ── App Settings tab ──────────────────────────────────────────
  const appSettingsPanelHtml = `
    <h3 class="text-xl font-bold text-gray-800 mb-1">App Settings</h3>
    <p class="text-sm text-gray-500 mb-6">Configure how Marksheet Pro works for you.</p>
    <div id="app-settings-feedback" class="hidden mb-4 p-3 rounded-md bg-green-100 text-green-700 text-sm font-medium"></div>
    <div class="space-y-5">
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h4 class="font-semibold text-gray-800 mb-1">Features</h4>
        <p class="text-xs text-gray-500 mb-4">Toggle app features on or off to match your workflow.</p>
        <div class="flex items-center justify-between py-3" data-setting-key="attendanceEnabled">
          <div>
            <p class="font-medium text-gray-700 text-sm">Attendance Tracking</p>
            <p class="text-xs text-gray-500 mt-0.5">Show the Attendance button and sheet. Disable if you use other means for tracking attendance.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-6 flex-shrink-0">
            <input type="checkbox" id="attendance-enabled-toggle" class="sr-only peer" ${attendanceEnabled ? 'checked' : ''}>
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>
        <div class="flex items-center justify-between py-3 border-t border-gray-200" data-setting-key="autoSaveSettings">
          <div>
            <p class="font-medium text-gray-700 text-sm">Auto-Save Settings</p>
            <p class="text-xs text-gray-500 mt-0.5">Automatically save any setting change and show a tiny confirmation.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-6 flex-shrink-0">
            <input type="checkbox" id="auto-save-settings-toggle" class="sr-only peer" ${autoSaveSettingsEnabled ? 'checked' : ''}>
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>
      </div>
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h4 class="font-semibold text-gray-800 mb-1">Appearance</h4>
        <p class="text-xs text-gray-500 mb-4">Adjust the visual style of the app.</p>
        <div class="flex items-center justify-between py-3" data-setting-key="darkMode">
          <div>
            <p class="font-medium text-gray-700 text-sm">Dark Mode</p>
            <p class="text-xs text-gray-500 mt-0.5">Switch to a darker colour scheme to reduce eye strain.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-6 flex-shrink-0">
            <input type="checkbox" id="dark-mode-toggle" class="sr-only peer" ${darkModeEnabled ? 'checked' : ''}>
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>
        <div class="flex items-center justify-between py-3 border-t border-gray-200" data-setting-key="highContrastMode">
          <div>
            <p class="font-medium text-gray-700 text-sm">High Contrast</p>
            <p class="text-xs text-gray-500 mt-0.5">Increase contrast for better readability.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-6 flex-shrink-0">
            <input type="checkbox" id="high-contrast-toggle" class="sr-only peer" ${highContrastEnabled ? 'checked' : ''}>
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>
        <div class="flex items-center justify-between py-3 border-t border-gray-200" data-setting-key="reducedMotion">
          <div>
            <p class="font-medium text-gray-700 text-sm">Reduced Motion</p>
            <p class="text-xs text-gray-500 mt-0.5">Minimize animations and transitions for a steadier experience.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-6 flex-shrink-0">
            <input type="checkbox" id="reduced-motion-toggle" class="sr-only peer" ${reducedMotionEnabled ? 'checked' : ''}>
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
          </label>
        </div>
        <div class="space-y-6 border-t border-gray-200 pt-4 mt-1">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div data-setting-key="densityMode">
              <label for="density-mode-select" class="block text-sm font-medium text-gray-700">Density</label>
              <select id="density-mode-select" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                <option value="comfortable" ${densityMode === 'comfortable' ? 'selected' : ''}>Comfortable</option>
                <option value="compact" ${densityMode === 'compact' ? 'selected' : ''}>Compact</option>
              </select>
            </div>
          </div>

          <div class="border-t border-gray-200 pt-6" data-setting-key="fontSizeMode">
            <label class="block text-sm font-medium text-gray-700 mb-3">Font Size</label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label data-setting-card data-group="font-size-mode" data-value="small" class="flex-1 flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition ${fontSizeMode === 'small' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="font-size-mode" value="small" ${fontSizeMode === 'small' ? 'checked' : ''} class="sr-only">
                <div class="text-center">
                  <div style="font-size: 14px; line-height: 1.4;" class="font-medium">Small</div>
                  <div style="font-size: 12px;" class="text-gray-600 mt-1">14px</div>
                </div>
              </label>
              <label data-setting-card data-group="font-size-mode" data-value="default" class="flex-1 flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition ${fontSizeMode === 'default' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="font-size-mode" value="default" ${fontSizeMode === 'default' ? 'checked' : ''} class="sr-only">
                <div class="text-center">
                  <div style="font-size: 16px; line-height: 1.4;" class="font-medium">Default</div>
                  <div style="font-size: 12px;" class="text-gray-600 mt-1">16px</div>
                </div>
              </label>
              <label data-setting-card data-group="font-size-mode" data-value="large" class="flex-1 flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition ${fontSizeMode === 'large' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="font-size-mode" value="large" ${fontSizeMode === 'large' ? 'checked' : ''} class="sr-only">
                <div class="text-center">
                  <div style="font-size: 17px; line-height: 1.4;" class="font-medium">Large</div>
                  <div style="font-size: 12px;" class="text-gray-600 mt-1">17px</div>
                </div>
              </label>
            </div>
            <select id="font-size-mode-select" class="hidden">
              <option value="small" ${fontSizeMode === 'small' ? 'selected' : ''}>Small</option>
              <option value="default" ${fontSizeMode === 'default' ? 'selected' : ''}>Default</option>
              <option value="large" ${fontSizeMode === 'large' ? 'selected' : ''}>Large</option>
            </select>
          </div>

          <div class="border-t border-gray-200 pt-6" data-setting-key="themePreset">
            <label class="block text-sm font-medium text-gray-700 mb-3">Theme</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label data-setting-card data-group="theme-preset" data-value="default" class="flex items-center p-3 border-2 rounded-lg cursor-pointer transition ${themePreset === 'default' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="theme-preset" value="default" ${themePreset === 'default' ? 'checked' : ''} class="mr-3">
                <div class="flex-1">
                  <div class="font-medium text-sm mb-2">Default</div>
                  <div class="flex gap-1">
                    <div class="w-5 h-5 rounded" style="background-color: #2b3a67;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #0d9488;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #c026d3;"></div>
                  </div>
                </div>
              </label>
              <label data-setting-card data-group="theme-preset" data-value="ocean" class="flex items-center p-3 border-2 rounded-lg cursor-pointer transition ${themePreset === 'ocean' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="theme-preset" value="ocean" ${themePreset === 'ocean' ? 'checked' : ''} class="mr-3">
                <div class="flex-1">
                  <div class="font-medium text-sm mb-2">Ocean</div>
                  <div class="flex gap-1">
                    <div class="w-5 h-5 rounded" style="background-color: #1d4ed8;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #0f766e;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #0891b2;"></div>
                  </div>
                </div>
              </label>
              <label data-setting-card data-group="theme-preset" data-value="forest" class="flex items-center p-3 border-2 rounded-lg cursor-pointer transition ${themePreset === 'forest' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="theme-preset" value="forest" ${themePreset === 'forest' ? 'checked' : ''} class="mr-3">
                <div class="flex-1">
                  <div class="font-medium text-sm mb-2">Forest</div>
                  <div class="flex gap-1">
                    <div class="w-5 h-5 rounded" style="background-color: #166534;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #1d4ed8;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #ca8a04;"></div>
                  </div>
                </div>
              </label>
              <label data-setting-card data-group="theme-preset" data-value="sunset" class="flex items-center p-3 border-2 rounded-lg cursor-pointer transition ${themePreset === 'sunset' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="theme-preset" value="sunset" ${themePreset === 'sunset' ? 'checked' : ''} class="mr-3">
                <div class="flex-1">
                  <div class="font-medium text-sm mb-2">Sunset</div>
                  <div class="flex gap-1">
                    <div class="w-5 h-5 rounded" style="background-color: #b45309;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #be185d;"></div>
                    <div class="w-5 h-5 rounded" style="background-color: #dc2626;"></div>
                  </div>
                </div>
              </label>
            </div>
            <select id="theme-preset-select" class="hidden">
              <option value="default" ${themePreset === 'default' ? 'selected' : ''}>Default</option>
              <option value="ocean" ${themePreset === 'ocean' ? 'selected' : ''}>Ocean</option>
              <option value="forest" ${themePreset === 'forest' ? 'selected' : ''}>Forest</option>
              <option value="sunset" ${themePreset === 'sunset' ? 'selected' : ''}>Sunset</option>
            </select>
          </div>

          <div class="border-t border-gray-200 pt-6" data-setting-key="gradeColorIntensity">
            <label class="block text-sm font-medium text-gray-700 mb-3">Grade Colors</label>
            <div class="space-y-3">
              <!-- Subtle -->
              <label data-setting-card data-group="grade-color-intensity" data-value="subtle" class="flex items-center p-3 border-2 rounded-lg cursor-pointer transition ${gradeColorIntensity === 'subtle' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="grade-color-intensity" value="subtle" ${gradeColorIntensity === 'subtle' ? 'checked' : ''} class="mr-3">
                <div class="flex-1">
                  <div class="font-medium text-sm mb-2">Subtle</div>
                  <div class="flex flex-wrap gap-1">
                    <div class="w-6 h-6 rounded bg-green-50 border border-gray-200" title="Level 4 (80%+)"></div>
                    <div class="w-6 h-6 rounded bg-blue-50 border border-gray-200" title="Level 3 (70%)"></div>
                    <div class="w-6 h-6 rounded bg-yellow-50 border border-gray-200" title="Level 2 (60%)"></div>
                    <div class="w-6 h-6 rounded bg-orange-50 border border-gray-200" title="Level 1 (50%)"></div>
                    <div class="w-6 h-6 rounded bg-red-50 border border-gray-200" title="Below 50%"></div>
                  </div>
                </div>
              </label>
              
              <!-- Standard -->
              <label data-setting-card data-group="grade-color-intensity" data-value="standard" class="flex items-center p-3 border-2 rounded-lg cursor-pointer transition ${gradeColorIntensity === 'standard' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="grade-color-intensity" value="standard" ${gradeColorIntensity === 'standard' ? 'checked' : ''} class="mr-3">
                <div class="flex-1">
                  <div class="font-medium text-sm mb-2">Standard</div>
                  <div class="flex flex-wrap gap-1">
                    <div class="w-6 h-6 rounded bg-green-100 border border-gray-300" title="Level 4 (80%+)"></div>
                    <div class="w-6 h-6 rounded bg-blue-100 border border-gray-300" title="Level 3 (70%)"></div>
                    <div class="w-6 h-6 rounded bg-yellow-100 border border-gray-300" title="Level 2 (60%)"></div>
                    <div class="w-6 h-6 rounded bg-orange-100 border border-gray-300" title="Level 1 (50%)"></div>
                    <div class="w-6 h-6 rounded bg-red-100 border border-gray-300" title="Below 50%"></div>
                  </div>
                </div>
              </label>
              
              <!-- Strong -->
              <label data-setting-card data-group="grade-color-intensity" data-value="strong" class="flex items-center p-3 border-2 rounded-lg cursor-pointer transition ${gradeColorIntensity === 'strong' ? 'border-primary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
                <input type="radio" name="grade-color-intensity" value="strong" ${gradeColorIntensity === 'strong' ? 'checked' : ''} class="mr-3">
                <div class="flex-1">
                  <div class="font-medium text-sm mb-2">Strong</div>
                  <div class="flex flex-wrap gap-1">
                    <div class="w-6 h-6 rounded bg-green-300 border border-gray-400" title="Level 4 (80%+)"></div>
                    <div class="w-6 h-6 rounded bg-blue-300 border border-gray-400" title="Level 3 (70%)"></div>
                    <div class="w-6 h-6 rounded bg-yellow-300 border border-gray-400" title="Level 2 (60%)"></div>
                    <div class="w-6 h-6 rounded bg-orange-300 border border-gray-400" title="Level 1 (50%)"></div>
                    <div class="w-6 h-6 rounded bg-red-300 border border-gray-400" title="Below 50%"></div>
                  </div>
                </div>
              </label>
            </div>
            <select id="grade-color-intensity-select" class="hidden">
              <option value="subtle" ${gradeColorIntensity === 'subtle' ? 'selected' : ''}>Subtle</option>
              <option value="standard" ${gradeColorIntensity === 'standard' ? 'selected' : ''}>Standard</option>
              <option value="strong" ${gradeColorIntensity === 'strong' ? 'selected' : ''}>Strong</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div id="app-settings-dirty-indicator" class="hidden mt-4 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">You have unsaved changes.</div>
    <div class="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
      <button data-navigate-home class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg shadow-sm">&larr; Back to Gradebook</button>
      <div class="flex gap-2">
        <button id="reset-app-settings-btn" class="bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-bold py-2 px-4 rounded-lg shadow-sm">Reset Defaults</button>
        <button id="save-app-settings-btn" class="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg shadow-sm">Save Settings</button>
      </div>
    </div>`;

  // ── Billing tab ───────────────────────────────────────────────
  const billingPanelHtml = `
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      </div>
      <h3 class="text-xl font-semibold text-gray-700 mb-2">Billing</h3>
      <p class="text-gray-500 text-sm max-w-xs">Subscription and billing management is coming soon. Marksheet Pro is currently free to use.</p>
      <span class="mt-4 inline-block bg-yellow-100 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full">Coming Soon</span>
      <div class="mt-8">
        <button data-navigate-home class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg shadow-sm">&larr; Back to Gradebook</button>
      </div>
    </div>`;

  // ── Render ────────────────────────────────────────────────────
  if (isSetupMode) {
    contentWrapper.innerHTML = `
      <div class="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto fade-in">
        <h2 class="text-2xl font-bold text-primary mb-2">Welcome to Marksheet Pro!</h2>
        <p class="text-gray-600 mb-6">Please set up your profile to get started.</p>
        ${profilePanelHtml}
      </div>`;
  } else {
    contentWrapper.innerHTML = `
      <div class="max-w-4xl mx-auto fade-in">
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <div class="border-b border-gray-200">
            <nav class="flex -mb-px" aria-label="Account navigation">
              <button data-account-tab="profile" class="account-tab-btn border-b-2 border-primary text-primary px-6 py-4 text-sm font-semibold">Profile</button>
              <button data-account-tab="app-settings" class="account-tab-btn border-b-2 border-transparent text-gray-500 hover:text-gray-700 px-6 py-4 text-sm font-medium">App Settings</button>
              <button data-account-tab="billing" class="account-tab-btn border-b-2 border-transparent text-gray-500 hover:text-gray-700 px-6 py-4 text-sm font-medium">Billing</button>
            </nav>
          </div>
          <div data-account-panel="profile" class="p-8">${profilePanelHtml}</div>
          <div data-account-panel="app-settings" class="hidden p-8">${appSettingsPanelHtml}</div>
          <div data-account-panel="billing" class="hidden p-8">${billingPanelHtml}</div>
        </div>
      </div>`;

    contentWrapper.querySelectorAll('.account-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.accountTab;
        contentWrapper.querySelectorAll('.account-tab-btn').forEach((b) => {
          b.classList.remove('border-primary', 'text-primary');
          b.classList.add('border-transparent', 'text-gray-500');
        });
        btn.classList.add('border-primary', 'text-primary');
        btn.classList.remove('border-transparent', 'text-gray-500');
        contentWrapper.querySelectorAll('[data-account-panel]').forEach((p) => p.classList.add('hidden'));
        contentWrapper.querySelector(`[data-account-panel="${tab}"]`)?.classList.remove('hidden');
      });
    });

    const defaultAppSettings = {
      attendanceEnabled: true,
      darkMode: false,
      highContrastMode: false,
      reducedMotion: false,
      densityMode: 'comfortable',
      fontSizeMode: 'default',
      themePreset: 'default',
      gradeColorIntensity: 'standard',
      autoSaveSettings: false,
    };

    const normalizeSettings = (settings = {}) => ({
      attendanceEnabled: settings.attendanceEnabled !== false,
      darkMode: !!settings.darkMode,
      highContrastMode: !!settings.highContrastMode,
      reducedMotion: !!settings.reducedMotion,
      densityMode: settings.densityMode === 'compact' ? 'compact' : 'comfortable',
      fontSizeMode: ['small', 'default', 'large'].includes(settings.fontSizeMode) ? settings.fontSizeMode : 'default',
      themePreset: ['default', 'ocean', 'forest', 'sunset'].includes(settings.themePreset)
        ? settings.themePreset
        : 'default',
      gradeColorIntensity: ['subtle', 'standard', 'strong'].includes(settings.gradeColorIntensity)
        ? settings.gradeColorIntensity
        : 'standard',
      autoSaveSettings: !!settings.autoSaveSettings,
    });

    const getSettingsFromInputs = () => ({
      attendanceEnabled: document.getElementById('attendance-enabled-toggle')?.checked ?? true,
      darkMode: document.getElementById('dark-mode-toggle')?.checked ?? false,
      highContrastMode: document.getElementById('high-contrast-toggle')?.checked ?? false,
      reducedMotion: document.getElementById('reduced-motion-toggle')?.checked ?? false,
      densityMode: document.getElementById('density-mode-select')?.value === 'compact' ? 'compact' : 'comfortable',
      fontSizeMode: ['small', 'default', 'large'].includes(
        document.querySelector('input[name="font-size-mode"]:checked')?.value
      )
        ? document.querySelector('input[name="font-size-mode"]:checked')?.value
        : 'default',
      themePreset: ['default', 'ocean', 'forest', 'sunset'].includes(
        document.querySelector('input[name="theme-preset"]:checked')?.value
      )
        ? document.querySelector('input[name="theme-preset"]:checked')?.value
        : 'default',
      gradeColorIntensity: ['subtle', 'standard', 'strong'].includes(
        document.querySelector('input[name="grade-color-intensity"]:checked')?.value
      )
        ? document.querySelector('input[name="grade-color-intensity"]:checked')?.value
        : 'standard',
      autoSaveSettings: document.getElementById('auto-save-settings-toggle')?.checked ?? false,
    });

    const saveSettingsToState = (settings) => {
      const state = getAppState();
      if (!state.gradebook_data) return;
      state.gradebook_data.appSettings = {
        ...state.gradebook_data.appSettings,
        ...settings,
      };
      triggerAutoSave();
    };

    const showSettingsFeedback = (message, hideDelay = 1500) => {
      const fb = document.getElementById('app-settings-feedback');
      if (!fb) return;
      fb.textContent = message;
      fb.classList.remove('hidden');
      setTimeout(() => fb.classList.add('hidden'), hideDelay);
    };

    const isSettingsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const settingKeySelectors = {
      attendanceEnabled: '[data-setting-key="attendanceEnabled"]',
      darkMode: '[data-setting-key="darkMode"]',
      highContrastMode: '[data-setting-key="highContrastMode"]',
      reducedMotion: '[data-setting-key="reducedMotion"]',
      densityMode: '[data-setting-key="densityMode"]',
      fontSizeMode: '[data-setting-key="fontSizeMode"]',
      themePreset: '[data-setting-key="themePreset"]',
      gradeColorIntensity: '[data-setting-key="gradeColorIntensity"]',
      autoSaveSettings: '[data-setting-key="autoSaveSettings"]',
    };

    let lastSavedSettings = normalizeSettings(getAppState().gradebook_data?.appSettings || defaultAppSettings);

    const syncSelectionCards = () => {
      contentWrapper.querySelectorAll('[data-setting-card]').forEach((card) => {
        const group = card.getAttribute('data-group');
        const value = card.getAttribute('data-value');
        const selectedValue = contentWrapper.querySelector(`input[name="${group}"]:checked`)?.value;
        const isSelected = selectedValue === value;
        card.classList.toggle('border-primary', isSelected);
        card.classList.toggle('bg-blue-50', isSelected);
        card.classList.toggle('border-gray-200', !isSelected);
        if (!isSelected) {
          card.classList.add('hover:border-gray-300');
        }
      });
    };

    const updateDirtyState = () => {
      const currentSettings = normalizeSettings(getSettingsFromInputs());
      Object.entries(settingKeySelectors).forEach(([key, selector]) => {
        const container = contentWrapper.querySelector(selector);
        if (!container) return;
        container.classList.toggle('setting-dirty', currentSettings[key] !== lastSavedSettings[key]);
      });
      const dirty = !isSettingsEqual(currentSettings, lastSavedSettings);
      const dirtyIndicator = document.getElementById('app-settings-dirty-indicator');
      const wasHidden = dirtyIndicator?.classList.contains('hidden');
      dirtyIndicator?.classList.toggle('hidden', !dirty);
      if (dirtyIndicator && dirty && wasHidden) {
        dirtyIndicator.classList.remove('dirty-indicator-pop');
        // Restart animation each time banner appears.
        void dirtyIndicator.offsetWidth;
        dirtyIndicator.classList.add('dirty-indicator-pop');
      }
      if (dirtyIndicator && !dirty) {
        dirtyIndicator.classList.remove('dirty-indicator-pop');
      }
      const saveBtn = document.getElementById('save-app-settings-btn');
      if (saveBtn) {
        saveBtn.disabled = !dirty;
        saveBtn.classList.toggle('opacity-70', !dirty);
        saveBtn.classList.toggle('cursor-not-allowed', !dirty);
      }
    };

    const persistSettings = (message = 'Settings saved!', hideDelay = 1500) => {
      const state = getAppState();
      if (!state.gradebook_data) return;
      const settings = normalizeSettings(getSettingsFromInputs());
      saveSettingsToState(settings);
      lastSavedSettings = settings;
      updateDirtyState();
      showSettingsFeedback(message, hideDelay);
    };

    document.getElementById('save-app-settings-btn')?.addEventListener('click', () => {
      persistSettings('Settings saved!', 1800);
    });

    document.getElementById('reset-app-settings-btn')?.addEventListener('click', () => {
      const autoSaveWasEnabled = document.getElementById('auto-save-settings-toggle')?.checked ?? false;
      document.getElementById('attendance-enabled-toggle').checked = defaultAppSettings.attendanceEnabled;
      document.getElementById('dark-mode-toggle').checked = defaultAppSettings.darkMode;
      document.getElementById('high-contrast-toggle').checked = defaultAppSettings.highContrastMode;
      document.getElementById('reduced-motion-toggle').checked = defaultAppSettings.reducedMotion;
      document.getElementById('density-mode-select').value = defaultAppSettings.densityMode;
      contentWrapper.querySelector(`input[name="font-size-mode"][value="${defaultAppSettings.fontSizeMode}"]`).checked =
        true;
      contentWrapper.querySelector(`input[name="theme-preset"][value="${defaultAppSettings.themePreset}"]`).checked =
        true;
      contentWrapper.querySelector(
        `input[name="grade-color-intensity"][value="${defaultAppSettings.gradeColorIntensity}"]`
      ).checked = true;
      document.getElementById('auto-save-settings-toggle').checked = defaultAppSettings.autoSaveSettings;

      applyVisualSettingsPreview();
      syncSelectionCards();
      updateDirtyState();

      if (autoSaveWasEnabled) {
        persistSettings('Settings reset and saved', 1200);
      } else {
        showSettingsFeedback('Defaults restored (not saved yet)', 1500);
      }
    });

    const applyVisualSettingsPreview = () => {
      const html = document.documentElement;
      const darkMode = document.getElementById('dark-mode-toggle')?.checked ?? false;
      const highContrastMode = document.getElementById('high-contrast-toggle')?.checked ?? false;
      const reducedMotion = document.getElementById('reduced-motion-toggle')?.checked ?? false;
      const density = document.getElementById('density-mode-select')?.value === 'compact' ? 'compact' : 'comfortable';
      const fontSize = ['small', 'default', 'large'].includes(
        document.querySelector('input[name="font-size-mode"]:checked')?.value
      )
        ? document.querySelector('input[name="font-size-mode"]:checked')?.value
        : 'default';
      const theme = ['default', 'ocean', 'forest', 'sunset'].includes(
        document.querySelector('input[name="theme-preset"]:checked')?.value
      )
        ? document.querySelector('input[name="theme-preset"]:checked')?.value
        : 'default';

      html.classList.toggle('dark-mode', darkMode);
      html.classList.toggle('high-contrast-mode', highContrastMode);
      html.classList.toggle('reduced-motion', reducedMotion);
      html.classList.toggle('compact-mode', density === 'compact');
      html.classList.toggle('font-small', fontSize === 'small');
      html.classList.toggle('font-large', fontSize === 'large');
      html.classList.remove('theme-ocean', 'theme-forest', 'theme-sunset');
      if (theme !== 'default') {
        html.classList.add(`theme-${theme}`);
      }
    };

    const maybeAutoSave = () => {
      const current = normalizeSettings(getSettingsFromInputs());
      if (current.autoSaveSettings && !isSettingsEqual(current, lastSavedSettings)) {
        persistSettings('Saved', 900);
      }
    };

    const enhanceRadioGroupKeyboardNavigation = (groupName) => {
      const radios = Array.from(contentWrapper.querySelectorAll(`input[name="${groupName}"]`));
      radios.forEach((radio, index) => {
        radio.addEventListener('keydown', (event) => {
          const forwardKeys = ['ArrowRight', 'ArrowDown'];
          const backwardKeys = ['ArrowLeft', 'ArrowUp'];
          if (!forwardKeys.includes(event.key) && !backwardKeys.includes(event.key)) return;
          event.preventDefault();
          const direction = forwardKeys.includes(event.key) ? 1 : -1;
          const nextIndex = (index + direction + radios.length) % radios.length;
          radios[nextIndex].checked = true;
          radios[nextIndex].focus();
          radios[nextIndex].dispatchEvent(new Event('change'));
        });
      });
    };

    const onSettingChanged = () => {
      applyVisualSettingsPreview();
      syncSelectionCards();
      updateDirtyState();
      maybeAutoSave();
    };

    document.getElementById('attendance-enabled-toggle')?.addEventListener('change', onSettingChanged);
    document.getElementById('auto-save-settings-toggle')?.addEventListener('change', onSettingChanged);
    document.getElementById('dark-mode-toggle')?.addEventListener('change', onSettingChanged);
    document.getElementById('high-contrast-toggle')?.addEventListener('change', onSettingChanged);
    document.getElementById('reduced-motion-toggle')?.addEventListener('change', onSettingChanged);
    document.getElementById('density-mode-select')?.addEventListener('change', onSettingChanged);
    document.querySelectorAll('input[name="font-size-mode"]')?.forEach((radio) => {
      radio.addEventListener('change', onSettingChanged);
    });
    document.querySelectorAll('input[name="theme-preset"]')?.forEach((radio) => {
      radio.addEventListener('change', onSettingChanged);
    });
    document.querySelectorAll('input[name="grade-color-intensity"]')?.forEach((radio) => {
      radio.addEventListener('change', onSettingChanged);
    });

    enhanceRadioGroupKeyboardNavigation('font-size-mode');
    enhanceRadioGroupKeyboardNavigation('theme-preset');
    enhanceRadioGroupKeyboardNavigation('grade-color-intensity');

    syncSelectionCards();
    updateDirtyState();
  }

  // ── Profile picture & logo upload listeners (unchanged) ───────
  const uploadPicBtn = document.getElementById('upload-profile-pic-btn');
  const fileInput = document.getElementById('profile-picture-upload');
  const schoolLogoUploadBtn = document.getElementById('upload-school-logo-btn');
  const schoolLogoRemoveBtn = document.getElementById('remove-school-logo-btn');
  const schoolLogoInput = document.getElementById('school-logo-upload');
  const schoolLogoDataInput = document.getElementById('school-logo-data-url');

  if (schoolLogoDataInput) {
    schoolLogoDataInput.value = schoolLogoDataUrl || '';
  }

  const renderSchoolLogoPreview = (dataUrl) => {
    const wrapper = document.getElementById('school-logo-preview-wrap');
    if (!wrapper) return;
    if (dataUrl) {
      wrapper.innerHTML = `<img id="school-logo-preview" src="${dataUrl}" class="max-w-full max-h-full object-contain">`;
    } else {
      wrapper.innerHTML = `<span id="school-logo-placeholder" class="text-[11px] text-gray-400">No Logo</span>`;
    }
  };

  const resizeImageToDataUrl = (file, maxWidth = 320, maxHeight = 180, quality = 0.9) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
          const targetWidth = Math.max(1, Math.round(img.width * scale));
          const targetHeight = Math.max(1, Math.round(img.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not process logo image.'));
            return;
          }

          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          resolve(canvas.toDataURL('image/png', quality));
        };
        img.onerror = () => reject(new Error('Invalid logo image file.'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Could not read logo image file.'));
      reader.readAsDataURL(file);
    });

  if (uploadPicBtn) {
    uploadPicBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
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
            img.className = 'w-32 h-32 rounded-full mx-auto object-cover mb-4';
            preview.replaceWith(img);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (schoolLogoUploadBtn && schoolLogoInput) {
    schoolLogoUploadBtn.addEventListener('click', () => {
      schoolLogoInput.click();
    });
  }

  if (schoolLogoInput) {
    schoolLogoInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
      const maxBytes = 5 * 1024 * 1024;

      if (!allowedTypes.includes(file.type)) {
        showModal({
          title: 'Invalid Logo Format',
          content: '<p>Please upload a PNG, JPG, or WEBP file.</p>',
          confirmText: null,
          cancelText: 'Close',
          modalWidth: 'max-w-sm',
        });
        schoolLogoInput.value = '';
        return;
      }

      if (file.size > maxBytes) {
        showModal({
          title: 'Logo File Too Large',
          content: '<p>Please upload an image smaller than 5MB.</p>',
          confirmText: null,
          cancelText: 'Close',
          modalWidth: 'max-w-sm',
        });
        schoolLogoInput.value = '';
        return;
      }

      try {
        const resizedDataUrl = await resizeImageToDataUrl(file);
        if (schoolLogoDataInput) schoolLogoDataInput.value = resizedDataUrl;
        renderSchoolLogoPreview(resizedDataUrl);
      } catch (error) {
        console.error('Failed to process school logo:', error);
        showModal({
          title: 'Logo Upload Failed',
          content: `<p>${error.message || 'Could not upload school logo.'}</p>`,
          confirmText: null,
          cancelText: 'Close',
          modalWidth: 'max-w-sm',
        });
      } finally {
        schoolLogoInput.value = '';
      }
    });
  }

  if (schoolLogoRemoveBtn) {
    schoolLogoRemoveBtn.addEventListener('click', () => {
      if (schoolLogoDataInput) schoolLogoDataInput.value = '';
      renderSchoolLogoPreview('');
    });
  }
}

export function renderAttendanceSheet(dateString) {
  // ... (No changes here)
  const classData = getActiveClassData();
  if (!classData) return;

  const selectedDate = dateString || new Date().toISOString().slice(0, 10);
  const students = Object.values(classData.students || {}).sort((a, b) =>
    (a.lastName || '').localeCompare(b.lastName || '')
  );

  if (!classData.attendance) classData.attendance = {};
  if (!classData.attendance[selectedDate]) classData.attendance[selectedDate] = {};
  const attendanceForDate = classData.attendance[selectedDate];

  const studentRows = students
    .map((student) => {
      const studentAttendance = attendanceForDate[student.id] || { status: 'present', notes: '' };
      const status = studentAttendance.status;
      const notes = studentAttendance.notes || '';

      // Calculate Term Summary
      let lateCount = 0;
      let absentCount = 0;
      Object.values(classData.attendance || {}).forEach((dateData) => {
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
    })
    .join('');

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
    return (
      student.contacts
        .map(
          (contact, index) => `
            <div class="contact-item flex items-center gap-2 p-2 bg-gray-100 rounded">
                <div class="flex-grow">
                    <p class="font-semibold">${contact.name} <span class="text-xs text-gray-500">${contact.isParent ? '(Parent/Guardian)' : '(Student)'}</span></p>
                    <p class="text-sm text-gray-600">${contact.info}</p>
                </div>
                <button class="delete-contact-btn delete-btn" data-index="${index}">&times;</button>
            </div>
        `
        )
        .join('') || '<p class="text-sm text-gray-500">No contacts added yet.</p>'
    );
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
    onConfirm: async () => {
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
          showModal({
            title: 'Upload Failed',
            content: `<p>${error.message}</p>`,
            confirmText: null,
            cancelText: 'Close',
          });
          return;
        }
      }

      renderGradebook();
      triggerAutoSave();
    },
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

  modalElement.addEventListener('click', (e) => {
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
        },
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

export function renderAnalyticsModal() {
  const initialClassData = getActiveClassData();
  if (!initialClassData) return;
  let cleanupRefreshHandlers = () => {};
  const appSettings = getAppState()?.gradebook_data?.appSettings || {};
  const attendanceEnabled = appSettings.attendanceEnabled !== false;
  const gradeColorIntensity = ['subtle', 'standard', 'strong'].includes(appSettings.gradeColorIntensity)
    ? appSettings.gradeColorIntensity
    : 'standard';

  const getAnalyticsContext = () => {
    const liveClassData = getActiveClassData() || initialClassData;
    const stats = calculateClassStats(liveClassData);
    const termUnits = Object.values(liveClassData.units || {})
      .filter((u) => !u.isFinal)
      .sort((a, b) => a.order - b.order);
    const allAnalyticsUnits = Object.values(liveClassData.units || {}).sort((a, b) => a.order - b.order);
    return { liveClassData, stats, termUnits, allAnalyticsUnits };
  };

  const initialCtx = getAnalyticsContext();
  if (!initialCtx.stats) {
    showModal({
      title: 'No Data',
      content: '<p>Add students and grades to see analytics.</p>',
      confirmText: null,
      cancelText: 'Close',
      modalWidth: 'max-w-sm',
    });
    return;
  }

  // Helper: compute each assignment's % weight within its unit
  function computeAsgWeights(unit, sourceClassData) {
    const analyticsCatWts = sourceClassData.categoryWeights || { k: 25, t: 25, c: 25, a: 25 };
    const asgs = Object.values(unit.assignments || {}).sort((a, b) => a.order - b.order);
    let totalFactor = 0;
    const factors = asgs.map((asg) => {
      const w = parseFloat(asg.weight) || 1;
      let factor;
      if (unit.isFinal) {
        factor = w;
      } else {
        const uf = ['k', 't', 'c', 'a'].reduce(
          (s, cat) => s + (parseFloat(asg.categoryTotals?.[cat]) > 0 ? (analyticsCatWts[cat] || 25) / 100 : 0),
          0
        );
        factor = uf > 0 ? w * uf : 0;
      }
      totalFactor += factor;
      return { asg, factor };
    });
    return factors.map(({ asg, factor }) => ({
      name: asg.name,
      id: asg.id,
      pct: totalFactor > 0 ? (factor / totalFactor) * 100 : 0,
      isSubmitted: asg.isSubmitted,
    }));
  }

  // Helper: compute per-assignment avg performance (read-only, no stored changes)
  function computeAsgPerformance(unit, studentFilter, sourceClassData) {
    const parseGradeLocal = (val) => {
      if (val === undefined || val === null || val === '') return null;
      if (typeof val === 'string' && val.trim().toUpperCase() === 'M') return 0;
      const n = parseFloat(val);
      return isNaN(n) ? null : n;
    };
    const asgs = Object.values(unit.assignments || {})
      .filter((a) => !a.isSubmitted)
      .sort((a, b) => a.order - b.order);
    const students =
      studentFilter && studentFilter !== '__class__'
        ? [sourceClassData.students[studentFilter]].filter(Boolean)
        : Object.values(sourceClassData.students || {});
    return asgs.map((asg) => {
      let earned = 0;
      let possible = 0;
      students.forEach((student) => {
        const grade = student.grades?.[asg.id];
        if (!grade) return;
        if (unit.isFinal) {
          const s = parseGradeLocal(grade.grade);
          const t = parseFloat(asg.total) || 0;
          if (s !== null && t > 0) {
            earned += s;
            possible += t;
          }
        } else {
          ['k', 't', 'c', 'a'].forEach((cat) => {
            const s = parseGradeLocal(grade[cat]);
            const t = parseFloat(asg.categoryTotals?.[cat]) || 0;
            if (s !== null && t > 0) {
              earned += s;
              possible += t;
            }
          });
        }
      });
      return {
        name: asg.name,
        avg: possible > 0 ? (earned / possible) * 100 : null,
      };
    });
  }

  // Build filter options HTML
  const buildUnitOptionsHtml = (units, selectedId) =>
    units
      .map((u, i) => {
        const label = u.isFinal ? 'Final Assessment' : u.title ? `Unit ${u.order}: ${u.title}` : `Unit ${u.order}`;
        const selected = selectedId ? u.id === selectedId : i === 0;
        return `<option value="${u.id}" ${selected ? 'selected' : ''}>${label}</option>`;
      })
      .join('');

  const buildStudentOptionsHtml = (students, selectedId) =>
    students
      .sort((a, b) => String(a.lastName).localeCompare(String(b.lastName)))
      .map(
        (s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.lastName}, ${s.firstName}</option>`
      )
      .join('');

  const unitOptions = buildUnitOptionsHtml(initialCtx.allAnalyticsUnits);
  const studentList = buildStudentOptionsHtml(Object.values(initialCtx.liveClassData.students || {}));

  const getIntensityBarColor = (avg) => {
    if (avg === null || avg === undefined) return 'rgba(209, 213, 219, 0.5)';
    const palettes = {
      subtle: {
        l4: 'rgba(34, 197, 94, 0.55)',
        l3: 'rgba(59, 130, 246, 0.55)',
        l2: 'rgba(234, 179, 8, 0.55)',
        l1: 'rgba(249, 115, 22, 0.55)',
        r: 'rgba(239, 68, 68, 0.55)',
      },
      standard: {
        l4: 'rgba(34, 197, 94, 0.7)',
        l3: 'rgba(59, 130, 246, 0.7)',
        l2: 'rgba(234, 179, 8, 0.7)',
        l1: 'rgba(249, 115, 22, 0.7)',
        r: 'rgba(239, 68, 68, 0.7)',
      },
      strong: {
        l4: 'rgba(22, 163, 74, 0.85)',
        l3: 'rgba(37, 99, 235, 0.85)',
        l2: 'rgba(202, 138, 4, 0.85)',
        l1: 'rgba(234, 88, 12, 0.85)',
        r: 'rgba(220, 38, 38, 0.85)',
      },
    };

    const palette = palettes[gradeColorIntensity] || palettes.standard;
    if (avg >= 80) return palette.l4;
    if (avg >= 70) return palette.l3;
    if (avg >= 60) return palette.l2;
    if (avg >= 50) return palette.l1;
    return palette.r;
  };

  const computeAttendanceStats = (sourceClassData) => {
    const result = { present: 0, absent: 0, late: 0 };
    const attendance = sourceClassData?.attendance || {};
    Object.values(attendance).forEach((dateData) => {
      Object.values(dateData || {}).forEach((record) => {
        if (record?.status === 'absent') result.absent += 1;
        else if (record?.status === 'late') result.late += 1;
        else if (record?.status === 'present') result.present += 1;
      });
    });
    result.total = result.present + result.absent + result.late;
    return result;
  };

  const content = `
    <div class="space-y-6">
      <div class="grid grid-cols-1 ${attendanceEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6">
        <div class="bg-gray-50 p-4 rounded-lg border">
          <h4 class="text-sm font-bold text-gray-500 uppercase mb-4 text-center">Grade Distribution</h4>
          <div class="relative h-64 w-full"><canvas id="chart-distribution"></canvas></div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg border">
          <h4 class="text-sm font-bold text-gray-500 uppercase mb-4 text-center">Category Performance</h4>
          <div class="relative h-64 w-full"><canvas id="chart-categories"></canvas></div>
        </div>
        ${
          attendanceEnabled
            ? `<div class="bg-gray-50 p-4 rounded-lg border">
          <h4 class="text-sm font-bold text-gray-500 uppercase mb-4 text-center">Attendance Distribution</h4>
          <div id="chart-attendance-wrap" class="relative h-64 w-full"><canvas id="chart-attendance"></canvas></div>
        </div>`
            : ''
        }
      </div>

      <div class="border-t border-gray-200 pt-5">
        <h3 class="text-sm font-bold text-gray-600 uppercase tracking-wider mb-4">Curriculum Weight Breakdown</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-gray-50 p-4 rounded-lg border">
            <h4 class="text-sm font-bold text-gray-500 uppercase mb-3 text-center">Unit Weights (% of Term)</h4>
            <div id="chart-unit-weights-wrap" class="relative h-56 w-full"><canvas id="chart-unit-weights"></canvas></div>
          </div>
          <div class="bg-gray-50 p-4 rounded-lg border">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-bold text-gray-500 uppercase">Assignment Weight in Unit</h4>
              <select id="asg-unit-filter" class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white">${unitOptions}</select>
            </div>
            <div id="chart-asg-weights-wrap" class="relative h-52 w-full"><canvas id="chart-asg-weights"></canvas></div>
            <p id="asg-unit-pct-note" class="text-xs text-gray-400 text-center mt-2"></p>
          </div>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-5">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <h3 class="text-sm font-bold text-gray-600 uppercase tracking-wider">Detailed Percentage Table</h3>
          <select id="analytics-breakdown-type" class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white">
            <option value="assignments" selected>Assignments</option>
            <option value="units">Units</option>
          </select>
          <select id="analytics-breakdown-unit-filter" class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white">
            <option value="all">All Units</option>
          </select>
        </div>
        <div class="bg-gray-50 p-3 rounded-lg border">
          <div id="analytics-breakdown-table-wrap" class="max-h-[38vh] overflow-auto"></div>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-5">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <h3 class="text-sm font-bold text-gray-600 uppercase tracking-wider">Assignment Performance</h3>
          <select id="perf-unit-filter" class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white">${unitOptions}</select>
          <select id="perf-student-filter" class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white min-w-[140px]">
            <option value="__class__">Class Average</option>
            ${studentList}
          </select>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg border">
          <div id="chart-asg-perf-wrap" class="relative h-64 w-full"><canvas id="chart-asg-perf"></canvas></div>
        </div>
      </div>
    </div>
  `;

  showModal({
    title: `Class Analytics: ${initialClassData.name}`,
    content,
    modalWidth: 'max-w-5xl',
    confirmText: null,
    cancelText: 'Close',
    onCancel: () => {
      cleanupRefreshHandlers();
    },
  });

  setTimeout(() => {
    if (!document.getElementById('custom-modal')) {
      return;
    }

    const chartInstances = {};
    const rebuildChart = (key, ctx, config) => {
      if (!ctx) return null;
      if (chartInstances[key]) {
        chartInstances[key].destroy();
      }
      const instance = new Chart(ctx, config);
      chartInstances[key] = instance;
      return instance;
    };

    const syncFilterOptions = () => {
      const { liveClassData, allAnalyticsUnits } = getAnalyticsContext();
      const asgFilter = document.getElementById('asg-unit-filter');
      const perfFilter = document.getElementById('perf-unit-filter');
      const studentFilter = document.getElementById('perf-student-filter');
      const breakdownUnitFilter = document.getElementById('analytics-breakdown-unit-filter');

      const selectedAsgUnitId = asgFilter?.value;
      const selectedPerfUnitId = perfFilter?.value;
      const selectedStudentId = studentFilter?.value;
      const selectedBreakdownUnitId = breakdownUnitFilter?.value;

      if (asgFilter) asgFilter.innerHTML = buildUnitOptionsHtml(allAnalyticsUnits, selectedAsgUnitId);
      if (perfFilter) perfFilter.innerHTML = buildUnitOptionsHtml(allAnalyticsUnits, selectedPerfUnitId);
      if (breakdownUnitFilter) {
        breakdownUnitFilter.innerHTML = `
          <option value="all">All Units</option>
          ${buildUnitOptionsHtml(allAnalyticsUnits, selectedBreakdownUnitId === 'all' ? null : selectedBreakdownUnitId)}
        `;
        if (selectedBreakdownUnitId === 'all') breakdownUnitFilter.value = 'all';
      }

      if (studentFilter) {
        studentFilter.innerHTML = `
          <option value="__class__">Class Average</option>
          ${buildStudentOptionsHtml(Object.values(liveClassData.students || {}), selectedStudentId)}
        `;
        if (!studentFilter.value) studentFilter.value = '__class__';
      }
    };

    const renderTopCharts = () => {
      const { liveClassData, stats, termUnits } = getAnalyticsContext();
      if (!stats) return;

      const ctxDist = document.getElementById('chart-distribution')?.getContext('2d');
      if (ctxDist) {
        rebuildChart('distribution', ctxDist, {
          type: 'bar',
          data: {
            labels: Object.keys(stats.distribution),
            datasets: [
              {
                label: '# of Students',
                data: Object.values(stats.distribution),
                backgroundColor: [
                  'rgba(34, 197, 94, 0.6)',
                  'rgba(234, 179, 8, 0.6)',
                  'rgba(249, 115, 22, 0.6)',
                  'rgba(239, 68, 68, 0.6)',
                  'rgba(153, 27, 27, 0.6)',
                ],
                borderColor: [
                  'rgba(34, 197, 94, 1)',
                  'rgba(234, 179, 8, 1)',
                  'rgba(249, 115, 22, 1)',
                  'rgba(239, 68, 68, 1)',
                  'rgba(153, 27, 27, 1)',
                ],
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } },
          },
        });
      }

      const ctxCat = document.getElementById('chart-categories')?.getContext('2d');
      if (ctxCat) {
        rebuildChart('categories', ctxCat, {
          type: 'radar',
          data: {
            labels: ['Knowledge', 'Thinking', 'Communication', 'Application'],
            datasets: [
              {
                label: 'Class Average %',
                data: [stats.catAverages.k, stats.catAverages.t, stats.catAverages.c, stats.catAverages.a],
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: 'rgba(59, 130, 246, 1)',
                pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { r: { angleLines: { display: true }, suggestedMin: 50, suggestedMax: 100 } },
          },
        });
      }

      if (attendanceEnabled) {
        const attendanceWrap = document.getElementById('chart-attendance-wrap');
        const attendanceStats = computeAttendanceStats(liveClassData);
        if (attendanceWrap) {
          if (!attendanceStats.total) {
            attendanceWrap.innerHTML =
              '<p class="text-xs text-gray-400 text-center pt-10">No attendance records yet.</p>';
          } else {
            attendanceWrap.innerHTML = '<canvas id="chart-attendance"></canvas>';
            const ctxAttendance = document.getElementById('chart-attendance')?.getContext('2d');
            if (ctxAttendance) {
              rebuildChart('attendance', ctxAttendance, {
                type: 'doughnut',
                data: {
                  labels: ['Present', 'Absent', 'Late'],
                  datasets: [
                    {
                      data: [attendanceStats.present, attendanceStats.absent, attendanceStats.late],
                      backgroundColor: [
                        'rgba(34, 197, 94, 0.75)',
                        'rgba(239, 68, 68, 0.75)',
                        'rgba(245, 158, 11, 0.75)',
                      ],
                      borderColor: ['rgba(22, 163, 74, 1)', 'rgba(220, 38, 38, 1)', 'rgba(217, 119, 6, 1)'],
                      borderWidth: 1,
                    },
                  ],
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const count = Number(ctx.raw) || 0;
                          const pct = attendanceStats.total
                            ? ((count / attendanceStats.total) * 100).toFixed(1)
                            : '0.0';
                          return ` ${ctx.label}: ${count} (${pct}%)`;
                        },
                      },
                    },
                  },
                },
              });
            }
          }
        }
      }

      const uwWrap = document.getElementById('chart-unit-weights-wrap');
      if (!uwWrap) return;
      if (termUnits.length === 0) {
        uwWrap.innerHTML = '<p class="text-xs text-gray-400 text-center pt-10">No term units configured.</p>';
        return;
      }

      uwWrap.innerHTML = '<canvas id="chart-unit-weights"></canvas>';
      const unitColors = [
        'rgba(59, 130, 246, 0.75)',
        'rgba(16, 185, 129, 0.75)',
        'rgba(245, 158, 11, 0.75)',
        'rgba(239, 68, 68, 0.75)',
        'rgba(139, 92, 246, 0.75)',
        'rgba(236, 72, 153, 0.75)',
        'rgba(20, 184, 166, 0.75)',
        'rgba(249, 115, 22, 0.75)',
      ];
      const ctxUw = document.getElementById('chart-unit-weights')?.getContext('2d');
      if (!ctxUw) return;
      rebuildChart('unitWeights', ctxUw, {
        type: 'doughnut',
        data: {
          labels: termUnits.map((u) => (u.title ? `Unit ${u.order}: ${u.title}` : `Unit ${u.order}`)),
          datasets: [
            {
              data: termUnits.map((u) => parseFloat(u.weight) || 0),
              backgroundColor: termUnits.map((_, i) => unitColors[i % unitColors.length]),
              borderWidth: 2,
              borderColor: '#fff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${Number(ctx.raw).toFixed(1)}%` } },
          },
        },
      });
    };

    function renderAsgWeightChart(unitId) {
      const { liveClassData, allAnalyticsUnits } = getAnalyticsContext();
      const wrap = document.getElementById('chart-asg-weights-wrap');
      if (!wrap) return;

      const fallbackUnitId = allAnalyticsUnits[0]?.id;
      const resolvedUnitId = liveClassData.units?.[unitId] ? unitId : fallbackUnitId;
      const unit = resolvedUnitId ? liveClassData.units[resolvedUnitId] : null;
      if (!unit) {
        wrap.innerHTML = '<p class="text-xs text-gray-400 text-center pt-10">No units available.</p>';
        return;
      }

      const weights = computeAsgWeights(unit, liveClassData);
      const note = document.getElementById('asg-unit-pct-note');
      if (note) {
        const lbl = unit.isFinal ? 'Final Assessment' : `Unit ${unit.order}${unit.title ? `: ${unit.title}` : ''}`;
        const termNote =
          !unit.isFinal && unit.weight != null
            ? ` · This unit is ${parseFloat(unit.weight).toFixed(1)}% of the term grade.`
            : '';
        note.textContent = `${lbl}${termNote}`;
      }

      wrap.innerHTML = '<canvas id="chart-asg-weights"></canvas>';
      if (weights.length === 0) {
        wrap.innerHTML = '<p class="text-xs text-gray-400 text-center pt-10">No assignments in this unit.</p>';
        return;
      }

      const ctx = document.getElementById('chart-asg-weights')?.getContext('2d');
      if (!ctx) return;
      const barBg = weights.map((w) => (w.isSubmitted ? 'rgba(156, 163, 175, 0.6)' : 'rgba(59, 130, 246, 0.7)'));
      rebuildChart('assignmentWeights', ctx, {
        type: 'bar',
        data: {
          labels: weights.map((w) => w.name),
          datasets: [
            {
              label: '% of Unit Grade',
              data: weights.map((w) => parseFloat(w.pct.toFixed(1))),
              backgroundColor: barBg,
              borderColor: barBg.map((c) => c.replace('0.7', '1').replace('0.6', '1')),
              borderWidth: 1,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const w = weights[ctx.dataIndex];
                  return ` ${Number(ctx.raw).toFixed(1)}% of unit${w?.isSubmitted ? ' (submitted/ungraded)' : ''}`;
                },
              },
            },
          },
        },
      });
    }

    function renderBreakdownTable() {
      const { liveClassData } = getAnalyticsContext();
      const wrap = document.getElementById('analytics-breakdown-table-wrap');
      const typeFilter = document.getElementById('analytics-breakdown-type');
      const unitFilter = document.getElementById('analytics-breakdown-unit-filter');
      if (!wrap || !typeFilter || !unitFilter) return;

      const mode = typeFilter.value;
      const selectedUnitId = unitFilter.value || 'all';
      const breakdown = computeWeightBreakdown(liveClassData);
      const fmt = (v) => (v === null || v === undefined ? '--' : `${v.toFixed(1)}%`);

      if (mode === 'units') {
        const rows =
          selectedUnitId === 'all'
            ? breakdown.unitRows
            : breakdown.unitRows.filter((row) => row.unitId === selectedUnitId);

        if (!rows.length) {
          wrap.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">No unit percentages available.</p>';
          return;
        }

        wrap.innerHTML = `
          <table class="w-full text-xs">
            <thead class="bg-gray-100 text-gray-600 uppercase tracking-wide sticky top-0">
              <tr>
                <th class="p-2 text-left">Unit</th>
                <th class="p-2 text-center">% of Term</th>
                <th class="p-2 text-center">% of Overall</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                    <tr class="border-t border-gray-200">
                      <td class="p-2 font-medium text-gray-700">${row.unitLabel}</td>
                      <td class="p-2 text-center text-gray-600">${fmt(row.pctTerm)}</td>
                      <td class="p-2 text-center text-gray-700 font-semibold">${fmt(row.pctOverall)}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        `;
        return;
      }

      const rows =
        selectedUnitId === 'all'
          ? breakdown.assignmentRows
          : breakdown.assignmentRows.filter((row) => row.unitId === selectedUnitId);

      if (!rows.length) {
        wrap.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">No assignment percentages available.</p>';
        return;
      }

      wrap.innerHTML = `
        <table class="w-full text-xs">
          <thead class="bg-gray-100 text-gray-600 uppercase tracking-wide sticky top-0">
            <tr>
              <th class="p-2 text-left">Assignment</th>
              <th class="p-2 text-left">Unit</th>
              <th class="p-2 text-center">% of Unit</th>
              <th class="p-2 text-center">% of Term</th>
              <th class="p-2 text-center">% of Overall</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr class="border-t border-gray-200">
                    <td class="p-2 font-medium text-gray-700">${row.assignmentName}</td>
                    <td class="p-2 text-gray-600">${row.unitLabel}</td>
                    <td class="p-2 text-center text-gray-600">${fmt(row.pctUnit)}</td>
                    <td class="p-2 text-center text-gray-600">${fmt(row.pctTerm)}</td>
                    <td class="p-2 text-center text-gray-700 font-semibold">${fmt(row.pctOverall)}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    function renderPerfChart(unitId, studentFilter) {
      const { liveClassData, allAnalyticsUnits } = getAnalyticsContext();
      const wrap = document.getElementById('chart-asg-perf-wrap');
      if (!wrap) return;

      const fallbackUnitId = allAnalyticsUnits[0]?.id;
      const resolvedUnitId = liveClassData.units?.[unitId] ? unitId : fallbackUnitId;
      const unit = resolvedUnitId ? liveClassData.units[resolvedUnitId] : null;
      if (!unit) {
        wrap.innerHTML = '<p class="text-xs text-gray-400 text-center pt-10">No units available.</p>';
        return;
      }

      const perfData = computeAsgPerformance(unit, studentFilter, liveClassData);
      wrap.innerHTML = '<canvas id="chart-asg-perf"></canvas>';
      if (perfData.length === 0) {
        wrap.innerHTML = '<p class="text-xs text-gray-400 text-center pt-10">No graded assignments in this unit.</p>';
        return;
      }

      const ctx = document.getElementById('chart-asg-perf')?.getContext('2d');
      if (!ctx) return;
      const perfLabel =
        studentFilter && studentFilter !== '__class__'
          ? (() => {
              const s = liveClassData.students[studentFilter];
              return s ? `${s.firstName} ${s.lastName}` : 'Student';
            })()
          : 'Class Avg %';

      rebuildChart('assignmentPerformance', ctx, {
        type: 'bar',
        data: {
          labels: perfData.map((d) => d.name),
          datasets: [
            {
              label: perfLabel,
              data: perfData.map((d) => (d.avg != null ? parseFloat(d.avg.toFixed(1)) : null)),
              backgroundColor: perfData.map((d) => getIntensityBarColor(d.avg)),
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },
          plugins: {
            legend: { display: true },
            tooltip: {
              callbacks: { label: (ctx) => (ctx.raw != null ? ` ${Number(ctx.raw).toFixed(1)}%` : ' No data') },
            },
          },
        },
      });
    }

    syncFilterOptions();
    renderTopCharts();

    const asgUnitFilter = document.getElementById('asg-unit-filter');
    const perfUnitFilter = document.getElementById('perf-unit-filter');
    const perfStudentFilter = document.getElementById('perf-student-filter');
    const breakdownTypeFilter = document.getElementById('analytics-breakdown-type');
    const breakdownUnitFilter = document.getElementById('analytics-breakdown-unit-filter');

    renderAsgWeightChart(asgUnitFilter?.value);
    renderBreakdownTable();
    renderPerfChart(perfUnitFilter?.value, perfStudentFilter?.value || '__class__');

    asgUnitFilter?.addEventListener('change', (e) => renderAsgWeightChart(e.target.value));
    const updatePerfChart = () => renderPerfChart(perfUnitFilter?.value, perfStudentFilter?.value || '__class__');
    perfUnitFilter?.addEventListener('change', updatePerfChart);
    perfStudentFilter?.addEventListener('change', updatePerfChart);
    breakdownTypeFilter?.addEventListener('change', renderBreakdownTable);
    breakdownUnitFilter?.addEventListener('change', renderBreakdownTable);

    const refreshAllAnalyticsCharts = () => {
      syncFilterOptions();
      renderTopCharts();
      renderAsgWeightChart(document.getElementById('asg-unit-filter')?.value);
      renderBreakdownTable();
      renderPerfChart(
        document.getElementById('perf-unit-filter')?.value,
        document.getElementById('perf-student-filter')?.value || '__class__'
      );
    };

    cleanupRefreshHandlers = () => {
      Object.values(chartInstances).forEach((chart) => chart?.destroy?.());
      document.removeEventListener('marksheet:data-changed', handleDataChanged);
    };

    const handleDataChanged = () => {
      if (!document.getElementById('custom-modal')) {
        cleanupRefreshHandlers();
        return;
      }
      refreshAllAnalyticsCharts();
    };

    document.addEventListener('marksheet:data-changed', handleDataChanged);
  }, 100);
}
