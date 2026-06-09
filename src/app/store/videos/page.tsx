import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Buy Music Videos — Vuka',
  description: 'Browse and buy music videos from independent artists on Vuka.',
};

export default function StoreVideosPage() {
  return <StorePage defaultFilter="video" />;
}
