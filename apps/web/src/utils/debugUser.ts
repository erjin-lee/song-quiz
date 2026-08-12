const DEBUG_NICKNAME_MARKER = 'DEBUG_USER';
const DEBUG_CHAT_MESSAGE_MAX_LENGTH = 500;

/** 닉네임에 DEBUG_USER가 포함된 유저는 동시 재생 디버깅용 채팅 로그를 발송한다. */
export function isDebugUser(nickname: string): boolean {
  return nickname.includes(DEBUG_NICKNAME_MARKER);
}

/** 디버그 채팅 메시지가 지나치게 길어지지 않도록(room:state 등 큰 payload) 잘라낸다. */
export function truncateForDebugChat(
  text: string,
  maxLength: number = DEBUG_CHAT_MESSAGE_MAX_LENGTH,
): string {
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}...(truncated)`
    : text;
}
