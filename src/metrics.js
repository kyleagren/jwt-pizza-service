const os = require('os');
const config = require('./config');

const REPORT_INTERVAL_MS = 10000;
const ACTIVE_USER_TIMEOUT_MS = 5 * 60 * 1000;

// ---- Cumulative counters (never reset; use rate() in Grafana for per-minute) ----
const requestsByMethod = {};
const authAttempts = { success: 0, failure: 0 };
const pizza = { sold: 0, failures: 0, revenue: 0 };

// ---- Latency samples (reset every report so each report is an interval average) ----
let requestLatency = { total: 0, count: 0 };
let pizzaLatency = { total: 0, count: 0 };

// ---- Active users: email -> last time we saw them ----
const activeUsers = new Map();

// Express middleware. Register it AFTER setAuthUser so req.user is populated.
function requestTracker(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const path = req.path; // capture now; routers rewrite req.url while handling

  res.on('finish', () => {
    requestsByMethod[method] = (requestsByMethod[method] || 0) + 1;
    requestLatency.total += Date.now() - start;
    requestLatency.count++;

    // Any authenticated request keeps that user active
    if (req.user?.email) {
      activeUsers.set(req.user.email, Date.now());
    }

    if (path === '/api/auth') {
      trackAuth(method, req, res);
    }
  });

  next();
}

function trackAuth(method, req, res) {
  const success = res.statusCode < 400;

  // PUT = login, POST = register
  if (method === 'PUT' || method === 'POST') {
    authAttempts[success ? 'success' : 'failure']++;
    if (success && req.body?.email) {
      activeUsers.set(req.body.email, Date.now());
    }
  }

  // DELETE = logout
  if (method === 'DELETE' && success && req.user?.email) {
    activeUsers.delete(req.user.email);
  }
}

// Call from the order router after the factory responds
function pizzaPurchase(success, latencyMs, price, count) {
  if (success) {
    pizza.sold += count;
    pizza.revenue += price;
  } else {
    pizza.failures++;
  }
  pizzaLatency.total += latencyMs;
  pizzaLatency.count++;
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

function expireInactiveUsers() {
  const now = Date.now();
  for (const [email, lastSeen] of activeUsers) {
    if (now - lastSeen > ACTIVE_USER_TIMEOUT_MS) {
      activeUsers.delete(email);
    }
  }
}

function buildMetrics() {
  const metrics = [];

  // HTTP requests by method
  Object.entries(requestsByMethod).forEach(([method, count]) => {
    metrics.push(
      createMetric('http_requests', count, '1', 'sum', 'asInt', { method }),
    );
  });

  // Auth attempts
  metrics.push(
    createMetric('auth_attempts', authAttempts.success, '1', 'sum', 'asInt', {
      status: 'success',
    }),
  );
  metrics.push(
    createMetric('auth_attempts', authAttempts.failure, '1', 'sum', 'asInt', {
      status: 'failure',
    }),
  );

  // Active users
  expireInactiveUsers();
  metrics.push(
    createMetric('active_users', activeUsers.size, '', 'gauge', 'asInt', {}),
  );

  // System
  metrics.push(
    createMetric(
      'cpu_usage',
      getCpuUsagePercentage(),
      '%',
      'gauge',
      'asDouble',
      {},
    ),
  );
  metrics.push(
    createMetric(
      'memory_usage',
      getMemoryUsagePercentage(),
      '%',
      'gauge',
      'asDouble',
      {},
    ),
  );

  // Pizzas
  metrics.push(
    createMetric('pizzas_sold', pizza.sold, '1', 'sum', 'asInt', {}),
  );
  metrics.push(
    createMetric('pizza_failures', pizza.failures, '1', 'sum', 'asInt', {}),
  );
  metrics.push(
    createMetric('pizza_revenue', pizza.revenue, '1', 'sum', 'asDouble', {}),
  );

  // Latency (average over the interval; skipped when there were no samples)
  if (requestLatency.count > 0) {
    metrics.push(
      createMetric(
        'request_latency',
        requestLatency.total / requestLatency.count,
        'ms',
        'gauge',
        'asDouble',
        {},
      ),
    );
  }
  if (pizzaLatency.count > 0) {
    metrics.push(
      createMetric(
        'pizza_latency',
        pizzaLatency.total / pizzaLatency.count,
        'ms',
        'gauge',
        'asDouble',
        {},
      ),
    );
  }
  requestLatency = { total: 0, count: 0 };
  pizzaLatency = { total: 0, count: 0 };

  return metrics;
}

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes,
) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: Object.entries(attributes).map(([key, value]) => ({
            key,
            value: { stringValue: String(value) },
          })),
        },
      ],
    },
  };

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality =
      'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricsToGrafana(metrics) {
  const body = {
    resourceMetrics: [{ scopeMetrics: [{ metrics }] }],
  };

  fetch(config.metrics.endpointUrl, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error.message);
    });
}

function sendMetricsPeriodically(period) {
  const timer = setInterval(() => {
    try {
      sendMetricsToGrafana(buildMetrics());
    } catch (error) {
      console.error('Error building metrics:', error);
    }
  }, period);
  timer.unref(); // don't keep the process (or Jest) alive just for metrics
}

if (config.metrics?.endpointUrl) {
  sendMetricsPeriodically(REPORT_INTERVAL_MS);
}

module.exports = { requestTracker, pizzaPurchase };
