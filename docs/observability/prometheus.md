# Prometheus Metrics Export Guide

The mta-my-way server exports metrics in Prometheus text format via the `/api/metrics` endpoint.

## Configuration

### Environment Variables

```bash
# Enable metrics endpoint (default: true)
METRICS_ENABLED=true

# Metrics endpoint path (default: /api/metrics)
METRICS_ENDPOINT=/api/metrics

# Enable default labels (default: true)
METRICS_DEFAULT_LABELS=true

# Default service label (default: mta-my-way)
METRICS_SERVICE_NAME=mta-my-way
```

### Prometheus Configuration

Add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'mta-my-way'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
        labels:
          service: 'mta-my-way'
          environment: 'production'
```

### Kubernetes ServiceMonitor

For Kubernetes deployments with Prometheus Operator:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: mta-my-way
  labels:
    app: mta-my-way
spec:
  selector:
    matchLabels:
      app: mta-my-way
  endpoints:
    - port: http
      path: /api/metrics
      interval: 15s
```

## Available Metrics

### HTTP Metrics

- `http_requests_total` - Total HTTP requests (labels: method, status_code)
- `http_request_duration_seconds` - HTTP request latency histogram
- `http_request_size_bytes` - HTTP request body size histogram
- `http_response_size_bytes` - HTTP response body size histogram
- `active_connections` - Number of active HTTP connections

### Cache Metrics

- `cache_hits_total` - Total cache hits
- `cache_misses_total` - Total cache misses

### Feed Polling Metrics

- `feed_poll_duration_seconds` - Feed poll latency histogram
- `feed_errors_total` - Total feed poll errors
- `feed_entities_processed` - Number of entities processed from feed

### Push Notification Metrics

- `push_notifications_sent_total` - Total push notifications sent
- `push_notifications_failed_total` - Total push notifications failed
- `push_subscriptions_active` - Number of active push subscriptions

### Trip Tracking Metrics

- `trips_created_total` - Total trips created in the journal
- `trips_active` - Number of trips currently being tracked
- `trips_queried_total` - Total trip journal queries
- `trip_query_duration_seconds` - Trip query latency histogram

### Commute Analysis Metrics

- `commute_analysis_requests_total` - Total commute analysis requests
- `commute_analysis_duration_seconds` - Commute analysis computation latency

### Station Search Metrics

- `station_search_requests_total` - Total station search requests
- `station_search_duration_seconds` - Station search latency
- `station_search_results_count` - Number of results returned

### Delay Prediction Metrics

- `delay_prediction_requests_total` - Total delay prediction requests
- `delay_prediction_duration_seconds` - Delay prediction computation latency
- `delay_prediction_accuracy` - Delay prediction accuracy rate

### Context Detection Metrics

- `context_detections_total` - Total context detections
- `context_transitions_total` - Total context state transitions
- `context_overrides_total` - Total manual context overrides

### Alert Metrics

- `alerts_active` - Number of active alerts
- `alerts_match_rate` - Alert pattern match rate (0-1)
- `alerts_changes_total` - Total alert changes detected

### Equipment Metrics

- `equipment_outages` - Number of equipment outages
- `equipment_elevators_out` - Number of elevators out of service
- `equipment_escalators_out` - Number of escalators out of service

## Querying Metrics

### Common PromQL Queries

**Request rate:**
```promql
rate(http_requests_total[5m])
```

**Error rate:**
```promql
rate(http_requests_total{status_code=~"5.."}[5m])
```

**P95 latency:**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Cache hit ratio:**
```promql
cache_hits_total / (cache_hits_total + cache_misses_total)
```

**Active subscriptions:**
```promql
push_subscriptions_active
```

## Alerting Rules

Example Prometheus alerting rules:

```yaml
groups:
  - name: mta-my-way
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High error rate detected

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High request latency detected

      - alert: FeedPollingDown
        expr: time() - max(feed_entities_processed) > 300
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: Feed polling has stopped

      - alert: HighFailureRate
        expr: rate(push_notifications_failed_total[5m]) / rate(push_notifications_sent_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High push notification failure rate
```

## Grafana Dashboards

Import the provided Grafana dashboard JSON to visualize metrics:

```json
{
  "title": "MTA My Way - Performance Dashboard",
  "panels": [
    {
      "title": "Request Rate",
      "targets": [
        {
          "expr": "rate(http_requests_total[5m])"
        }
      ]
    },
    {
      "title": "Error Rate",
      "targets": [
        {
          "expr": "rate(http_requests_total{status_code=~\"5..\"}[5m])"
        }
      ]
    },
    {
      "title": "Latency (p95)",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
        }
      ]
    },
    {
      "title": "Cache Hit Ratio",
      "targets": [
        {
          "expr": "cache_hits_total / (cache_hits_total + cache_misses_total)"
        }
      ]
    },
    {
      "title": "Active Subscriptions",
      "targets": [
        {
          "expr": "push_subscriptions_active"
        }
      ]
    },
    {
      "title": "Feed Freshness",
      "targets": [
        {
          "expr": "time() - max(feed_entities_processed)"
        }
      ]
    }
  ]
}
```
