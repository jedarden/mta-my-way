/**
 * Synthetic GTFS-RT protobuf fixture generator for tests.
 *
 * Uses protobufjs to encode realistic feed messages so tests run without
 * an MTA API key. Each fixture targets a specific parser/transformer path.
 */

import { transit_realtime } from "../proto/compiled.js";

// ---------------------------------------------------------------------------
// Helper: current-ish timestamp
// ---------------------------------------------------------------------------

const NOW = Math.floor(Date.now() / 1000);

function futureTime(offsetMinutes: number): number {
  return NOW + offsetMinutes * 60;
}

// ---------------------------------------------------------------------------
// Core builders
// ---------------------------------------------------------------------------

function makeHeader(timestamp = NOW, tripReplacementPeriod?: number) {
  const header: transit_realtime.IFeedHeader = {
    gtfsRealtimeVersion: "2.0",
    timestamp,
  };
  if (tripReplacementPeriod !== undefined) {
    header[".transit_realtime.nyctFeedHeader"] = {
      nyctSubwayVersion: "1.0",
      tripReplacementPeriod: [
        {
          routeId: "*",
          replacementPeriod: { start: timestamp, end: timestamp + tripReplacementPeriod },
        },
      ],
    };
  }
  return header;
}

function makeStopTimeUpdate(
  stopId: string,
  arrivalSeconds: number,
  scheduledTrack?: string,
  actualTrack?: string
): transit_realtime.TripUpdate.IStopTimeUpdate {
  const stu: transit_realtime.TripUpdate.IStopTimeUpdate = {
    stopId,
    arrival: { time: arrivalSeconds },
    departure: { time: arrivalSeconds + 30 },
  };
  if (scheduledTrack !== undefined || actualTrack !== undefined) {
    stu[".transit_realtime.nyctStopTimeUpdate"] = {
      scheduledTrack: scheduledTrack ?? null,
      actualTrack: actualTrack ?? null,
    };
  }
  return stu;
}

function makeTripUpdate(
  tripId: string,
  routeId: string,
  stopTimeUpdates: transit_realtime.TripUpdate.IStopTimeUpdate[],
  options: {
    isAssigned?: boolean;
    trainId?: string;
    direction?: transit_realtime.IONYCTNysctripdescription.Direction | null;
  } = {}
): transit_realtime.ITripUpdate {
  const tu: transit_realtime.ITripUpdate = {
    trip: {
      tripId,
      routeId,
      ".transit_realtime.nyctTripDescriptor": {
        isAssigned: options.isAssigned ?? true,
        trainId: options.trainId ?? null,
        direction: options.direction ?? transit_realtime.IONYCTNysctripdescription.Direction.NORTH,
      },
    },
    stopTimeUpdate: stopTimeUpdates,
  };
  return tu;
}

function makeEntity(
  id: string,
  tripUpdate?: transit_realtime.ITripUpdate,
  alert?: transit_realtime.IAlert,
  isDeleted = false
): transit_realtime.IFeedEntity {
  return { id, tripUpdate, alert, isDeleted };
}

// ---------------------------------------------------------------------------
// Feed encoders
// ---------------------------------------------------------------------------

/** Encode a FeedMessage to a Uint8Array for parser testing */
function encodeFeed(message: transit_realtime.IFeedMessage): Uint8Array {
  const writer = transit_realtime.FeedMessage.encode(transit_realtime.FeedMessage.create(message));
  return writer.finish();
}

// ---------------------------------------------------------------------------
// Exported fixtures
// ---------------------------------------------------------------------------

/** Basic A Division feed with assigned 1-train trip */
export function aDivisionFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW, 12000),
    entity: [
      makeEntity(
        "1-trip-001",
        makeTripUpdate(
          "A2024-01-01_001",
          "1",
          [
            makeStopTimeUpdate("101N", futureTime(2)),
            makeStopTimeUpdate("102N", futureTime(5)),
            makeStopTimeUpdate("103N", futureTime(8)),
          ],
          { isAssigned: true, trainId: "01@1234" }
        )
      ),
      makeEntity(
        "1-trip-002",
        makeTripUpdate(
          "A2024-01-01_002",
          "2",
          [makeStopTimeUpdate("101S", futureTime(3)), makeStopTimeUpdate("100S", futureTime(7))],
          { isAssigned: true, trainId: "02@5678", direction: "S" }
        )
      ),
    ],
  });
}

