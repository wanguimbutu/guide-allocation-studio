import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfWeek
} from "date-fns";

export function getWeekStart(input = new Date()) {
  return startOfWeek(input, { weekStartsOn: 1 });
}

export function getWeekEnd(input: Date) {
  return endOfWeek(input, { weekStartsOn: 1 });
}

export function formatIsoDate(input: Date) {
  return format(input, "yyyy-MM-dd");
}

export function weekRangeLabel(weekStartIso: string) {
  const start = parseISO(weekStartIso);
  const end = getWeekEnd(start);
  return `${format(start, "dd MMM")} - ${format(end, "dd MMM yyyy")}`;
}

export function buildWeekDays(weekStartIso: string) {
  const start = parseISO(weekStartIso);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      index,
      iso: formatIsoDate(date),
      label: format(date, "EEE d"),
      isToday: isSameDay(date, new Date())
    };
  });
}
