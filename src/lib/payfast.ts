import crypto from 'crypto';

export interface PayFastData {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  name_first: string;
  email_address: string;
  m_payment_id: string;
  amount: string;
  item_name: string;
  item_description?: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
}

/**
 * Build the PayFast form fields including MD5 signature.
 * PayFast signature: URL-encode each value, join as query string,
 * append passphrase if set, MD5 hash the result.
 */
export function buildPayFastForm(data: PayFastData, passphrase: string) {
  const ordered: Record<string, string> = {};

  // Field order matters for PayFast signature
  const fieldOrder = [
    'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
    'name_first', 'email_address', 'm_payment_id', 'amount', 'item_name',
    'item_description', 'custom_str1', 'custom_str2', 'custom_str3',
  ];

  for (const field of fieldOrder) {
    const val = (data as any)[field];
    if (val !== undefined && val !== null && val !== '') {
      ordered[field] = val;
    }
  }

  // PayFast signature: encode like a query string, MD5 it
  const sigString =
    Object.entries(ordered)
      .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`)
      .join('&') +
    (passphrase ? `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : '');

  const signature = crypto.createHash('md5').update(sigString).digest('hex');
  return { ...ordered, signature };
}

export function validatePayFastITN(data: Record<string, string>, passphrase: string): boolean {
  const received = data.signature;
  const copy = { ...data };
  delete copy.signature;
  const str =
    Object.entries(copy)
      .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`)
      .join('&') +
    (passphrase ? `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : '');
  const expected = crypto.createHash('md5').update(str).digest('hex');
  return received === expected;
}

export const PAYFAST_IPS = [
  '197.97.145.144', '197.97.145.145', '197.97.145.146', '197.97.145.147',
  '41.74.179.194', '41.74.179.195', '41.74.179.196', '41.74.179.197',
  '::1', '127.0.0.1',
];
