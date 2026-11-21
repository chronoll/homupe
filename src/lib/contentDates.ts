export function getContentWeekStart(date: string | null): string {
  // Preserve the calendar date recorded in Notion, including for timed entries.
  const calendarDate = date?.split("T")[0];
  if (!calendarDate || !/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
    return "undated";
  }

  const day = new Date(`${calendarDate}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== calendarDate) {
    return "undated";
  }

  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
