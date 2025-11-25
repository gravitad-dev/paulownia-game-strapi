/**
 * Daily Reset Helper Functions
 * Utilities for calculating daily reset times at 5:00 AM Madrid time
 */

/**
 * Gets the next 5:00 AM in Madrid timezone
 * @param fromDate - Reference date (defaults to now)
 * @returns Date object representing next 5:00 AM Madrid time
 */
export function getNext5AMMadrid(fromDate: Date = new Date()): Date {
  // Convert to Madrid timezone
  const madridTimeStr = fromDate.toLocaleString('en-US', { 
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const madridTime = new Date(madridTimeStr);
  
  // Set to 5:00 AM
  madridTime.setHours(5, 0, 0, 0);
  
  // If we're past 5 AM today in Madrid, move to tomorrow
  const nowMadrid = new Date(fromDate.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  if (nowMadrid.getHours() >= 5) {
    madridTime.setDate(madridTime.getDate() + 1);
  }
  
  return madridTime;
}

/**
 * Checks if two dates are the same calendar day in Madrid timezone
 * @param date1 - First date
 * @param date2 - Second date
 * @returns true if both dates are the same day in Madrid timezone
 */
export function isSameDayMadrid(date1: Date, date2: Date): boolean {
  const d1Str = date1.toLocaleString('en-US', { 
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const d2Str = date2.toLocaleString('en-US', { 
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
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
  const nowMadridStr = now.toLocaleString('en-US', { 
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const nowMadrid = new Date(nowMadridStr);
  const currentHour = nowMadrid.getHours();
  
  // Calculate last 5 AM cutoff
  const last5AM = new Date(nowMadrid);
  last5AM.setHours(5, 0, 0, 0);
  
  // If current time is before 5 AM, last cutoff was yesterday at 5 AM
  if (currentHour < 5) {
    last5AM.setDate(last5AM.getDate() - 1);
  }
  
  // Check if claim was after the last 5 AM cutoff
  return claimDate >= last5AM;
}
