import { AdBanner } from './AdBanner';

const ADFIT_UNIT_ID = 'DAN-u5RBfdl0nhCmMwD0';

interface RoomActionOverlayProps {
  message: string;
}

/** 방 생성/입장 처리 직전에 잠깐 띄우는 전면 오버레이. 광고 노출 시간을 확보한다. */
export function RoomActionOverlay({ message }: RoomActionOverlayProps) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-sm font-semibold text-slate-600">{message}</p>
        <AdBanner unitId={ADFIT_UNIT_ID} width={320} height={250} />
      </div>
    </div>
  );
}
