import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Buy Sample Packs — Vuka',
  description: 'Browse and buy sample packs and loops from independent producers on Vuka.',
};

export default function StoreSamplesPage() {
  return <StorePage defaultFilter="sample" />;
}
