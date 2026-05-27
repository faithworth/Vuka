import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Vuka database...');

  // Create test artist user
  const user = await prisma.user.upsert({
    where: { email: 'demo@vuka.app' },
    update: {},
    create: {
      email: 'demo@vuka.app',
      name: 'DJ Vusi',
      role: 'artist',
    },
  });

  const artist = await prisma.artist.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      slug: 'dj-vusi',
      name: 'DJ Vusi',
      bio: 'Katlehong-born producer. Amapiano, Afrobeats, and everything in between. No label. Just vibes.',
      city: 'Katlehong',
      country: 'ZA',
      genreTags: ['Amapiano', 'Afrobeats', 'Gqom'],
      currency: 'ZAR',
    },
  });

  console.log(`✅ Artist: ${artist.name} (/${artist.slug})`);

  // Create demo beats
  const beats = [
    {
      title: 'Sunset Amapiano',
      slug: 'sunset-amapiano',
      genre: 'Amapiano',
      mood: 'Chill',
      bpm: 112,
      keySignature: 'C Minor',
      basicPrice: 150,
      premiumPrice: 350,
      exclPrice: 2500,
      tags: ['amapiano', 'log drum', 'piano'],
      previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // placeholder
    },
    {
      title: 'Katlehong Nights',
      slug: 'katlehong-nights',
      genre: 'Gqom',
      mood: 'Dark',
      bpm: 130,
      keySignature: 'A Minor',
      basicPrice: 120,
      premiumPrice: 280,
      exclPrice: 2000,
      tags: ['gqom', 'dark', 'tribal'],
      previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    },
    {
      title: 'Lagos to Jozi',
      slug: 'lagos-to-jozi',
      genre: 'Afrobeats',
      mood: 'Energetic',
      bpm: 104,
      keySignature: 'G Major',
      basicPrice: 200,
      premiumPrice: 450,
      exclPrice: 3000,
      tags: ['afrobeats', 'highlife', 'guitar'],
      previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    },
  ];

  for (const beatData of beats) {
    await prisma.beat.upsert({
      where: { slug: beatData.slug },
      update: {},
      create: {
        ...beatData,
        artistId: artist.id,
        waveformData: Array.from({ length: 60 }, (_, i) =>
          Math.max(0.1, Math.abs(Math.sin(i * 0.4) * 0.6 + Math.sin(i * 1.2) * 0.4))
        ),
        isActive: true,
      },
    });
    console.log(`  🎵 Beat: ${beatData.title}`);
  }

  // Create demo release
  const release = await prisma.release.upsert({
    where: { slug: 'rise-ep' },
    update: {},
    create: {
      artistId: artist.id,
      title: 'Rise EP',
      slug: 'rise-ep',
      releaseType: 'ep',
      price: 80,
      minPrice: 50,
      payWhatWant: true,
      description: 'Five tracks. One story. From Katlehong to the world.',
      releaseDate: new Date('2024-06-01'),
      isActive: true,
    },
  });

  const tracks = [
    { title: 'Vuka (Intro)', trackNumber: 1, previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', fullUrl: '', duration: 180 },
    { title: 'Township Dreams', trackNumber: 2, previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', fullUrl: '', duration: 210 },
    { title: 'Sunset Boulevard', trackNumber: 3, previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', fullUrl: '', duration: 195 },
    { title: 'Late Night Studio', trackNumber: 4, previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', fullUrl: '', duration: 225 },
    { title: 'Rise (Outro)', trackNumber: 5, previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', fullUrl: '', duration: 160 },
  ];

  for (const track of tracks) {
    await prisma.track.create({
      data: {
        ...track,
        releaseId: release.id,
        waveformData: Array.from({ length: 60 }, (_, i) =>
          Math.max(0.1, Math.abs(Math.sin(i * 0.5) * 0.7 + Math.sin(i * 0.9) * 0.3))
        ),
      },
    }).catch(() => {}); // ignore duplicates
  }

  console.log(`  🎶 Release: ${release.title} (${tracks.length} tracks)`);

  // Create a goal
  await prisma.goal.upsert({
    where: { id: 'demo-goal' },
    update: {},
    create: {
      id: 'demo-goal',
      artistId: artist.id,
      title: 'New Studio Equipment',
      description: 'Saving up for a proper audio interface and monitors',
      targetAmount: 5000,
      currentAmount: 1850,
      currency: 'ZAR',
      isActive: true,
    },
  });

  console.log('  🎯 Goal created');
  console.log('\n✅ Seed complete!');
  console.log(`\nTest artist profile: http://localhost:3000/artist/dj-vusi`);
  console.log(`Store: http://localhost:3000/store`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
