'use client';

import { useCurrency } from './CurrencyProvider';

const CURRENCIES = [
  ['ZAR','ZAR — South African Rand'],['USD','USD — US Dollar'],['EUR','EUR — Euro'],
  ['GBP','GBP — British Pound'],['NGN','NGN — Nigerian Naira'],['KES','KES — Kenyan Shilling'],
  ['GHS','GHS — Ghanaian Cedi'],['BWP','BWP — Botswana Pula'],['ZMW','ZMW — Zambian Kwacha'],
  ['AUD','AUD — Australian Dollar'],['CAD','CAD — Canadian Dollar'],
];

export default function GlobalCurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  return (
    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
      <span>Currency</span>
      <select value={currency} onChange={e => void setCurrency(e.target.value)}
        className="px-2 py-1 rounded-lg text-xs"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
        {CURRENCIES.map(([code,label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
}