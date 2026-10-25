const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2021-03" -> "Mar 2021", "2021" -> "2021"; anything else is shown as typed. */
export function formatDate(d: string) {
  const m = d.match(/^(\d{4})-(\d{2})/);
  if (m) return `${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
  return d;
}

export function formatRange(start: string, end: string, current: boolean) {
  const s = formatDate(start);
  const e = current ? "Present" : formatDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Whether an achievement already contains a number (digits or a number word). */
export function hasNumber(t: string) {
  return /\d|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|dozens|hundreds?|thousands?|millions?)\b/i.test(t);
}
