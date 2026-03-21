/**
 * Elevator and escalator equipment status types (Phase 6)
 * Data from MTA Equipment API
 */

/** Equipment type */
export type EquipmentType = "elevator" | "escalator";

/**
 * Status of a single piece of equipment (elevator or escalator)
 */
export interface EquipmentStatus {
  /** Parent station ID */
  stationId: string;
  /** Equipment type */
  type: EquipmentType;
  /** Human-readable description, e.g., "Elevator to mezzanine" */
  description: string;
  /** Whether the equipment is currently operational */
  isActive: boolean;
  /** When the equipment went out of service (POSIX timestamp) */
  outOfServiceSince?: number;
  /** MTA's estimated return to service (often vague, e.g., "Spring 2024") */
  estimatedReturn?: string;
  /** Whether this is the station's only ADA-accessible path */
  ada: boolean;
}

/**
 * Station equipment summary
 */
export interface StationEquipmentSummary {
  /** Station ID */
  stationId: string;
  /** All equipment at this station */
  equipment: EquipmentStatus[];
  /** Whether the station has any ADA-accessible path currently working */
  adaAccessible: boolean;
  /** Count of operational elevators */
  workingElevators: number;
  /** Count of operational escalators */
  workingEscalators: number;
  /** Count of out-of-service elevators */
  brokenElevators: number;
  /** Count of out-of-service escalators */
  brokenEscalators: number;
}
