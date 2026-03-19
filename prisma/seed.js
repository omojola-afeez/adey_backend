// prisma/seed.js  —  Run: node prisma/seed.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ADEY database...');

  // ── Categories ──────────────────────────────
  const cats = await Promise.all([
    prisma.category.upsert({ where: { slug: 'phones-tablets' },   update: {}, create: { name: 'Phones & Tablets',  slug: 'phones-tablets',   icon: '📱' } }),
    prisma.category.upsert({ where: { slug: 'audio' },            update: {}, create: { name: 'Audio & Earphones', slug: 'audio',             icon: '🎧' } }),
    prisma.category.upsert({ where: { slug: 'smart-gadgets' },    update: {}, create: { name: 'Smart Gadgets',     slug: 'smart-gadgets',     icon: '💡' } }),
    prisma.category.upsert({ where: { slug: 'fashion' },          update: {}, create: { name: 'Fashion & Shoes',   slug: 'fashion',           icon: '👟' } }),
    prisma.category.upsert({ where: { slug: 'home-kitchen' },     update: {}, create: { name: 'Home & Kitchen',    slug: 'home-kitchen',      icon: '🏠' } }),
    prisma.category.upsert({ where: { slug: 'beauty' },           update: {}, create: { name: 'Beauty & Care',     slug: 'beauty',            icon: '💄' } }),
    prisma.category.upsert({ where: { slug: 'wearables' },        update: {}, create: { name: 'Wearables',         slug: 'wearables',         icon: '⌚' } }),
    prisma.category.upsert({ where: { slug: 'accessories' },      update: {}, create: { name: 'Accessories',       slug: 'accessories',       icon: '🔌' } }),
  ]);

  const [phones, audio, gadgets, fashion, home, beauty, wearables, accessories] = cats;
  console.log('✅ Categories seeded');

  // ── Admin user ───────────────────────────────
  const adminHash = await bcrypt.hash('Admin@1234', 12);
  await prisma.user.upsert({
    where:  { email: 'admin@adeyimports.com' },
    update: {},
    create: {
      email:        'admin@adeyimports.com',
      phone:        '08000000001',
      firstName:    'ADEY',
      lastName:     'Admin',
      passwordHash: adminHash,
      role:         'ADMIN',
      isVerified:   true,
    },
  });

  // ── Staff user ───────────────────────────────
  const staffHash = await bcrypt.hash('Staff@1234', 12);
  await prisma.user.upsert({
    where:  { email: 'staff@adeyimports.com' },
    update: {},
    create: {
      email:        'staff@adeyimports.com',
      phone:        '08000000002',
      firstName:    'Amaka',
      lastName:     'Obi',
      passwordHash: staffHash,
      role:         'STAFF',
      isVerified:   true,
    },
  });

  // ── Sample customer ──────────────────────────
  const custHash = await bcrypt.hash('Customer@1234', 12);
  const customer = await prisma.user.upsert({
    where:  { email: 'emeka@gmail.com' },
    update: {},
    create: {
      email:         'emeka@gmail.com',
      phone:         '08123456789',
      firstName:     'Emeka',
      lastName:      'Okafor',
      passwordHash:  custHash,
      role:          'CUSTOMER',
      tier:          'GOLD',
      loyaltyPoints: 1240,
      isVerified:    true,
    },
  });

  console.log('✅ Users seeded');

  // ── Sample address ───────────────────────────
  await prisma.address.upsert({
    where:  { id: 'seed-addr-1' },
    update: {},
    create: {
      id:        'seed-addr-1',
      userId:    customer.id,
      label:     'Home',
      street:    '14 Admiralty Way, Lekki Phase 1',
      city:      'Lagos',
      state:     'Lagos',
      landmark:  'Near Shoprite Lekki',
      isDefault: true,
    },
  });

  // ── Products ─────────────────────────────────
  const products = [
    { sku:'ADE-AUD-001', name:'Pro Wireless Earbuds ANC',      slug:'pro-wireless-earbuds-anc',      categoryId:audio.id,       costPrice:8500,  sellingPrice:28500,  comparePrice:45000, stockQty:23,  availability:'IN_STOCK',   isFeatured:true,  tags:['audio','anc','wireless'], soldCount:284 },
    { sku:'ADE-PHN-001', name:'Xiaomi Redmi 13C 128GB',        slug:'xiaomi-redmi-13c-128gb',         categoryId:phones.id,      costPrice:25000, sellingPrice:92000,  comparePrice:130000,stockQty:8,   availability:'LOW_STOCK',  isFeatured:true,  tags:['xiaomi','android','phone'], soldCount:119 },
    { sku:'ADE-GAD-001', name:'RGB LED Strip 10m App Control', slug:'rgb-led-strip-10m',              categoryId:gadgets.id,     costPrice:3500,  sellingPrice:14200,  comparePrice:22000, stockQty:0,   availability:'IN_TRANSIT', isFeatured:false, tags:['led','smart-home','rgb'], soldCount:203 },
    { sku:'ADE-WEA-001', name:'Smart Watch Ultra Fitness',     slug:'smart-watch-ultra-fitness',      categoryId:wearables.id,   costPrice:10000, sellingPrice:38000,  comparePrice:60000, stockQty:0,   availability:'PRE_ORDER',  isFeatured:true,  tags:['smartwatch','fitness','ecg'], soldCount:77 },
    { sku:'ADE-GAD-002', name:'IPS 27" Monitor 144Hz',         slug:'ips-27-monitor-144hz',           categoryId:gadgets.id,     costPrice:52000, sellingPrice:185000, comparePrice:272000,stockQty:3,   availability:'LOW_STOCK',  isFeatured:true,  tags:['monitor','gaming','144hz'], soldCount:341 },
    { sku:'ADE-GAD-003', name:'Wireless Gaming Controller',    slug:'wireless-gaming-controller',     categoryId:gadgets.id,     costPrice:9000,  sellingPrice:32500,  comparePrice:48000, stockQty:41,  availability:'IN_STOCK',   isFeatured:false, tags:['gaming','controller','xbox'], soldCount:156 },
    { sku:'ADE-GAD-004', name:'4K Action Camera Waterproof',   slug:'4k-action-camera-waterproof',    categoryId:gadgets.id,     costPrice:18000, sellingPrice:74000,  comparePrice:103000,stockQty:6,   availability:'LOW_STOCK',  isFeatured:true,  tags:['camera','4k','waterproof'], soldCount:92 },
    { sku:'ADE-ACC-001', name:'Power Bank 65W 20000mAh',       slug:'power-bank-65w-20000mah',        categoryId:accessories.id, costPrice:5500,  sellingPrice:22000,  comparePrice:35000, stockQty:94,  availability:'IN_STOCK',   isFeatured:false, tags:['powerbank','usbc','fast-charge'], soldCount:418 },
    { sku:'ADE-HOM-001', name:'Ergonomic Office Chair Mesh',   slug:'ergonomic-office-chair-mesh',    categoryId:home.id,        costPrice:42000, sellingPrice:145000, comparePrice:210000,stockQty:9,   availability:'IN_STOCK',   isFeatured:false, tags:['chair','office','ergonomic'], soldCount:103 },
    { sku:'ADE-BEA-001', name:'Ionic Hair Straightener Pro',   slug:'ionic-hair-straightener-pro',    categoryId:beauty.id,      costPrice:4500,  sellingPrice:18500,  comparePrice:28000, stockQty:56,  availability:'IN_STOCK',   isFeatured:false, tags:['hair','beauty','ceramic'], soldCount:189 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where:  { sku: p.sku },
      update: {},
      create: { ...p, images: [], rating: 4.7 + Math.random() * 0.3, reviewCount: p.soldCount },
    });
  }
  console.log('✅ Products seeded');

  // ── Active shipment ──────────────────────────
  await prisma.shipment.upsert({
    where:  { reference: 'SHP-20250308-001' },
    update: {},
    create: {
      reference:  'SHP-20250308-001',
      status:     'CUSTOMS_CLEARANCE',
      vessel:     'COSCO Guangzhou',
      origin:     'Guangzhou, China',
      departedAt: new Date('2025-03-12T08:00:00Z'),
      etaLagos:   new Date('2025-03-18T17:00:00Z'),
      arrivedAt:  new Date('2025-03-17T06:30:00Z'),
      notes:      'Batch 1 — March shipment',
    },
  });
  console.log('✅ Shipment seeded');

  // ── Coupons ──────────────────────────────────
  await prisma.coupon.upsert({
    where:  { code: 'ADEY10' },
    update: {},
    create: { code: 'ADEY10', type: 'percent', value: 10, minOrderValue: 20000, maxUses: 500 },
  });
  await prisma.coupon.upsert({
    where:  { code: 'WELCOME5K' },
    update: {},
    create: { code: 'WELCOME5K', type: 'fixed', value: 5000, minOrderValue: 30000, maxUses: 100 },
  });
  console.log('✅ Coupons seeded');

  console.log('\n🚀 Seed complete!');
  console.log('   Admin login:    admin@adeyimports.com / Admin@1234');
  console.log('   Staff login:    staff@adeyimports.com / Staff@1234');
  console.log('   Customer login: emeka@gmail.com       / Customer@1234');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
