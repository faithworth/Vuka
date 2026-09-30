'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { formatCurrency as baseFormatCurrency } from '@/lib/utils';

type CurrencyContextValue = {
  currency: string;
  rates: Record<string, number>;
  setCurrency: (currency: string) => Promise<void>;
  formatCurrency: (amountZar: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const SUPPORTED = ['ZAR','USD','EUR','GBP','NGN','KES','GHS','BWP','ZMW','AUD','CAD'];

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState('ZAR');
  const [rates, setRates] = useState<Record<string, number>>({ ZAR: 1 });

  useEffect(() => {
    const local = window.localStorage.getItem('vuka_currency');
    if (local && SUPPORTED.includes(local)) setCurrencyState(local);
    Promise.all([
      fetch('/api/currency/rates', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      fetch('/api/preferences', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ]).then(([fx, pref]) => {
      if (fx?.rates) setRates(fx.rates);
      if (pref?.currency && SUPPORTED.includes(pref.currency)) setCurrencyState(pref.currency);
    }).catch(() => {});
  }, []);

  async function setCurrency(currency: string) {
    const next = SUPPORTED.includes(currency) ? currency : 'ZAR';
    setCurrencyState(next);
    window.localStorage.setItem('vuka_currency', next);
    document.cookie = `vuka_currency=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: next }),
      });
      // Guests are intentionally local-only; authenticated users persist server-side.
      if (!res.ok && res.status !== 401) console.warn('[currency] preference save failed');
    } catch {}
  }

  const value = useMemo(() => ({
    currency,
    rates,
    setCurrency,
    formatCurrency: (amountZar: number) => baseFormatCurrency(
      currency === 'ZAR' ? amountZar : Math.round(amountZar * (rates[currency] ?? 1) * 100) / 100,
      currency,
    ),
  }), [currency, rates]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const value = useContext(CurrencyContext);
  if (!value) throw new Error('useCurrency must be used inside CurrencyProvider');
  return value;
}
