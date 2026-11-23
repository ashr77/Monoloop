// ============================================================================
// MONOLOOP - Estimated delivered-cost model (Member 3)
//
//   C_total = C_material + C_transport + C_handling
//
// Transport + handling is modelled as a one-off charge per supplier used
// (the t_i * y_i term of the proposal's objective). Every figure here is an
// ESTIMATE for ranking, not a logistics quotation.
// ============================================================================

/** Fixed loading/handling charge per supplier pickup (BDT). */
export const HANDLING_BDT_PER_SUPPLIER = 1500;
/** Indicative small-truck rate (BDT per road km). */
export const TRANSPORT_BDT_PER_KM = 60;
/** Distance assumed for an intra-city pickup (km). */
export const SAME_CITY_KM = 10;
/** Regional default when a city pair is unknown (km). */
export const UNKNOWN_DISTANCE_KM = 150;

/** Approximate road distances (km) between the demo cities. Symmetric. */
const ROAD_KM: Record<string, Record<string, number>> = {
  Dhaka: { Gazipur: 35, Narayanganj: 20, Chattogram: 250, Khulna: 220, Bogura: 200, Cumilla: 100 },
  Gazipur: { Narayanganj: 50, Chattogram: 280, Khulna: 250, Bogura: 170, Cumilla: 130 },
  Narayanganj: { Chattogram: 235, Khulna: 240, Bogura: 220, Cumilla: 85 },
  Chattogram: { Khulna: 420, Bogura: 420, Cumilla: 150 },
  Khulna: { Bogura: 260, Cumilla: 310 },
  Bogura: { Cumilla: 290 },
};

const norm = (city: string | null | undefined) => (city ?? '').trim().toLowerCase();

export interface DistanceEstimate {
  km: number;
  known: boolean;
}

export function estimateDistanceKm(from: string | null | undefined, to: string | null | undefined): DistanceEstimate {
  const a = norm(from);
  const b = norm(to);
  if (!a || !b) return { km: UNKNOWN_DISTANCE_KM, known: false };
  if (a === b) return { km: SAME_CITY_KM, known: true };
  for (const [x, row] of Object.entries(ROAD_KM)) {
    for (const [y, km] of Object.entries(row)) {
      const nx = x.toLowerCase();
      const ny = y.toLowerCase();
      if ((nx === a && ny === b) || (nx === b && ny === a)) return { km, known: true };
    }
  }
  return { km: UNKNOWN_DISTANCE_KM, known: false };
}

/** One-off transport + handling estimate for collecting from one supplier. */
export function estimateTransportBdt(distanceKm: number): number {
  return HANDLING_BDT_PER_SUPPLIER + Math.round(distanceKm * TRANSPORT_BDT_PER_KM);
}
