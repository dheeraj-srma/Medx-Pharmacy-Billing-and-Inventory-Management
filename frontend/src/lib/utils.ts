import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date into strictly DD/MM/YYYY (with optional 12-hour time in IST).
 */
export function formatDateDDMMYYYY(
  dateInput: string | number | Date | null | undefined, 
  includeTime = false
): string {
  if (!dateInput) return "-";
  
  let d: Date;
  if (typeof dateInput === "string") {
    let s = dateInput.trim();
    // If it's an ISO datetime string without timezone offset or Z, treat it as UTC
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) && !s.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
      s += "Z";
    }
    d = new Date(s);
  } else {
    d = new Date(dateInput);
  }

  if (isNaN(d.getTime())) return String(dateInput);
  
  // Format strictly in Indian Standard Time (IST, UTC+5:30)
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    } : {}),
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
  
  const day = getPart("day");
  const month = getPart("month");
  const year = getPart("year");

  if (includeTime) {
    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");
    const dayPeriod = getPart("dayPeriod").toUpperCase();
    return `${day}/${month}/${year}, ${hour}:${minute}:${second} ${dayPeriod}`;
  }

  return `${day}/${month}/${year}`;
}

export interface LooseEligibility {
  canSellLoose: boolean;
  unitsPerPack: number;
  unitLabel: string;
}

/**
 * Determines whether a medicine is eligible for selling loose tablets/capsules.
 * Excludes liquids, syrups, sachets, packets, ointments, drops, inhalers, etc.
 */
export function checkLooseEligibility(
  packSizeStr?: string | null, 
  productName?: string
): LooseEligibility {
  if (!packSizeStr && !productName) {
    return { canSellLoose: false, unitsPerPack: 1, unitLabel: "units" };
  }

  const combined = `${packSizeStr || ""} ${productName || ""}`.toLowerCase();

  // Exclude whole-pack items: syrups, sachets, bottles, ointments, tubes, drops, packets, etc.
  const nonLoosePattern = /\b(syrup|suspension|liquid|elixir|solution|bottle|sachet|packet|pack of|box of|cream|ointment|gel|lotion|drop|drops|spray|inhaler|injection|inj|vial|ampoule|tube|tin|jar|roll|bandage|powder|diaper|diapers|pad|pads|soap|shampoo|toothpaste)\b/i;
  if (nonLoosePattern.test(combined)) {
    return { canSellLoose: false, unitsPerPack: 1, unitLabel: "units" };
  }

  // Must explicitly specify tablets / capsules with count > 1
  const tabletPattern = /\b(\d+)\s*(tablet|tablets|tab|tabs|capsule|capsules|cap|caps|strip|strips)\b/i;
  const match = (packSizeStr || "").match(tabletPattern);
  if (match) {
    const count = parseInt(match[1], 10);
    if (count > 1) {
      const isCap = /\b(capsule|capsules|cap|caps)\b/i.test(match[2]);
      return { 
        canSellLoose: true, 
        unitsPerPack: count, 
        unitLabel: isCap ? "caps" : "tabs" 
      };
    }
  }

  // Alternative pattern: e.g. "10's", "15s" when medicine name indicates tabs/caps
  const alternatePattern = /\b(\d+)\s*(['’]s|s)\b/i;
  const altMatch = (packSizeStr || "").match(alternatePattern);
  if (altMatch) {
    const count = parseInt(altMatch[1], 10);
    if (count > 1 && /\b(tablet|capsule|tab|cap)\b/i.test(combined)) {
      const isCap = /\b(capsule|cap)\b/i.test(combined);
      return { 
        canSellLoose: true, 
        unitsPerPack: count, 
        unitLabel: isCap ? "caps" : "tabs" 
      };
    }
  }

  return { canSellLoose: false, unitsPerPack: 1, unitLabel: "units" };
}
