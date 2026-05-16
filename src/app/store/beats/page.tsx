import { Metadata } from 'next';
import StorePage from '../page';

export const metadata: Metadata = {
  title: 'Buy Beats — Vuka',
  description: 'Browse and buy beats from independent producers. Amapiano, Afrobeats, Hip Hop, Drill and more.',
};

export default function StoreBeatsPage() {
  return <StorePage defaultFilter="beat" />;
}
