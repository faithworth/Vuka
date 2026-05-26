import crypto from 'crypto';

export interface PayFastData {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  name_first: string;
  name_last?: string;
  email_address: string;
  cell_number?: string;
  m_payment_id: string;
  amount: string;
  item_name: string;
  item_description?: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  custom_str4?: string;
  custom_str5?: string;
  email_confirmation?: string;
  confirmation_address?: string;
}

/**
 * Build the PayFast form fields including MD5 signature.
 * Strictly follows PayFast's PHP urlencode() field ordering requirements.
 */
export function buildPayFastForm(data: PayFastData, passphrase: string) {
  // Only include non-empty fields in exact PayFast-required order
  const fieldOrder = [
    'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
    'name_first', 'name_last', 'email_address', 'cell_number',
    'm_payment_id', 'amount', 'item_name', 'item_description',
    'custom_str1', 'custom_str2', 'custom_str3', 'custom_str4', 'custom_str5',
    'email_confirmation', 'confirmation_address',
  ];

  const ordered: [string, string][] = [];
  for (const field of fieldOrder) {
    const val = (data as any)[field];
    if (val !== undefined && val !== null && val !== '') {
      ordered.push([field, String(val)]);
    }
  }

  // PayFast: encode like PHP urlencode — space = +, specific chars encoded
  const pfEncode = (v: string) =>
    encodeURIComponent(v)
      .replace(/%20/g, '+')
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');

  const parts = ordered.map(([k, v]) => `${k}=${pfEncode(v)}`);
  if (passphrase) parts.push(`passphrase=${pfEncode(passphrase)}`);

  const signature = crypto
    .createHash('md5')
    .update(parts.join('&'))
    .digest('hex');

  return Object.fromEntries([...ordered, ['signature', signature]]);
}

export function validatePayFastITN(data: Record<string, string>, passphrase: string): boolean {
  const received = data.signature;
  const copy = { ...data };
  delete copy.signature;
  const pfEncode = (v: string) =>
    encodeURIComponent(v)
      .replace(/%20/g, '+')
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  const str =
    Object.entries(copy)
      .map(([k, v]) => `${k}=${pfEncode(v)}`)
      .join('&') +
    (passphrase ? `&passphrase=${pfEncode(passphrase)}` : '');
  const expected = crypto.createHash('md5').update(str).digest('hex');
  return received === expected;
}

export const PAYFAST_IPS = [
  '197.97.145.144', '197.97.145.145', '197.97.145.146', '197.97.145.147',
  '41.74.179.194', '41.74.179.195', '41.74.179.196', '41.74.179.197',
  '::1', '127.0.0.1',
];
