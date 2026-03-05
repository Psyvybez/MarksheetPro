let appState = {};
let currentUser = null;
const MAX_HISTORY_ENTRIES = 20;
let undoStack = [];
let redoStack = [];

function cloneData(data) {
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}

function serializeData(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

export function setAppState(newState) {
  appState = newState;
}

export function setCurrentUser(newUser) {
  currentUser = newUser;
}

export function getAppState() {
  return appState;
}

export function getCurrentUser() {
  return currentUser;
}

export function clearHistory() {
  undoStack = [];
  redoStack = [];
}

export function captureHistoryPoint() {
  const gradebookData = appState?.gradebook_data;
  if (!gradebookData) return false;

  const snapshot = cloneData(gradebookData);
  const serialized = serializeData(snapshot);
  const previousSerialized = undoStack.length ? undoStack[undoStack.length - 1].serialized : null;

  if (serialized && previousSerialized && serialized === previousSerialized) return false;

  undoStack.push({ snapshot, serialized });
  if (undoStack.length > MAX_HISTORY_ENTRIES) undoStack.shift();
  redoStack = [];
  return true;
}

export function undoHistory() {
  if (!undoStack.length || !appState?.gradebook_data) return false;

  const currentSnapshot = cloneData(appState.gradebook_data);
  redoStack.push({ snapshot: currentSnapshot, serialized: serializeData(currentSnapshot) });

  const previous = undoStack.pop();
  appState.gradebook_data = previous.snapshot;
  return true;
}

export function redoHistory() {
  if (!redoStack.length || !appState?.gradebook_data) return false;

  const currentSnapshot = cloneData(appState.gradebook_data);
  undoStack.push({ snapshot: currentSnapshot, serialized: serializeData(currentSnapshot) });
  if (undoStack.length > MAX_HISTORY_ENTRIES) undoStack.shift();

  const next = redoStack.pop();
  appState.gradebook_data = next.snapshot;
  return true;
}

export function canUndoHistory() {
  return undoStack.length > 0;
}

export function canRedoHistory() {
  return redoStack.length > 0;
}

export function getActiveSemesterData() {
  const activeSemester = appState.gradebook_data?.activeSemester || '1';
  return appState.gradebook_data?.semesters?.[activeSemester] || { classes: {} };
}

export function getActiveClassData() {
  const semesterData = getActiveSemesterData();
  const activeClassId = appState.gradebook_data?.activeClassId;
  return activeClassId ? semesterData.classes?.[activeClassId] : null;
}
