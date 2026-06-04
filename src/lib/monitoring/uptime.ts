/**
 * VUKA — Better Uptime Heartbeat Monitor
 * Phase 11 — Infrastructure & Deployment
 *
 * Sends heartbeat pings to Better Uptime monitors.
 * Call pingHeartbeat() from cron jobs and critical health endpoints.
 *
 * Setup:
 *   1. Create a Heartbeat monitor at https://betteruptime.com
 *   2. Set BETTER_UPTIME_API_KEY in environment
 *   3. Get your heartbeat URL from the monitor config
 *   4. Set BETTER_UPTIME_HEARTBEAT_URL in environment
 */

export async function pingHeartbeat(monitorName = 'default'): Promise<void> {
  const heartbeatUrl = process.env.BETTER_UPTIME_HEARTBEAT_URL;
  if (!heartbeatUrl) return;

  fetch(heartbeatUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'vuka-heartbeat/1.0' },
  }).catch(() => {
    // Non-critical — never block
  });
}

/**
 * Create or update a monitor via Better Uptime API.
 * Useful for registering new API endpoints as monitors programmatically.
 */
export async function createMonitor(params: {
  url: string;
  monitorType?: 'status' | 'expected_status_code' | 'keyword' | 'keyword_absence';
  expectedStatusCode?: number;
  keyword?: string;
  checkFrequency?: number; // seconds
  regions?: string[];
}): Promise<void> {
  const apiKey = process.env.BETTER_UPTIME_API_KEY;
  if (!apiKey) return;

  fetch('https://betteruptime.com/api/v2/monitors', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: params.url,
      monitor_type: params.monitorType ?? 'status',
      expected_status_codes: params.expectedStatusCode ? [params.expectedStatusCode] : [200],
      required_keyword: params.keyword,
      check_frequency: params.checkFrequency ?? 180,
      regions: params.regions ?? ['eu', 'us', 'as'],
    }),
  }).catch(() => {});
}
