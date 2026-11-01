const NATIVE_COUNT = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

export function won(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** "아메리카노 한 잔, 햄치즈 샌드위치 두 개" */
export function describeItems(items: { name: string; qty: number; unit: string }[]): string {
  return items
    .map((i) => (NATIVE_COUNT[i.qty] ? `${i.name} ${NATIVE_COUNT[i.qty]} ${i.unit}` : `${i.name} ${i.qty}${i.unit}`))
    .join(', ');
}

/** 초를 "3분"처럼 읽는다. 1분 미만도 "1분" */
export function minutesText(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))}분`;
}
