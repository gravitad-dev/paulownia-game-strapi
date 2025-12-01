/**
 * Daily Reset Helper Functions
 * Utilities for calculating daily reset times at 5:00 AM Madrid time
 */

/**
 * Gets the next 5:00 AM in Madrid timezone
 * @param fromDate - Reference date (defaults to now)
 * @returns Date object representing next 5:00 AM Madrid time
 */
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { addDays } from "date-fns";

const MADRID_TZ = "Europe/Madrid";

export function getNext5AMMadrid(fromDate: Date = new Date()): Date {
  const zonedNow = utcToZonedTime(fromDate, MADRID_TZ);
  const base = zonedNow.getHours() >= 5 ? addDays(zonedNow, 1) : zonedNow;
  const candidate = new Date(base);
  candidate.setHours(5, 0, 0, 0);
  return zonedTimeToUtc(candidate, MADRID_TZ);
}

/**
 * Checks if two dates are the same calendar day in Madrid timezone
 * @param date1 - First date
 * @param date2 - Second date
 * @returns true if both dates are the same day in Madrid timezone
 */
export function isSameDayMadrid(date1: Date, date2: Date): boolean {
  const d1Str = date1.toLocaleString("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const d2Str = date2.toLocaleString("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return d1Str === d2Str;
}

/**
 * Checks if a claim was made after the last 5 AM cutoff in Madrid timezone
 * Used to determine if user can claim today's reward
 * @param claimDate - Date when the last claim was made
 * @returns true if claim was made after the last 5 AM cutoff (i.e., "today")
 */
export function wasClaimedAfterLast5AM(claimDate: Date): boolean {
  const now = new Date();
  const zonedNow = utcToZonedTime(now, MADRID_TZ);
  const base = zonedNow.getHours() < 5 ? addDays(zonedNow, -1) : zonedNow;
  const cutoffZoned = new Date(base);
  cutoffZoned.setHours(5, 0, 0, 0);
  const cutoffUtc = zonedTimeToUtc(cutoffZoned, MADRID_TZ);
  return claimDate.getTime() >= cutoffUtc.getTime();
}
