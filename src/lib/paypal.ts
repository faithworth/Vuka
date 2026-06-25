/**
 * VUKA — PayPal REST API v2 Integration
 *
 * Handles international payments and payouts for non-SA artists, producers,
 * and buyers. ZAR artists use Paystack; everyone else can use PayPal (USD).
 *
 * Covers:
 *   - OAuth2 access token management (auto-refresh, cached in memory)
 *   - Order create → capture flow (buyers paying for beats/releases)
 *   - Payouts API (paying international artists their earnings in USD)
 *   - Webhook signature verification (PayPal webhook ID-based)
 *   - Refunds
 *   - Idempotency on every mutating call
 *
 * Environment:
 *   PAYPAL_CLIENT_ID       — App client ID (required in production)
 *   PAYPAL_CLIENT_SECRET   — App secret (required in production)
 *   PAYPAL_SANDBOX         — "true" → sandbox.paypal.com, omit for live
 *   PAYPAL_WEBHOOK_ID      — Webhook ID from PayPal developer dashboard
 *
 * Usage:
 *   import paypal from '@/lib/paypal';
 *   const order = await paypal.orders.create({ ... });
 *   const capture = await paypal.orders.capture(orderId);
 */

const CLIENT_ID     = process.env.PAYPAL_CLIENT_ID!;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET!;
const SANDBOX       = process.env.PAYPAL_SANDBOX === 'true';
const WEBHOOK_ID    = process.env.PAYPAL_WEBHOOK_ID ?? '';

const BASE_URL = SANDBOX
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

// ── Token cache (in-process, resets on cold start) ────────────────────────
let _token: string | null = null;
let _tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt - 30_000) return _token;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('[PayPal] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set');
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[PayPal] Token request failed ${res.status}: ${body}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  _token = data.access_token;
  _tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return _token;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────

interface PayPalRequestOptions {
  method:        'GET' | 'POST' | 'PATCH' | 'DELETE';
  path:          string;
  body?:         unknown;
  idempotencyKey?: string;
}

