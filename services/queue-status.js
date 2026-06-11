export const ACTIVE_JOB_STATUSES = Object.freeze(['queued', 'running']);
export const FAILED_JOB_STATUSES = Object.freeze(['failed', 'timeout']);
export const TERMINAL_JOB_STATUSES = Object.freeze(['succeeded', 'failed', 'cancelled', 'timeout']);

const activeJobStatusSet = new Set(ACTIVE_JOB_STATUSES);
const terminalJobStatusSet = new Set(TERMINAL_JOB_STATUSES);

export function isActiveJobStatus(status) {
  return activeJobStatusSet.has(status);
}

export function isTerminalJobStatus(status) {
  return terminalJobStatusSet.has(status);
}
