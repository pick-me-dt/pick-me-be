import { OrderStatus } from '@prisma/client';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEEDS_CONFIRMATION: ['RESERVED', 'CANCELLED'],
  RESERVED: ['SENT', 'CANCELLED'],
  SENT: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: [],
  CANCELLED: [],
};

/** 주문이 아직 끝나지 않은 상태 */
export const ACTIVE_STATUSES: OrderStatus[] = ['NEEDS_CONFIRMATION', 'RESERVED', 'SENT', 'PREPARING', 'READY'];

/** 매장에 이미 전송된 상태. 취소하면 매장 취소와 결제 승인 취소가 필요하다. */
export const SENT_STATUSES: OrderStatus[] = ['SENT', 'PREPARING', 'READY'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** to로 갈 수 있는 출발 상태들 */
export function sourcesOf(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) => TRANSITIONS[from].includes(to));
}
