// AI 응답을 자유 텍스트 하나로 받지 않고 구조화된 결과로 받는다(§21). OpenAI Responses API의
// Structured Output(json_schema, strict)을 사용해 이 shape을 벗어난 응답 자체를 방지한다.

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface AnalysisResult {
  summary: string;
  probableCause: string;
  confidence: Confidence;
  evidence: string[];
  recommendedChecks: string[];
  limitations: string[];
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
  },
  required: [
    "summary",
    "probableCause",
    "confidence",
    "evidence",
    "recommendedChecks",
    "limitations",
  ],
  additionalProperties: false,
} as const;

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
  };
}
