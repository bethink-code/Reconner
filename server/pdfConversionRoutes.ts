import type { Express } from "express";
import type multer from "multer";
import rateLimit from "express-rate-limit";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import { pool } from "./db";
import { fileParser } from "./fileParser";
import { computeConfidenceScore, extractTablesWithAI } from "./pdfAiExtractor";

export function registerPdfConversionRoutes(
  app: Express,
  upload: multer.Multer,
) {
  const aiExtractLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: "AI extraction limit reached. Try again later." },
  });

  app.post("/api/convert/parse", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const isPDF =
        req.file.mimetype === "application/pdf" ||
        req.file.originalname?.endsWith(".pdf");
      if (!isPDF) {
        return res.status(400).json({ error: "Only PDF files are accepted" });
      }

      const parsed = await fileParser.parsePDF(req.file.buffer);
      const confidence = computeConfidenceScore(parsed);
      const aiAvailable = !!process.env.ANTHROPIC_API_KEY;

      audit(req, {
        action: "convert.parse",
        outcome: "success",
        detail: `${parsed.rowCount} rows, confidence ${confidence}%`,
      });
      res.json({
        headers: parsed.headers,
        rows: parsed.rows,
        rowCount: parsed.rowCount,
        confidence,
        aiAvailable,
      });
    } catch (error: any) {
      audit(req, {
        action: "convert.parse",
        outcome: "error",
        detail: error.message,
      });
      res.status(422).json({ error: error.message || "Failed to extract data from PDF" });
    }
  });

  app.post(
    "/api/convert/ai-extract",
    isAuthenticated,
    aiExtractLimiter,
    upload.single("file"),
    async (req: any, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const isPDF =
          req.file.mimetype === "application/pdf" ||
          req.file.originalname?.endsWith(".pdf");
        if (!isPDF) {
          return res.status(400).json({ error: "Only PDF files are accepted" });
        }

        if (!process.env.ANTHROPIC_API_KEY) {
          return res.status(503).json({ error: "AI extraction is not configured" });
        }

        if (req.file.size > 10 * 1024 * 1024) {
          return res.status(400).json({
            error: "PDF too large for AI extraction. Maximum 10MB.",
          });
        }

        const result = await extractTablesWithAI(req.file.buffer);
        const { usage } = result;

        audit(req, {
          action: "convert.ai_extract",
          outcome: "success",
          detail: `${result.rowCount} rows | ${usage.inputTokens} in / ${usage.outputTokens} out | $${usage.estimatedCostUsd}`,
        });

        try {
          const rawSub = req.user?.claims?.sub;
          const userId = rawSub != null ? String(rawSub) : undefined;
          const userEmail = req.user?.claims?.email || req.user?.email;
          const orgId = req.user?.currentOrgId || null;

          await pool.query(
            `INSERT INTO ai_usage (user_id, user_email, organization_id, action, model, input_tokens, output_tokens, estimated_cost_usd)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              userId,
              userEmail,
              orgId,
              "convert.ai_extract",
              usage.model,
              usage.inputTokens,
              usage.outputTokens,
              usage.estimatedCostUsd,
            ],
          );
        } catch (error) {
          console.error("Failed to log AI usage:", error);
        }

        res.json({
          headers: result.headers,
          rows: result.rows,
          rowCount: result.rowCount,
          usage,
        });
      } catch (error: any) {
        audit(req, {
          action: "convert.ai_extract",
          outcome: "error",
          detail: error.message,
        });
        const status = error.message?.includes("not configured") ? 503 : 422;
        res.status(status).json({ error: error.message || "AI extraction failed" });
      }
    },
  );
}
