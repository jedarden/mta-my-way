/**
 * Per-trip delay prediction routes.
 *
 * GET /api/trip/:tripId/predict — ETA for a tracked trip adjusted by the delay
 * predictor's historical segment model, plus a route-level delay probability.
 *
 * This route was previously commented out "to reduce security surface area".
 * It is a read-only GET over the same public trip data that /api/trip/:tripId
 * already serves, and it is registered on the same app, so it sits behind the
 * identical /api/* middleware chain: input sanitization, SSRF protection,
 * optional auth, session security, CSRF (a no-op for safe methods), HPP,
 * open-redirect protection, metrics, and the shared 60 req/min/IP rate
 * limiter. It adds no new write path and requires no new exemption.
 */

import type { StationIndex } from "@mta-my-way/shared";
import { tripIdParamsSchema } from "@mta-my-way/shared";
import type { Context } from "hono";
import { getRouteDelayProbability, predictDelay } from "../delay-predictor.js";
import { validateParams } from "../middleware/index.js";
import {
  recordDelayPredictionDuration,
  recordDelayPredictionRequest,
} from "../middleware/metrics.js";
import { logger } from "../observability/logger.js";
import type { TripData } from "../trip-lookup.js";
import { lookupTrip } from "../trip-lookup.js";

/** A leg of the trip the train has still to run, as predictDelay consumes it. */
interface TripSegment {
  fromStationId: string;
  toStationId: string;
  fromStationName: string;
  toStationName: string;
  scheduledSeconds: number;
}

interface SegmentPrediction extends TripSegment {
  prediction: ReturnType<typeof predictDelay>;
}

type DelayRisk = "low" | "medium" | "high";

/**
 * Collect the legs between the train's current position and its destination.
 *
 * A leg only qualifies when both ends carry usable times and the arrival is
 * after the departure — GTFS-RT feeds routinely drop one of the two, and a
 * zero- or negative-length leg would poison the pattern lookup.
 */
function collectRemainingSegments(trip: TripData): TripSegment[] {
  const segments: TripSegment[] = [];

  for (let i = trip.currentStopIndex; i < trip.stops.length - 1; i++) {
    const currentStop = trip.stops[i]!;
    const nextStop = trip.stops[i + 1]!;

    const departureTime = currentStop.departureTime ?? currentStop.arrivalTime;
    const arrivalTime = nextStop.arrivalTime ?? nextStop.departureTime;

    if (departureTime && arrivalTime && arrivalTime > departureTime) {
      segments.push({
        fromStationId: currentStop.stationId ?? currentStop.stopId,
        toStationId: nextStop.stationId ?? nextStop.stopId,
        fromStationName: currentStop.stationName,
        toStationName: nextStop.stationName,
        scheduledSeconds: arrivalTime - departureTime,
      });
    }
  }

  return segments;
}

/** Bucket the predicted-to-scheduled ratio into a user-facing risk label. */
function delayRiskFor(ratio: number): DelayRisk {
  if (ratio < 1.1) return "low";
  if (ratio < 1.3) return "medium";
  return "high";
}

/** Render an ETA adjustment in minutes as a user-facing range. */
function formatDelayRange(minutes: number): string {
  if (minutes > 0) return `+${minutes} min`;
  if (minutes < 0) return `${minutes} min`;
  return "On time";
}

/** Build the per-trip delay prediction route handlers. */
export function buildTripPredictionRoutes(stations: StationIndex) {
  /** GET /api/trip/:tripId/predict — predicted, delay-adjusted ETA. */
  async function getTripPrediction(c: Context) {
    const startTime = Date.now();
    let hasData = false;

    try {
      const params = validateParams(c, tripIdParamsSchema);
      if (params instanceof Response) return params;

      const { tripId } = params;
      const trip = lookupTrip(tripId, stations);

      if (!trip) {
        recordDelayPredictionDuration((Date.now() - startTime) / 1000);
        recordDelayPredictionRequest(false, false);
        return c.json({ error: "Trip not found or no longer active" }, 404);
      }

      const segmentPredictions: SegmentPrediction[] = collectRemainingSegments(trip).map(
        (segment) => ({
          ...segment,
          prediction: predictDelay(
            trip.routeId,
            trip.direction ?? "N",
            segment.fromStationId,
            segment.toStationId,
            segment.scheduledSeconds
          ),
        })
      );

      // Predicted total is the scheduled total with each predicted leg swapped
      // in; legs without enough history fall back to their scheduled time.
      let totalScheduledSeconds = 0;
      let totalPredictedSeconds = 0;
      let hasPredictions = false;

      for (const segment of segmentPredictions) {
        totalScheduledSeconds += segment.scheduledSeconds;
        if (segment.prediction) {
          totalPredictedSeconds += segment.prediction.predictedMinutes * 60;
          hasPredictions = true;
        } else {
          totalPredictedSeconds += segment.scheduledSeconds;
        }
      }

      const lastStop = trip.stops[trip.stops.length - 1];
      const baseEtaSeconds = lastStop?.arrivalTime ?? null;
      const baseEta = baseEtaSeconds ? new Date(baseEtaSeconds * 1000).toISOString() : null;

      let adjustedEta: string | null = null;
      let delayRisk: DelayRisk | null = null;
      let delayMinutesRange: string | null = null;

      // hasPredictions implies at least one segment, so the ratio below never
      // divides by zero.
      if (hasPredictions && baseEtaSeconds) {
        const etaAdjustmentSeconds = totalPredictedSeconds - totalScheduledSeconds;
        adjustedEta = new Date((baseEtaSeconds + etaAdjustmentSeconds) * 1000).toISOString();

        delayRisk = delayRiskFor(totalPredictedSeconds / totalScheduledSeconds);
        delayMinutesRange = formatDelayRange(Math.round(etaAdjustmentSeconds / 60));
      }

      hasData = hasPredictions;
      recordDelayPredictionDuration((Date.now() - startTime) / 1000);
      recordDelayPredictionRequest(true, hasData);

      c.header("Cache-Control", "public, max-age=30");
      return c.json({
        tripId: trip.tripId,
        routeId: trip.routeId,
        direction: trip.direction,
        destination: trip.destination,
        progressPercent: trip.progressPercent,
        remainingStops: trip.remainingStops,
        totalStops: trip.totalStops,
        baseEta,
        adjustedEta,
        delayRisk,
        delayMinutesRange,
        routeDelayProbability: getRouteDelayProbability(trip.routeId, trip.direction ?? "N"),
        segments: segmentPredictions,
        hasPredictions,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Trip prediction error", error instanceof Error ? error : undefined);

      recordDelayPredictionDuration((Date.now() - startTime) / 1000);
      recordDelayPredictionRequest(false, false);

      return c.json({ error: "Failed to generate prediction" }, 500);
    }
  }

  return { getTripPrediction };
}
