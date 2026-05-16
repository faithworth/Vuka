import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(new Date(date));
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getTierFromAmount(amount: number, currency = 'ZAR') {
  const inZar = currency === 'ZAR' ? amount : amount * 18;
  if (inZar >= 500) return 'Ride or Die';
  if (inZar >= 200) return 'Day One';
  if (inZar >= 50) return 'Supporter';
  return 'Listener';
}

export function generateWaveformFallback(seed = 1, bars = 60) {
  const arr: number[] = [];
  for (let i = 0; i < bars; i++) {
    const v = Math.abs(Math.sin((i + seed) * 0.4) * 0.6 + Math.sin((i + seed) * 1.2) * 0.4);
    arr.push(Math.max(0.1, Math.min(1, v)));
  }
  return arr;
}

// Simple cuid-like unique ID generator
export function cuid(): string {
  return 'c' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
