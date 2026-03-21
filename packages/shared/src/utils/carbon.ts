/**
 * Carbon savings calculation utilities (Phase 6)
 * Used for "Your Subway Year" annual summary
 */

/**
 * EPA emissions data:
 * - Average car: ~404g CO2 per mile
 * - NYC Subway: ~30g CO2 per passenger-mile
 * - Savings: 374g CO2 per passenger-mile
 */
const CAR_EMISSIONS_GRAMS_PER_MILE = 404;
const SUBWAY_EMISSIONS_GRAMS_PER_MILE = 30;
const SAVINGS_GRAMS_PER_MILE = CAR_EMISSIONS_GRAMS_PER_MILE - SUBWAY_EMISSIONS_GRAMS_PER_MILE; // 374g

/**
 * Convert kilometers to miles
 */
export function kmToMiles(km: number): number {
  return km * 0.621371;
}

/**
 * Convert miles to kilometers
 */
export function milesToKm(miles: number): number {
  return miles * 1.60934;
}

/**
 * Calculate CO2 savings from taking subway instead of driving
 *
 * @param distanceKm - Distance traveled in kilometers
 * @returns CO2 saved in grams
 */
export function calculateCO2SavingsGrams(distanceKm: number): number {
  const miles = kmToMiles(distanceKm);
  return miles * SAVINGS_GRAMS_PER_MILE;
}

/**
 * Calculate CO2 savings in kilograms
 */
export function calculateCO2SavingsKg(distanceKm: number): number {
  return calculateCO2SavingsGrams(distanceKm) / 1000;
}

/**
 * Calculate CO2 savings in metric tons
 */
export function calculateCO2SavingsTons(distanceKm: number): number {
  return calculateCO2SavingsGrams(distanceKm) / 1000000;
}

/**
 * Interface for carbon savings summary
 */
export interface CarbonSavingsSummary {
  /** Total distance traveled in km */
  totalDistanceKm: number;
  /** Total distance in miles */
  totalDistanceMiles: number;
  /** CO2 saved in grams */
  savingsGrams: number;
  /** CO2 saved in kg */
  savingsKg: number;
  /** CO2 saved in metric tons */
  savingsTons: number;
  /** Equivalent in car-free days (assuming avg 40 miles/day driving) */
  carFreeDays: number;
  /** Equivalent trees needed to absorb same CO2 (1 tree ~21kg CO2/year) */
  equivalentTrees: number;
}

/**
 * Calculate comprehensive carbon savings summary
 *
 * @param totalDistanceKm - Total distance traveled by subway in km
 * @returns Complete carbon savings summary
 */
export function calculateCarbonSavingsSummary(
  totalDistanceKm: number
): CarbonSavingsSummary {
  const totalDistanceMiles = kmToMiles(totalDistanceKm);
  const savingsGrams = calculateCO2SavingsGrams(totalDistanceKm);
  const savingsKg = savingsGrams / 1000;
  const savingsTons = savingsGrams / 1000000;

  // Average American drives ~40 miles/day
  const carFreeDays = Math.round(totalDistanceMiles / 40);

  // One tree absorbs ~21kg CO2 per year
  const equivalentTrees = Math.round(savingsKg / 21);

  return {
    totalDistanceKm,
    totalDistanceMiles,
    savingsGrams,
    savingsKg,
    savingsTons,
    carFreeDays,
    equivalentTrees,
  };
}

/**
 * Format carbon savings for display
 */
export function formatCarbonSavings(savingsKg: number): string {
  if (savingsKg < 1) {
    return `${Math.round(savingsKg * 1000)}g CO₂ saved`;
  }
  if (savingsKg < 1000) {
    return `${savingsKg.toFixed(1)}kg CO₂ saved`;
  }
  return `${(savingsKg / 1000).toFixed(2)} tons CO₂ saved`;
}

/**
 * Format distance for display
 */
export function formatDistance(distanceKm: number): string {
  const miles = kmToMiles(distanceKm);
  if (miles < 1) {
    return `${Math.round(miles * 5280)} ft`;
  }
  if (miles < 10) {
    return `${miles.toFixed(1)} mi`;
  }
  return `${Math.round(miles)} mi`;
}

/**
 * Calculate environmental impact equivalents for display
 */
export function getEnvironmentalEquivalents(savingsKg: number): {
  trees: string;
  carMiles: string;
  flights: string;
} {
  // Trees: 1 tree absorbs ~21kg CO2/year
  const trees = Math.round(savingsKg / 21);

  // Car miles: 404g per mile
  const carMiles = Math.round(savingsKg * 1000 / CAR_EMISSIONS_GRAMS_PER_MILE);

  // Flights: NYC to LA ~700kg CO2 per passenger
  const flights = (savingsKg / 700).toFixed(1);

  return {
    trees: `${trees} tree${trees === 1 ? "" : "s"}`,
    carMiles: `${carMiles} miles not driven`,
    flights: `${flights} NYC↔LA flight${parseFloat(flights) === 1 ? "" : "s"}`,
  };
}
