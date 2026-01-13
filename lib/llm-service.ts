import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Initialize Clients
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// We use the OpenAI provider for Groq (it is API compatible)
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

// --- PERSONALITIES & GOALS ---

const SYSTEM_PROMPT_COMMON = `
You are an autonomous AI trading agent. 
OBJECTIVE: Achieve consistent monthly returns of 5% (approx 0.25% per trading day).
RISK PROFILE: Conservative to Moderate. Prioritize capital preservation.
STRATEGY: Target high-probability "base hits" rather than high-risk "home runs".
OUTPUT FORMAT: You must strictly output valid JSON.
`;

const PROMPTS = {
  gemini_analyst: `
    ${SYSTEM_PROMPT_COMMON}
    ROLE: Fundamental & Sentiment Analyst.
    STRENGTH: You are skeptical. You look for reasons NOT to buy.
    INSTRUCTIONS: 
    1. Analyze the provided technical data AND news sentiment.
    2. If News Sentiment is negative (< 0), override positive technicals and REJECT the trade.
    3. If RSI is > 70, strictly SELL or HOLD (unless news is extremely bullish).
    4. Provide a "data_verification" string proving you read the specific price/RSI provided.
  `,
  llama_technical: `
    ${SYSTEM_PROMPT_COMMON}
    ROLE: Technical Scalper.
    STRENGTH: You are a pattern recognition engine.
    INSTRUCTIONS:
    1. Focus purely on the numbers (RSI, MACD, Trend).
    2. Ignore news unless it is catastrophic (-0.5 or lower).
    3. Buy Aggressively if RSI < 30 and Trend is UP.
    4. Sell Aggressively if RSI > 70.
  `
};

export type LLMDecision = {
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string;
  data_verification: string; // Proof the LLM read the inputs
};

export async function getLLMDecision(
  modelType: 'gemini' | 'llama', 
  symbol: string, 
  marketData: string
): Promise<LLMDecision> {
  
  // Select Model
  const model = modelType === 'gemini' 
    ? google('models/gemini-1.5-flash')
    : groq('llama-3.3-70b-versatile'); 

  const systemPrompt = modelType === 'gemini' ? PROMPTS.gemini_analyst : PROMPTS.llama_technical;

  try {
    const { text } = await generateText({
      model: model,
      system: systemPrompt,
      prompt: `
        Analyze this stock: ${symbol}
        DATA: ${marketData}
        
        Respond in this exact JSON format:
        {
          "action": "buy" | "sell" | "hold",
          "confidence": 0.1 to 1.0,
          "reasoning": "brief explanation",
          "data_verification": "I see Price is X and RSI is Y"
        }
      `,
    });

    // Clean up potential markdown formatting (```json ... ```)
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as LLMDecision;

  } catch (error) {
    console.error(`Error getting ${modelType} decision for ${symbol}:`, error);
    return {
      symbol,
      action: 'hold',
      confidence: 0,
      reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data_verification: 'Failed'
    };
  }
}