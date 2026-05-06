import type { Express } from "express";
import type multer from "multer";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import {
  fileParser,
  DataNormalizer,
  detectAndExcludeDuplicates,
  detectAndExcludeReversals,
} from "./fileParser";
import { dataQualityValidator } from "./dataQualityValidator";
import { objectStorageService } from "./objectStorage";
import { ReconciliationCommandService } from "./reconciliation/reconciliationCommandService.ts";
import { reconciliationStateWriter } from "./reconciliation/reconciliationStateWriter.ts";
import { assertFileWrite, assertPeriodWrite } from "./routeAccess";
import { storage } from "./storage";

type ComputeContentHash = (buffer: Buffer) => string;

function inferUploadFileType(file: Express.Multer.File) {
  const lower = file.originalname.toLowerCase();
  const isCSV =
    file.mimetype.includes("csv") ||
    file.mimetype === "text/csv" ||
    file.mimetype === "text/plain" ||
    lower.endsWith(".csv") ||
    lower.endsWith(".txt");
  const isExcel =
    file.mimetype.includes("spreadsheet") ||
    file.mimetype.includes("excel") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls");
  const isPDF = file.mimetype === "application/pdf" || lower.endsWith(".pdf");

  return {
    isCSV,
    isExcel,
    isPDF,
    fileType: isCSV ? "csv" : isExcel ? "xlsx" : "pdf",
  };
}

function normalizeIssueType(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes("column_shift")) return "column_shift";
  if (normalized.includes("page_break")) return "page_break";
  if (normalized.includes("repeated_header")) return "repeated_header";
  if (normalized.includes("empty_column")) return "empty_column";
  if (
    normalized.includes("type_mismatch") ||
    normalized.includes("data_type_mismatch")
  ) {
    return "type_mismatch";
  }
  if (normalized.includes("missing_required")) return "missing_data";
  if (normalized.includes("inconsistent")) return "inconsistent_data";
  return normalized;
}

async function readFileBuffer(file: any): Promise<Buffer> {
  if (file.fileData) {
    return Buffer.from(file.fileData, "base64");
  }
  const objectFile = await objectStorageService.getFile(file.fileUrl);
  const [buffer] = await objectFile.download();
  return buffer;
}

const reconciliationCommandService = new ReconciliationCommandService(reconciliationStateWriter);

