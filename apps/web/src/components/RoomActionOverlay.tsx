import { AdBanner } from './AdBanner';

const ADSENSE_SLOT_ROOM_GAME = import.meta.env.VITE_ADSENSE_SLOT_ROOM_GAME;

interface RoomActionOverlayProps {
  message: string;
}

/** 방 생성/입장 처리 직전에 잠깐 띄우는 전면 오버레이. 광고 노출 시간을 확보한다. */
export function RoomActionOverlay({ message }: RoomActionOverlayProps) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-sm font-semibold text-slate-600">{message}</p>
        <AdBanner slotId={ADSENSE_SLOT_ROOM_GAME} />
      </div>
    </div>
  );
}
