import type { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  finalizeAiQuotaSlot,
  PROMPT_INJECTION_SYSTEM_GUARDRAIL,
  reserveDailyAiQuotaSlot,
} from "@/lib/agents/guardrails";

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
export const DEFAULT_AI_TIMEOUT_MS = 25_000;

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

export type AgentFailureReason =
  "AI_NOT_CONFIGURED" | "AI_QUOTA_EXCEEDED" | "AI_CALL_FAILED" | "SCHEMA_VALIDATION_FAILED";

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
      reason: AgentFailureReason;
      message: string;
    };

export function httpStatusForAgentError(reason: AgentFailureReason): number {
  if (reason === "AI_NOT_CONFIGURED") return 503;
  if (reason === "AI_QUOTA_EXCEEDED") return 429;
  return 422;
}

/**
 * Formats a provider error with an explicit class tag (e.g. AUTH_401_403, QUOTA_429, MODEL_404,
 * TIMEOUT, UPSTREAM_5XX) for admin-only `AiUsageLog.errorMessage` diagnostics while redacting any
 * accidental credential query parameters. Never expose this string to end-users/diners.
 */
export function classifyProviderErrorForLog(err: unknown): string {
  const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const rawStatus =
    typeof errObj?.status === "number"
      ? errObj.status
      : typeof errObj?.code === "number"
        ? errObj.code
        : undefined;
  const errName = err instanceof Error ? err.name : "UnknownError";
  const rawMessage = err instanceof Error ? err.message : String(err ?? "Unknown AI error");
  const redactedMessage = rawMessage
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_KEY]");

  const statusMatch =
    rawStatus ??
    (() => {
      const m = /\b(400|401|403|404|429|500|502|503|504)\b/.exec(redactedMessage);
      return m ? Number.parseInt(m[1]!, 10) : undefined;
    })();

  let errorClass = "PROVIDER_ERROR";
  if (
    statusMatch === 401 ||
    statusMatch === 403 ||
    /api[_\s-]?key|unauthenticated|permission_denied|invalid.*key/i.test(redactedMessage)
  ) {
    errorClass = "AUTH_401_403";
  } else if (
    statusMatch === 429 ||
    /resource_exhausted|quota|rate[_\s-]?limit|too many requests/i.test(redactedMessage)
  ) {
    errorClass = "QUOTA_429";
  } else if (statusMatch === 404 || /not_found|model.*not found/i.test(redactedMessage)) {
    errorClass = "MODEL_404";
  } else if (
    errName === "AbortError" ||
    errName === "TimeoutError" ||
    /timed?\s*out|aborted/i.test(redactedMessage)
  ) {
    errorClass = "TIMEOUT";
  } else if (statusMatch && statusMatch >= 500) {
    errorClass = `UPSTREAM_${statusMatch}`;
  } else if (statusMatch === 400) {
    errorClass = "BAD_REQUEST_400";
  }

  const statusTag = statusMatch ? ` HTTP ${statusMatch}` : "";
  return `[${errorClass}${statusTag}] ${errName}: ${redactedMessage}`.slice(0, 500);
}

/**
 * Shared Gemini runner for all platform AI agents.
 * - Handles missing GEMINI_API_KEY gracefully ("AI not configured")
 * - Reserves a DB-backed `PENDING` row in `AiUsageLog` BEFORE calling Gemini (enforcing global,
 *   caller, client IP, and restaurant daily caps across restarts and parallel requests)
 * - Prepends prompt-injection isolation instructions on every call
 * - Enforces a short request timeout (`timeoutMs`, default 25s)
 * - Validates structured JSON output with Zod before returning
 * - Finalizes latency & token usage on the reserved `AiUsageLog` row
 */
export async function runStructuredAgent<T>(params: {
  agentName: string;
  systemInstruction: string;
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  callerKey?: string | null;
  clientIp?: string | null;
  restaurantId?: string;
  userId?: string;
  timeoutMs?: number;
  db?: PrismaClient;
}): Promise<AgentCallResult<T>> {
  const cfg = getGeminiConfig();
  if (!cfg.configured || !cfg.apiKey) {
    return {
      ok: false,
      reason: "AI_NOT_CONFIGURED",
      message: "AI not configured",
    };
  }

  const slot = await reserveDailyAiQuotaSlot(
    {
      agentName: params.agentName,
      model: cfg.model,
      callerKey: params.callerKey ?? (params.userId ? `user:${params.userId}` : null),
      clientIp: params.clientIp ?? null,
      restaurantId: params.restaurantId ?? null,
      userId: params.userId ?? null,
    },
    params.db,
  );

  if (!slot.allowed) {
    return {
      ok: false,
      reason: "AI_QUOTA_EXCEEDED",
      message: slot.reason,
    };
  }

  const startedAt = Date.now();
  const timeoutMs = params.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;

  try {
    const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
    const response = await ai.models.generateContent({
      model: cfg.model,
      contents: params.contents,
      config: {
        systemInstruction: `${PROMPT_INJECTION_SYSTEM_GUARDRAIL}\n\n${params.systemInstruction}`,
        responseMimeType: "application/json",
        abortSignal: AbortSignal.timeout(timeoutMs),
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
      await finalizeAiQuotaSlot(
        slot.logId,
        {
          success: false,
          inputTokens,
          outputTokens,
          latencyMs,
          errorMessage: "Model response was not valid JSON",
        },
        params.db,
      );
      return {
        ok: false,
        reason: "SCHEMA_VALIDATION_FAILED",
        message: "AI returned malformed JSON output",
      };
    }

    const validated = params.schema.safeParse(parsedJson);
    if (!validated.success) {
      await finalizeAiQuotaSlot(
        slot.logId,
        {
          success: false,
          inputTokens,
          outputTokens,
          latencyMs,
          errorMessage: validated.error.message.slice(0, 500),
        },
        params.db,
      );
      return {
        ok: false,
        reason: "SCHEMA_VALIDATION_FAILED",
        message: "AI output failed schema validation",
      };
    }

    await finalizeAiQuotaSlot(
      slot.logId,
      {
        success: true,
        inputTokens,
        outputTokens,
        latencyMs,
      },
      params.db,
    );

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
    const classifiedError = classifyProviderErrorForLog(err);
    await finalizeAiQuotaSlot(
      slot.logId,
      {
        success: false,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        errorMessage: classifiedError,
      },
      params.db,
    );
    return {
      ok: false,
      reason: "AI_CALL_FAILED",
      message: "AI service temporarily unavailable",
    };
  }
}
