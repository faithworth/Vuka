import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Merch — Vuka Music',
  description: 'Shop exclusive merch from independent artists on Vuka Music.',
};

export default function StoreMerchPage() {
  return <StorePage defaultFilter="merch" />;
}
