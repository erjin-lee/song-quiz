interface GameHelpModalProps {
  onClose: () => void;
}

/**
 * 게임 방법 안내 모달. RoomListPage에서는 버튼으로 선택적으로 열리고,
 * RoomGamePage에서는 방 입장 시 자동으로 뜬다 — 후자의 경우 "확인"/배경 클릭 등
 * 실제 유저 입력으로만 닫혀야 한다. 이 클릭이 브라우저에 user activation을
 * 남겨줘야, 첫 라운드 재생 예정 시각에 자동재생(YouTube unMute+play)이 브라우저
 * 자동재생 정책에 막히지 않는다(대기실에서 아무 조작도 없었던 참가자만 막히던
 * 문제 - GamePlayer.tsx의 자동재생 관련 주석 참고). 타이머로 자동 닫히게 만들면
 * 이 효과가 사라지므로 절대 추가하지 않는다.
 */
export function GameHelpModal({ onClose }: GameHelpModalProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-slate-800">게임 방법</h2>
        <ul className="flex flex-col gap-3 text-sm text-slate-600">
          <li className="flex items-start gap-2.5">
            <span className="shrink-0">💬</span>
            <span>정답은 채팅창에 입력해서 맞혀요.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0">⏱️</span>
            <span>한 라운드는 최대 30초 동안 진행돼요.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0">🏆</span>
            <span>맞힌 순서에 따라 6점, 4점, 3점, 이후 전원 1점을 받아요.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0">⏭️</span>
            <span>참가자 과반수가 스킵을 누르면 라운드가 종료돼요.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0">⚡</span>
            <span>
              스피드 모드에서는 첫 정답자가 나오면 6초 뒤 정답이 공개되고,
              4초 뒤 자동으로 다음 라운드로 넘어가요.
            </span>
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-600"
        >
          확인
        </button>
      </div>
    </div>
  );
}
