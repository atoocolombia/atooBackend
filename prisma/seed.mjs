import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

const DEFAULT_USERS = [
  {
    id: '1234ADM',
    email: 'admin@gmail.com',
    password: '12345',
    userType: 'ADMIN',
  },
  {
    id: '1234ASE',
    email: 'asesor@gmail.com',
    password: '12345',
    userType: 'ADVISOR',
  },
  {
    id: '1234ANL',
    email: 'analista@gmail.com',
    password: '12345',
    userType: 'ANALYST',
  },
];

const NAMMI_GALLERY = [
  '/vehicles/dongfeng-nammi/main.png',
  '/vehicles/dongfeng-nammi/gallery/IMG_2439.JPG',
  '/vehicles/dongfeng-nammi/gallery/IMG_2442.JPG',
  '/vehicles/dongfeng-nammi/gallery/IMG_2443.JPG',
  '/vehicles/dongfeng-nammi/gallery/IMG_2444.JPG',
  '/vehicles/dongfeng-nammi/gallery/IMG_2445.JPG',
];

const SKY_GALLERY = [
  '/vehicles/dongfeng-aeolus-sky-ev01/main.png',
  '/vehicles/dongfeng-aeolus-sky-ev01/gallery/IMG_9112.JPG',
  '/vehicles/dongfeng-aeolus-sky-ev01/gallery/IMG_9113.JPG',
  '/vehicles/dongfeng-aeolus-sky-ev01/gallery/IMG_9114.JPG',
  '/vehicles/dongfeng-aeolus-sky-ev01/gallery/IMG_9115.JPG',
];

const CATALOG_VEHICLES = [
  {
    id: 'NAMMI01',
    slug: 'dongfeng-nammi',
    name: 'Dongfeng Nammi',
    subtitle: 'Eléctrico compacto ideal para la ciudad',
    type: 'CARRO',
    highlights: [
      'Diseño compacto y eficiente para uso diario en ciudad',
      'Bajo costo de operación y mantenimiento eléctrico',
      'Tecnología de asistencia al conductor (ADAS)',
      'Pantalla central inteligente con conectividad',
      'Ideal para plataformas de transporte y movilidad urbana',
    ],
    features: ['100% eléctrico', 'Carga rápida DC', 'Bluetooth y conectividad', 'Cámara de reversa', 'ADAS de serie'],
    specs: [
      { label: 'Tipo', value: 'Hatchback eléctrico' },
      { label: 'Autonomía', value: 'Hasta ~430 km (CLTC)' },
      { label: 'Motor', value: 'Eléctrico ~70 kW' },
      { label: 'Pasajeros', value: '5' },
    ],
    badge: 'Más Popular',
    popular: true,
    weeklyPriceCop: 207_000,
    active: true,
    sortOrder: 0,
    specSheetPath: '/vehicles/dongfeng-nammi/ficha-tecnica.pdf',
    gallery: NAMMI_GALLERY,
  },
  {
    id: 'SKYEV01',
    slug: 'dongfeng-aeolus-sky-ev01',
    name: 'Dongfeng Aeolus Sky EV 01',
    subtitle: 'SUV eléctrica con mayor espacio y autonomía',
    type: 'CAMIONETA',
    highlights: [
      'SUV eléctrica con mayor espacio interior y de carga',
      'Autonomía extendida para trayectos urbanos e interurbanos',
      'Diseño moderno con iluminación LED',
      'Confort superior para conductor y pasajeros',
    ],
    features: ['SUV 100% eléctrica', 'Mayor autonomía', 'Espacio amplio', 'LED delanteros y traseros', 'Asistencias a la conducción'],
    specs: [
      { label: 'Tipo', value: 'SUV eléctrica' },
      { label: 'Autonomía', value: 'Hasta ~500 km (CLTC)' },
      { label: 'Pasajeros', value: '5' },
    ],
    badge: null,
    popular: false,
    weeklyPriceCop: 207_000,
    active: true,
    sortOrder: 1,
    specSheetPath: '/vehicles/dongfeng-aeolus-sky-ev01/ficha-tecnica.pdf',
    gallery: SKY_GALLERY,
  },
];

function imageId(vehicleId, index) {
  return `${vehicleId}IMG${String(index).padStart(2, '0')}`;
}

async function seedCatalog() {
  await prisma.landingSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', maxVisibleVehicles: 10 },
  });

  for (const v of CATALOG_VEHICLES) {
    await prisma.catalogVehicle.upsert({
      where: { slug: v.slug },
      update: {
        name: v.name,
        subtitle: v.subtitle,
        type: v.type,
        highlights: v.highlights,
        features: v.features,
        specs: v.specs,
        badge: v.badge,
        popular: v.popular,
        weeklyPriceCop: v.weeklyPriceCop,
        active: v.active,
        sortOrder: v.sortOrder,
        specSheetPath: v.specSheetPath,
      },
      create: {
        id: v.id,
        slug: v.slug,
        name: v.name,
        subtitle: v.subtitle,
        type: v.type,
        highlights: v.highlights,
        features: v.features,
        specs: v.specs,
        badge: v.badge,
        popular: v.popular,
        weeklyPriceCop: v.weeklyPriceCop,
        active: v.active,
        sortOrder: v.sortOrder,
        specSheetPath: v.specSheetPath,
      },
    });

    const count = await prisma.catalogVehicleImage.count({ where: { vehicleId: v.id } });
    if (count > 0) continue;

    for (let i = 0; i < v.gallery.length; i++) {
      const publicUrl = v.gallery[i];
      await prisma.catalogVehicleImage.create({
        data: {
          id: imageId(v.id, i),
          vehicleId: v.id,
          publicUrl,
          originalName: publicUrl.split('/').pop() ?? 'image',
          mimeType: publicUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          sortOrder: i,
          isPrimary: i === 0,
        },
      });
    }
    console.log(`Catálogo listo: ${v.name}`);
  }
}

async function main() {
  for (const user of DEFAULT_USERS) {
    const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, userType: user.userType },
      create: {
        id: user.id,
        email: user.email,
        passwordHash,
        userType: user.userType,
      },
    });
    console.log(`Usuario listo: ${user.email} (${user.userType})`);
  }

  await seedCatalog();
}

main()
  .catch((err) => {
    console.error('Error en seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
