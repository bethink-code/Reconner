import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { fileParser, DataNormalizer, SOURCE_PRESETS } from "./fileParser";
import { objectStorageService } from "./objectStorage";
import { reportGenerator } from "./reportGenerator";
import { 
  insertReconciliationPeriodSchema,
  insertUploadedFileSchema,
  insertTransactionSchema,
  insertMatchSchema,
  matchingRulesConfigSchema
} from "@shared/schema";
import { z } from "zod";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  }
});

// Expanded column mapping schema to include time and payment type
const columnMappingSchema = z.record(z.enum(['date', 'amount', 'reference', 'description', 'time', 'paymentType', 'cardNumber', 'ignore']));

export async function registerRoutes(app: Express): Promise<Server> {
  
  app.get("/api/periods", async (req, res) => {
    try {
      const periods = await storage.getPeriods();
      res.json(periods);
    } catch (error) {
      console.error("Error fetching periods:", error);
      res.status(500).json({ error: "Failed to fetch periods" });
    }
  });

  app.get("/api/periods/:id", async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }
      res.json(period);
    } catch (error) {
      console.error("Error fetching period:", error);
      res.status(500).json({ error: "Failed to fetch period" });
    }
  });

  app.post("/api/periods", async (req, res) => {
    try {
      const validated = insertReconciliationPeriodSchema.parse(req.body);
      const period = await storage.createPeriod(validated);
      res.json(period);
    } catch (error) {
      console.error("Error creating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });

  app.patch("/api/periods/:id", async (req, res) => {
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

  app.delete("/api/periods/:id", async (req, res) => {
    try {
      await storage.deletePeriod(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting period:", error);
      res.status(500).json({ error: "Failed to delete period" });
    }
  });

  app.get("/api/periods/:periodId/files", async (req, res) => {
    try {
      const files = await storage.getFilesByPeriod(req.params.periodId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/periods/:periodId/files/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { sourceType, sourceName } = req.body;
      if (!sourceType || !sourceName) {
        return res.status(400).json({ error: "sourceType and sourceName are required" });
      }

      // Check for existing file with same sourceType/sourceName and delete it
      const existingFiles = await storage.getFilesByPeriod(req.params.periodId);
      const existingFile = existingFiles.find(f => 
        f.sourceType === sourceType && f.sourceName === sourceName
      );
      
      if (existingFile) {
        // Delete old file's transactions, matches, and the file record
        console.log(`Replacing existing file: ${existingFile.fileName} (${existingFile.id})`);
        await storage.deleteFile(existingFile.id);
        // Try to clean up object storage (but don't fail if it doesn't work)
        try {
          await objectStorageService.deleteFile(existingFile.fileUrl);
        } catch (e) {
          console.warn("Could not delete old file from storage:", e);
        }
      }

      const isCSV = req.file.mimetype.includes('csv') || 
                    req.file.mimetype === 'text/csv' || 
                    req.file.originalname.endsWith('.csv');
      
      const isExcel = req.file.mimetype.includes('spreadsheet') || 
                      req.file.mimetype.includes('excel') ||
                      req.file.originalname.endsWith('.xlsx') || 
                      req.file.originalname.endsWith('.xls');

      const isPDF = req.file.mimetype === 'application/pdf' ||
                    req.file.originalname.endsWith('.pdf');

      if (!isCSV && !isExcel && !isPDF) {
        return res.status(400).json({ 
          error: "Invalid file format. Please upload CSV, Excel, or PDF files only." 
        });
      }

      const fileType = isCSV ? 'csv' : isExcel ? 'xlsx' : 'pdf';

      const parsed = await fileParser.parse(req.file.buffer, fileType);
      const columnMappings = fileParser.autoDetectColumns(parsed.headers);

      const suggestedMappingsObject: Record<string, string> = {};
      for (const mapping of columnMappings) {
        suggestedMappingsObject[mapping.detectedColumn] = mapping.suggestedMapping;
      }

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
        status: 'uploaded'
      });

      res.json({
        file: uploadedFile,
        preview: {
          headers: parsed.headers,
          rows: DataNormalizer.normalizePreviewRows(parsed.rows.slice(0, 5)),
          totalRows: parsed.rowCount,
        },
        suggestedMappings: suggestedMappingsObject,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get("/api/files/:fileId/preview", async (req, res) => {
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
      
      const mappingToUse = file.columnMapping || suggestedMappings;
      if (mappingToUse && Object.keys(mappingToUse).length > 0) {
        for (const row of parsed.rows.slice(0, 5)) {
          const extracted = fileParser.extractTransactionData(
            row,
            mappingToUse as Record<string, string>,
            parsed.headers,
            file.sourceType
          );
          normalizedPreview.push(extracted);
        }
      }

      res.json({
        headers: parsed.headers,
        rows: DataNormalizer.normalizePreviewRows(parsed.rows.slice(0, 5)),
        totalRows: parsed.rowCount,
        suggestedMappings,
        currentMapping: file.columnMapping,
        // New fields for improved UI
        detectedPreset: detectedPreset ? {
          name: detectedPreset.name,
          description: detectedPreset.description,
        } : null,
        columnLabels,
        normalizedPreview,
      });
    } catch (error) {
      console.error("Error fetching file preview:", error);
      res.status(500).json({ error: "Failed to fetch file preview" });
    }
  });

  app.post("/api/files/:fileId/column-mapping", async (req, res) => {
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
    } catch (error) {
      console.error("Error saving column mapping:", error);
      res.status(400).json({ error: "Invalid column mapping data" });
    }
  });

  app.post("/api/files/:fileId/process", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      if (!file.columnMapping) {
        return res.status(400).json({ error: "Column mapping not set" });
      }

      // Delete existing transactions from this file before reprocessing
      // This prevents duplicates when files are processed multiple times
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
        
        // Validate the row
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
          matchStatus: 'unmatched' as const,
          matchId: null,
        });
      }

      const created = await storage.createTransactions(validTransactions);
      
      await storage.updateFile(file.id, { 
        status: 'processed',
        rowCount: created.length 
      });

      res.json({ 
        success: true, 
        transactionsCreated: created.length,
        totalRows: parsed.rowCount,
        skipStats: skipStats,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  });

  app.delete("/api/files/:fileId", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (file) {
        await storage.deleteTransactionsByFile(file.id);
        await objectStorageService.deleteFile(file.fileUrl);
        await storage.deleteFile(file.id);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/periods/:periodId/transactions", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = (page - 1) * limit;
      const sourceType = req.query.sourceType as string | undefined;
      const matchStatus = req.query.matchStatus as string | undefined;
      const isCardTransaction = req.query.isCardTransaction as string | undefined;
      
      const result = await storage.getTransactionsByPeriodPaginated(
        req.params.periodId,
        { limit, offset, sourceType, matchStatus, isCardTransaction }
      );
      
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
  // MATCHING RULES ENDPOINTS
  // ============================================
  
  app.get("/api/periods/:periodId/matching-rules", async (req, res) => {
    try {
      const rules = await storage.getMatchingRules(req.params.periodId);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching matching rules:", error);
      res.status(500).json({ error: "Failed to fetch matching rules" });
    }
  });

  app.post("/api/periods/:periodId/matching-rules", async (req, res) => {
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
  
  app.post("/api/periods/:periodId/auto-match", async (req, res) => {
    try {
      console.log('=== Starting Auto-Match with Invoice Grouping ===');
      
      // Get user-configured matching rules (or defaults)
      const rules = await storage.getMatchingRules(req.params.periodId);
      console.log('Matching rules:', rules);

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
      
      console.log(`Loaded: ${bankTransactions.length} unmatched bank, ${fuelTransactions.length} unmatched fuel transactions`);

      // *** KEY STEP: Group fuel by invoice ***
      const fuelInvoices = groupFuelByInvoice(fuelTransactions, rules.groupByInvoice);
      console.log(`Grouped into ${fuelInvoices.length} invoices (groupByInvoice: ${rules.groupByInvoice})`);

      // Log multi-line invoice examples
      const multiLine = fuelInvoices.filter(inv => inv.items.length > 1).slice(0, 5);
      if (multiLine.length > 0) {
        console.log('Multi-line invoice examples:');
        multiLine.forEach(inv => {
          console.log(`  Invoice ${inv.invoiceNumber}: ${inv.items.length} items = R${inv.totalAmount.toFixed(2)}`);
        });
      }

      let matchCount = 0;
      let skippedNonCardCount = transactions.filter(t => 
        t.sourceType === 'fuel' && t.isCardTransaction !== 'yes'
      ).length;

      // Track matched invoices to avoid double-matching
      const matchedInvoices = new Set<string>();

      // Match bank transactions to invoices
      for (const bankTx of bankTransactions) {
        let bestMatch: { 
          invoice: FuelInvoice; 
          confidence: number; 
          timeDiff: number; 
          dateDiff: number;
          amountDiff: number;
          reasons: string[];
        } | null = null;

        for (const invoice of fuelInvoices) {
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
            confidence = 62;
            reasons.push(`${Math.abs(dateDiff)} days difference (weekend processing)`);
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
              confidence = 65;
              reasons.push(`Time difference: ${timeDiff} minutes`);
            }
          }

          // Amount penalty (the further from exact, the lower confidence)
          if (amountDiff > 0) {
            const amountPenalty = Math.min(10, (amountDiff / rules.amountTolerance) * 10);
            confidence -= amountPenalty;
          }

          // Card number check (optional or required based on rules)
          if (rules.requireCardMatch) {
            if (!bankTx.cardNumber || !invoice.cardNumber) continue;
            if (bankTx.cardNumber !== invoice.cardNumber) continue;
            reasons.push('Card numbers match (required)');
          } else {
            // Optional card bonus/penalty
            if (bankTx.cardNumber && invoice.cardNumber) {
              if (bankTx.cardNumber === invoice.cardNumber) {
                confidence += 10;
                reasons.push('Card numbers match (bonus)');
              } else {
                confidence -= 15;
                reasons.push('Card numbers differ');
              }
            }
          }

          // Multi-line invoice note
          if (invoice.items.length > 1) {
            reasons.push(`Grouped invoice: ${invoice.items.length} items`);
          }

          // Cap confidence
          confidence = Math.min(100, Math.max(0, confidence));

          // Check minimum confidence threshold
          if (confidence < rules.minimumConfidence) continue;

          // Prefer matches with: highest confidence, then smallest date diff, then smallest time diff
          const absDiff = Math.abs(dateDiff);
          if (!bestMatch || 
              confidence > bestMatch.confidence ||
              (confidence === bestMatch.confidence && absDiff < bestMatch.dateDiff) ||
              (confidence === bestMatch.confidence && absDiff === bestMatch.dateDiff && timeDiff < bestMatch.timeDiff)) {
            bestMatch = { invoice, confidence, timeDiff, dateDiff: absDiff, amountDiff, reasons };
          }
        }

        // Create match if found
        if (bestMatch) {
          const matchType = bestMatch.confidence >= rules.autoMatchThreshold ? 'auto' : 'auto_review';
          
          const match = await storage.createMatch({
            periodId: req.params.periodId,
            fuelTransactionId: bestMatch.invoice.items[0].id, // Link to first item
            bankTransactionId: bankTx.id,
            matchType,
            matchConfidence: String(bestMatch.confidence),
          });

          // Update bank transaction
          await storage.updateTransaction(bankTx.id, {
            matchStatus: 'matched',
            matchId: match.id
          });

          // Update ALL fuel transactions in the invoice
          for (const fuelItem of bestMatch.invoice.items) {
            await storage.updateTransaction(fuelItem.id, {
              matchStatus: 'matched',
              matchId: match.id
            });
          }

          matchedInvoices.add(bestMatch.invoice.invoiceNumber);
          matchCount++;

          console.log(`Match: Bank R${parseFloat(bankTx.amount).toFixed(2)} → Invoice ${bestMatch.invoice.invoiceNumber} (${bestMatch.invoice.items.length} items = R${bestMatch.invoice.totalAmount.toFixed(2)}) [${bestMatch.confidence}%]`);
        }
      }

      const matchRate = bankTransactions.length > 0 
        ? ((matchCount / bankTransactions.length) * 100).toFixed(1) 
        : '0';

      console.log(`\n=== Auto-Match Complete ===`);
      console.log(`Matches: ${matchCount}/${bankTransactions.length} = ${matchRate}%`);

      res.json({ 
        success: true, 
        matchesCreated: matchCount,
        cardTransactionsProcessed: fuelTransactions.length,
        invoicesCreated: fuelInvoices.length,
        bankTransactionsAvailable: bankTransactions.length,
        nonCardTransactionsSkipped: skippedNonCardCount,
        matchRate: `${matchRate}%`,
        rulesUsed: rules
      });
    } catch (error) {
      console.error("Error auto-matching:", error);
      res.status(500).json({ error: "Failed to auto-match transactions" });
    }
  });

  app.post("/api/matches/manual", async (req, res) => {
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

  app.delete("/api/matches/:matchId", async (req, res) => {
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

  app.get("/api/periods/:periodId/report/:format", async (req, res) => {
    try {
      const { periodId, format } = req.params;
      
      const period = await storage.getPeriod(periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }

      const transactions = await storage.getTransactionsByPeriod(periodId);
      const matches = await storage.getMatchesByPeriod(periodId);

      const reportData = { period, transactions, matches };

      if (format === 'pdf') {
        const buffer = reportGenerator.generatePDF(reportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${period.name}.pdf"`);
        res.send(buffer);
      } else if (format === 'excel') {
        const buffer = reportGenerator.generateExcel(reportData);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${period.name}.xlsx"`);
        res.send(buffer);
      } else if (format === 'csv') {
        const csv = reportGenerator.generateCSV(reportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${period.name}.csv"`);
        res.send(csv);
      } else {
        res.status(400).json({ error: "Invalid format. Use pdf, excel, or csv" });
      }
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/periods/:periodId/summary", async (req, res) => {
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

  const httpServer = createServer(app);

  return httpServer;
}
