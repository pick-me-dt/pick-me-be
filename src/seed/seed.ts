import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/** 시드 데이터의 고정 ID. 시연 스크립트·테스트에서 참조한다. */
export const SEED = {
  brandId: '00000000-0000-4000-8000-000000000001',
  stores: {
    yangjae: '00000000-0000-4000-8000-000000000101',
    pangyo: '00000000-0000-4000-8000-000000000102',
    jeongja: '00000000-0000-4000-8000-000000000103',
  },
  menu: {
    americano: '00000000-0000-4000-8000-000000000201',
    latte: '00000000-0000-4000-8000-000000000202',
    vanillaLatte: '00000000-0000-4000-8000-000000000203',
    coldBrew: '00000000-0000-4000-8000-000000000204',
    sandwich: '00000000-0000-4000-8000-000000000205',
    icedAmericano: '00000000-0000-4000-8000-000000000206',
    greenTeaLatte: '00000000-0000-4000-8000-000000000207',
  },
  userId: '00000000-0000-4000-8000-000000000301',
  vehicleId: '00000000-0000-4000-8000-000000000401',
  deviceId: 'emulator-001',
  plateNumber: '12가3456',
  favoriteId: '00000000-0000-4000-8000-000000000501',
  favoriteSetId: '00000000-0000-4000-8000-000000000502',
  /** 주문 내역 화면용 지난 주문 */
  pastOrders: {
    yesterday: '00000000-0000-4000-8000-000000000601',
    threeDaysAgo: '00000000-0000-4000-8000-000000000602',
    noShow: '00000000-0000-4000-8000-000000000603',
  },
  staffPassword: 'pickme1234',
} as const;

export const STORES = [
  { id: SEED.stores.yangjae, name: '픽미 DT 양재점', lat: 37.4705, lng: 127.035, loginId: 'yangjae' },
  { id: SEED.stores.pangyo, name: '픽미 DT 판교점', lat: 37.3947, lng: 127.1112, loginId: 'pangyo' },
  { id: SEED.stores.jeongja, name: '픽미 DT 정자점', lat: 37.367, lng: 127.108, loginId: 'jeongja' },
];

