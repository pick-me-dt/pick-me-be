import { canTransition, sourcesOf } from './order-state';

describe('주문 상태 머신', () => {
  it('정상 흐름: 예약 → 전송 → 제조 → 준비 → 수령', () => {
    expect(canTransition('RESERVED', 'SENT')).toBe(true);
    expect(canTransition('SENT', 'PREPARING')).toBe(true);
    expect(canTransition('PREPARING', 'READY')).toBe(true);
    expect(canTransition('READY', 'PICKED_UP')).toBe(true);
  });

  it('확인 대기 주문은 확인을 거쳐야 예약이 된다', () => {
    expect(canTransition('NEEDS_CONFIRMATION', 'RESERVED')).toBe(true);
    expect(canTransition('NEEDS_CONFIRMATION', 'SENT')).toBe(false);
  });

  it('되돌아가는 전이와 종료 상태에서의 전이는 막는다', () => {
    expect(canTransition('READY', 'SENT')).toBe(false);
    expect(canTransition('PICKED_UP', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'RESERVED')).toBe(false);
  });

  it('수령 전까지는 어느 상태에서든 취소할 수 있다', () => {
    expect(sourcesOf('CANCELLED').sort()).toEqual(['NEEDS_CONFIRMATION', 'PREPARING', 'READY', 'RESERVED', 'SENT']);
  });
});
