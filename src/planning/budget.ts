// Shared by intake, intent, edits and remaining-budget calculations.
const CAP = /(?:hard cap(?: of)?|no more than|maximum|max budget|(?:do|must) not (?:go over|exceed)|don['’]?t (?:go over|exceed))\s*\$?\s*(\d+(?:\.\d{1,2})?)/i;
export function budgetCapInText(text: string): number | null {
  const match = CAP.exec(text);
  return match ? Math.round(Number(match[1]) * 100) : null;
}
export function withoutBudgetCap(text: string): string {
  return text.replace(new RegExp(CAP.source, 'gi'), '');
}
