import { describe, expect, it } from 'vitest';
import { selectNewsProcessingBatch } from './batch-selector';

describe('news processing batch selection', () => {
  it('keeps the request bounded while pairing corroborating publisher headlines', () => {
    const candidates = [
      { id: 'newest', title: 'Đà Lạt đông khách dịp lễ 2.9 nhưng vẫn thông thoáng' },
      { id: 'death-a', title: 'Phát hiện thi thể nữ kế toán ở hồ Xuân Hương - Đà Lạt' },
      { id: 'death-b', title: 'Ph&#xE1;t hi&#x1EC7;n thi th&#x1EC3; n&#x1EEF; k&#x1EBF; to&#xE1;n ban qu&#x1EA3;n l&#xFD; d&#x1EF1; &#xE1;n &#x1EDF; h&#x1ED3; Xu&#xE2;n H&#x1B0;&#x1A1;ng' },
      { id: 'flight', title: 'Chuyến bay Cần Thơ hoãn đến hai lần' },
    ];

    expect(selectNewsProcessingBatch(candidates).map(candidate => candidate.id))
      .toEqual(['death-a', 'death-b']);
  });

  it('uses the newest bounded batch when no likely corroborating pair exists', () => {
    const candidates = [
      { id: 'one', title: 'Airport reopens' },
      { id: 'two', title: 'Road repairs begin' },
      { id: 'three', title: 'Flower show announced' },
    ];

    expect(selectNewsProcessingBatch(candidates).map(candidate => candidate.id))
      .toEqual(['one', 'two']);
  });
});
