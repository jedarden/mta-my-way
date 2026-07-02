/**
 * Performance benchmarking utilities.
 *
 * Provides tools for measuring and comparing performance of critical code paths.
 * Useful for regression testing and optimization validation.
 */

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
  percentile95: number;
  percentile99: number;
  memoryDelta?: number;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmupIterations?: number;
  collectMemory?: boolean;
  timeout?: number;
}

interface TimedRun {
  time: number;
  memory?: number;
}

/**
 * Run a benchmark for a synchronous function.
 */
export function benchmark(
  name: string,
  fn: () => void,
  options: BenchmarkOptions = {}
): BenchmarkResult {
  const {
    iterations = 1000,
    warmupIterations = 100,
    collectMemory = false,
    timeout = 30000,
  } = options;

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    fn();
  }

  // Force GC if available
  if (global.gc) {
    global.gc();
  }

  const initialMemory = collectMemory ? process.memoryUsage().heapUsed : undefined;
  const times: TimedRun[] = [];
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    const memBefore = collectMemory ? process.memoryUsage().heapUsed : undefined;

    fn();

    const memAfter = collectMemory ? process.memoryUsage().heapUsed : undefined;
    const end = process.hrtime.bigint();

    times.push({
      time: Number(end - start) / 1_000_000, // Convert to milliseconds
      memory: memBefore && memAfter ? memAfter - memBefore : undefined,
    });

    if (Date.now() - startTime > timeout) {
      break;
    }
  }

  const finalMemory = collectMemory ? process.memoryUsage().heapUsed : undefined;
  const sortedTimes = times.map((t) => t.time).sort((a, b) => a - b);
  const totalTime = times.reduce((sum, t) => sum + t.time, 0);

  return {
    name,
    iterations: times.length,
    totalTime,
    avgTime: totalTime / times.length,
    minTime: sortedTimes[0]!,
    maxTime: sortedTimes[sortedTimes.length - 1]!,
    opsPerSecond: (times.length / totalTime) * 1000,
    percentile95: sortedTimes[Math.floor(sortedTimes.length * 0.95)]!,
    percentile99: sortedTimes[Math.floor(sortedTimes.length * 0.99)]!,
    memoryDelta: initialMemory && finalMemory ? finalMemory - initialMemory : undefined,
  };
}

/**
 * Run benchmarks for multiple functions and compare results.
 */
export function compareBenchmarks(
  benchmarks: Array<{ name: string; fn: () => void }>,
  options: BenchmarkOptions = {}
): BenchmarkResult[] {
  return benchmarks.map((b) => benchmark(b.name, b.fn, options));
}

/**
 * Run an async benchmark.
 */
export async function benchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const {
    iterations = 100,
    warmupIterations = 10,
    collectMemory = false,
    timeout = 30000,
  } = options;

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  if (global.gc) {
    global.gc();
  }

  const initialMemory = collectMemory ? process.memoryUsage().heapUsed : undefined;
  const times: number[] = [];
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();

    await fn();

    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1_000_000);

    if (Date.now() - startTime > timeout) {
      break;
    }
  }

  const finalMemory = collectMemory ? process.memoryUsage().heapUsed : undefined;
  const sortedTimes = times.sort((a, b) => a - b);
  const totalTime = times.reduce((sum, t) => sum + t, 0);

  return {
    name,
    iterations: times.length,
    totalTime,
    avgTime: totalTime / times.length,
    minTime: sortedTimes[0]!,
    maxTime: sortedTimes[sortedTimes.length - 1]!,
    opsPerSecond: (times.length / totalTime) * 1000,
    percentile95: sortedTimes[Math.floor(sortedTimes.length * 0.95)]!,
    percentile99: sortedTimes[Math.floor(sortedTimes.length * 0.99)]!,
    memoryDelta: initialMemory && finalMemory ? finalMemory - initialMemory : undefined,
  };
}

/**
 * Format a benchmark result for display.
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  const lines = [
    `Benchmark: ${result.name}`,
    `  Iterations: ${result.iterations}`,
    `  Total time: ${result.totalTime.toFixed(2)}ms`,
    `  Avg: ${result.avgTime.toFixed(4)}ms`,
    `  Min: ${result.minTime.toFixed(4)}ms`,
    `  Max: ${result.maxTime.toFixed(4)}ms`,
    `  95th percentile: ${result.percentile95.toFixed(4)}ms`,
    `  99th percentile: ${result.percentile99.toFixed(4)}ms`,
    `  Ops/sec: ${result.opsPerSecond.toFixed(2)}`,
  ];

  if (result.memoryDelta !== undefined) {
    lines.push(`  Memory delta: ${(result.memoryDelta / 1024 / 1024).toFixed(2)}MB`);
  }

  return lines.join("\n");
}

/**
 * Compare multiple benchmark results and format as a table.
 */
export function formatBenchmarkComparison(results: BenchmarkResult[]): string {
  if (results.length === 0) {
    return "No benchmark results to compare.";
  }

  const baseline = results[0]!;
  const lines = ["Benchmark Comparison", "===================", ""];

  for (const result of results) {
    const relativeAvg =
      baseline.avgTime > 0 ? ((result.avgTime - baseline.avgTime) / baseline.avgTime) * 100 : 0;
    const relativeOps =
      baseline.opsPerSecond > 0
        ? ((result.opsPerSecond - baseline.opsPerSecond) / baseline.opsPerSecond) * 100
        : 0;

    lines.push(
      `${result.name}:`,
      `  Avg: ${result.avgTime.toFixed(4)}ms (${relativeAvg >= 0 ? "+" : ""}${relativeAvg.toFixed(1)}%)`,
      `  Ops/sec: ${result.opsPerSecond.toFixed(2)} (${relativeOps >= 0 ? "+" : ""}${relativeOps.toFixed(1)}%)`,
      ""
    );
  }

  return lines.join("\n");
}
