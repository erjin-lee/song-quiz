import { buildAiAnalysisMessage } from "./build-ai-analysis-message";
import { AnalysisResult } from "../openai/schema";
import { DeploymentContext } from "../context/types";

const RESULT: AnalysisResult = {
  summary: "Quiz Snapshot 조회가 반복적으로 실패하고 있습니다.",
  probableCause: "API의 DB 조회 지연 가능성이 높습니다.",
  confidence: "HIGH",
  evidence: ["QuizSnapshotFailure 5분 6회", "API latency 2.4s"],
  recommendedChecks: ["MySQL 쿼리 확인", "RDS Connections 확인"],
  limitations: [],
  deploymentCorrelation: {
    relevance: "HIGH",
    summary:
      "장애 9분 전 API가 배포되었고, PR #82에서 관련 파일이 변경되었습니다.",
  },
};

const DEPLOYMENTS: DeploymentContext[] = [
  {
    service: "api",
    commitSha: "abc123",
    deployedAt: "2026-08-24T03:21:00.000Z",
    minutesBeforeIncident: 9,
    pullRequestLookup: "FOUND",
    pullRequest: {
      number: 82,
      title: "Quiz Snapshot 조회 로직 개선",
      changedFiles: ["apps/api/src/quiz/quiz.service.ts"],
    },
  },
];

const DEPLOYMENT_PR_LOOKUP_FAILED: DeploymentContext = {
  service: "game",
  commitSha: "def456",
  deployedAt: "2026-08-24T03:15:00.000Z",
  minutesBeforeIncident: 15,
  pullRequestLookup: "FAILED",
};

describe("buildAiAnalysisMessage", () => {
  it("OpenAI 구조화 결과를 Block Kit 메시지로 formatting한다", () => {
    const message = buildAiAnalysisMessage(
      "SongQuiz-Prod-High-Game-QuizSnapshotFailure",
      "Game",
      RESULT,
      DEPLOYMENTS,
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
    const message = buildAiAnalysisMessage(
      "alarm",
      "Game",
      {
        ...RESULT,
        confidence: "LOW",
        evidence: [],
        limitations: ["관련 trace를 조회하지 못했습니다."],
      },
      [],
    );

    const blocksText = JSON.stringify(message.blocks);
    expect(blocksText).toContain("*Evidence*\\n없음");
    expect(blocksText).toContain("관련 trace를 조회하지 못했습니다.");
  });

  it("deploymentCorrelation이 HIGH면 Recent Deployment/PR 정보를 표시한다(§25)", () => {
    const message = buildAiAnalysisMessage(
      "alarm",
      "Game",
      RESULT,
      DEPLOYMENTS,
    );

    const blocksText = JSON.stringify(message.blocks);
    expect(blocksText).toContain("Recent Deployment");
    expect(blocksText).toContain("9분 전");
    expect(blocksText).toContain("PR #82");
    expect(blocksText).toContain("Deployment Correlation");
  });

  it("deploymentCorrelation이 NONE이면 Recent Deployment 목록을 지나치게 강조하지 않는다(§25, §27)", () => {
    const message = buildAiAnalysisMessage(
      "alarm",
      "Game",
      {
        ...RESULT,
        deploymentCorrelation: {
          relevance: "NONE",
          summary:
            "Metrics/Logs/Trace에서 장애 징후가 없어 관련성을 뒷받침할 근거가 없습니다.",
        },
      },
      DEPLOYMENTS,
    );

    const blocksText = JSON.stringify(message.blocks);
    expect(blocksText).not.toContain("Recent Deployment");
    expect(blocksText).toContain("Deployment Correlation");
    expect(blocksText).toContain("NONE");
  });

  it("pullRequestLookup이 FAILED면 direct push와 구분해 PR 조회 실패로 표시한다(§4)", () => {
    const message = buildAiAnalysisMessage("alarm", "Game", RESULT, [
      DEPLOYMENT_PR_LOOKUP_FAILED,
    ]);

    const blocksText = JSON.stringify(message.blocks);
    expect(blocksText).toContain("PR 조회 실패");
    expect(blocksText).not.toContain("direct push");
  });
});