async function paypalRequest<T = unknown>(opts: PayPalRequestOptions): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
    'Prefer':        'return=representation',
  };

  if (opts.idempotencyKey) {
    headers['PayPal-Request-Id'] = opts.idempotencyKey;
  }

  const res = await fetch(`${BASE_URL}${opts.path}`, {
    method:  opts.method,
    headers,
    body:    opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new PayPalError(res.status, text, opts.path);
  }

  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export class PayPalError extends Error {
  status:  number;
  raw:     string;
  path:    string;

  constructor(status: number, raw: string, path: string) {
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.message ?? parsed?.error_description ?? raw;
    } catch { /* keep raw */ }
    super(`[PayPal] ${status} ${path}: ${detail}`);
    this.name   = 'PayPalError';
    this.status = status;
    this.raw    = raw;
    this.path   = path;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface PayPalMoney {
  currency_code: string;  // ISO-4217, e.g. 'USD'
  value:         string;  // String decimal, e.g. '12.50'
}

export interface PayPalOrderItem {
  name:        string;    // Max 127 chars
  description?: string;  // Max 127 chars
  quantity:    string;    // Integer as string
  unit_amount: PayPalMoney;
  category:    'DIGITAL_GOODS' | 'PHYSICAL_GOODS' | 'DONATION';
}

export interface CreateOrderInput {
  /** Amount in USD (we always charge in USD for international buyers) */
  amountUSD:       number;
  /** Items in the cart — for PayPal's purchase unit line items */
  items:           PayPalOrderInput[];
  /** Return URL after PayPal approval (used for redirect flow fallback) */
  returnUrl:       string;
  /** Cancel URL */
  cancelUrl:       string;
  /** Internal reference (stored on order for webhook correlation) */
  reference:       string;
  /** Buyer email (pre-fills PayPal login) */
  buyerEmail?:     string;
}

export interface PayPalOrderInput {
  name:        string;
  description?: string;
  amountUSD:   number;
  quantity?:   number;
}

export interface PayPalOrder {
  id:     string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links:  Array<{ href: string; rel: string; method: string }>;
  purchase_units?: unknown[];
}

export interface PayPalCaptureResult {
  id:     string;
  status: string;
  purchase_units: Array<{
    reference_id: string;
    payments: {
      captures: Array<{
        id:              string;
        status:          string;
        amount:          PayPalMoney;
        seller_receivable_breakdown?: {
          gross_amount:        PayPalMoney;
          paypal_fee:          PayPalMoney;
          net_amount:          PayPalMoney;
        };
        final_capture: boolean;
        create_time:   string;
        update_time:   string;
      }>;
    };
  }>;
  payer?: {
    name?:          { given_name: string; surname: string };
    email_address?: string;
    payer_id?:      string;
  };
}

// ── Orders API ────────────────────────────────────────────────────────────

const orders = {
  /**
   * Create a PayPal order (step 1 of the buyer flow).
   * Returns an order ID + approve URL to redirect the buyer to.
   */
  async create(input: CreateOrderInput, idempotencyKey: string): Promise<PayPalOrder> {
    const totalStr = input.amountUSD.toFixed(2);

    const lineItems: PayPalOrderItem[] = input.items.map((item) => ({
      name:        item.name.slice(0, 127),
      description: item.description?.slice(0, 127),
      quantity:    String(item.quantity ?? 1),
      unit_amount: { currency_code: 'USD', value: item.amountUSD.toFixed(2) },
      category:    'DIGITAL_GOODS',
    }));

    return paypalRequest<PayPalOrder>({
      method: 'POST',
      path:   '/v2/checkout/orders',
      idempotencyKey,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id:  input.reference,
          description:   `Vuka Music Purchase — Ref: ${input.reference}`,
          amount: {
            currency_code: 'USD',
            value:         totalStr,
            breakdown: {
              item_total: { currency_code: 'USD', value: totalStr },
            },
          },
          items: lineItems,
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name:          'Vuka Music',
              locale:              'en-ZA',
              landing_page:        'LOGIN',
              shipping_preference: 'NO_SHIPPING',
              user_action:         'PAY_NOW',
              return_url:          input.returnUrl,
              cancel_url:          input.cancelUrl,
            },
            ...(input.buyerEmail ? { email_address: input.buyerEmail } : {}),
          },
        },
      },
    });
  },

  /**
   * Capture an approved order (step 2 — call after buyer approves).
   */
  async capture(orderId: string, idempotencyKey: string): Promise<PayPalCaptureResult> {
    return paypalRequest<PayPalCaptureResult>({
      method:          'POST',
      path:            `/v2/checkout/orders/${orderId}/capture`,
      idempotencyKey,
      body:            {},
    });
  },

  /**
   * Fetch order details (for webhook correlation / status checks).
   */
  async get(orderId: string): Promise<PayPalOrder & Record<string, unknown>> {
    return paypalRequest({
      method: 'GET',
      path:   `/v2/checkout/orders/${orderId}`,
    });
  },
};

// ── Payouts API ───────────────────────────────────────────────────────────

export interface PayoutRecipient {
  /** PayPal email of the artist/producer receiving the payout */
  email:       string;
  /** Amount in USD */
  amountUSD:   number;
  /** Internal note (visible to recipient) */
  note:        string;
  /** Your internal reference ID for this payout item */
  senderItemId: string;
}

export interface PayoutBatchResult {
  batch_header: {
    payout_batch_id: string;
    batch_status:    string;
    time_created:    string;
  };
  links: Array<{ href: string; rel: string; method: string }>;
}

export interface PayoutBatchStatus {
  batch_header: {
    payout_batch_id: string;
    batch_status:    'DENIED' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'CANCELED';
    amount:          PayPalMoney;
    fees:            PayPalMoney;
    time_created:    string;
    time_completed?: string;
  };
  items: Array<{
    payout_item_id:   string;
    transaction_id?:  string;
    transaction_status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNCLAIMED' | 'RETURNED' | 'ONHOLD' | 'BLOCKED' | 'REFUNDED' | 'REVERSED';
    payout_item: {
      recipient_type: string;
      amount:         PayPalMoney;
      note:           string;
      receiver:       string;
      sender_item_id: string;
    };
    errors?: { name: string; message: string }[];
  }>;
}

