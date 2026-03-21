/**
 * Verification script: parse a real MTA feed binary and check NYCT extensions.
 * Usage: node scripts/verify-proto.mjs [path-to-feed.bin]
 * Defaults to /tmp/mta-feed.bin
 */
import { readFileSync } from "node:fs";
import { transit_realtime } from "../src/proto/compiled.js";

const NYCT_FEED_HEADER_KEY = ".transit_realtime.nyctFeedHeader";
const NYCT_TRIP_KEY = ".transit_realtime.nyctTripDescriptor";
const NYCT_STU_KEY = ".transit_realtime.nyctStopTimeUpdate";

const feedPath = process.argv[2] || "/tmp/mta-feed.bin";
const buffer = readFileSync(feedPath);

const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

console.log("=== Feed Header ===");
console.log("GTFS version:", feed.header.gtfsRealtimeVersion);
console.log("Timestamp:", new Date(Number(feed.header.timestamp) * 1000).toISOString());

const nyctHeader = feed.header[NYCT_FEED_HEADER_KEY];
if (nyctHeader) {
  console.log("NYCT subway version:", nyctHeader.nyctSubwayVersion);
  console.log("Trip replacement periods:", nyctHeader.tripReplacementPeriod?.length || 0);
}

let tripUpdates = 0;
let vehiclePositions = 0;
let alerts = 0;
let nyctTrips = 0;
let nyctTracks = 0;

for (const entity of feed.entity) {
  if (entity.tripUpdate) tripUpdates++;
  if (entity.vehicle) vehiclePositions++;
  if (entity.alert) alerts++;

  if (entity.tripUpdate?.trip?.[NYCT_TRIP_KEY]) nyctTrips++;

  if (entity.tripUpdate?.stopTimeUpdate) {
    for (const stu of entity.tripUpdate.stopTimeUpdate) {
      if (stu[NYCT_STU_KEY]) nyctTracks++;
    }
  }
}

console.log(`\n=== Entities: ${feed.entity.length} ===`);
console.log(`TripUpdates: ${tripUpdates}`);
console.log(`VehiclePositions: ${vehiclePositions}`);
console.log(`Alerts: ${alerts}`);
console.log(`Trips with NYCT extensions: ${nyctTrips}`);
console.log(`StopTimeUpdates with NYCT track info: ${nyctTracks}`);

// Show sample trips
let shown = 0;
for (const entity of feed.entity) {
  if (shown >= 3) break;
  const nyctTrip = entity.tripUpdate?.trip?.[NYCT_TRIP_KEY];
  if (!nyctTrip) continue;

  const trip = entity.tripUpdate.trip;
  console.log(`\n=== Sample Trip ${++shown} ===`);
  console.log("Route:", trip.routeId, "| Trip:", trip.tripId);
  console.log(
    "Train ID:",
    nyctTrip.trainId,
    "| Assigned:",
    nyctTrip.isAssigned,
    "| Dir:",
    nyctTrip.direction
  );

  for (const stu of entity.tripUpdate.stopTimeUpdate) {
    const nyctStu = stu[NYCT_STU_KEY];
    if (nyctStu?.scheduledTrack || nyctStu?.actualTrack) {
      console.log(
        `  Stop ${stu.stopId}: scheduled=${nyctStu.scheduledTrack}, actual=${nyctStu.actualTrack}`
      );
      break;
    }
  }
}

const ok = feed.entity.length > 0 && tripUpdates > 0 && feed.header.gtfsRealtimeVersion === "1.0";
console.log(
  `\n${ok ? "PASS" : "FAIL"}: ${feed.entity.length} entities, ${nyctTrips} NYCT trips, ${nyctTracks} track updates`
);
process.exit(ok ? 0 : 1);
