export class VoiceSettingsResponse {
  /** 음성 결제 허용. 끄면 음성 주문은 모두 정차 후 확인을 거친다 */
  voiceOrderEnabled: boolean;
  /** 음성 1회 결제 한도(원) */
  voiceLimitPerOrder: number;
  /** 음성 1일 결제 한도(원, KST 기준) */
  voiceLimitDaily: number;
}

export class VehicleSummary {
  id: string;
  plateNumber: string;
  model: string | null;
}

export class MeResponse {
  id: string;
  name: string;
  vehicle: VehicleSummary;
  settings: VoiceSettingsResponse;
}

export class FavoriteItem {
  menuItemId: string;
  qty: number;
}

export class FavoriteResponse {
  id: string;
  /** 음성 호출 이름. 예: "평소 그거" */
  alias: string;
  storeId: string | null;
  items: FavoriteItem[];
  createdAt: Date;
}
