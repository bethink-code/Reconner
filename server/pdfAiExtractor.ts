import Anthropic from "@anthropic-ai/sdk";
import type { ParsedFileData } from "./fileParser";

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export function computeConfidenceScore(parsed: ParsedFileData): number {
  const { headers, rows } = parsed;
  if (rows.length === 0) return 0;

  // Column consistency (30%) - what % of rows have same number of non-empty cells
  const cellCounts = rows.map(row =>
    headers.filter(h => row[h] && String(row[h]).trim() !== "").length
  );
  const mostCommonCount = cellCounts
    .sort((a, b) =>
      cellCounts.filter(v => v === a).length - cellCounts.filter(v => v === b).length
    )
    .pop()!;
  const consistencyRatio = cellCounts.filter(c => c === mostCommonCount).length / cellCounts.length;
  const columnConsistency = consistencyRatio * 100;

  // Header quality (15%) - real names vs empty/numeric/generic
  const goodHeaders = headers.filter(h => {
    if (!h || h.trim() === "") return false;
    if (/^Column \d+$/.test(h)) return false;
    if (/^\d+$/.test(h.trim())) return false;
    return true;
  });
  const headerQuality = (goodHeaders.length / Math.max(headers.length, 1)) * 100;

  // Date detection (15%) - at least one column with date-like values
  const datePattern = /\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}/;
  let hasDateColumn = false;
  for (const header of headers) {
    const dateCount = rows.filter(r => datePattern.test(String(r[header] || ""))).length;
    if (dateCount / rows.length > 0.4) {
      hasDateColumn = true;
      break;
    }
  }
  const dateScore = hasDateColumn ? 100 : 0;

  // Numeric detection (15%) - at least one column with numeric/currency values
  const numericPattern = /^[R$€£]?\s*-?\d[\d\s,]*\.?\d*$/;
  let hasNumericColumn = false;
  for (const header of headers) {
    const numCount = rows.filter(r => numericPattern.test(String(r[header] || "").trim())).length;
    if (numCount / rows.length > 0.4) {
      hasNumericColumn = true;
      break;
    }
  }
  const numericScore = hasNumericColumn ? 100 : 0;

  // Row count plausibility (10%) - 3-5000 is good
  let rowScore = 100;
  if (rows.length < 3) rowScore = rows.length * 20;
  else if (rows.length > 5000) rowScore = Math.max(0, 100 - (rows.length - 5000) / 100);

  // Empty cell ratio (15%) - below 20% empty is good
  const totalCells = rows.length * headers.length;
  const emptyCells = rows.reduce((acc, row) =>
    acc + headers.filter(h => !row[h] || String(row[h]).trim() === "").length, 0
  );
  const emptyRatio = emptyCells / Math.max(totalCells, 1);
  let emptyScore = 100;
  if (emptyRatio > 0.5) emptyScore = 0;
  else if (emptyRatio > 0.2) emptyScore = Math.round((1 - (emptyRatio - 0.2) / 0.3) * 100);

  const score = Math.round(
    columnConsistency * 0.3 +
    headerQuality * 0.15 +
    dateScore * 0.15 +
    numericScore * 0.15 +
    rowScore * 0.1 +
    emptyScore * 0.15
  );

  return Math.max(0, Math.min(100, score));
}

export async function extractTablesWithAI(pdfBuffer: Buffer): Promise<ParsedFileData & { usage: AiUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const client = new Anthropic();
  const base64Pdf = pdfBuffer.toString("base64");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          },
          {
            type: "text",
            text: `Extract all tabular transaction data from this PDF document.

Rules:
- Return ONLY a JSON object with exactly this structure: {"headers": ["col1", "col2", ...], "rows": [["val1", "val2", ...], ...]}
- Each row array must have the same length as the headers array
- Merge multi-line rows that belong to the same transaction into a single row
- Ignore decorative elements, page headers, page footers, page numbers, and summary totals
- Focus on the main transaction table(s): dates, descriptions, references, amounts, balances
- If there are multiple tables, combine them if they have the same structure, otherwise use the largest one
- Use the actual column headers from the document
- Preserve all data values exactly as they appear
- Return valid JSON only, no markdown or explanation`,
          },
        ],
      },
    ],
  });

  const textContent = response.content.find(block => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from AI extraction");
  }

  let jsonStr = textContent.text.trim();
  // Strip markdown code fences if present
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: { headers: string[]; rows: string[][] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try to extract JSON from the response
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error("AI returned invalid JSON response");
    }
  }

  if (!parsed.headers || !Array.isArray(parsed.headers) || !parsed.rows || !Array.isArray(parsed.rows)) {
    throw new Error("AI response missing headers or rows");
  }

  // Convert row arrays to Record objects
  const rows = parsed.rows.map(row => {
    const obj: Record<string, any> = {};
    parsed.headers.forEach((header, i) => {
      obj[header] = row[i] || "";
    });
    return obj;
  });

  // Calculate cost — Sonnet 4 pricing: $3/MTok input, $15/MTok output
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const estimatedCostUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  return {
    headers: parsed.headers,
    rows,
    rowCount: rows.length,
    usage: {
      model: "claude-sonnet-4-20250514",
      inputTokens,
      outputTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000, // 4 decimal places
    },
  };
}
