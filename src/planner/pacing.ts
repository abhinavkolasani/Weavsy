/** A comfortable number of visits; travel, hours and budget can reduce it. */
export function suggestedStopCount(minutes: number) {
  if (minutes < 110) return 1;
  return Math.min(6, Math.max(2, Math.floor(minutes / 120) + 1));
}
