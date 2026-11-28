import { getContentWeekStart } from "../contentDates";

test.each([
  ["2026-01-04", "2025-12-29"],
  ["2026-01-05T00:30:00+09:00", "2026-01-05"],
  ["2026-02-30", "undated"],
  ["not-a-date", "undated"],
  [null, "undated"],
])("groups %s by its recorded calendar week", (input, expected) => {
  expect(getContentWeekStart(input)).toBe(expected);
});
