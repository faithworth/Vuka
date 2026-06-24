import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Merch — Vuka',
  description: 'Shop exclusive merch from independent artists on Vuka.',
};

export default function StoreMerchPage() {
  return <StorePage defaultFilter="merch" />;
}
