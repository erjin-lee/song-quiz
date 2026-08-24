// AI 응답을 자유 텍스트 하나로 받지 않고 구조화된 결과로 받는다(§21). OpenAI Responses API의
// Structured Output(json_schema, strict)을 사용해 이 shape을 벗어난 응답 자체를 방지한다.

export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type DeploymentRelevance = "HIGH" | "MEDIUM" | "LOW" | "NONE";

// 최근 배포/PR은 반드시 "보조 근거"로만 쓴다(§2, §22~23) - relevance/summary를 별도
// 필드로 분리해, "최근에 배포됨"과 "장애 원인임"을 AI가 구조적으로 구분해서 답하게 한다.
export interface DeploymentCorrelation {
  relevance: DeploymentRelevance;
  summary: string;
}

export interface AnalysisResult {
  summary: string;
  probableCause: string;
  confidence: Confidence;
  evidence: string[];
  recommendedChecks: string[];
  limitations: string[];
  deploymentCorrelation: DeploymentCorrelation;
}

export const ANALYSIS_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    probableCause: { type: "string" },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    evidence: { type: "array", items: { type: "string" } },
    recommendedChecks: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
    deploymentCorrelation: {
      type: "object",
      properties: {
        relevance: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "NONE"] },
        summary: { type: "string" },
      },
      required: ["relevance", "summary"],
      additionalProperties: false,
    },
  },
  required: [
    "summary",
    "probableCause",
    "confidence",
    "evidence",
    "recommendedChecks",
    "limitations",
    "deploymentCorrelation",
  ],
  additionalProperties: false,
} as const;

// evidence/recommendedChecks/limitations가 너무 길어지지 않도록(§26) 응답을 받은 뒤
// 여기서 잘라낸다 - json_schema strict mode가 minItems/maxItems를 안정적으로 지원한다는
// 보장이 없어 스키마가 아니라 후처리로 제한한다(analyze-incident.ts에서 사용).
export const MAX_EVIDENCE_ITEMS = 6;
export const MAX_RECOMMENDED_CHECKS = 4;
export const MAX_LIMITATIONS = 4;

/** 파싱 실패 시(§21) 또는 데이터 부족 시(§23) 쓰는 정직한 fallback 결과. */
export function buildFallbackAnalysisResult(reason: string): AnalysisResult {
  return {
    summary: "현재 데이터만으로 AI 분석 결과를 생성하지 못했습니다.",
    probableCause: "현재 데이터만으로 특정할 수 없습니다.",
    confidence: "LOW",
    evidence: [],
    recommendedChecks: [
      "CloudWatch Logs/Metrics/X-Ray Console에서 직접 확인하세요.",
    ],
    limitations: [reason],
    deploymentCorrelation: {
      relevance: "NONE",
      summary: "분석 실패로 배포 연관성을 판단하지 못했습니다.",
    },
  };
}
