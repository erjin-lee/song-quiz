import OpenAI from "openai";
import { IncidentContext } from "../context/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import {
  ANALYSIS_RESULT_JSON_SCHEMA,
  AnalysisResult,
  Confidence,
  buildFallbackAnalysisResult,
} from "./schema";

// 여러 AWS API 조회 뒤에 이어지는 호출이라 apps/api의 OpenAiChatClient(maxRetries=2,
// timeout=60초)보다 짧고 재시도 횟수도 적게 잡는다 - Lambda 전체 timeout(60초, §28) 안에서
// Metrics/Logs Insights polling/X-Ray/Slack 호출까지 끝나야 하므로, worst case(재시도 포함)
// 20초 * 2회 = 40초 안으로 상한을 둔다.
const MAX_RETRIES = 1;
const REQUEST_TIMEOUT_MS = 20_000;

const VALID_CONFIDENCE: Confidence[] = ["HIGH", "MEDIUM", "LOW"];

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.summary === "string" &&
    typeof candidate.probableCause === "string" &&
    VALID_CONFIDENCE.includes(candidate.confidence as Confidence) &&
    Array.isArray(candidate.evidence) &&
    Array.isArray(candidate.recommendedChecks) &&
    Array.isArray(candidate.limitations)
  );
}

export interface AnalyzeIncidentConfig {
  apiKey: string;
  model: string;
}

/**
 * IncidentContext를 OpenAI Responses API로 보내 구조화된 분석 결과를 받는다(§17, §21).
 * network/인증 오류 등 API 호출 자체의 실패는 그대로 throw해 호출부(handler.ts)가
 * "OpenAI 실패" stage로 처리하게 한다 - 이 경우 Slack AI 분석 메시지를 보내지 않는다.
 * 반면 API 호출은 성공했지만 응답이 스키마를 벗어나 파싱에 실패하면(이론상 strict
 * structured output에서는 드물지만) throw하지 않고 정직한 LOW-confidence fallback을
 * 반환해 그 결과를 그대로 Slack에 보낸다(§21).
 */
export async function analyzeIncident(
  context: IncidentContext,
  config: AnalyzeIncidentConfig,
): Promise<AnalysisResult> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  const response = await client.responses.create({
    model: config.model,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(context) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "incident_analysis",
        schema: ANALYSIS_RESULT_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const content = response.output_text;
  if (!content) {
    return buildFallbackAnalysisResult("OpenAI 응답에 content가 없습니다.");
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (!isAnalysisResult(parsed)) {
      return buildFallbackAnalysisResult(
        "OpenAI 응답이 예상한 형식과 다릅니다.",
      );
    }
    return parsed;
  } catch {
    return buildFallbackAnalysisResult("OpenAI 응답 JSON 파싱에 실패했습니다.");
  }
}