/** B Division feed with assigned and unassigned F-train trips */
export function bDivisionFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW, 12000),
    entity: [
      makeEntity(
        "F-trip-001",
        makeTripUpdate(
          "B2024-01-01_001",
          "F",
          [makeStopTimeUpdate("725N", futureTime(1)), makeStopTimeUpdate("726N", futureTime(4))],
          { isAssigned: true, trainId: "F1@9012" }
        )
      ),
      makeEntity(
        "F-trip-002",
        makeTripUpdate(
          "B2024-01-01_002",
          "F",
          [makeStopTimeUpdate("725S", futureTime(6)), makeStopTimeUpdate("724S", futureTime(10))],
          { isAssigned: false }
        )
      ),
      makeEntity(
        "D-trip-001",
        makeTripUpdate(
          "B2024-01-01_003",
          "D",
          [makeStopTimeUpdate("725N", futureTime(3)), makeStopTimeUpdate("730N", futureTime(9))],
          { isAssigned: false }
        )
      ),
    ],
  });
}

/** L Line (CBTC) feed */
export function lLineFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW, 12000),
    entity: [
      makeEntity(
        "L-trip-001",
        makeTripUpdate(
          "L2024-01-01_001",
          "L",
          [makeStopTimeUpdate("L01N", futureTime(1)), makeStopTimeUpdate("L02N", futureTime(3))],
          { isAssigned: true, trainId: "L01@ABC" }
        )
      ),
    ],
  });
}

/** Empty feed (header only, no entities) */
export function emptyFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW),
    entity: [],
  });
}

/** Feed with unassigned trips only */
export function unassignedTripsFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW, 12000),
    entity: [
      makeEntity(
        "A-unassigned-001",
        makeTripUpdate(
          "A_UN1",
          "A",
          [makeStopTimeUpdate("A01N", futureTime(5)), makeStopTimeUpdate("A02N", futureTime(10))],
          { isAssigned: false }
        )
      ),
      makeEntity(
        "C-unassigned-001",
        makeTripUpdate("C_UN1", "C", [makeStopTimeUpdate("C01S", futureTime(4))], {
          isAssigned: false,
        })
      ),
    ],
  });
}

/** Feed with NYCT track extensions showing a rerouted train */
export function reroutedTrackFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW, 12000),
    entity: [
      makeEntity(
        "F-reroute-001",
        makeTripUpdate(
          "F_REROUTE_1",
          "F",
          [
            makeStopTimeUpdate("725N", futureTime(2), "1", "2"),
            makeStopTimeUpdate("726N", futureTime(5), "1", "1"),
          ],
          { isAssigned: true, trainId: "FR@REROUTE" }
        )
      ),
    ],
  });
}

/** Feed with deleted entities (should be skipped) */
export function deletedEntitiesFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW),
    entity: [
      makeEntity("deleted-001", undefined, undefined, true),
      makeEntity("deleted-002", undefined, undefined, true),
      makeEntity(
        "active-001",
        makeTripUpdate("ACTIVE_1", "1", [makeStopTimeUpdate("101N", futureTime(3))], {
          isAssigned: true,
        })
      ),
    ],
  });
}

/** Feed with no NYCT header extension (no trip replacement period) */
export function noNyctExtensionFeed(): Uint8Array {
  return encodeFeed({
    header: {
      gtfsRealtimeVersion: "2.0",
      timestamp: NOW,
    },
    entity: [
      makeEntity(
        "basic-001",
        makeTripUpdate("BASIC_1", "N", [makeStopTimeUpdate("N01N", futureTime(4))], {
          isAssigned: true,
        })
      ),
    ],
  });
}

