import dayjs from 'dayjs';

/** YYYY-MM-DD for API calls */
export function formatDateForApi(date: Date): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/** "Today", "Tomorrow", or "24 May" */
export function formatDateDisplay(date: Date): string {
  const d = dayjs(date);
  if (d.isSame(dayjs(), 'day')) return 'Today';
  if (d.isSame(dayjs().add(1, 'day'), 'day')) return 'Tomorrow';
  return d.format('D MMM');
}

/** "Mon", "Tue", … */
export function formatDayOfWeek(date: Date): string {
  return dayjs(date).format('ddd');
}

/** Day number as string: "1", "24" */
export function formatDayNum(date: Date): string {
  return dayjs(date).format('D');
}

/** "24 May · 8:30 AM" */
export function formatDateTime(iso: string): string {
  return dayjs(iso).format('D MMM · h:mm A');
}

/** "8:30 AM" */
export function formatTime(iso: string): string {
  return dayjs(iso).format('h:mm A');
}

/** Next 31 days starting from today */
export function getNext31Days(): Date[] {
  return Array.from({ length: 31 }, (_, i) => dayjs().add(i, 'day').toDate());
}
