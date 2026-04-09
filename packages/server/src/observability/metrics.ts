/**
 * Metrics collection utility.
 *
 * Tracks counters, gauges, and histograms for application monitoring.
 * Metrics can be exported for scraping by Prometheus or other monitoring systems.
 * Supports proper labeled metrics where each label combination is tracked separately.
 */

/**
 * Generate a unique key for a label combination.
 * Sorts label keys to ensure consistent keys regardless of order.
 */
function labelKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

interface CounterMetric {
  type: "counter";
  value: number;
  help: string;
}

interface GaugeMetric {
  type: "gauge";
  value: number;
  help: string;
}

interface HistogramMetric {
  type: "histogram";
  values: number[];
  help: string;
  buckets: number[];
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric;

/**
 * Labeled metric instance with its own state.
 */
interface LabeledMetric {
  labels: Record<string, string>;
  metric: Metric;
}

/**
 * Metrics registry with support for labeled metrics.
 * Each unique label combination creates a separate metric instance.
 */
class MetricsRegistry {
  private metrics: Map<string, Map<string, LabeledMetric>> = new Map();
  private defaultLabels: Record<string, string> = {};

  /**
   * Set default labels that will be added to all metrics.
   */
  setDefaultLabels(labels: Record<string, string>): void {
    this.defaultLabels = { ...labels };
  }

  /**
   * Merge default labels with provided labels.
   */
  private mergeLabels(labels: Record<string, string>): Record<string, string> {
    return { ...this.defaultLabels, ...labels };
  }

  /**
   * Register or get a counter metric.
   */
  counter(
    name: string,
    help: string
  ): {
    inc: (amount?: number, labels?: Record<string, string>) => void;
    reset: (labels?: Record<string, string>) => void;
  } {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Map());
    }

