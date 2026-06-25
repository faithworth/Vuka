/**
 * VUKA — PayPal REST API v2 Integration
 *
 * Handles international payments and payouts for non-SA artists, producers,
 * and buyers. ZAR artists use Paystack; everyone else uses PayPal (USD).
 *
 * Covers:
 *   - OAuth2 access token management (auto-refresh, in-memory cache)
 *   - Order create → capture flow (buyers paying for beats/releases)
 *   - Payouts API (paying international artists their earnings in USD)
 *   - Webhook signature verification (PayPal webhook-ID-based)
 *   - Refunds
 *   - Idempotency on every mutating call
 *
 * FX conversion is handled by @/lib/fx — live rates, no hardcoded values.
 *
 * Environment:
 *   PAYPAL_CLIENT_ID       — App client ID (required in production)
 *   PAYPAL_CLIENT_SECRET   — App secret   (required in production)
 *   PAYPAL_WEBHOOK_ID      — Webhook ID from developer dashboard
 *   PAYPAL_SANDBOX         — "true" → sandbox.paypal.com
 */

const CLIENT_ID     = process.env.PAYPAL_CLIENT_ID     ?? '';
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? '';
const SANDBOX       = process.env.PAYPAL_SANDBOX === 'true';
export const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID ?? '';

export const PAYPAL_BASE_URL = SANDBOX
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

// ── Token cache ───────────────────────────────────────────────────────────

let _token:           string | null = null;
let _tokenExpiresAt:  number        = 0;

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt - 30_000) return _token;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('[PayPal] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set');
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new PayPalError(res.status, body, '/v1/oauth2/token');
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  _token           = data.access_token;
  _tokenExpiresAt  = Date.now() + data.expires_in * 1000;
  return _token;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────

interface RequestOpts {
  method:           'GET' | 'POST' | 'PATCH' | 'DELETE';
  path:             string;
  body?:            unknown;
  idempotencyKey?:  string;
}

async function paypalRequest<T = unknown>(opts: RequestOpts): Promise<T> {
  const token   = await getAccessToken();
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
    'Prefer':        'return=representation',
  };
  if (opts.idempotencyKey) headers['PayPal-Request-Id'] = opts.idempotencyKey;

  const res  = await fetch(`${PAYPAL_BASE_URL}${opts.path}`, {
    method:  opts.method,
    headers,
    body:    opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new PayPalError(res.status, text, opts.path);
  if (!text)   return {} as T;

  try   { return JSON.parse(text) as T; }
  catch { return text as unknown as T;  }
}

// ── Error class ───────────────────────────────────────────────────────────

export class PayPalError extends Error {
  status: number;
  raw:    string;
  path:   string;

  constructor(status: number, raw: string, path: string) {
    let detail = raw;
    try {
      const p = JSON.parse(raw);
      detail  = p?.message ?? p?.error_description ?? raw;
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
  currency_code: string;
  value:         string;  // string decimal e.g. "12.50"
}

export interface PayPalOrder {
  id:     string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links:  { href: string; rel: string; method: string }[];
}

export interface PayPalCaptureResult {
  id:     string;
  status: string;
  purchase_units: {
    reference_id: string;
    payments: {
      captures: {
        id:     string;
        status: string;
        amount: PayPalMoney;
        seller_receivable_breakdown?: {
          gross_amount: PayPalMoney;
          paypal_fee:   PayPalMoney;
          net_amount:   PayPalMoney;
        };
        final_capture: boolean;
        create_time:   string;
        update_time:   string;
      }[];
    };
  }[];
  payer?: {
    name?:          { given_name: string; surname: string };
    email_address?: string;
    payer_id?:      string;
  };
}

// ── Orders API ────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  amountUSD:    number;
  items:        { name: string; description?: string; amountUSD: number; quantity?: number }[];
  returnUrl:    string;
  cancelUrl:    string;
  reference:    string;
  buyerEmail?:  string;
}

const orders = {
  async create(input: CreateOrderInput, idempotencyKey: string): Promise<PayPalOrder> {
    const totalStr  = input.amountUSD.toFixed(2);
    const lineItems = input.items.map((item) => ({
      name:        item.name.slice(0, 127),
      description: item.description?.slice(0, 127),
      quantity:    String(item.quantity ?? 1),
      unit_amount: { currency_code: 'USD', value: item.amountUSD.toFixed(2) },
      category:    'DIGITAL_GOODS',
    }));

    return paypalRequest<PayPalOrder>({
      method:          'POST',
      path:            '/v2/checkout/orders',
      idempotencyKey,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id:  input.reference,
          description:   `Vuka Music — Ref: ${input.reference}`,
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

  async capture(orderId: string, idempotencyKey: string): Promise<PayPalCaptureResult> {
    return paypalRequest<PayPalCaptureResult>({
      method:          'POST',
      path:            `/v2/checkout/orders/${orderId}/capture`,
      idempotencyKey,
      body:            {},
    });
  },

  async get(orderId: string): Promise<PayPalOrder & Record<string, unknown>> {
    return paypalRequest({ method: 'GET', path: `/v2/checkout/orders/${orderId}` });
  },
};

// ── Payouts API ───────────────────────────────────────────────────────────

export interface PayoutRecipient {
  email:        string;
  amountUSD:    number;
  note:         string;
  senderItemId: string;
}

export interface PayoutBatchResult {
  batch_header: {
    payout_batch_id: string;
    batch_status:    string;
    time_created:    string;
  };
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
  items: {
    payout_item_id:     string;
    transaction_id?:    string;
    transaction_status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNCLAIMED' | 'RETURNED' | 'ONHOLD' | 'BLOCKED' | 'REFUNDED' | 'REVERSED';
    payout_item: {
      recipient_type: string;
      amount:         PayPalMoney;
      note:           string;
      receiver:       string;
      sender_item_id: string;
    };
    errors?: { name: string; message: string }[];
  }[];
}

const payouts = {
  async send(recipients: PayoutRecipient[], idempotencyKey: string): Promise<PayoutBatchResult> {
    return paypalRequest<PayoutBatchResult>({
      method:          'POST',
      path:            '/v1/payments/payouts',
      idempotencyKey,
      body: {
        sender_batch_header: {
          sender_batch_id: idempotencyKey,
          email_subject:   'Your Vuka Music payout has arrived',
          email_message:   'Your earnings from Vuka Music have been transferred to your PayPal account.',
        },
        items: recipients.map((r) => ({
          recipient_type: 'EMAIL',
          amount:         { value: r.amountUSD.toFixed(2), currency: 'USD' },
          note:           r.note.slice(0, 4000),
          sender_item_id: r.senderItemId,
          receiver:       r.email,
        })),
      },
    });
  },

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
  async issue(
    captureId:       string,
    amountUSD?:      number,
    idempotencyKey?: string,
    note?:           string,
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

export async function verifyWebhookSignature(params: {
  transmissionId:   string;
  transmissionTime: string;
  certUrl:          string;
  authAlgo:         string;
  transmissionSig:  string;
  webhookId:        string;
  webhookEvent:     unknown;
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

export function isPayPalConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

export function getApproveUrl(order: PayPalOrder): string | null {
  return order.links.find((l) => l.rel === 'payer-action')?.href
      ?? order.links.find((l) => l.rel === 'approve')?.href
      ?? null;
}

// ── Named exports ─────────────────────────────────────────────────────────

const paypal = { orders, payouts, refunds };
export default paypal;
export { paypal };
