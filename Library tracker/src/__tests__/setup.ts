import { beforeEach } from 'vitest';

// Reset localStorage before every individual test so state never leaks between tests.
beforeEach(() => {
  localStorage.clear();
});