    return {
      inc: (amount = 1, labels = {}) => {
        const mergedLabels = this.mergeLabels(labels);
        const key = labelKey(mergedLabels);
        const metricMap = this.metrics.get(name)!;

        let labeled = metricMap.get(key);
        if (!labeled) {
          labeled = {
            labels: mergedLabels,
            metric: { type: "counter", value: 0, help },
          };
          metricMap.set(key, labeled);
        }

        if (labeled.metric.type === "counter") {
          labeled.metric.value += amount;
        }
      },
      reset: (labels = {}) => {
        const mergedLabels = this.mergeLabels(labels);
        const key = labelKey(mergedLabels);
        const metricMap = this.metrics.get(name)!;

        const labeled = metricMap.get(key);
        if (labeled && labeled.metric.type === "counter") {
          labeled.metric.value = 0;
        }
      },
    };
  }

  /**
   * Register or get a gauge metric.
   */
  gauge(
    name: string,
    help: string
  ): {
    set: (value: number, labels?: Record<string, string>) => void;
    inc: (amount?: number, labels?: Record<string, string>) => void;
    dec: (amount?: number, labels?: Record<string, string>) => void;
  } {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Map());
    }

    return {
      set: (value, labels = {}) => {
        const mergedLabels = this.mergeLabels(labels);
        const key = labelKey(mergedLabels);
        const metricMap = this.metrics.get(name)!;

        let labeled = metricMap.get(key);
        if (!labeled) {
          labeled = {
            labels: mergedLabels,
            metric: { type: "gauge", value: 0, help },
          };
          metricMap.set(key, labeled);
        }

        if (labeled.metric.type === "gauge") {
          labeled.metric.value = value;
        }
      },
      inc: (amount = 1, labels = {}) => {
        const mergedLabels = this.mergeLabels(labels);
        const key = labelKey(mergedLabels);
        const metricMap = this.metrics.get(name)!;

        let labeled = metricMap.get(key);
        if (!labeled) {
          labeled = {
            labels: mergedLabels,
            metric: { type: "gauge", value: 0, help },
          };
          metricMap.set(key, labeled);
        }

        if (labeled.metric.type === "gauge") {
          labeled.metric.value += amount;
        }
      },
      dec: (amount = 1, labels = {}) => {
        const mergedLabels = this.mergeLabels(labels);
        const key = labelKey(mergedLabels);
        const metricMap = this.metrics.get(name)!;

        let labeled = metricMap.get(key);
        if (!labeled) {
          labeled = {
            labels: mergedLabels,
            metric: { type: "gauge", value: 0, help },
          };
          metricMap.set(key, labeled);
        }

        if (labeled.metric.type === "gauge") {
          labeled.metric.value -= amount;
        }
      },
    };
  }

  /**
   * Register or get a histogram metric.
   */
  histogram(
    name: string,
    help: string,
    buckets: number[] = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ): {
    observe: (value: number, labels?: Record<string, string>) => void;
    reset: (labels?: Record<string, string>) => void;
  } {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Map());
    }

    return {
      observe: (value, labels = {}) => {
        const mergedLabels = this.mergeLabels(labels);
        const key = labelKey(mergedLabels);
        const metricMap = this.metrics.get(name)!;

        let labeled = metricMap.get(key);
        if (!labeled) {
          labeled = {
            labels: mergedLabels,
            metric: { type: "histogram", values: [], help, buckets },
          };
          metricMap.set(key, labeled);
        }

        if (labeled.metric.type === "histogram") {
          labeled.metric.values.push(value);
        }
      },
      reset: (labels = {}) => {
        const mergedLabels = this.mergeLabels(labels);
        const key = labelKey(mergedLabels);
        const metricMap = this.metrics.get(name)!;

        const labeled = metricMap.get(key);
        if (labeled && labeled.metric.type === "histogram") {
          labeled.metric.values = [];
        }
      },
    };
  }

  /**
   * Get all metrics as a map.
   */
  getAll(): Map<string, Map<string, LabeledMetric>> {
    return this.metrics;
  }

  /**
   * Clear all metrics.
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Sanitize metric name for Prometheus format.
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  /**
   * Format labels for Prometheus export.
   */
  private formatLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) {
      return "";
    }
    return `{${Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",")}}`;
  }

  /**
   * Export metrics in Prometheus text format.
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    for (const [name, metricMap] of this.metrics) {
      const sanitizedName = this.sanitizeName(name);

      // Get help from first metric instance
      const firstInstance = metricMap.values().next().value;
      if (firstInstance) {
        lines.push(`# HELP ${sanitizedName} ${firstInstance.metric.help}`);
        lines.push(`# TYPE ${sanitizedName} ${firstInstance.metric.type}`);
      }

      for (const labeled of metricMap.values()) {
        const labelStr = this.formatLabels(labeled.labels);

        if (labeled.metric.type === "counter" || labeled.metric.type === "gauge") {
          lines.push(`${sanitizedName}${labelStr} ${labeled.metric.value}`);
        } else if (labeled.metric.type === "histogram") {
          const values = [...labeled.metric.values].sort((a, b) => a - b);
          const count = values.length;
          const sum = values.reduce((a, b) => a + b, 0);

          // Export _count and _sum
          lines.push(`${sanitizedName}_count${labelStr} ${count}`);
          lines.push(`${sanitizedName}_sum${labelStr} ${sum}`);

          // Calculate bucket values
          const cumulativeCounts: number[] = [];
          for (const bucket of labeled.metric.buckets) {
            const leValue = values.filter((v) => v <= bucket).length;
            cumulativeCounts.push(leValue);
            const bucketLabels = { ...labeled.labels, le: bucket.toString() };
            lines.push(`${sanitizedName}_bucket${this.formatLabels(bucketLabels)} ${leValue}`);
          }
          // +Inf bucket
          const infLabels = { ...labeled.labels, le: "+Inf" };
          lines.push(`${sanitizedName}_bucket${this.formatLabels(infLabels)} ${count}`);
        }
      }

      lines.push(""); // Empty line between metrics
    }

    return lines.join("\n");
  }
}

/**
 * Global metrics registry.
 */
export const metrics = new MetricsRegistry();

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestsTotal = metrics.counter("http_requests_total", "Total HTTP requests");
export const httpRequestDuration = metrics.histogram(
  "http_request_duration_seconds",
  "HTTP request latency in seconds"
);
export const httpRequestSize = metrics.histogram(
  "http_request_size_bytes",
  "HTTP request body size in bytes"
);
export const httpResponseSize = metrics.histogram(
  "http_response_size_bytes",
  "HTTP response body size in bytes"
);
export const activeConnections = metrics.gauge(
  "active_connections",
  "Number of active HTTP connections"
);

