/** 공백/대소문자 차이를 무시하고 정답을 비교하기 위한 정규화. */
export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '');
}

/** 1등 6점, 2등 4점, 3등 3점, 4등 이후는 모두 1점. rank는 0부터 시작한다. */
export function pointsForRank(rank: number): number {
  if (rank === 0) return 6;
  if (rank === 1) return 4;
  if (rank === 2) return 3;
  return 1;
}
