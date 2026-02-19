let appState = {};
let currentUser = null;

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

export function getActiveSemesterData() {
  const activeSemester = appState.gradebook_data?.activeSemester || '1';
  return appState.gradebook_data?.semesters?.[activeSemester] || { classes: {} };
}

export function getActiveClassData() {
  const semesterData = getActiveSemesterData();
  const activeClassId = appState.gradebook_data?.activeClassId;
  return activeClassId ? semesterData.classes?.[activeClassId] : null;
}
