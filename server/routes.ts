import type { Express } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import multer from "multer";
import { storage } from "./storage";
import { fileParser, DataNormalizer, SOURCE_PRESETS, detectAndExcludeReversals } from "./fileParser";
import { dataQualityValidator } from "./dataQualityValidator";
import { objectStorageService } from "./objectStorage";
import { setupAuth, isAuthenticated } from "./auth";
import { 
  insertReconciliationPeriodSchema,
  insertUploadedFileSchema,
  insertTransactionSchema,
  insertMatchSchema,
  matchingRulesConfigSchema,
  type User
} from "../shared/schema";
import { z } from "zod";

function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  }
});

// Expanded column mapping schema to include time and payment type
const columnMappingSchema = z.record(z.enum(['date', 'amount', 'reference', 'description', 'time', 'paymentType', 'cardNumber', 'attendant', 'pump', 'ignore']));

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Auth endpoint to get current user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Admin middleware - checks if user is admin
  const isAdmin = async (req: any, res: any, next: any) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      next();
    } catch (error) {
      console.error("Admin check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

  // Admin routes - get all users
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin routes - set user admin status
  app.patch('/api/admin/users/:id/admin', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isAdmin: makeAdmin } = req.body;
      if (typeof makeAdmin !== 'boolean') {
        return res.status(400).json({ message: "isAdmin must be a boolean" });
      }
      
      // Prevent removing own admin status
      if (req.params.id === req.user.claims.sub && !makeAdmin) {
        return res.status(400).json({ message: "Cannot remove your own admin status" });
      }
      
      const updated = await storage.setUserAdmin(req.params.id, makeAdmin);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating user admin status:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  
  app.get("/api/periods", isAuthenticated, async (req: any, res) => {
    try {
      const rawSub = req.user?.claims?.sub;
      const userId = rawSub != null ? String(rawSub) : undefined;
      const periods = await storage.getPeriods(userId);
      res.json(periods);
    } catch (error) {
      console.error("Error fetching periods:", error);
      res.status(500).json({ error: "Failed to fetch periods" });
    }
  });

  app.get("/api/periods/:id", isAuthenticated, async (req: any, res) => {
    try {
      const period = await storage.getPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }
      // Ownership check: users can only access their own periods
      const userId = req.user?.claims?.sub;
      if (period.userId && period.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(period);
    } catch (error) {
      console.error("Error fetching period:", error);
      res.status(500).json({ error: "Failed to fetch period" });
    }
  });

  app.post("/api/periods", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const validated = insertReconciliationPeriodSchema.parse(req.body);
      const period = await storage.createPeriod({ ...validated, userId });
      res.json(period);
    } catch (error) {
      console.error("Error creating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });

  app.patch("/api/periods/:id", isAuthenticated, async (req, res) => {
    try {
      const partialSchema = insertReconciliationPeriodSchema.partial();
      const validated = partialSchema.parse(req.body);
      const updated = await storage.updatePeriod(req.params.id, validated);
      if (!updated) {
        return res.status(404).json({ error: "Period not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });

  app.delete("/api/periods/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePeriod(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting period:", error);
      res.status(500).json({ error: "Failed to delete period" });
    }
  });

  app.get("/api/periods/:periodId/files", isAuthenticated, async (req, res) => {
    try {
      const files = await storage.getFilesByPeriod(req.params.periodId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/periods/:periodId/files/upload", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { sourceType, sourceName, bankName } = req.body;
      if (!sourceType || !sourceName) {
        return res.status(400).json({ error: "sourceType and sourceName are required" });
      }

      // Compute content hash for smart re-upload detection
      const contentHash = computeContentHash(req.file.buffer);

      // Check for existing file with same sourceType/sourceName
      const existingFiles = await storage.getFilesByPeriod(req.params.periodId);
      const existingFile = existingFiles.find(f => 
        f.sourceType === sourceType && f.sourceName === sourceName
      );
      
      // Smart re-upload detection: if same content hash, re-parse for mappings but skip DB insert
      if (existingFile && existingFile.contentHash === contentHash) {
        console.log(`Same file re-uploaded, re-parsing for mappings: ${existingFile.fileName}`);

        // Re-parse to get fresh suggested mappings (needed for mapping confirmation step)
        const isCSVReupload = req.file.mimetype.includes('csv') ||
                      req.file.mimetype === 'text/csv' ||
                      req.file.mimetype === 'text/plain' ||
                      req.file.originalname.toLowerCase().endsWith('.csv') ||
                      req.file.originalname.toLowerCase().endsWith('.txt');
        const fileType = isCSVReupload ? 'csv' : 'excel';
        const reuploadParsed = await fileParser.parse(req.file.buffer, fileType);
        const reuploadMappingsArray = fileParser.autoDetectColumns(reuploadParsed.headers);
        const reuploadDetectedPreset = fileParser.detectSourcePreset(reuploadParsed.headers);

        // Build suggested mappings: preset mappings take priority, then auto-detect
        const reuploadMappings: Record<string, string> = {};
        if (reuploadDetectedPreset) {
          for (const header of reuploadParsed.headers) {
            reuploadMappings[header] = reuploadDetectedPreset.mappings[header] || 'ignore';
          }
        } else {
          for (const mapping of reuploadMappingsArray) {
            reuploadMappings[mapping.detectedColumn] = mapping.mappedTo || 'ignore';
          }
          // Fill in unmapped headers
          for (const header of reuploadParsed.headers) {
            if (!reuploadMappings[header]) {
              reuploadMappings[header] = 'ignore';
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
          qualityReport: existingFile.qualityReport || { hasIssues: false, totalRows: reuploadParsed.rowCount, cleanRows: reuploadParsed.rowCount, issues: [] },
          isReupload: true,
          message: "Same file detected, using existing data"
        });
      }
      
      // Store existing file info for cleanup AFTER successful upload
      const fileToReplace = existingFile ? {
        id: existingFile.id,
        fileName: existingFile.fileName,
        fileUrl: existingFile.fileUrl
      } : null;
      
      if (fileToReplace) {
        console.log(`Will replace existing file after successful upload: ${fileToReplace.fileName} (${fileToReplace.id})`);
      }

      const isCSV = req.file.mimetype.includes('csv') ||
                    req.file.mimetype === 'text/csv' ||
                    req.file.mimetype === 'text/plain' ||
                    req.file.originalname.endsWith('.csv') ||
                    req.file.originalname.endsWith('.txt');
      
      const isExcel = req.file.mimetype.includes('spreadsheet') || 
                      req.file.mimetype.includes('excel') ||
                      req.file.originalname.endsWith('.xlsx') || 
                      req.file.originalname.endsWith('.xls');

      const isPDF = req.file.mimetype === 'application/pdf' ||
                    req.file.originalname.endsWith('.pdf');

      if (!isCSV && !isExcel && !isPDF) {
        return res.status(400).json({
          error: "Invalid file format. Please upload CSV, TXT, Excel, or PDF files only."
        });
      }

      const fileType = isCSV ? 'csv' : isExcel ? 'xlsx' : 'pdf';

      const parsed = await fileParser.parse(req.file.buffer, fileType);
      const columnMappings = fileParser.autoDetectColumns(parsed.headers);
      
      // Detect source preset to validate file type
      const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
      
      // Validate source type matches file content using preset's category
      // sourceType can be 'fuel', 'bank', 'bank1', 'bank2', etc.
      // category is always 'fuel' or 'bank'
      const normalizeSourceType = (st: string) => st.replace(/\d+$/, ''); // 'bank1' -> 'bank'
      if (detectedPreset && detectedPreset.category !== normalizeSourceType(sourceType)) {
        const detectedCategory = detectedPreset.category;
        const expectedCategory = normalizeSourceType(sourceType);
        console.warn(`Source type mismatch: expected ${expectedCategory}, detected ${detectedCategory} (${detectedPreset.name})`);
        return res.status(400).json({ 
          error: `This looks like a ${detectedCategory === 'bank' ? 'bank statement' : 'fuel system export'}, but you're uploading it as ${expectedCategory === 'bank' ? 'bank data' : 'fuel data'}. Please check you're on the right step.`,
          detectedType: detectedCategory,
          expectedType: expectedCategory,
          detectedPreset: detectedPreset.name
        });
      }

      const suggestedMappingsObject: Record<string, string> = {};
      for (const mapping of columnMappings) {
        suggestedMappingsObject[mapping.detectedColumn] = mapping.suggestedMapping;
      }

      // Run data quality validation
      const rawQualityReport = dataQualityValidator.validate(
        parsed,
        sourceType as 'fuel' | 'bank',
        sourceName
      );
      
      // Transform quality report to match frontend expectations
      const normalizeIssueType = (type: string): string => {
        const normalized = type.toLowerCase();
        // Normalize to canonical types
        if (normalized.includes('column_shift')) return 'column_shift';
        if (normalized.includes('page_break')) return 'page_break';
        if (normalized.includes('repeated_header')) return 'repeated_header';
        if (normalized.includes('empty_column')) return 'empty_column';
        if (normalized.includes('type_mismatch') || normalized.includes('data_type_mismatch')) return 'type_mismatch';
        if (normalized.includes('missing_required')) return 'missing_data';
        if (normalized.includes('inconsistent')) return 'inconsistent_data';
        return normalized;
      };

      const qualityReport = {
        hasIssues: rawQualityReport.hasIssues,
        hasCriticalIssues: rawQualityReport.hasCriticalIssues,
        overallScore: 100 - (rawQualityReport.problematicRows / rawQualityReport.totalRows * 100),
        totalRows: rawQualityReport.totalRows,
        cleanRows: rawQualityReport.cleanRows,
        problematicRows: rawQualityReport.problematicRows,
        issues: rawQualityReport.issues.map(issue => ({
          type: normalizeIssueType(issue.type),
          severity: issue.severity.toLowerCase(),
          message: issue.message,
          details: issue.details,
          affectedColumns: issue.details?.columns,
          rowNumbers: issue.affectedRows,
          suggestedFix: issue.suggestedFix,
        })),
        columnAnalysis: rawQualityReport.columnAnalysis.map(col => ({
          columnName: col.columnName,
          columnIndex: col.columnIndex,
          inferredType: col.inferredType,
          nullCount: col.nullCount,
          nonNullCount: col.nonNullCount,
          uniqueValues: col.uniqueValues,
          sampleValues: col.sampleValues,
          expectedType: col.inferredType,
          actualType: col.inferredType,
          nullPercentage: col.nullCount / (col.nullCount + col.nonNullCount) * 100,
          consistencyScore: 100 - (col.headerLikeValues + col.pageLikeValues) / (col.nonNullCount || 1) * 100,
        })),
        suggestedMapping: rawQualityReport.suggestedColumnMapping,
        suggestedColumnMapping: rawQualityReport.suggestedColumnMapping, // Keep legacy field too
        rowsToRemove: rawQualityReport.rowsToRemove,
        columnShiftDetected: rawQualityReport.columnShiftDetected,
        shiftDetails: rawQualityReport.shiftDetails,
        detectedPreset: rawQualityReport.detectedPreset,
      };

      const fileUrl = await objectStorageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      const uploadedFile = await storage.createFile({
        periodId: req.params.periodId,
        fileName: req.file.originalname,
        fileType,
        sourceType,
        sourceName,
        fileUrl,
        fileSize: req.file.size,
        rowCount: parsed.rowCount,
        columnMapping: null,
        qualityReport: qualityReport,
        contentHash,
        bankName: bankName || null,
        status: 'uploaded'
      });

      // NOW that new file is successfully created, safely delete the old one
      if (fileToReplace) {
        console.log(`Cleaning up replaced file: ${fileToReplace.fileName} (${fileToReplace.id})`);
        try {
          // First delete matches that reference this file's transactions (explicit cleanup)
          await storage.deleteMatchesByFile(fileToReplace.id);
          // Then delete transactions
          await storage.deleteTransactionsByFile(fileToReplace.id);
          // Then delete the file record
          await storage.deleteFile(fileToReplace.id);
          // Finally clean up object storage
          await objectStorageService.deleteFile(fileToReplace.fileUrl);
          console.log(`Successfully cleaned up old file, its transactions, and related matches`);
        } catch (cleanupError) {
          console.warn("Could not fully clean up old file:", cleanupError);
          // Don't fail the upload if cleanup fails
        }
      }

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
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get("/api/files/:fileId/preview", isAuthenticated, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const objectFile = await objectStorageService.getFile(file.fileUrl);
      const [buffer] = await objectFile.download();
      
      const parsed = await fileParser.parse(buffer, file.fileType);
      const suggestedMappingsArray = fileParser.autoDetectColumns(parsed.headers);
      
      const suggestedMappings: Record<string, string> = {};
      for (const mapping of suggestedMappingsArray) {
        suggestedMappings[mapping.detectedColumn] = mapping.suggestedMapping;
      }

      // Detect source preset and get column labels
      const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
      const columnLabels: Record<string, string> = {};
      for (const header of parsed.headers) {
        columnLabels[header] = fileParser.getColumnLabel(header, parsed.headers);
      }

      // Generate normalized preview if we have a current mapping
      const normalizedPreview: Array<{
        transactionDate: string;
        transactionTime: string;
        amount: string;
        referenceNumber: string;
        description: string;
        paymentType: string;
        isCardTransaction: 'yes' | 'no' | 'unknown';
      }> = [];
      
      // Full file analysis stats
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
        }
      };
      
      const mappingToUse = file.columnMapping || suggestedMappings;
      if (mappingToUse && Object.keys(mappingToUse).length > 0) {
        // Analyze all rows for stats
        for (let i = 0; i < parsed.rows.length; i++) {
          const row = parsed.rows[i];
          const extracted = fileParser.extractTransactionData(
            row,
            mappingToUse as Record<string, string>,
            parsed.headers,
            file.sourceType
          );
          
          // Get first 5 for preview
          if (i < 5) {
            normalizedPreview.push(extracted);
          }
          
          // Validate for full stats
          const validation = fileParser.isValidTransactionRow(
            extracted,
            row,
            mappingToUse as Record<string, string>
          );
          
          if (!validation.valid) {
            switch (validation.reason) {
              case 'header_row':
                fullAnalysisStats.skippedRows.headerRows++;
                break;
              case 'empty_date':
                fullAnalysisStats.skippedRows.emptyDate++;
                break;
              case 'zero_or_invalid_amount':
                fullAnalysisStats.skippedRows.zeroOrInvalidAmount++;
                break;
              case 'page_break':
                fullAnalysisStats.skippedRows.pageBreaks++;
                break;
              default:
                fullAnalysisStats.skippedRows.other++;
            }
          } else {
            fullAnalysisStats.validTransactions++;
            if (extracted.isCardTransaction === 'yes') {
              fullAnalysisStats.cardTransactions++;
            } else if (extracted.isCardTransaction === 'no') {
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
        detectedPreset: detectedPreset ? {
          name: detectedPreset.name,
          description: detectedPreset.description,
        } : null,
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

  app.post("/api/files/:fileId/column-mapping", isAuthenticated, async (req, res) => {
    try {
      const validatedMapping = columnMappingSchema.parse(req.body.columnMapping);

      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Check for duplicate mappings (same field mapped to multiple columns)
      const mappedFields: Record<string, string> = {};
      const duplicates: { field: string; columns: string[] }[] = [];
      
      for (const [column, field] of Object.entries(validatedMapping)) {
        if (field === 'ignore') continue;
        
        if (mappedFields[field]) {
          // Found a duplicate - check if we already have this field in duplicates
          const existing = duplicates.find(d => d.field === field);
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
        const errorMessages = duplicates.map(d => 
          `"${d.field}" is mapped to both "${d.columns.join('" and "')}" - please choose only ONE column for each field`
        );
        return res.status(400).json({ 
          error: "Duplicate mappings detected",
          duplicates: duplicates,
          message: errorMessages.join('. ')
        });
      }

      await storage.updateFile(req.params.fileId, { 
        columnMapping: validatedMapping,
        status: 'mapped'
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving column mapping:", error?.message || String(error));
      res.status(400).json({ error: error?.message || "Invalid column mapping data" });
    }
  });

  // Alias route for periods-based URL pattern used by the flow components
  app.post("/api/periods/:periodId/files/:fileId/process", isAuthenticated, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Validate file belongs to the period
      if (file.periodId !== req.params.periodId) {
        return res.status(400).json({ error: "File does not belong to this period" });
      }

      if (!file.columnMapping) {
        return res.status(400).json({ error: "Column mapping not set" });
      }

      // Delete existing transactions from this file before reprocessing
      await storage.deleteTransactionsByFile(file.id);

      const objectFile = await objectStorageService.getFile(file.fileUrl);
      const [buffer] = await objectFile.download();
      
      const parsed = await fileParser.parse(buffer, file.fileType);
      
      // Track skip statistics
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
          file.sourceType
        );
        
        const validation = fileParser.isValidTransactionRow(
          extracted,
          row,
          file.columnMapping as Record<string, string>
        );
        
        if (!validation.valid) {
          skipStats.total_skipped++;
          if (validation.reason && validation.reason in skipStats) {
            (skipStats as any)[validation.reason]++;
          }
          continue;
        }
        
        skipStats.total_processed++;
        
        validTransactions.push({
          fileId: file.id,
          periodId: file.periodId,
          sourceType: file.sourceType,
          sourceName: file.sourceName,
          rawData: row,
          transactionDate: extracted.transactionDate,
          transactionTime: extracted.transactionTime || null,
          amount: extracted.amount,
          description: extracted.description || '',
          referenceNumber: extracted.referenceNumber || '',
          cardNumber: extracted.cardNumber || null,
          paymentType: extracted.paymentType || null,
          isCardTransaction: extracted.isCardTransaction,
          attendant: extracted.attendant || null,
          pump: extracted.pump || null,
          matchStatus: 'unmatched' as const,
          matchId: null,
        });
      }

      // For bank files, detect and exclude reversed/declined/cancelled transactions
      let reversalStats = null;
      if (file.sourceType.startsWith('bank')) {
        const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
        const presetName = detectedPreset?.name || null;
        reversalStats = detectAndExcludeReversals(validTransactions, presetName);
        if (reversalStats.totalExcluded > 0) {
          console.log(`[PROCESS] Reversal detection: ${reversalStats.totalExcluded} excluded (${reversalStats.declined} declined, ${reversalStats.reversed} reversed, ${reversalStats.cancelled} cancelled, ${reversalStats.pairedApprovals} paired approvals)`);
        }
      }

      console.log(`[PROCESS] Creating ${validTransactions.length} transactions for file ${file.id}, period ${file.periodId}`);

      const { count: createdCount } = await storage.createTransactions(validTransactions);

      console.log(`[PROCESS] Created ${createdCount} transactions in database`);

      await storage.updateFile(file.id, {
        status: 'processed',
        rowCount: createdCount
      });


      res.json({
        success: true,
        transactionsCreated: createdCount,
        totalRows: parsed.rowCount,
        skipStats: skipStats,
        reversalStats: reversalStats,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  });

  app.delete("/api/files/:fileId", isAuthenticated, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (file) {
        await storage.deleteMatchesByFile(file.id);
        await storage.deleteTransactionsByFile(file.id);
        if (file.fileUrl) {
          await objectStorageService.deleteFile(file.fileUrl);
        }
        await storage.deleteFile(file.id);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/periods/:periodId/transactions", isAuthenticated, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = (page - 1) * limit;
      const sourceType = req.query.sourceType as string | undefined;
      const matchStatus = req.query.matchStatus as string | undefined;
      const isCardTransaction = req.query.isCardTransaction as string | undefined;
      
      console.log(`[TRANSACTIONS] Fetching for period ${req.params.periodId}, page ${page}, limit ${limit}`);
      
      const result = await storage.getTransactionsByPeriodPaginated(
        req.params.periodId,
        { limit, offset, sourceType, matchStatus, isCardTransaction }
      );
      
      console.log(`[TRANSACTIONS] Found ${result.total} total, returning ${result.transactions.length} on page ${page}`);
      
      res.json({
        transactions: result.transactions,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit)
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // ============================================
  // VERIFICATION SUMMARY ENDPOINT
  // ============================================
  
  app.get("/api/periods/:periodId/verification-summary", isAuthenticated, async (req, res) => {
    try {
      const summary = await storage.getVerificationSummary(req.params.periodId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching verification summary:", error);
      res.status(500).json({ error: "Failed to fetch verification summary" });
    }
  });

  // ============================================
  // MATCHING RULES ENDPOINTS
  // ============================================
  
  app.get("/api/periods/:periodId/matching-rules", isAuthenticated, async (req, res) => {
    try {
      const rules = await storage.getMatchingRules(req.params.periodId);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching matching rules:", error);
      res.status(500).json({ error: "Failed to fetch matching rules" });
    }
  });

  app.post("/api/periods/:periodId/matching-rules", isAuthenticated, async (req, res) => {
    try {
      const validatedRules = matchingRulesConfigSchema.parse(req.body);
      const saved = await storage.saveMatchingRules(req.params.periodId, validatedRules);
      res.json({ success: true, rules: saved });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({ error: "Invalid matching rules data", details: error.errors });
      }
      console.error("Error saving matching rules:", error);
      res.status(500).json({ error: "Failed to save matching rules" });
    }
  });

  // ============================================
  // INVOICE GROUPING TYPES AND HELPERS
  // ============================================
  
  interface FuelInvoice {
    invoiceNumber: string;
    items: any[];
    totalAmount: number;
    firstDate: string;
    firstTime: string | null;
    cardNumber: string | null;
  }

  // Group fuel transactions by invoice/reference number
  function groupFuelByInvoice(fuelTransactions: any[], groupByInvoice: boolean): FuelInvoice[] {
    if (!groupByInvoice) {
      // Treat each transaction as its own "invoice"
      return fuelTransactions.map(tx => ({
        invoiceNumber: tx.id,
        items: [tx],
        totalAmount: parseFloat(tx.amount),
        firstDate: tx.transactionDate,
        firstTime: tx.transactionTime,
        cardNumber: tx.cardNumber
      }));
    }

    const invoices: Record<string, FuelInvoice> = {};

    for (const tx of fuelTransactions) {
      const invoiceNum = tx.referenceNumber || tx.id;

      if (!invoices[invoiceNum]) {
        invoices[invoiceNum] = {
          invoiceNumber: invoiceNum,
          items: [],
          totalAmount: 0,
          firstDate: tx.transactionDate,
          firstTime: tx.transactionTime,
          cardNumber: tx.cardNumber
        };
      }

      invoices[invoiceNum].items.push(tx);
      invoices[invoiceNum].totalAmount += parseFloat(tx.amount);
    }

    return Object.values(invoices);
  }

  // Helper function to parse time strings and calculate minutes from midnight
  function parseTimeToMinutes(timeStr: string): number | null {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  // Helper function to parse date and calculate days difference
  function parseDateToDays(dateStr: string): number | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  }

  // ============================================
  // AUTO-MATCH WITH INVOICE GROUPING
  // ============================================
  
  app.post("/api/periods/:periodId/auto-match", isAuthenticated, async (req, res) => {
    try {
      // Reset previous matches so re-running always gives accurate totals
      await storage.resetMatchesByPeriod(req.params.periodId);

      // Get user-configured matching rules (or defaults)
      const rules = await storage.getMatchingRules(req.params.periodId);

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      
      // Filter fuel transactions to ONLY confirmed card transactions for reconciliation
      // Cash and unknown transactions are excluded from matching but kept for reporting
      const fuelTransactions = transactions.filter(t => 
        t.sourceType === 'fuel' && 
        t.isCardTransaction === 'yes' &&
        t.matchStatus === 'unmatched'
      );
      
      // All bank transactions are card by definition (from merchant portals)
      const bankTransactions = transactions.filter(t => 
        t.sourceType && 
        t.sourceType.startsWith('bank') &&
        t.matchStatus === 'unmatched'
      );
      

      // *** DATE RANGE VALIDATION ***
      // Detect bank transactions that cannot be matched because no fuel data exists for those dates
      const fuelDates = fuelTransactions
        .map(t => t.transactionDate)
        .filter(d => d && d.trim())
        .map(d => new Date(d!).getTime())
        .filter(d => !isNaN(d));
      
      const bankDates = bankTransactions
        .map(t => t.transactionDate)
        .filter(d => d && d.trim())
        .map(d => new Date(d!).getTime())
        .filter(d => !isNaN(d));

      let unmatchableBankTransactions: typeof bankTransactions = [];
      let dateRangeWarning = '';
      
      if (fuelDates.length > 0 && bankDates.length > 0) {
        const maxFuelDate = Math.max(...fuelDates);
        const minFuelDate = Math.min(...fuelDates);
        const maxBankDate = Math.max(...bankDates);
        const minBankDate = Math.min(...bankDates);
        
        // Find bank transactions outside fuel date range
        unmatchableBankTransactions = bankTransactions.filter(t => {
          if (!t.transactionDate) return false;
          const bankTime = new Date(t.transactionDate).getTime();
          if (isNaN(bankTime)) return false;
          // Bank date is after fuel data ends OR before fuel data starts
          return bankTime > maxFuelDate || bankTime < minFuelDate;
        });
        
        if (unmatchableBankTransactions.length > 0) {
          const maxFuelDateStr = new Date(maxFuelDate).toISOString().split('T')[0];
          const minFuelDateStr = new Date(minFuelDate).toISOString().split('T')[0];
          dateRangeWarning = `${unmatchableBankTransactions.length} bank transaction(s) are outside your fuel data date range (${minFuelDateStr} to ${maxFuelDateStr}) and cannot be matched.`;
          // Mark these as unmatchable in bulk
          await storage.updateTransactionsBatch(
            unmatchableBankTransactions.map(tx => ({ id: tx.id, data: { matchStatus: 'unmatchable', matchId: null } }))
          );
        }
      }
      
      // Filter out unmatchable transactions for matching
      const matchableBankTransactions = bankTransactions.filter(
        t => !unmatchableBankTransactions.includes(t)
      );
      

      // *** KEY STEP: Group fuel by invoice ***
      const fuelInvoices = groupFuelByInvoice(fuelTransactions, rules.groupByInvoice);

      // Pre-index invoices by date bucket for O(1) lookup per date
      const invoicesByDate = new Map<number, FuelInvoice[]>();
      for (const invoice of fuelInvoices) {
        const dayKey = parseDateToDays(invoice.firstDate || '');
        if (dayKey !== null) {
          // Index into each day within the matching window
          for (let offset = -1; offset <= rules.dateWindowDays; offset++) {
            const key = dayKey + offset;
            if (!invoicesByDate.has(key)) invoicesByDate.set(key, []);
            invoicesByDate.get(key)!.push(invoice);
          }
        }
      }

      let matchCount = 0;
      let skippedNonCardCount = transactions.filter(t =>
        t.sourceType === 'fuel' && t.isCardTransaction !== 'yes'
      ).length;

      // Track matched invoices to avoid double-matching
      const matchedInvoices = new Set<string>();

      // Collect matches and transaction updates for bulk creation
      const pendingMatches: Array<{
        matchData: { periodId: string; fuelTransactionId: string; bankTransactionId: string; matchType: string; matchConfidence: string };
        bankTxId: string;
        fuelItemIds: string[];
      }> = [];

      // Match bank transactions to invoices (only matchable ones)
      for (const bankTx of matchableBankTransactions) {
        let bestMatch: { 
          invoice: FuelInvoice; 
          confidence: number; 
          timeDiff: number; 
          dateDiff: number;
          amountDiff: number;
          reasons: string[];
        } | null = null;

        // Look up candidate invoices by bank transaction date
        const bankDayKey = parseDateToDays(bankTx.transactionDate || '');
        const candidateInvoices = bankDayKey !== null ? (invoicesByDate.get(bankDayKey) || []) : fuelInvoices;
        // Deduplicate candidates (same invoice may appear in multiple date buckets)
        const seen = new Set<string>();

        for (const invoice of candidateInvoices) {
          if (seen.has(invoice.invoiceNumber)) continue;
          seen.add(invoice.invoiceNumber);
          // Skip if already matched
          if (matchedInvoices.has(invoice.invoiceNumber)) continue;
          if (invoice.items.some(item => item.matchStatus === 'matched')) continue;

          const reasons: string[] = [];

          // Amount matching with configurable tolerance
          const bankAmount = parseFloat(bankTx.amount);
          const fuelAmount = invoice.totalAmount;
          const amountDiff = Math.abs(bankAmount - fuelAmount);

          if (amountDiff > rules.amountTolerance) continue; // Outside tolerance

          if (amountDiff === 0) {
            reasons.push('Exact amount match');
          } else {
            reasons.push(`Amount within R${amountDiff.toFixed(2)} (tolerance: R${rules.amountTolerance})`);
          }

          // Date matching with configurable window
          const fuelDate = parseDateToDays(invoice.firstDate || '');
          const bankDate = parseDateToDays(bankTx.transactionDate || '');

          if (fuelDate === null || bankDate === null) continue;

          const dateDiff = bankDate - fuelDate; // Positive = bank is later

          // Allow bank to be 0-N days after fuel (based on rules)
          // Also allow bank to be 1 day before fuel (timezone differences)
          if (dateDiff < -1 || dateDiff > rules.dateWindowDays) continue;

          // Calculate base confidence from date difference
          let confidence = 70;
          if (dateDiff === 0) {
            confidence = 85;
            reasons.push('Same day transaction');
          } else if (Math.abs(dateDiff) === 1) {
            confidence = 75;
            reasons.push('1 day difference');
          } else if (Math.abs(dateDiff) === 2) {
            confidence = 68;
            reasons.push('2 days difference');
          } else {
            confidence = 65;
            reasons.push(`${Math.abs(dateDiff)} days difference (weekend/holiday processing)`);
          }

          // Time matching (only for same-day transactions)
          const fuelTime = parseTimeToMinutes(invoice.firstTime || '');
          const bankTime = parseTimeToMinutes(bankTx.transactionTime || '');

          let timeDiff = 0;

          if (dateDiff === 0 && fuelTime !== null && bankTime !== null) {
            timeDiff = Math.abs(fuelTime - bankTime);

            if (timeDiff <= 5) {
              confidence = 100;
              reasons.push('Times within 5 minutes');
            } else if (timeDiff <= 15) {
              confidence = 95;
              reasons.push('Times within 15 minutes');
            } else if (timeDiff <= 30) {
              confidence = 85;
              reasons.push('Times within 30 minutes');
            } else if (timeDiff <= rules.timeWindowMinutes) {
              confidence = 75;
              reasons.push(`Times within ${timeDiff} minutes`);
            } else {
              confidence = 75;
              reasons.push(`Time difference: ${timeDiff} minutes`);
            }
          }

          // Amount penalty (the further from exact, the lower confidence)
          // Reduced from max 10 to max 5 to ensure within-tolerance amounts can still match
          if (amountDiff > 0) {
            const amountPenalty = Math.min(5, (amountDiff / rules.amountTolerance) * 5);
            confidence -= amountPenalty;
          }

          // Card number check - CRITICAL for disambiguation when multiple matches exist
          // Card numbers are normalized to last 4 digits during import
          let cardMatch: 'yes' | 'no' | 'unknown' = 'unknown';
          
          if (rules.requireCardMatch) {
            if (!bankTx.cardNumber || !invoice.cardNumber) continue;
            if (bankTx.cardNumber !== invoice.cardNumber) continue;
            cardMatch = 'yes';
            confidence += 25; // Strong boost for required card match
            reasons.push('Card numbers match (required)');
          } else {
            // When card numbers are available, they're the strongest discriminator
            // for ambiguous cases (e.g., R200 on same day from different cards)
            if (bankTx.cardNumber && invoice.cardNumber) {
              if (bankTx.cardNumber === invoice.cardNumber) {
                cardMatch = 'yes';
                confidence += 25; // Strong boost - card match is highly reliable
                reasons.push('Card numbers match (strong)');
              } else {
                cardMatch = 'no';
                confidence -= 30; // Strong penalty - different cards should not match
                reasons.push('Card numbers differ (penalty)');
              }
            }
            // If fuel has no card number, don't penalize - fuel systems often lack card data
            // Only card mismatch (both have cards but different) gets penalized above
          }

          // Multi-line invoice note
          if (invoice.items.length > 1) {
            reasons.push(`Grouped invoice: ${invoice.items.length} items`);
          }

          // Cap confidence
          confidence = Math.min(100, Math.max(0, confidence));

          // Check minimum confidence threshold
          if (confidence < rules.minimumConfidence) continue;

          // Prefer matches with: highest confidence, then card match, then smallest date diff, then smallest time diff
          const absDiff = Math.abs(dateDiff);
          const cardMatchScore = cardMatch === 'yes' ? 2 : cardMatch === 'unknown' ? 1 : 0;
          const bestCardScore = bestMatch ? 
            (bestMatch.reasons.some(r => r.includes('Card numbers match')) ? 2 : 
             bestMatch.reasons.some(r => r.includes('Card numbers differ')) ? 0 : 1) : -1;
          
          if (!bestMatch || 
              confidence > bestMatch.confidence ||
              (confidence === bestMatch.confidence && cardMatchScore > bestCardScore) ||
              (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff < bestMatch.dateDiff) ||
              (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff === bestMatch.dateDiff && timeDiff < bestMatch.timeDiff)) {
            bestMatch = { invoice, confidence, timeDiff, dateDiff: absDiff, amountDiff, reasons };
          }
        }

        // Collect match for bulk creation
        if (bestMatch) {
          const matchType = bestMatch.confidence >= rules.autoMatchThreshold ? 'auto' : 'auto_review';

          pendingMatches.push({
            matchData: {
              periodId: req.params.periodId,
              fuelTransactionId: bestMatch.invoice.items[0].id,
              bankTransactionId: bankTx.id,
              matchType,
              matchConfidence: String(bestMatch.confidence),
            },
            bankTxId: bankTx.id,
            fuelItemIds: bestMatch.invoice.items.map(item => item.id),
          });

          matchedInvoices.add(bestMatch.invoice.invoiceNumber);
          matchCount++;
        }
      }

      // Bulk create all matches at once
      console.log(`[MATCH] Creating ${pendingMatches.length} matches in bulk...`);
      const createdMatches = await storage.createMatchesBatch(
        pendingMatches.map(pm => pm.matchData)
      );

      // Build transaction updates from created matches
      const txUpdates: Array<{ id: string; data: { matchStatus: string; matchId: string } }> = [];
      for (let i = 0; i < createdMatches.length; i++) {
        const match = createdMatches[i];
        const pending = pendingMatches[i];
        txUpdates.push({ id: pending.bankTxId, data: { matchStatus: 'matched', matchId: match.id } });
        for (const fuelId of pending.fuelItemIds) {
          txUpdates.push({ id: fuelId, data: { matchStatus: 'matched', matchId: match.id } });
        }
      }

      // Bulk update all transactions
      console.log(`[MATCH] Updating ${txUpdates.length} transactions in bulk...`);
      await storage.updateTransactionsBatch(txUpdates);

      // Calculate match rate based on matchable transactions (excluding unmatchable)
      const matchableCount = matchableBankTransactions.length;
      const matchRate = matchableCount > 0
        ? ((matchCount / matchableCount) * 100).toFixed(1)
        : '0';

      // Update period status to complete after matching
      await storage.updatePeriod(req.params.periodId, { status: 'complete' });

      res.json({
        success: true,
        matchesCreated: matchCount,
        cardTransactionsProcessed: fuelTransactions.length,
        invoicesCreated: fuelInvoices.length,
        bankTransactionsTotal: bankTransactions.length,
        bankTransactionsMatchable: matchableCount,
        bankTransactionsUnmatchable: unmatchableBankTransactions.length,
        nonCardTransactionsSkipped: skippedNonCardCount,
        matchRate: `${matchRate}%`,
        rulesUsed: rules,
        warnings: dateRangeWarning ? [dateRangeWarning] : []
      });
    } catch (error) {
      console.error("Error auto-matching:", error);
      res.status(500).json({ error: "Failed to auto-match transactions" });
    }
  });

  app.post("/api/matches/manual", isAuthenticated, async (req, res) => {
    try {
      const matchInput = insertMatchSchema.omit({ matchType: true, matchConfidence: true }).parse(req.body);

      const match = await storage.createMatch({
        ...matchInput,
        matchType: 'manual',
        matchConfidence: '100',
      });

      await storage.updateTransaction(matchInput.fuelTransactionId, { 
        matchStatus: 'matched',
        matchId: match.id 
      });
      await storage.updateTransaction(matchInput.bankTransactionId, { 
        matchStatus: 'matched',
        matchId: match.id 
      });

      res.json({ success: true, match });
    } catch (error) {
      console.error("Error creating manual match:", error);
      res.status(400).json({ error: "Failed to create manual match" });
    }
  });

  app.delete("/api/matches/:matchId", isAuthenticated, async (req, res) => {
    try {
      const match = await storage.getMatch(req.params.matchId);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      await storage.updateTransaction(match.fuelTransactionId, { 
        matchStatus: 'unmatched',
        matchId: null 
      });
      await storage.updateTransaction(match.bankTransactionId, { 
        matchStatus: 'unmatched',
        matchId: null 
      });

      await storage.deleteMatch(req.params.matchId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting match:", error);
      res.status(500).json({ error: "Failed to delete match" });
    }
  });

  // Transaction Resolution Routes
  app.get("/api/periods/:periodId/resolutions", isAuthenticated, async (req, res) => {
    try {
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching resolutions:", error);
      res.status(500).json({ error: "Failed to fetch resolutions" });
    }
  });

  // Resolution Summary - counts by type for completion state logic
  app.get("/api/periods/:periodId/resolution-summary", isAuthenticated, async (req, res) => {
    try {
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      
      const summary = {
        linked: 0,
        reviewed: 0,
        dismissed: 0,
        flagged: 0,
        writtenOff: 0,
      };
      
      for (const r of resolutions) {
        switch (r.resolutionType) {
          case 'linked':
            summary.linked++;
            break;
          case 'reviewed':
            summary.reviewed++;
            break;
          case 'dismissed':
            summary.dismissed++;
            break;
          case 'flagged':
            summary.flagged++;
            break;
          case 'written_off':
            summary.writtenOff++;
            break;
        }
      }
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching resolution summary:", error);
      res.status(500).json({ error: "Failed to fetch resolution summary" });
    }
  });

  app.get("/api/transactions/:transactionId/resolutions", isAuthenticated, async (req, res) => {
    try {
      const resolutions = await storage.getResolutionsByTransaction(req.params.transactionId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching transaction resolutions:", error);
      res.status(500).json({ error: "Failed to fetch resolutions" });
    }
  });

  app.post("/api/resolutions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { transactionId, periodId, resolutionType, reason, notes, linkedTransactionId, assignee } = req.body;

      if (!transactionId || !periodId || !resolutionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const resolution = await storage.createResolution({
        transactionId,
        periodId,
        resolutionType,
        reason: reason || null,
        notes: notes || null,
        userId: user?.id || null,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
        userEmail: user?.email || null,
        linkedTransactionId: linkedTransactionId || null,
        assignee: assignee || null,
      });

      // Update the transaction's match status to 'resolved' for resolutions other than 'linked'
      if (resolutionType !== 'linked') {
        await storage.updateTransaction(transactionId, { 
          matchStatus: 'resolved'
        });
      }

      res.json({ success: true, resolution });
    } catch (error) {
      console.error("Error creating resolution:", error);
      res.status(500).json({ error: "Failed to create resolution" });
    }
  });

  // Bulk dismiss low-value transactions
  app.post("/api/resolutions/bulk-dismiss", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { transactionIds, periodId } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: 'dismissed',
          reason: 'test_transaction',
          notes: 'Bulk dismissed as low-value transaction',
          userId: user?.id || null,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null,
        });
        resolutions.push(resolution);

        await storage.updateTransaction(transactionId, { 
          matchStatus: 'resolved'
        });
      }

      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk dismissing:", error);
      res.status(500).json({ error: "Failed to bulk dismiss transactions" });
    }
  });

  // Bulk flag transactions for review
  app.post("/api/resolutions/bulk-flag", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { transactionIds, periodId } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: 'flagged',
          reason: null,
          notes: 'Flagged for manager review',
          userId: user?.id || null,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null,
        });
        resolutions.push(resolution);

        await storage.updateTransaction(transactionId, { 
          matchStatus: 'resolved'
        });
      }

      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk flagging:", error);
      res.status(500).json({ error: "Failed to bulk flag transactions" });
    }
  });

  // Clear all resolutions for a period (undo)
  app.delete("/api/periods/:periodId/resolutions", isAuthenticated, async (req, res) => {
    try {
      const count = await storage.clearResolutionsByPeriod(req.params.periodId);
      res.json({ success: true, count });
    } catch (error) {
      console.error("Error clearing resolutions:", error);
      res.status(500).json({ error: "Failed to clear resolutions" });
    }
  });

  // Bulk confirm matches (quick wins)
  app.post("/api/matches/bulk-confirm", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as User;
      const { matches, periodId } = req.body;

      if (!matches || !Array.isArray(matches) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const createdMatches = [];
      for (const { bankId, fuelId } of matches) {
        try {
          // Create the match
          const match = await storage.createMatch({
            periodId,
            bankTransactionId: bankId,
            fuelTransactionId: fuelId,
            matchType: 'manual',
            matchConfidence: '100',
          });
          createdMatches.push(match);

          // Update transaction statuses
          await storage.updateTransaction(bankId, { matchStatus: 'matched' });
          await storage.updateTransaction(fuelId, { matchStatus: 'matched' });

          // Create resolution for audit trail
          await storage.createResolution({
            transactionId: bankId,
            periodId,
            resolutionType: 'linked',
            reason: null,
            notes: 'Bulk confirmed as quick win match',
            userId: user?.id || null,
            userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
            userEmail: user?.email || null,
            linkedTransactionId: fuelId,
            assignee: null,
          });
        } catch (matchError) {
          console.error(`Error creating match for bank ${bankId}:`, matchError);
        }
      }

      res.json({ success: true, count: createdMatches.length });
    } catch (error) {
      console.error("Error bulk confirming:", error);
      res.status(500).json({ error: "Failed to bulk confirm matches" });
    }
  });


  app.get("/api/periods/:periodId/summary", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }

      const summary = await storage.getPeriodSummary(req.params.periodId);
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // Export full reconciliation report as Excel
  app.get("/api/periods/:periodId/export", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const matchesData = await storage.getMatchesByPeriod(req.params.periodId);
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);

      // Build lookup maps
      const matchMap = new Map<string, typeof matchesData[0]>();
      for (const m of matchesData) {
        matchMap.set(m.bankTransactionId, m);
        matchMap.set(m.fuelTransactionId, m);
      }
      const resolutionMap = new Map(resolutions.map(r => [r.transactionId, r]));
      const txMap = new Map(transactions.map(t => [t.id, t]));

      const bankTxns = transactions.filter(t => t.sourceType?.startsWith('bank'));
      const fuelTxns = transactions.filter(t => t.sourceType === 'fuel');
      const matchedBank = bankTxns.filter(t => t.matchStatus === 'matched');
      const unmatchedBank = bankTxns.filter(t => t.matchStatus === 'unmatched' && parseFloat(t.amount) > 0);
      const excludedBank = bankTxns.filter(t => t.matchStatus === 'excluded');
      const outsideRange = bankTxns.filter(t => t.matchStatus === 'unmatchable');
      const matchableBank = bankTxns.filter(t => t.matchStatus === 'matched' || t.matchStatus === 'unmatched');

      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryRows = [
        { 'Metric': 'Period', 'Value': period.name },
        { 'Metric': 'Period Dates', 'Value': `${period.startDate} to ${period.endDate}` },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Fuel Transactions', 'Value': fuelTxns.length },
        { 'Metric': '  Card', 'Value': fuelTxns.filter(t => t.isCardTransaction === 'yes').length },
        { 'Metric': '  Cash', 'Value': fuelTxns.filter(t => t.isCardTransaction === 'no').length },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Bank Transactions (Total)', 'Value': bankTxns.length },
        { 'Metric': '  Matchable', 'Value': matchableBank.length },
        { 'Metric': '  Outside Date Range', 'Value': outsideRange.length },
        { 'Metric': '  Excluded (reversed/declined)', 'Value': excludedBank.length },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Matched', 'Value': matchedBank.length },
        { 'Metric': 'Match Rate', 'Value': matchableBank.length > 0 ? `${Math.round((matchedBank.length / matchableBank.length) * 100)}%` : 'N/A' },
        { 'Metric': 'Unmatched Bank', 'Value': unmatchedBank.length },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Matched Bank Amount', 'Value': matchedBank.reduce((s, t) => s + parseFloat(t.amount), 0).toFixed(2) },
        { 'Metric': 'Unmatched Bank Amount', 'Value': unmatchedBank.reduce((s, t) => s + parseFloat(t.amount), 0).toFixed(2) },
        { 'Metric': 'Excluded Bank Amount', 'Value': excludedBank.reduce((s, t) => s + parseFloat(t.amount), 0).toFixed(2) },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

      // Sheet 2: Matched pairs
      const matchedRows = matchesData.map(m => {
        const bank = txMap.get(m.bankTransactionId);
        const fuel = txMap.get(m.fuelTransactionId);
        const bankAmt = bank ? parseFloat(bank.amount) : 0;
        const fuelAmt = fuel ? parseFloat(fuel.amount) : 0;
        return {
          'Date': bank?.transactionDate || fuel?.transactionDate || '',
          'Bank Amount': bankAmt,
          'Fuel Amount': fuelAmt,
          'Difference': Math.round((bankAmt - fuelAmt) * 100) / 100,
          'Bank Source': bank?.sourceName || '',
          'Bank Description': bank?.description || '',
          'Fuel Description': fuel?.description || '',
          'Card Number': bank?.cardNumber || '',
          'Attendant': fuel?.attendant || '',
          'Pump': fuel?.pump || '',
          'Confidence': m.matchConfidence ? `${m.matchConfidence}%` : '',
          'Match Type': m.matchType || 'auto',
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matchedRows), 'Matched');

      // Sheet 3: Unmatched bank transactions
      const unmatchedRows = unmatchedBank.map(t => {
        const resolution = resolutionMap.get(t.id);
        return {
          'Date': t.transactionDate,
          'Time': t.transactionTime || '',
          'Amount': parseFloat(t.amount),
          'Bank': t.sourceName || t.sourceType,
          'Card Number': t.cardNumber || '',
          'Description': t.description || '',
          'Resolution': resolution ? resolution.resolutionType : 'unresolved',
          'Notes': resolution?.notes || '',
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedRows), 'Unmatched');

      // Sheet 4: Excluded (reversed/declined/cancelled)
      if (excludedBank.length > 0) {
        const excludedRows = excludedBank.map(t => {
          const reason = t.description?.match(/\[Excluded: (.+?)\]/)?.[1] || 'Excluded';
          const cleanDesc = t.description?.replace(/\s*\[Excluded:.*?\]/g, '').trim() || '';
          return {
            'Date': t.transactionDate,
            'Time': t.transactionTime || '',
            'Amount': parseFloat(t.amount),
            'Bank': t.sourceName || t.sourceType,
            'Card Number': t.cardNumber || '',
            'Description': cleanDesc,
            'Reason': reason,
          };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(excludedRows), 'Excluded');
      }

      // Sheet 5: Outside Date Range
      if (outsideRange.length > 0) {
        const outsideRows = outsideRange.map(t => ({
          'Date': t.transactionDate,
          'Time': t.transactionTime || '',
          'Amount': parseFloat(t.amount),
          'Bank': t.sourceName || t.sourceType,
          'Card Number': t.cardNumber || '',
          'Description': t.description || '',
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outsideRows), 'Outside Date Range');
      }

      // Sheet 6: Fuel Transactions (with attendant/pump detail)
      const fuelRows = fuelTxns.map(t => {
        const match = matchMap.get(t.id);
        const bankTx = match ? txMap.get(match.bankTransactionId) : null;
        return {
          'Date': t.transactionDate,
          'Time': t.transactionTime || '',
          'Amount': parseFloat(t.amount),
          'Payment Type': t.paymentType || '',
          'Card Number': t.cardNumber || '',
          'Attendant': t.attendant || '',
          'Pump': t.pump || '',
          'Description': t.description || '',
          'Matched': match ? 'Yes' : 'No',
          'Bank Match Amount': bankTx ? parseFloat(bankTx.amount) : '',
          'Bank Source': bankTx?.sourceName || '',
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelRows), 'Fuel Transactions');

      // Sheet 7: All Transactions
      const allRows = transactions.map(t => ({
        'Date': t.transactionDate,
        'Time': t.transactionTime || '',
        'Source': t.sourceType,
        'Source Name': t.sourceName || '',
        'Amount': parseFloat(t.amount),
        'Card Number': t.cardNumber || '',
        'Payment Type': t.paymentType || '',
        'Reference': t.referenceNumber || '',
        'Description': t.description || '',
        'Attendant': t.attendant || '',
        'Pump': t.pump || '',
        'Status': t.matchStatus,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), 'All Transactions');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Reconciliation_${period.name.replace(/\s+/g, '_')}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting reconciliation:", error);
      res.status(500).json({ error: "Failed to export reconciliation" });
    }
  });

  app.get("/api/periods/:periodId/export-flagged", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }

      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const flaggedResolutions = resolutions.filter(r => r.resolutionType === 'flagged');
      
      if (flaggedResolutions.length === 0) {
        return res.status(404).json({ error: "No flagged transactions found" });
      }

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const transactionMap = new Map(transactions.map(t => [t.id, t]));
      
      const flaggedData = flaggedResolutions.map(r => {
        const tx = transactionMap.get(r.transactionId);
        return {
          'Bank Transaction Date': tx?.transactionDate || '',
          'Bank Amount': tx ? parseFloat(tx.amount) : 0,
          'Bank Reference': tx?.referenceNumber || '',
          'Description': tx?.description || '',
          'Flagged By': r.userName || r.userEmail || 'Unknown',
          'Flagged Date': r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-ZA') : '',
          'Notes': r.notes || '',
        };
      });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(flaggedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Flagged Transactions');
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Flagged_Transactions_${period.name.replace(/\s+/g, '_')}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting flagged transactions:", error);
      res.status(500).json({ error: "Failed to export flagged transactions" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