// ============================================================================
// Cache Metrics
// ============================================================================

export const cacheHits = metrics.counter("cache_hits_total", "Total cache hits");
export const cacheMisses = metrics.counter("cache_misses_total", "Total cache misses");

// ============================================================================
// Feed Polling Metrics
// ============================================================================

export const feedPollDuration = metrics.histogram(
  "feed_poll_duration_seconds",
  "Feed poll latency in seconds",
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);
export const feedErrors = metrics.counter("feed_errors_total", "Total feed poll errors");
export const feedEntitiesProcessed = metrics.gauge(
  "feed_entities_processed",
  "Number of entities processed from feed"
);

// ============================================================================
// Push Notification Metrics
// ============================================================================

export const pushNotificationsSent = metrics.counter(
  "push_notifications_sent_total",
  "Total push notifications sent"
);
export const pushNotificationsFailed = metrics.counter(
  "push_notifications_failed_total",
  "Total push notifications failed"
);
export const pushSubscriptionsActive = metrics.gauge(
  "push_subscriptions_active",
  "Number of active push subscriptions"
);

// ============================================================================
// Trip Tracking Metrics
// ============================================================================

export const tripsCreated = metrics.counter(
  "trips_created_total",
  "Total trips created in the journal"
);
export const tripsActive = metrics.gauge("trips_active", "Number of trips currently being tracked");
export const tripsQueried = metrics.counter("trips_queried_total", "Total trip journal queries");
export const tripQueryDuration = metrics.histogram(
  "trip_query_duration_seconds",
  "Trip query latency in seconds"
);

// ============================================================================
// Commute Analysis Metrics
// ============================================================================

export const commuteAnalysisRequests = metrics.counter(
  "commute_analysis_requests_total",
  "Total commute analysis requests"
);
export const commuteAnalysisDuration = metrics.histogram(
  "commute_analysis_duration_seconds",
  "Commute analysis computation latency in seconds",
  [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

// ============================================================================
// Station Search Metrics
// ============================================================================

export const stationSearchRequests = metrics.counter(
  "station_search_requests_total",
  "Total station search requests"
);
export const stationSearchDuration = metrics.histogram(
  "station_search_duration_seconds",
  "Station search latency in seconds",
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
);
export const stationSearchResults = metrics.histogram(
  "station_search_results_count",
  "Number of results returned from station search",
  [0, 1, 5, 10, 25, 50, 100]
);

// ============================================================================
// Delay Prediction Metrics
// ============================================================================

export const delayPredictionRequests = metrics.counter(
  "delay_prediction_requests_total",
  "Total delay prediction requests"
);
export const delayPredictionDuration = metrics.histogram(
  "delay_prediction_duration_seconds",
  "Delay prediction computation latency in seconds",
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
);
export const delayPredictionAccuracy = metrics.gauge(
  "delay_prediction_accuracy",
  "Delay prediction accuracy rate"
);

// ============================================================================
// Context Detection Metrics
// ============================================================================

export const contextDetections = metrics.counter(
  "context_detections_total",
  "Total context detections"
);
export const contextTransitions = metrics.counter(
  "context_transitions_total",
  "Total context state transitions"
);
export const contextOverrides = metrics.counter(
  "context_overrides_total",
  "Total manual context overrides"
);

// ============================================================================
// Alert Metrics
// ============================================================================

export const alertsActive = metrics.gauge("alerts_active", "Number of active alerts");
export const alertsMatchRate = metrics.gauge("alerts_match_rate", "Alert pattern match rate (0-1)");
export const alertsChanges = metrics.counter(
  "alerts_changes_total",
  "Total alert changes detected"
);

// ============================================================================
// Equipment Metrics
// ============================================================================

export const equipmentOutages = metrics.gauge("equipment_outages", "Number of equipment outages");
export const equipmentElevatorsOut = metrics.gauge(
  "equipment_elevators_out",
  "Number of elevators out of service"
);
export const equipmentEscalatorsOut = metrics.gauge(
  "equipment_escalators_out",
  "Number of escalators out of service"
);
