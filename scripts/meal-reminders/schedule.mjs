const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const japanOffsetMs = 9 * hourMs;
const mealSlots = [[8, "breakfast"], [12, "lunch"], [19, "dinner"]];

export function nextMealReminder(after) {
  // Japan has no seasonal time shift. Convert the JST calendar day to UTC for the alarm.
  const midnight = Math.floor((after + japanOffsetMs) / dayMs) * dayMs - japanOffsetMs;
  const [hour, mealType] = mealSlots.find(([hour]) => midnight + hour * hourMs > after) ?? mealSlots[0];
  const sameDayAt = midnight + hour * hourMs;
  const at = sameDayAt > after ? sameDayAt : sameDayAt + dayMs;
  const date = new Date(at + japanOffsetMs).toISOString().slice(0, 10);
  return { at, date, mealType };
}