/** Alerts feed with various alert types */
export function alertsFeed(): Uint8Array {
  const alertEntity1 = makeEntity("alert-suspended", undefined, {
    headerText: {
      translation: [
        {
          text: "[F] service has been suspended between Church Av and Jay St-MetroTech",
          language: "en",
        },
      ],
    },
    descriptionText: {
      translation: [
        {
          text: "Service suspended due to track work. Please use [G] service.",
          language: "en",
        },
      ],
    },
    activePeriod: [{ start: NOW - 3600, end: NOW + 3600 }],
    informedEntity: [{ routeId: "F" }],
    cause: 1, // CONSTRUCTION
    effect: 1, // NO_SERVICE (proto enum value 1)
  });

  const alertEntity2 = makeEntity("alert-delays", undefined, {
    headerText: {
      translation: [
        {
          text: "[A, C, E] trains are running with delays due to signal problems",
          language: "en",
        },
      ],
    },
    descriptionText: {
      translation: [
        {
          text: "Expect 5-10 minute delays",
          language: "en",
        },
      ],
    },
    activePeriod: [{ start: NOW - 1800 }],
    informedEntity: [{ routeId: "A" }, { routeId: "C" }, { routeId: "E" }],
    cause: 2, // SIGNAL_FAILURE
    effect: 3, // SIGNIFICANT_DELAYS
  });

  const alertEntity3 = makeEntity("alert-resumed", undefined, {
    headerText: {
      translation: [
        {
          text: "[G] service has resumed between Church Av and Court Sq",
          language: "en",
        },
      ],
    },
    descriptionText: {
      translation: [{ text: "Normal service has resumed.", language: "en" }],
    },
    activePeriod: [{ start: NOW }],
    informedEntity: [{ routeId: "G" }],
    cause: 1,
    effect: 7, // OTHER_EFFECT (proto enum value 7) → maps to "info"
  });

  const alertEntity4 = makeEntity("alert-html-entities", undefined, {
    headerText: {
      translation: [
        {
          text: "[N, Q, R] trains are running with 8-12 minute delays",
          language: "en",
        },
      ],
    },
    descriptionText: {
      translation: [
        {
          text: "Northbound [N, Q, R] trains are running with delays due to a stalled train at 34 St.",
          language: "en",
        },
      ],
    },
    activePeriod: [{ start: NOW - 600 }],
    informedEntity: [{ routeId: "N" }, { routeId: "Q" }, { routeId: "R" }],
    cause: 4, // MEDICAL_EMERGENCY
    effect: 3, // SIGNIFICANT_DELAYS
  });

  return encodeFeed({
    header: makeHeader(NOW),
    entity: [alertEntity1, alertEntity2, alertEntity3, alertEntity4],
  });
}

/** Feed with past arrivals (should be filtered by transformer) */
export function pastArrivalsFeed(): Uint8Array {
  // All arrivals are 2+ minutes in the past
  const pastTime1 = NOW - 120; // 2 minutes ago
  const pastTime2 = NOW - 90; // 1.5 minutes ago (still > 30s past)
  return encodeFeed({
    header: makeHeader(NOW, 12000),
    entity: [
      makeEntity(
        "past-trip-001",
        makeTripUpdate(
          "PAST_1",
          "1",
          [makeStopTimeUpdate("101N", pastTime1), makeStopTimeUpdate("102N", pastTime2)],
          { isAssigned: true }
        )
      ),
    ],
  });
}

/** Multi-line feed (N/Q/R/W) for testing multiple routes */
export function nqrwFeed(): Uint8Array {
  return encodeFeed({
    header: makeHeader(NOW, 12000),
    entity: [
      makeEntity(
        "N-trip-001",
        makeTripUpdate(
          "N2024_001",
          "N",
          [makeStopTimeUpdate("N01N", futureTime(2)), makeStopTimeUpdate("N02N", futureTime(6))],
          { isAssigned: true, trainId: "N1@A1B2" }
        )
      ),
      makeEntity(
        "Q-trip-001",
        makeTripUpdate(
          "Q2024_001",
          "Q",
          [makeStopTimeUpdate("Q01N", futureTime(4)), makeStopTimeUpdate("Q02N", futureTime(8))],
          { isAssigned: false }
        )
      ),
    ],
  });
}
