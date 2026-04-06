/**
 * Metrics collection utility.
 *
 * Tracks counters, gauges, and histograms for application monitoring.
 * Metrics can be exported for scraping by Prometheus or other monitoring systems.
 */

interface CounterMetric {
  type: "counter";
  value: number;
  help: string;
  labels: Record<string, string>;
}

interface GaugeMetric {
  type: "gauge";
  value: number;
  help: string;
  labels: Record<string, string>;
}

interface HistogramMetric {
  type: "histogram";
  values: number[];
  help: string;
  labels: Record<string, string>;
  buckets: number[];
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric;

/**
 * Metrics registry.
 */
class MetricsRegistry {
  private metrics: Map<string, Metric> = new Map();

  /**
   * Register or get a counter metric.
   */
  counter(
    name: string,
    help: string
  ): {
    inc: (amount?: number, labels?: Record<string, string>) => void;
    reset: () => void;
  } {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        type: "counter",
        value: 0,
        help,
        labels: {},
      });
    }

    return {
      inc: (amount = 1, labels = {}) => {
        const metric = this.metrics.get(name);
        if (metric?.type === "counter") {
          metric.value += amount;
          metric.labels = { ...metric.labels, ...labels };
        }
      },
      reset: () => {
        const metric = this.metrics.get(name);
        if (metric?.type === "counter") {
          metric.value = 0;
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
      this.metrics.set(name, {
        type: "gauge",
        value: 0,
        help,
        labels: {},
      });
    }

    return {
      set: (value, labels = {}) => {
        const metric = this.metrics.get(name);
        if (metric?.type === "gauge") {
          metric.value = value;
          metric.labels = { ...metric.labels, ...labels };
        }
      },
      inc: (amount = 1, labels = {}) => {
        const metric = this.metrics.get(name);
        if (metric?.type === "gauge") {
          metric.value += amount;
          metric.labels = { ...metric.labels, ...labels };
        }
      },
      dec: (amount = 1, labels = {}) => {
        const metric = this.metrics.get(name);
        if (metric?.type === "gauge") {
          metric.value -= amount;
          metric.labels = { ...metric.labels, ...labels };
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
    reset: () => void;
  } {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        type: "histogram",
        values: [],
        help,
        labels: {},
        buckets,
      });
    }

    return {
      observe: (value, labels = {}) => {
        const metric = this.metrics.get(name);
        if (metric?.type === "histogram") {
          metric.values.push(value);
          metric.labels = { ...metric.labels, ...labels };
        }
      },
      reset: () => {
        const metric = this.metrics.get(name);
        if (metric?.type === "histogram") {
          metric.values = [];
        }
      },
    };
  }

  /**
   * Get all metrics as a map.
   */
  getAll(): Map<string, Metric> {
    return this.metrics;
  }

  /**
   * Clear all metrics.
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Export metrics in Prometheus text format.
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`# HELP ${sanitizedName} ${metric.help}`);
      lines.push(`# TYPE ${sanitizedName} ${metric.type}`);

      if (metric.type === "counter" || metric.type === "gauge") {
        const labelStr =
          Object.keys(metric.labels).length > 0
            ? `{${Object.entries(metric.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(",")}}`
            : "";
        lines.push(`${sanitizedName}${labelStr} ${metric.value}`);
      } else if (metric.type === "histogram") {
        const values = metric.values.sort((a, b) => a - b);
        const count = values.length;
        const sum = values.reduce((a, b) => a + b, 0);

        const labelStr =
          Object.keys(metric.labels).length > 0
            ? `{${Object.entries(metric.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(",")}}`
            : "";

        lines.push(`${sanitizedName}_count${labelStr} ${count}`);
        lines.push(`${sanitizedName}_sum${labelStr} ${sum}`);

        // Calculate bucket values
        for (const bucket of metric.buckets) {
          const leValue = values.filter((v) => v <= bucket).length;
          lines.push(
            `${sanitizedName}_bucket{le="${bucket}"${labelStr ? ", " + labelStr.slice(1, -1) : ""}} ${leValue}`
          );
        }
        // +Inf bucket
        lines.push(
          `${sanitizedName}_bucket{le="+Inf"${labelStr ? ", " + labelStr.slice(1, -1) : ""}} ${count}`
        );
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

/**
 * Common application metrics.
 */
export const httpRequestsTotal = metrics.counter("http_requests_total", "Total HTTP requests");
export const httpRequestDuration = metrics.histogram(
  "http_request_duration_seconds",
  "HTTP request duration"
);
export const httpRequestSize = metrics.histogram("http_request_size_bytes", "HTTP request size");
export const httpResponseSize = metrics.histogram("http_response_size_bytes", "HTTP response size");
export const activeConnections = metrics.gauge("active_connections", "Active network connections");
export const cacheHits = metrics.counter("cache_hits_total", "Cache hits");
export const cacheMisses = metrics.counter("cache_misses_total", "Cache misses");
export const feedPollDuration = metrics.histogram(
  "feed_poll_duration_seconds",
  "Feed poll duration"
);
export const feedErrors = metrics.counter("feed_errors_total", "Feed poll errors");
export const pushNotificationsSent = metrics.counter(
  "push_notifications_sent_total",
  "Push notifications sent"
);
export const pushNotificationsFailed = metrics.counter(
  "push_notifications_failed_total",
  "Push notifications failed"
);