const payouts = {
  /**
   * Send payouts to one or more international artists/producers.
   * Uses PayPal Payouts API (requires approved Payouts access in your app).
   *
   * Vuka keeps its platform fee before calling this — only artist net is sent.
   */
  async send(
    recipients: PayoutRecipient[],
    idempotencyKey: string,
  ): Promise<PayoutBatchResult> {
    const items = recipients.map((r) => ({
      recipient_type: 'EMAIL',
      amount: {
        value:         r.amountUSD.toFixed(2),
        currency:      'USD',
      },
      note:           r.note.slice(0, 4000),
      sender_item_id: r.senderItemId,
      receiver:       r.email,
    }));

    return paypalRequest<PayoutBatchResult>({
      method: 'POST',
      path:   '/v1/payments/payouts',
      idempotencyKey,
      body: {
        sender_batch_header: {
          sender_batch_id: idempotencyKey,
          email_subject:   'Your Vuka Music payout has arrived',
          email_message:   'Your earnings from Vuka Music have been sent to your PayPal account.',
        },
        items,
      },
    });
  },

  /**
   * Check the status of a previously sent payout batch.
   */
  async getBatchStatus(batchId: string): Promise<PayoutBatchStatus> {
    return paypalRequest<PayoutBatchStatus>({
      method: 'GET',
      path:   `/v1/payments/payouts/${batchId}`,
    });
  },
};

// ── Refunds API ───────────────────────────────────────────────────────────

export interface RefundResult {
  id:     string;
  status: 'CANCELLED' | 'PENDING' | 'COMPLETED';
  amount: PayPalMoney;
}

const refunds = {
  /**
   * Refund a captured payment.
   * captureId comes from PayPalCaptureResult.purchase_units[0].payments.captures[0].id
   */
  async issue(
    captureId:      string,
    amountUSD?:     number,   // omit for full refund
    idempotencyKey?: string,
    note?:          string,
  ): Promise<RefundResult> {
    return paypalRequest<RefundResult>({
      method:          'POST',
      path:            `/v2/payments/captures/${captureId}/refund`,
      idempotencyKey,
      body: {
        ...(amountUSD ? { amount: { value: amountUSD.toFixed(2), currency_code: 'USD' } } : {}),
        ...(note       ? { note_to_payer: note.slice(0, 255) } : {}),
      },
    });
  },
};

// ── Webhook verification ──────────────────────────────────────────────────

/**
 * Verify a PayPal webhook event using PayPal's /v1/notifications/verify-webhook-signature API.
 * This is the correct approach — PayPal doesn't use HMAC like Paystack.
 *
 * Pass all the headers PayPal sends exactly as received.
 */
export async function verifyWebhookSignature(params: {
  transmissionId:   string;  // paypal-transmission-id header
  transmissionTime: string;  // paypal-transmission-time header
  certUrl:          string;  // paypal-cert-url header
  authAlgo:         string;  // paypal-auth-algo header
  transmissionSig:  string;  // paypal-transmission-sig header
  webhookId:        string;  // your registered webhook ID from dashboard
  webhookEvent:     unknown; // the raw parsed JSON body
}): Promise<boolean> {
  try {
    const res = await paypalRequest<{ verification_status: 'SUCCESS' | 'FAILURE' }>({
      method: 'POST',
      path:   '/v1/notifications/verify-webhook-signature',
      body: {
        transmission_id:   params.transmissionId,
        transmission_time: params.transmissionTime,
        cert_url:          params.certUrl,
        auth_algo:         params.authAlgo,
        transmission_sig:  params.transmissionSig,
        webhook_id:        params.webhookId,
        webhook_event:     params.webhookEvent,
      },
    });
    return res.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Convert ZAR to USD using a hardcoded conservative rate.
 * In production, replace with a live FX API call (e.g. Open Exchange Rates).
 *
 * We store the rate used at time of purchase on the Purchase row so there's
 * no ambiguity on refunds.
 */
export function zarToUsd(zarAmount: number, rate = 0.054): number {
  // Default: 1 ZAR ≈ 0.054 USD (≈ R18.50/USD) — update regularly
  return Math.round(zarAmount * rate * 100) / 100;
}

/**
 * True if PayPal is configured and available.
 * Use this to conditionally show the PayPal payment option.
 */
export function isPayPalConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

/**
 * Get the PayPal approve URL from a created order's links array.
 */
export function getApproveUrl(order: PayPalOrder): string | null {
  return order.links.find((l) => l.rel === 'papprove')?.href
      ?? order.links.find((l) => l.rel === 'approve')?.href
      ?? null;
}

// ── Named export ─────────────────────────────────────────────────────────

const paypal = { orders, payouts, refunds };
export default paypal;
export { paypal, WEBHOOK_ID as PAYPAL_WEBHOOK_ID, BASE_URL as PAYPAL_BASE_URL };
