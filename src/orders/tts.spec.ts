import { describeItems, minutesText, won } from './tts';

describe('TTS 문구', () => {
  it('수량을 고유어 수사와 단위로 읽는다', () => {
    expect(
      describeItems([
        { name: '아메리카노', qty: 1, unit: '잔' },
        { name: '햄치즈 샌드위치', qty: 2, unit: '개' },
      ]),
    ).toBe('아메리카노 한 잔, 햄치즈 샌드위치 두 개');
    expect(describeItems([{ name: '콜드브루', qty: 12, unit: '잔' }])).toBe('콜드브루 12잔');
  });

  it('금액과 시간', () => {
    expect(won(4500)).toBe('4,500원');
    expect(minutesText(170)).toBe('3분');
    expect(minutesText(10)).toBe('1분');
  });
});
