import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date into strictly DD/MM/YYYY (with optional 12-hour time).
 */
export function formatDateDDMMYYYY(
  dateInput: string | number | Date | null | undefined, 
  includeTime = false
): string {
  if (!dateInput) return "-";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  if (includeTime) {
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, "0");
    return `${day}/${month}/${year}, ${strHours}:${minutes}:${seconds} ${ampm}`;
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
