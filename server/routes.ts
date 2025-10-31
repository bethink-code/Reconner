import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { fileParser } from "./fileParser";
import { objectStorageService } from "./objectStorage";
import { reportGenerator } from "./reportGenerator";
import { 
  insertReconciliationPeriodSchema,
  insertUploadedFileSchema,
  insertTransactionSchema,
  insertMatchSchema 
} from "@shared/schema";
import { z } from "zod";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  }
});

const columnMappingSchema = z.record(z.enum(['date', 'amount', 'reference', 'description', 'ignore']));

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
          rows: parsed.rows.slice(0, 5),
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

      res.json({
        headers: parsed.headers,
        rows: parsed.rows.slice(0, 5),
        totalRows: parsed.rowCount,
        suggestedMappings,
        currentMapping: file.columnMapping,
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

      const objectFile = await objectStorageService.getFile(file.fileUrl);
      const [buffer] = await objectFile.download();
      
      const parsed = await fileParser.parse(buffer, file.fileType);
      
      const transactions = parsed.rows.map(row => {
        const extracted = fileParser.extractTransactionData(row, file.columnMapping as Record<string, string>);
        
        return {
          fileId: file.id,
          periodId: file.periodId,
          sourceType: file.sourceType,
          rawData: row,
          transactionDate: extracted.transactionDate,
          amount: extracted.amount,
          description: extracted.description || '',
          referenceNumber: extracted.referenceNumber || '',
          matchStatus: 'unmatched' as const,
          matchId: null,
        };
      });

      const created = await storage.createTransactions(transactions);
      
      await storage.updateFile(file.id, { 
        status: 'processed',
        rowCount: created.length 
      });

      res.json({ 
        success: true, 
        transactionsCreated: created.length 
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
      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/periods/:periodId/auto-match", async (req, res) => {
    try {
      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      
      const fuelTransactions = transactions.filter(t => t.sourceType === 'fuel');
      const bankTransactions = transactions.filter(t => t.sourceType === 'bank');
      
      let matchCount = 0;

      for (const fuelTx of fuelTransactions) {
        if (fuelTx.matchStatus !== 'unmatched') continue;

        for (const bankTx of bankTransactions) {
          if (bankTx.matchStatus !== 'unmatched') continue;

          const amountMatch = Math.abs(parseFloat(fuelTx.amount) - parseFloat(bankTx.amount)) < 0.01;
          const dateMatch = fuelTx.transactionDate === bankTx.transactionDate;
          const refMatch = fuelTx.referenceNumber && bankTx.referenceNumber && 
                          fuelTx.referenceNumber === bankTx.referenceNumber;

          let confidence = 0;
          if (amountMatch) confidence += 50;
          if (dateMatch) confidence += 30;
          if (refMatch) confidence += 20;

          if (confidence >= 70) {
            const match = await storage.createMatch({
              periodId: req.params.periodId,
              fuelTransactionId: fuelTx.id,
              bankTransactionId: bankTx.id,
              matchType: 'auto',
              matchConfidence: String(confidence),
            });

            await storage.updateTransaction(fuelTx.id, { 
              matchStatus: 'matched',
              matchId: match.id 
            });
            await storage.updateTransaction(bankTx.id, { 
              matchStatus: 'matched',
              matchId: match.id 
            });

            matchCount++;
            break;
          }
        }
      }

      res.json({ 
        success: true, 
        matchesCreated: matchCount 
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

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const matches = await storage.getMatchesByPeriod(req.params.periodId);

      const summary = reportGenerator.calculateSummary({ period, transactions, matches });
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
