// OK 메시지의 "Duration"은 previousState(ALARM)와 state(OK)의 timestamp 차이로만 계산한다 -
// EventBridge 이벤트가 실제로 제공하는 값만 쓰고, 존재하지 않는 값을 추측해서 만들지 않는다.
export function formatDuration(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "알 수 없음";
  }

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  if (hours === 0 && (seconds > 0 || parts.length === 0))
    parts.push(`${seconds}초`);

  return parts.join(" ");
}