export function registerFileWorkflowRoutes(
  app: Express,
  upload: multer.Multer,
  computeContentHash: ComputeContentHash,
) {
  app.post(
    "/api/periods/:periodId/files/upload",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      try {
        const period = await assertPeriodWrite(req.params.periodId, req, res);
        if (!period) return;

        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }

        const { sourceType, sourceName, bankName } = req.body;
        if (!sourceType || !sourceName) {
          return res
            .status(400)
            .json({ error: "sourceType and sourceName are required" });
        }

        const contentHash = computeContentHash(req.file.buffer);
        const existingFiles = await storage.getFilesByPeriod(req.params.periodId);
        const existingFile = existingFiles.find(
          (file) => file.sourceType === sourceType && file.sourceName === sourceName,
        );

        if (existingFile && existingFile.contentHash === contentHash) {
          console.log(
            `Same file re-uploaded, re-parsing for mappings: ${existingFile.fileName}`,
          );

          const reuploadType = inferUploadFileType(req.file);
          const reuploadParsed = await fileParser.parse(
            req.file.buffer,
            reuploadType.isCSV ? "csv" : "excel",
          );
          const reuploadMappingsArray = fileParser.autoDetectColumns(
            reuploadParsed.headers,
          );
          const reuploadDetectedPreset = fileParser.detectSourcePreset(
            reuploadParsed.headers,
          );

          const reuploadMappings: Record<string, string> = {};
          if (reuploadDetectedPreset) {
            for (const header of reuploadParsed.headers) {
              reuploadMappings[header] =
                reuploadDetectedPreset.mappings[header] || "ignore";
            }
          } else {
            for (const mapping of reuploadMappingsArray) {
              reuploadMappings[mapping.detectedColumn] =
                mapping.suggestedMapping || "ignore";
            }
            for (const header of reuploadParsed.headers) {
              if (!reuploadMappings[header]) {
                reuploadMappings[header] = "ignore";
              }
            }
          }

          return res.json({
            file: existingFile,
            parsed: {
              headers: reuploadParsed.headers,
              rows: [],
              rowCount: existingFile.rowCount || reuploadParsed.rowCount,
            },
            suggestedMappings: reuploadMappings,
            qualityReport:
              existingFile.qualityReport || {
                hasIssues: false,
                totalRows: reuploadParsed.rowCount,
                cleanRows: reuploadParsed.rowCount,
                issues: [],
              },
            isReupload: true,
            message: "Same file detected, using existing data",
          });
        }

        const fileToReplace = existingFile
          ? {
              id: existingFile.id,
              fileName: existingFile.fileName,
              fileUrl: existingFile.fileUrl,
            }
          : null;

        if (fileToReplace) {
          console.log(
            `Will replace existing file after successful upload: ${fileToReplace.fileName} (${fileToReplace.id})`,
          );
        }

        const inferredType = inferUploadFileType(req.file);
        if (!inferredType.isCSV && !inferredType.isExcel && !inferredType.isPDF) {
          return res.status(400).json({
            error:
              "Invalid file format. Please upload CSV, TXT, Excel, or PDF files only.",
          });
        }

        const parsed = await fileParser.parse(req.file.buffer, inferredType.fileType);
        if (parsed.rowCount > 500000) {
          return res.status(400).json({
            error: `File contains ${parsed.rowCount.toLocaleString()} rows, which exceeds the 500,000 row limit. Please upload a smaller file.`,
          });
        }

        const columnMappings = fileParser.autoDetectColumns(parsed.headers);
        const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
        const normalizeSourceType = (value: string) => value.replace(/\d+$/, "");

        if (
          detectedPreset &&
          detectedPreset.category !== normalizeSourceType(sourceType)
        ) {
          const detectedCategory = detectedPreset.category;
          const expectedCategory = normalizeSourceType(sourceType);
          console.warn(
            `Source type mismatch: expected ${expectedCategory}, detected ${detectedCategory} (${detectedPreset.name})`,
          );
          return res.status(400).json({
            error: `This looks like a ${detectedCategory === "bank" ? "bank statement" : "fuel system export"}, but you're uploading it as ${expectedCategory === "bank" ? "bank data" : "fuel data"}. Please check you're on the right step.`,
            detectedType: detectedCategory,
            expectedType: expectedCategory,
            detectedPreset: detectedPreset.name,
          });
        }

        const suggestedMappingsObject: Record<string, string> = {};
        for (const mapping of columnMappings) {
          suggestedMappingsObject[mapping.detectedColumn] = mapping.suggestedMapping;
        }

        const rawQualityReport = dataQualityValidator.validate(
          parsed,
          sourceType as "fuel" | "bank",
          sourceName,
        );

        const qualityReport = {
          hasIssues: rawQualityReport.hasIssues,
          hasCriticalIssues: rawQualityReport.hasCriticalIssues,
          overallScore:
            100 -
            (rawQualityReport.problematicRows / rawQualityReport.totalRows) * 100,
          totalRows: rawQualityReport.totalRows,
          cleanRows: rawQualityReport.cleanRows,
          problematicRows: rawQualityReport.problematicRows,
          issues: rawQualityReport.issues.map((issue) => ({
            type: normalizeIssueType(issue.type),
            severity: issue.severity.toLowerCase(),
            message: issue.message,
            details: issue.details,
            affectedColumns: issue.details?.columns,
            rowNumbers: issue.affectedRows,
            suggestedFix: issue.suggestedFix,
          })),
          columnAnalysis: rawQualityReport.columnAnalysis.map((column) => ({
            columnName: column.columnName,
            columnIndex: column.columnIndex,
            inferredType: column.inferredType,
            nullCount: column.nullCount,
            nonNullCount: column.nonNullCount,
            uniqueValues: column.uniqueValues,
            sampleValues: column.sampleValues,
            expectedType: column.inferredType,
            actualType: column.inferredType,
            nullPercentage:
              (column.nullCount / (column.nullCount + column.nonNullCount)) * 100,
            consistencyScore:
              100 -
              ((column.headerLikeValues + column.pageLikeValues) /
                (column.nonNullCount || 1)) *
                100,
          })),
          suggestedMapping: rawQualityReport.suggestedColumnMapping,
          suggestedColumnMapping: rawQualityReport.suggestedColumnMapping,
          rowsToRemove: rawQualityReport.rowsToRemove,
          columnShiftDetected: rawQualityReport.columnShiftDetected,
          shiftDetails: rawQualityReport.shiftDetails,
          detectedPreset: rawQualityReport.detectedPreset,
        };

        const safeFileName = req.file.originalname
          .replace(/[^a-zA-Z0-9._\- ]/g, "_")
          .slice(0, 200);

        const fileUrl = await objectStorageService.uploadFile(
          req.file.buffer,
          safeFileName,
          req.file.mimetype,
        );

        const uploadedFile = await storage.createFile({
          periodId: req.params.periodId,
          fileName: safeFileName,
          fileType: inferredType.fileType,
          sourceType,
          sourceName,
          fileUrl,
          fileData: req.file.buffer.toString("base64"),
          fileSize: req.file.size,
          rowCount: parsed.rowCount,
          columnMapping: null,
          qualityReport,
          contentHash,
          bankName: bankName || null,
          status: "uploaded",
        });

        if (fileToReplace) {
          console.log(
            `Cleaning up replaced file: ${fileToReplace.fileName} (${fileToReplace.id})`,
          );
          try {
            await reconciliationCommandService.deleteFileAndState(req.params.periodId, fileToReplace.id);
            await objectStorageService.deleteFile(fileToReplace.fileUrl);
            console.log(
              "Successfully cleaned up old file, its transactions, and related matches",
            );
          } catch (cleanupError) {
            console.warn("Could not fully clean up old file:", cleanupError);
          }
        }

        audit(req, {
          action: "file.upload",
          resourceType: "file",
          resourceId: uploadedFile.id,
          detail: `${safeFileName} (${sourceType}/${sourceName})`,
        });

        res.json({
          file: uploadedFile,
          preview: {
            headers: parsed.headers,
            rows: DataNormalizer.normalizePreviewRows(parsed.rows.slice(0, 5)),
            totalRows: parsed.rowCount,
          },
          suggestedMappings: suggestedMappingsObject,
          qualityReport,
        });
      } catch (error: any) {
        console.error("Error uploading file:", error);
        console.error("Upload error detail:", error?.message || String(error));
        res.status(500).json({ error: "Failed to upload file" });
      }
    },
  );

  app.post(
    "/api/periods/:periodId/files/:fileId/process",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const period = await assertPeriodWrite(req.params.periodId, req, res);
        if (!period) return;

        const file = await storage.getFile(req.params.fileId);
        if (!file) {
          return res.status(404).json({ error: "File not found" });
        }

        if (file.periodId !== req.params.periodId) {
          return res
            .status(400)
            .json({ error: "File does not belong to this period" });
        }

        if (!file.columnMapping) {
          return res.status(400).json({ error: "Column mapping not set" });
        }

        await reconciliationCommandService.clearFileTransactions(req.params.periodId, file.id);
        const buffer = await readFileBuffer(file);
        const parsed = await fileParser.parse(buffer, file.fileType);

        if (parsed.rowCount > 500000) {
          return res.status(400).json({
            error: `File contains ${parsed.rowCount.toLocaleString()} rows, which exceeds the 500,000 row limit.`,
          });
        }

        const skipStats = {
          header_row: 0,
          empty_date: 0,
          zero_or_invalid_amount: 0,
          page_break: 0,
          total_skipped: 0,
          total_processed: 0,
        };

        const validTransactions: any[] = [];
        for (const row of parsed.rows) {
          const extracted = fileParser.extractTransactionData(
            row,
            file.columnMapping as Record<string, string>,
            parsed.headers,
            file.sourceType,
          );

          const validation = fileParser.isValidTransactionRow(
            extracted,
            row,
            file.columnMapping as Record<string, string>,
          );

          if (!validation.valid) {
            skipStats.total_skipped++;
            if (validation.reason && validation.reason in skipStats) {
              (skipStats as any)[validation.reason]++;
            }
            continue;
          }

          skipStats.total_processed++;

          const scrubbedRow = { ...row };
          const mapping = file.columnMapping as Record<string, string>;
          for (const [column, field] of Object.entries(mapping)) {
            if (field === "cardNumber" && scrubbedRow[column]) {
              const value = String(scrubbedRow[column]);
              scrubbedRow[column] =
                value.length > 4 ? "****" + value.slice(-4) : value;
            }
          }

          validTransactions.push({
            fileId: file.id,
            periodId: file.periodId,
            sourceType: file.sourceType,
            sourceName: file.sourceName,
            rawData: scrubbedRow,
            transactionDate: extracted.transactionDate,
            transactionTime: extracted.transactionTime || null,
            amount: extracted.amount,
            description: extracted.description || "",
            referenceNumber: extracted.referenceNumber || "",
            cardNumber: extracted.cardNumber || null,
            paymentType: extracted.paymentType || null,
            isCardTransaction: extracted.isCardTransaction,
            attendant: extracted.attendant || null,
            cashier: extracted.cashier || null,
            pump: extracted.pump || null,
            matchStatus: "unmatched" as const,
            matchId: null,
          });
        }

        let duplicateStats = null;
        if (file.sourceType.startsWith("bank")) {
          duplicateStats = detectAndExcludeDuplicates(validTransactions);
          if (duplicateStats.duplicatesExcluded > 0) {
            console.log(
              `[PROCESS] Duplicate detection: ${duplicateStats.duplicatesExcluded} excluded from ${duplicateStats.duplicateGroups} RRN groups`,
            );
          }
        }

        let reversalStats = null;
        if (file.sourceType.startsWith("bank")) {
          const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
          const presetName = detectedPreset?.name || null;
          reversalStats = detectAndExcludeReversals(validTransactions, presetName);
          if (reversalStats.totalExcluded > 0) {
            console.log(
              `[PROCESS] Reversal detection: ${reversalStats.totalExcluded} excluded (${reversalStats.declined} declined, ${reversalStats.reversed} reversed, ${reversalStats.cancelled} cancelled, ${reversalStats.pairedApprovals} paired approvals)`,
            );
          }
        }

        console.log(
          `[PROCESS] Creating ${validTransactions.length} transactions for file ${file.id}, period ${file.periodId}`,
        );
        const { count: createdCount } = await storage.createTransactions(
          validTransactions,
        );
        console.log(`[PROCESS] Created ${createdCount} transactions in database`);

        await storage.updateFile(file.id, {
          status: "processed",
          rowCount: createdCount,
          fileData: null,
        });

        res.json({
          success: true,
          transactionsCreated: createdCount,
          totalRows: parsed.rowCount,
          skipStats,
          duplicateStats,
          reversalStats,
        });
      } catch (error) {
        console.error("Error processing file:", error);
        res.status(500).json({ error: "Failed to process file" });
      }
    },
  );

  app.delete("/api/files/:fileId", isAuthenticated, async (req: any, res) => {
    try {
      const file = await assertFileWrite(req.params.fileId, req, res);
      if (!file) return;

      await reconciliationCommandService.deleteFileAndState(file.periodId, file.id);
      if (file.fileUrl) {
        await objectStorageService.deleteFile(file.fileUrl);
      }

      audit(req, {
        action: "file.delete",
        resourceType: "file",
        resourceId: file.id,
        detail: file.fileName,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });
}
