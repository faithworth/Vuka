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
  custom_str1?: string; // beatId or releaseId
  custom_str2?: string; // itemType
  custom_str3?: string; // licenseType
}

export function buildPayFastForm(data: PayFastData, passphrase: string) {
  const ordered: Record<string, string> = {
    merchant_id: data.merchant_id,
    merchant_key: data.merchant_key,
    return_url: data.return_url,
    cancel_url: data.cancel_url,
    notify_url: data.notify_url,
    name_first: data.name_first,
    email_address: data.email_address,
    m_payment_id: data.m_payment_id,
    amount: data.amount,
    item_name: data.item_name,
  };
  if (data.item_description) ordered.item_description = data.item_description;
  if (data.custom_str1) ordered.custom_str1 = data.custom_str1;
  if (data.custom_str2) ordered.custom_str2 = data.custom_str2;
  if (data.custom_str3) ordered.custom_str3 = data.custom_str3;

  const queryString =
    Object.entries(ordered)
      .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`)
      .join('&') + (passphrase ? `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : '');

  const signature = crypto.createHash('md5').update(queryString).digest('hex');
  return { ...ordered, signature };
}

export function validatePayFastITN(data: Record<string, string>, passphrase: string): boolean {
  const received = data.signature;
  const copy = { ...data };
  delete copy.signature;
  const str =
    Object.entries(copy)
      .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`)
      .join('&') + (passphrase ? `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}` : '');
  const expected = crypto.createHash('md5').update(str).digest('hex');
  return received === expected;
}

// PayFast sandbox/live IPs
export const PAYFAST_IPS = [
  '197.97.145.144','197.97.145.145','197.97.145.146','197.97.145.147',
  '41.74.179.194','41.74.179.195','41.74.179.196','41.74.179.197',
  '::1','127.0.0.1', // for testing
];
