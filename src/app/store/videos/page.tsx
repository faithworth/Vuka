import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Buy Music Videos — Vuka Music',
  description: 'Browse and buy music videos from independent artists on Vuka Music.',
};

export default function StoreVideosPage() {
  return <StorePage defaultFilter="video" />;
}
