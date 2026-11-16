import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export function getGeminiConfig(): {
  configured: boolean;
  apiKey: string | undefined;
  model: string;
} {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return {
    configured: Boolean(apiKey),
    apiKey,
    model,
  };
}

export type AgentCallResult<T> =
  | {
      ok: true;
      data: T;
      model: string;
      latencyMs: number;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      ok: false;
      reason: "AI_NOT_CONFIGURED" | "AI_CALL_FAILED" | "SCHEMA_VALIDATION_FAILED";
      message: string;
    };

async function recordAiLog(entry: {
  agentName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  restaurantId?: string;
  userId?: string;
}): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: entry,
    });
  } catch {
    // Never fail an application flow if telemetry logging encounters a transient DB issue
  }
}

/**
 * Shared Gemini runner for all 8 platform AI agents.
 * - Handles missing GEMINI_API_KEY gracefully ("AI not configured")
 * - Validates structured JSON output with Zod before returning
 * - Logs latency & token usage to AiUsageLog
 */
export async function runStructuredAgent<T>(params: {
  agentName: string;
  systemInstruction: string;
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  restaurantId?: string;
  userId?: string;
}): Promise<AgentCallResult<T>> {
  const cfg = getGeminiConfig();
  if (!cfg.configured || !cfg.apiKey) {
    return {
      ok: false,
      reason: "AI_NOT_CONFIGURED",
      message: "AI not configured",
    };
  }

  const startedAt = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
    const response = await ai.models.generateContent({
      model: cfg.model,
      contents: params.contents,
      config: {
        systemInstruction: params.systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const latencyMs = Date.now() - startedAt;
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const rawText = response.text?.trim() ?? "{}";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      await recordAiLog({
        agentName: params.agentName,
        model: cfg.model,
        inputTokens,
        outputTokens,
        latencyMs,
        success: false,
        errorMessage: "Model response was not valid JSON",
        restaurantId: params.restaurantId,
        userId: params.userId,
      });
      return {
        ok: false,
        reason: "SCHEMA_VALIDATION_FAILED",
        message: "AI returned malformed JSON output",
      };
    }

    const validated = params.schema.safeParse(parsedJson);
    if (!validated.success) {
      await recordAiLog({
        agentName: params.agentName,
        model: cfg.model,
        inputTokens,
        outputTokens,
        latencyMs,
        success: false,
        errorMessage: validated.error.message.slice(0, 500),
        restaurantId: params.restaurantId,
        userId: params.userId,
      });
      return {
        ok: false,
        reason: "SCHEMA_VALIDATION_FAILED",
        message: "AI output failed schema validation",
      };
    }

    await recordAiLog({
      agentName: params.agentName,
      model: cfg.model,
      inputTokens,
      outputTokens,
      latencyMs,
      success: true,
      restaurantId: params.restaurantId,
      userId: params.userId,
    });

    return {
      ok: true,
      data: validated.data,
      model: cfg.model,
      latencyMs,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Unknown AI error";
    await recordAiLog({
      agentName: params.agentName,
      model: cfg.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      success: false,
      errorMessage: message.slice(0, 500),
      restaurantId: params.restaurantId,
      userId: params.userId,
    });
    return {
      ok: false,
      reason: "AI_CALL_FAILED",
      message: "AI service temporarily unavailable",
    };
  }
}
