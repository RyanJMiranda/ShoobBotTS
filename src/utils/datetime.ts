/**
 * Formats a Date object into a string like "[M/D/YYYY h:i:s A]".
 * Example: [9/15/2025 08:21:30 PM]
 * @param date The Date object to format. Defaults to current date if not provided.
 * @returns The formatted date string.
 */
export function formatLogTimestamp(date: Date = new Date()): string {
  const d = date;

  const month = d.getMonth() + 1; // getMonth() is 0-indexed
  const day = d.getDate();
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours === 0 ? 12 : hours; // The hour '0' should be '12'

  return `[${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}]`;
}