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
  {
    id: '1234TLL',
    email: 'taller@gmail.com',
    password: '12345',
    userType: 'WORKSHOP',
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

const DEFAULT_LANDING_CONTENT = {
  hero: {
    badge: 'Tu propio vehículo en 60 meses',
    titleBefore: 'Drive Today, ',
    titleHighlight: 'Yours Tomorrow',
    description:
      'Modelo Rent to Own para conductores de Uber, DiDi y más. Pagos semanales y al finalizar el plazo, ¡el vehículo es tuyo!',
    primaryButtonText: 'Comenzar Ahora',
    secondaryButtonText: 'Ver Cómo Funciona',
    videoUrl: '/hero/hero-bg.mp4',
    posterUrl: '/hero/hero-poster.jpg',
    videoStoredPath: null,
    posterStoredPath: null,
    videoMimeType: null,
    posterMimeType: null,
  },
  benefits: {
    badge: 'Beneficios atoo',
    titleBefore: '¿Por Qué Elegir ',
    titleHighlight: 'atoo',
    titleAfter: '?',
    description:
      'La mejor alternativa para que puedas tener tu propio vehículo mientras generas ingresos.',
    items: [
      {
        icon: 'trending-up',
        title: 'Incrementa tus Ganancias',
        description:
          'Sin pagos de renta diarios. Todo lo que ganes es tuyo mientras cumples tu cuota semanal.',
        gradient: 'from-[#1A1FE8] to-[#3D42F0]',
      },
      {
        icon: 'shield',
        title: 'Sin Enganche',
        description: 'Comienza a conducir tu vehículo sin necesidad de desembolso inicial.',
        gradient: 'from-cyan-500 to-[#1A1FE8]',
      },
      {
        icon: 'clock',
        title: 'Proceso Rápido',
        description: 'Aprobación en 24 horas. Mínimos requisitos y trámites simples.',
        gradient: 'from-emerald-500 to-teal-600',
      },
      {
        icon: 'heart',
        title: 'Seguro Incluido',
        description: 'Todos nuestros vehículos incluyen seguro de cobertura amplia.',
        gradient: 'from-[#1A1FE8] to-[#6B70F5]',
      },
      {
        icon: 'wrench',
        title: 'Mantenimiento',
        description: 'Servicio y mantenimiento preventivo incluido durante el periodo de renta.',
        gradient: 'from-orange-500 to-amber-500',
      },
      {
        icon: 'percent',
        title: 'Mejores Tasas',
        description: 'Tasas competitivas y transparentes. Sin cargos ocultos.',
        gradient: 'from-[#3D42F0] to-[#1A1FE8]',
      },
    ],
  },
  steps: {
    badge: 'Proceso Simple',
    titleBefore: '¿Cómo ',
    titleHighlight: 'Funciona',
    titleAfter: '?',
    description: 'En solo 4 pasos simples estarás manejando tu futuro vehículo',
    ctaText: 'Iniciar Mi Solicitud',
    ctaNote: '⚡ Respuesta en menos de 24 horas',
    items: [
      {
        number: '01',
        icon: 'file-text',
        title: 'Solicitud',
        description:
          'Completa el formulario en línea con tus datos básicos. Solo necesitas INE y comprobante de domicilio.',
      },
      {
        number: '02',
        icon: 'check-circle-2',
        title: 'Aprobación',
        description:
          'Nuestro equipo revisa tu solicitud y te contacta en menos de 24 horas con una respuesta.',
      },
      {
        number: '03',
        icon: 'car',
        title: 'Entrega',
        description: 'Elige tu vehículo y firma el contrato. Comienza a conducir el mismo día.',
      },
      {
        number: '04',
        icon: 'trophy',
        title: '¡Es Tuyo!',
        description:
          'Después de 60 meses de pagos semanales puntuales, el vehículo pasa a tu nombre.',
      },
    ],
  },
  contact: {
    badge: '¡Comienza Tu Viaje Hoy!',
    titleBefore: '¿Listo para ',
    titleHighlight: 'Yours Tomorrow',
    titleAfter: '?',
    description:
      'Únete a más de {count} que ya están construyendo su patrimonio mientras trabajan',
    driverCount: '100 conductores',
    phoneLabel: 'Llámanos',
    phone: '55 1234 5678',
    emailLabel: 'Escríbenos',
    email: 'hola@atoo.com',
    trustItems: ['Aprobación en 24h', 'Sin enganche', 'Pagos semanales'],
  },
};

async function seedCatalog() {
  await prisma.landingSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', maxVisibleVehicles: 10, content: DEFAULT_LANDING_CONTENT },
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

async function seedWorkshops() {
  const workshopUser = await prisma.user.findUnique({ where: { email: 'taller@gmail.com' } });
  if (!workshopUser) return;

  const primary = await prisma.workshop.upsert({
    where: { id: 'TLLBOG01' },
    update: {
      name: 'TecnoMecánica Drive Bogotá Norte',
      address: 'Calle 170 #54-20',
      city: 'Bogotá',
      phone: '601 555 0101',
      active: true,
      userId: workshopUser.id,
    },
    create: {
      id: 'TLLBOG01',
      name: 'TecnoMecánica Drive Bogotá Norte',
      address: 'Calle 170 #54-20',
      city: 'Bogotá',
      phone: '601 555 0101',
      active: true,
      userId: workshopUser.id,
    },
  });

  await prisma.workshop.upsert({
    where: { id: 'TLLMED01' },
    update: {
      name: 'Centro de Diagnóstico El Poblado',
      address: 'Carrera 43A #16-145',
      city: 'Medellín',
      phone: '604 555 0202',
      active: true,
    },
    create: {
      id: 'TLLMED01',
      name: 'Centro de Diagnóstico El Poblado',
      address: 'Carrera 43A #16-145',
      city: 'Medellín',
      phone: '604 555 0202',
      active: true,
    },
  });

  const today = new Date();
  const dates = [0, 1, 2, 3, 7].map((offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  });

  for (const workshopId of [primary.id, 'TLLMED01']) {
    for (const date of dates) {
      await prisma.workshopAvailabilitySlot.upsert({
        where: {
          workshopId_date_startTime: {
            workshopId,
            date,
            startTime: '08:00',
          },
        },
        update: { endTime: '12:00', maxAppointments: 4 },
        create: {
          id: `SL${workshopId}${date.replace(/-/g, '')}0800`,
          workshopId,
          date,
          startTime: '08:00',
          endTime: '12:00',
          maxAppointments: 4,
        },
      });
      await prisma.workshopAvailabilitySlot.upsert({
        where: {
          workshopId_date_startTime: {
            workshopId,
            date,
            startTime: '14:00',
          },
        },
        update: { endTime: '18:00', maxAppointments: 3 },
        create: {
          id: `SL${workshopId}${date.replace(/-/g, '')}1400`,
          workshopId,
          date,
          startTime: '14:00',
          endTime: '18:00',
          maxAppointments: 3,
        },
      });
    }
  }

  console.log('Talleres y disponibilidad listos');
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
  await seedWorkshops();
}

main()
  .catch((err) => {
    console.error('Error en seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
