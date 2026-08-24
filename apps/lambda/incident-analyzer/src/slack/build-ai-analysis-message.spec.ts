import { buildAiAnalysisMessage } from "./build-ai-analysis-message";
import { AnalysisResult } from "../openai/schema";

const RESULT: AnalysisResult = {
  summary: "Quiz Snapshot 조회가 반복적으로 실패하고 있습니다.",
  probableCause: "API의 DB 조회 지연 가능성이 높습니다.",
  confidence: "HIGH",
  evidence: ["QuizSnapshotFailure 5분 6회", "API latency 2.4s"],
  recommendedChecks: ["MySQL 쿼리 확인", "RDS Connections 확인"],
  limitations: [],
};

describe("buildAiAnalysisMessage", () => {
  it("OpenAI 구조화 결과를 Block Kit 메시지로 formatting한다", () => {
    const message = buildAiAnalysisMessage(
      "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
      "Game",
      RESULT,
    );

    expect(message.text).toBe("🤖 [AI INCIDENT ANALYSIS]");
    const blocksText = JSON.stringify(message.blocks);
    expect(blocksText).toContain("SongQuiz-Prod-High-Game-QuizSnapshotFailure");
    expect(blocksText).toContain(RESULT.summary);
    expect(blocksText).toContain(RESULT.probableCause);
    expect(blocksText).toContain("QuizSnapshotFailure 5분 6회");
    expect(blocksText).toContain("HIGH");
  });

  it('evidence/limitations가 비어 있으면 "없음"으로 표시한다(데이터 부족 케이스, §23)', () => {
    const message = buildAiAnalysisMessage("alarm", "Game", {
      ...RESULT,
      confidence: "LOW",
      evidence: [],
      limitations: ["관련 trace를 조회하지 못했습니다."],
    });

    const blocksText = JSON.stringify(message.blocks);
    expect(blocksText).toContain("*Evidence*\\n없음");
    expect(blocksText).toContain("관련 trace를 조회하지 못했습니다.");
  });
});
