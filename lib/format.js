// Small display helpers shared by pages. No database access here.

export const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'];

const STATUS_LABEL = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const statusLabel = (s) => STATUS_LABEL[s] ?? s;
export const isFinished = (s) => s === 'RESOLVED' || s === 'CLOSED';

export function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "due in 5 h", "overdue by 2 d" - or '-' once the complaint is finished. */
export function dueText(dueAt, status) {
  if (!dueAt || isFinished(status)) return '-';
  const hours = Math.round((new Date(dueAt) - Date.now()) / 36e5);
  const size = Math.abs(hours) >= 48 ? `${Math.round(Math.abs(hours) / 24)} d` : `${Math.abs(hours)} h`;
  return hours < 0 ? `overdue by ${size}` : `due in ${size}`;
}

export const isOverdue = (dueAt, status) =>
  Boolean(dueAt) && !isFinished(status) && new Date(dueAt) < new Date();
