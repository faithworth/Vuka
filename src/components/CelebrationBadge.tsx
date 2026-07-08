'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import VukaCelebration from '@/components/brand/VukaCelebration';

const DISMISS_KEY = 'vuka:celebration-badge-dismissed-until';
const DISMISS_DAYS = 3;

/**
 * A small, ambient "someone just bought a record on Vuka" moment that floats
 * in the corner of every page — logged in or out. Purely decorative/brand
 * flavour, never blocks content, and remembers if the person dismissed it.
 */
export default function CelebrationBadge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (until && Date.now() < Number(until)) return;
    } catch {
      // localStorage unavailable — just show it
    }
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="vuka-cel-badge-wrap"
      style={{
        position: 'fixed',
        left: 14,
        bottom: 14,
        zIndex: 40,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px 6px 6px',
          borderRadius: 9999,
          background: 'rgba(17,17,17,0.9)',
          border: '1px solid rgba(160,232,124,0.25)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4), 0 0 24px rgba(160,232,124,0.08)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#A0A0A0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <X size={11} />
        </button>

        <Link href="/store" aria-label="Browse the Vuka store" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VukaCelebration variant="badge" size={52} />
          <span style={{ fontSize: 11, lineHeight: 1.25, color: '#F5F5F5', maxWidth: 108 }}>
            <strong style={{ color: '#A0E87C' }}>Someone just rose 🎉</strong>
            <br />
            <span style={{ color: '#A0A0A0' }}>bought a record on Vuka</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
