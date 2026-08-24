// 추가 dependency 없이 Node.js 기본 Intl.DateTimeFormat만으로 KST 표기를 만든다.
// 'sv-SE'(스웨덴어) 로케일은 Intl.DateTimeFormat이 별도 조립 없이 "YYYY-MM-DD HH:mm:ss"
// 형태를 그대로 내주는 몇 안 되는 로케일이라 이 트릭을 쓴다 - 언어 표시가 아니라 포맷 트릭이다.
const KST_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatKst(isoTimestamp: string): string {
  return `${KST_FORMATTER.format(new Date(isoTimestamp))} KST`;
}
