const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ISTANBUL = "Europe/Istanbul";

export const FREQ_EVERY_2H = "Her 2 saatte bir";
export const FREQ_DAILY = "Günde 1 kez";
export const FREQ_TWICE = "Günde 2 kez";
export const FREQ_CUTOFF = "Cut-off'a göre dinamik";

export function istanbulClock(date: Date): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISTANBUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute"))
  };
}

function unsent(slot: string | null, sent: ReadonlySet<string>): string | null {
  if (!slot || sent.has(slot)) return null;
  return slot;
}

export function everyTwoHoursSlot(receivedAt: Date, now: Date): string | null {
  const elapsed = now.getTime() - receivedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < TWO_HOURS_MS) return null;
  return `2h:${Math.floor(elapsed / TWO_HOURS_MS)}`;
}

function clockSlot(now: Date, hours: number[]): string | null {
  const clock = istanbulClock(now);
  const due = hours.filter((hour) => clock.minutes >= hour * 60).sort((a, b) => b - a);
  if (due.length === 0) return null;
  return `${clock.dateKey}:${String(due[0]).padStart(2, "0")}`;
}

export function dailyReminderSlot(now: Date): string | null {
  const slot = clockSlot(now, [9]);
  return slot ? `1d:${slot}` : null;
}

export function twiceReminderSlot(now: Date): string | null {
  const slot = clockSlot(now, [9, 15]);
  return slot ? `2d:${slot}` : null;
}

function validDate(value: Date | null): Date | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value;
}

export function dueReminderSlot(input: {
  frequency: string;
  receivedAt: Date;
  cutoffAt: Date | null;
  now: Date;
  sent: ReadonlySet<string>;
}): string | null {
  const frequency = input.frequency.trim();
  if (frequency === FREQ_EVERY_2H) return unsent(everyTwoHoursSlot(input.receivedAt, input.now), input.sent);
  if (frequency === FREQ_DAILY) return unsent(dailyReminderSlot(input.now), input.sent);
  if (frequency === FREQ_TWICE) return unsent(twiceReminderSlot(input.now), input.sent);
  if (frequency !== FREQ_CUTOFF) return null;

  const cutoff = validDate(input.cutoffAt);
  if (!cutoff) return unsent(dailyReminderSlot(input.now), input.sent);
  if (input.now.getTime() > cutoff.getTime()) return null;

  const remaining = cutoff.getTime() - input.now.getTime();
  const slot = remaining <= FOUR_HOURS_MS
    ? everyTwoHoursSlot(input.receivedAt, input.now)
    : remaining <= DAY_MS
      ? twiceReminderSlot(input.now)
      : dailyReminderSlot(input.now);
  return unsent(slot ? `cut:${slot}` : null, input.sent);
}
