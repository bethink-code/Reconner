import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import { assertFileOwner, assertFileWrite } from "./routeAccess";
import { storage } from "./storage";
import { fileParser, DataNormalizer } from "./fileParser";
import { objectStorageService } from "./objectStorage";

const columnMappingSchema = z.record(
  z.enum([
    "date",
    "amount",
    "reference",
    "description",
    "time",
    "paymentType",
    "cardNumber",
    "attendant",
    "cashier",
    "pump",
    "ignore",
  ]),
);

async function readFileBuffer(file: any): Promise<Buffer> {
  if (file.fileData) {
    return Buffer.from(file.fileData, "base64");
  }

  const objectFile = await objectStorageService.getFile(file.fileUrl);
  const [buffer] = await objectFile.download();
  return buffer;
}

export function registerFilePreparationRoutes(app: Express) {
  app.get("/api/files/:fileId/preview", isAuthenticated, async (req: any, res) => {
    try {
      const file = await assertFileOwner(req.params.fileId, req, res);
      if (!file) return;

      const buffer = await readFileBuffer(file);
      const parsed = await fileParser.parse(buffer, file.fileType);
      const suggestedMappingsArray = fileParser.autoDetectColumns(parsed.headers);

      const suggestedMappings: Record<string, string> = {};
      for (const mapping of suggestedMappingsArray) {
        suggestedMappings[mapping.detectedColumn] = mapping.suggestedMapping;
      }

      const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
      const columnLabels: Record<string, string> = {};
      for (const header of parsed.headers) {
        columnLabels[header] = fileParser.getColumnLabel(header, parsed.headers);
      }

      const normalizedPreview: Array<{
        transactionDate: string;
        transactionTime: string;
        amount: string;
        referenceNumber: string;
        description: string;
        paymentType: string;
        isCardTransaction: "yes" | "no" | "unknown";
      }> = [];

      const fullAnalysisStats = {
        totalRows: parsed.rowCount,
        validTransactions: 0,
        cardTransactions: 0,
        cashTransactions: 0,
        unknownPaymentType: 0,
        skippedRows: {
          headerRows: 0,
          emptyDate: 0,
          zeroOrInvalidAmount: 0,
          pageBreaks: 0,
          other: 0,
        },
      };

      const mappingToUse = file.columnMapping || suggestedMappings;
      if (mappingToUse && Object.keys(mappingToUse).length > 0) {
        for (let i = 0; i < parsed.rows.length; i++) {
          const row = parsed.rows[i];
          const extracted = fileParser.extractTransactionData(
            row,
            mappingToUse as Record<string, string>,
            parsed.headers,
            file.sourceType,
          );

          if (i < 5) {
            normalizedPreview.push(extracted);
          }

          const validation = fileParser.isValidTransactionRow(
            extracted,
            row,
            mappingToUse as Record<string, string>,
          );

          if (!validation.valid) {
            switch (validation.reason) {
              case "header_row":
                fullAnalysisStats.skippedRows.headerRows++;
                break;
              case "empty_date":
                fullAnalysisStats.skippedRows.emptyDate++;
                break;
              case "zero_or_invalid_amount":
                fullAnalysisStats.skippedRows.zeroOrInvalidAmount++;
                break;
              case "page_break":
                fullAnalysisStats.skippedRows.pageBreaks++;
                break;
              default:
                fullAnalysisStats.skippedRows.other++;
            }
          } else {
            fullAnalysisStats.validTransactions++;
            if (extracted.isCardTransaction === "yes") {
              fullAnalysisStats.cardTransactions++;
            } else if (extracted.isCardTransaction === "no") {
              fullAnalysisStats.cashTransactions++;
            } else {
              fullAnalysisStats.unknownPaymentType++;
            }
          }
        }
      }

      res.json({
        headers: parsed.headers,
        rows: DataNormalizer.normalizePreviewRows(parsed.rows.slice(0, 5)),
        totalRows: parsed.rowCount,
        suggestedMappings,
        currentMapping: file.columnMapping,
        detectedPreset: detectedPreset
          ? {
              name: detectedPreset.name,
              description: detectedPreset.description,
            }
          : null,
        columnLabels,
        normalizedPreview,
        qualityReport: file.qualityReport,
        fullAnalysisStats,
      });
    } catch (error) {
      console.error("Error fetching file preview:", error);
      res.status(500).json({ error: "Failed to fetch file preview" });
    }
  });

  app.post("/api/files/:fileId/column-mapping", isAuthenticated, async (req: any, res) => {
    try {
      const validatedMapping = columnMappingSchema.parse(req.body.columnMapping);

      const file = await assertFileWrite(req.params.fileId, req, res);
      if (!file) return;

      const mappedFields: Record<string, string> = {};
      const duplicates: { field: string; columns: string[] }[] = [];

      for (const [column, field] of Object.entries(validatedMapping)) {
        if (field === "ignore") continue;

        if (mappedFields[field]) {
          const existing = duplicates.find((duplicate) => duplicate.field === field);
          if (existing) {
            existing.columns.push(column);
          } else {
            duplicates.push({ field, columns: [mappedFields[field], column] });
          }
        } else {
          mappedFields[field] = column;
        }
      }

      if (duplicates.length > 0) {
        const errorMessages = duplicates.map(
          (duplicate) =>
            `"${duplicate.field}" is mapped to both "${duplicate.columns.join('" and "')}" - please choose only ONE column for each field`,
        );
        return res.status(400).json({
          error: "Duplicate mappings detected",
          duplicates,
          message: errorMessages.join(". "),
        });
      }

      await storage.updateFile(req.params.fileId, {
        columnMapping: validatedMapping,
        status: "mapped",
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving column mapping:", error?.message || String(error));
      console.error("Column mapping error:", error?.message || String(error));
      res.status(400).json({ error: "Invalid column mapping data" });
    }
  });
}