const MENU: { id: string; name: string; price: number; prepSec: number; unit?: string }[] = [
  { id: SEED.menu.americano, name: '아메리카노', price: 4500, prepSec: 90 },
  { id: SEED.menu.latte, name: '카페라떼', price: 5000, prepSec: 120 },
  { id: SEED.menu.vanillaLatte, name: '바닐라라떼', price: 5500, prepSec: 120 },
  { id: SEED.menu.coldBrew, name: '콜드브루', price: 5000, prepSec: 60 },
  { id: SEED.menu.sandwich, name: '햄치즈 샌드위치', price: 6500, prepSec: 180, unit: '개' },
  { id: SEED.menu.icedAmericano, name: '아이스 아메리카노', price: 4500, prepSec: 90 },
  { id: SEED.menu.greenTeaLatte, name: '녹차라떼', price: 5500, prepSec: 120 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 시연용 기본 데이터를 넣는다. 여러 번 실행해도 결과가 같다. */
export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.brand.upsert({
    where: { id: SEED.brandId },
    update: {},
    create: { id: SEED.brandId, name: '픽미 커피', channelType: 'MOCK_DT' },
  });

  const passwordHash = await bcrypt.hash(SEED.staffPassword, 10);
  for (const s of STORES) {
    const store = {
      brandId: SEED.brandId,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      // DT 차로 입구는 매장 좌표에서 약 30m 떨어진 곳으로 둔다
      laneLat: s.lat + 0.00027,
      laneLng: s.lng,
    };
    await prisma.store.upsert({ where: { id: s.id }, update: store, create: { id: s.id, ...store } });
    await prisma.storeStaff.upsert({
      where: { loginId: s.loginId },
      update: { storeId: s.id, passwordHash },
      create: { storeId: s.id, loginId: s.loginId, passwordHash },
    });
  }

  for (const m of MENU) {
    const item = { brandId: SEED.brandId, name: m.name, price: m.price, prepSec: m.prepSec, unit: m.unit ?? '잔' };
    await prisma.menuItem.upsert({ where: { id: m.id }, update: item, create: { id: m.id, ...item } });
  }

  await prisma.user.upsert({
    where: { id: SEED.userId },
    update: {},
    create: { id: SEED.userId, name: '시연 사용자' },
  });
  await prisma.vehicle.upsert({
    where: { id: SEED.vehicleId },
    update: {},
    create: {
      id: SEED.vehicleId,
      userId: SEED.userId,
      deviceId: SEED.deviceId,
      plateNumber: SEED.plateNumber,
      model: '더 뉴 그랜저',
    },
  });
  await prisma.favorite.upsert({
    where: { id: SEED.favoriteId },
    update: {},
    create: {
      id: SEED.favoriteId,
      userId: SEED.userId,
      alias: '평소 그거',
      items: [{ menuItemId: SEED.menu.americano, qty: 1 }],
    },
  });
  await prisma.favorite.upsert({
    where: { id: SEED.favoriteSetId },
    update: {},
    create: {
      id: SEED.favoriteSetId,
      userId: SEED.userId,
      alias: '출근길 세트',
      items: [
        { menuItemId: SEED.menu.latte, qty: 1 },
        { menuItemId: SEED.menu.sandwich, qty: 1 },
      ],
    },
  });

  await seedPastOrders(prisma);
}

/** 시연 차량의 지난 주문. 이미 있으면 건너뛴다 */
async function seedPastOrders(prisma: PrismaClient) {
  const now = Date.now();
  const past = [
    {
      id: SEED.pastOrders.yesterday,
      storeId: SEED.stores.pangyo,
      at: now - DAY_MS,
      lines: [{ menu: SEED.menu.americano, qty: 1 }],
      status: 'PICKED_UP' as const,
    },
    {
      id: SEED.pastOrders.threeDaysAgo,
      storeId: SEED.stores.yangjae,
      at: now - 3 * DAY_MS,
      lines: [
        { menu: SEED.menu.latte, qty: 1 },
        { menu: SEED.menu.sandwich, qty: 1 },
      ],
      status: 'PICKED_UP' as const,
    },
    {
      id: SEED.pastOrders.noShow,
      storeId: SEED.stores.jeongja,
      at: now - 5 * DAY_MS,
      lines: [{ menu: SEED.menu.coldBrew, qty: 2 }],
      status: 'CANCELLED' as const,
    },
  ];

  for (const o of past) {
    if (await prisma.order.findUnique({ where: { id: o.id } })) continue;
    const lines = o.lines.map((l) => ({ ...MENU.find((m) => m.id === l.menu)!, qty: l.qty }));
    const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const t = (minutes: number) => new Date(o.at + minutes * 60_000);
    const pickedUp = o.status === 'PICKED_UP';
    await prisma.order.create({
      data: {
        id: o.id,
        userId: SEED.userId,
        vehicleId: SEED.vehicleId,
        storeId: o.storeId,
        status: o.status,
        source: 'VOICE',
        totalAmount: total,
        plateNumber: SEED.plateNumber,
        externalOrderId: `MOCK-${o.id.slice(-4)}`,
        estPrepSec: Math.max(...lines.map((l) => l.prepSec)),
        etaAtSendSec: 120,
        createdAt: t(0),
        sentAt: t(8),
        laneEnteredAt: pickedUp ? t(10) : null,
        readyAt: t(11),
        pickedUpAt: pickedUp ? t(11) : null,
        cancelledAt: pickedUp ? null : t(26),
        cancelReason: pickedUp ? null : 'NO_SHOW',
        items: { create: lines.map((l) => ({ menuItemId: l.id, name: l.name, unitPrice: l.price, qty: l.qty })) },
        payment: { create: { amount: total, status: pickedUp ? 'CAPTURED' : 'VOIDED', providerRef: `mockpay_seed_${o.id.slice(-4)}` } },
        events: {
          create: [
            { type: 'created', createdAt: t(0) },
            { type: 'sent', createdAt: t(8) },
            { type: 'ready', createdAt: t(11) },
            pickedUp ? { type: 'picked_up', createdAt: t(11) } : { type: 'cancelled', payload: { reason: 'NO_SHOW' }, createdAt: t(26) },
          ],
        },
      },
    });
  }
}
