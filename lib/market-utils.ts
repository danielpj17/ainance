/**
 * Market Hours Utilities
 * Helpers for checking market status and handling market hours logic
 */

/**
 * Check if the US stock market is currently open
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const day = et.getDay(); // 0=Sunday, 6=Saturday
  const hours = et.getHours();
  const minutes = et.getMinutes();
  
  // Market closed on weekends
  if (day === 0 || day === 6) return false;
  
  // Market open 9:30 AM - 4:00 PM ET
  const currentMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

/**
 * Get market status with descriptive message
 */
export function getMarketStatus(): { open: boolean; message: string; timestamp: string } {
  const open = isMarketOpen();
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  
  return {
    open,
    message: open 
      ? "Market is open - live data" 
      : "Market is closed - using last available data",
    timestamp: et.toLocaleString("en-US", {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    })
  };
}

/**
 * Get the last market close time (4:00 PM ET on the most recent trading day)
 */
export function getLastMarketClose(): Date {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const day = et.getDay();
  const hours = et.getHours();
  const minutes = et.getMinutes();
  
  // Set to 4:00 PM ET
  et.setHours(16, 0, 0, 0);
  
  // If it's before market close today, go back to previous trading day
  const currentMinutes = hours * 60 + minutes;
  if (currentMinutes < 16 * 60) {
    et.setDate(et.getDate() - 1);
  }
  
  // If it's a weekend, go back to Friday
  const lastCloseDay = et.getDay();
  if (lastCloseDay === 0) { // Sunday
    et.setDate(et.getDate() - 2);
  } else if (lastCloseDay === 6) { // Saturday
    et.setDate(et.getDate() - 1);
  }
  
  return et;
}

/**
 * Format timestamp for display
 */
export function formatDataTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

