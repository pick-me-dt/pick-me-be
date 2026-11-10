import { OrderStatus } from '@prisma/client';

/**
 * 2차 기획 주문 상태 전이.
 * 매장 확인 중 → (수락) 제조 대기 → (제조 시작) 제조 중 → 준비 완료 → 수령 완료.
 * 수락 전에는 바로 취소, 수락 후에는 취소 확인 중을 거쳐 매장이 승인·거절한다.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ACCEPT: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCEL_REQUESTED', 'CANCELLED'],
  PREPARING: ['READY', 'CANCEL_REQUESTED', 'CANCELLED'],
  READY: ['PICKED_UP', 'CANCEL_REQUESTED', 'CANCELLED'],
  // 매장이 취소를 거절하면 요청 전 상태로 돌아간다
  CANCEL_REQUESTED: ['CANCELLED', 'ACCEPTED', 'PREPARING', 'READY'],
  PICKED_UP: [],
  REJECTED: [],
  CANCELLED: [],
};

/** 아직 끝나지 않은 주문 */
export const ACTIVE_STATUSES: OrderStatus[] = ['PENDING_ACCEPT', 'ACCEPTED', 'PREPARING', 'READY', 'CANCEL_REQUESTED'];

/** 제조를 시작하기 전 상태. 이때는 도착이 늦어지면 시작 추천을 늦춘다 */
export const BEFORE_PREP_STATUSES: OrderStatus[] = ['PENDING_ACCEPT', 'ACCEPTED'];

/** 운전자의 취소에 매장 판단이 필요한 상태 (직원이 수락한 뒤) */
export const CANCEL_NEEDS_APPROVAL: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** to로 갈 수 있는 출발 상태들 */
export function sourcesOf(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) => TRANSITIONS[from].includes(to));
}
