import { canTransition, sourcesOf } from './order-state';

describe('주문 상태 머신 (2차 기획)', () => {
  it('정상 흐름: 매장 확인 중 → 제조 대기 → 제조 중 → 준비 완료 → 수령 완료', () => {
    expect(canTransition('PENDING_ACCEPT', 'ACCEPTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'PREPARING')).toBe(true);
    expect(canTransition('PREPARING', 'READY')).toBe(true);
    expect(canTransition('READY', 'PICKED_UP')).toBe(true);
  });

  it('수락 없이 제조를 시작할 수 없다', () => {
    expect(canTransition('PENDING_ACCEPT', 'PREPARING')).toBe(false);
  });

  it('거절은 매장 확인 중에만', () => {
    expect(sourcesOf('REJECTED')).toEqual(['PENDING_ACCEPT']);
  });

  it('수락 후 취소는 취소 확인 중을 거치고, 거절되면 원래 상태로 돌아간다', () => {
    expect(sourcesOf('CANCEL_REQUESTED').sort()).toEqual(['ACCEPTED', 'PREPARING', 'READY']);
    expect(canTransition('CANCEL_REQUESTED', 'PREPARING')).toBe(true);
    expect(canTransition('CANCEL_REQUESTED', 'PICKED_UP')).toBe(false);
  });

  it('준비 완료에서 바로 수령만 가능하고, 종료 상태에서는 움직이지 않는다', () => {
    expect(canTransition('PREPARING', 'PICKED_UP')).toBe(false);
    expect(canTransition('PICKED_UP', 'CANCELLED')).toBe(false);
    expect(canTransition('REJECTED', 'ACCEPTED')).toBe(false);
    expect(canTransition('CANCELLED', 'PENDING_ACCEPT')).toBe(false);
  });
});
