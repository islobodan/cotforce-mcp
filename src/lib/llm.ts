/**
 * Direct LLM HTTP client for MCP clients that don't support sampling/createMessage.
 * Uses OpenAI-compatible /v1/chat/completions endpoint.
 * Works with OpenAI, LMStudio, Ollama, and any OpenAI-compatible provider.
 */

export interface DirectLLMOptions {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  baseUrl: string;
}

export interface DirectLLMResult {
  text: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callDirectLLM(
  options: DirectLLMOptions
): Promise<DirectLLMResult> {
  const url = `${options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const body = {
    model: options.model,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    max_tokens: options.maxTokens,
    temperature: options.temperature,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Direct LLM HTTP error ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new Error("Direct LLM returned empty content");
  }

  return { text, usage: data.usage };
}

export function isDirectModeConfigured(): boolean {
  return Boolean(process.env.API_KEY);
}
