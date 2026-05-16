import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Buy Music — Vuka',
  description: 'Browse and buy EPs, albums, singles and mixtapes from independent artists.',
};

export default function StoreReleasesPage() {
  return <StorePage defaultFilter="release" />;
}
