import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Buy Sample Packs — Vuka Music',
  description: 'Browse and buy sample packs and loops from independent producers on Vuka Music.',
};

export default function StoreSamplesPage() {
  return <StorePage defaultFilter="sample" />;
}
