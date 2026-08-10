import type { RoomParticipantDto } from '../types/room';

export function sortParticipantsByScore(
  participants: RoomParticipantDto[],
): RoomParticipantDto[] {
  return [...participants].sort((a, b) => b.score - a.score);
}
