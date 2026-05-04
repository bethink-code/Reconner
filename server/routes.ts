import type { Express } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import multer from "multer";
import { setupAuth } from "./auth";
import { registerAccountRoutes } from "./accountRoutes";
import { registerExportRoutes } from "./exportRoutes";
import { registerFilePreparationRoutes } from "./filePreparationRoutes";
import { registerFileWorkflowRoutes } from "./fileWorkflowRoutes";
import { registerPdfConversionRoutes } from "./pdfConversionRoutes";
import { registerPeriodRoutes } from "./periodRoutes";
import { registerReconciliationReadRoutes } from "./reconciliationReadRoutes";
import { registerReconciliationWriteRoutes } from "./reconciliationWriteRoutes";

function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  registerAccountRoutes(app);
  registerExportRoutes(app);
  registerFilePreparationRoutes(app);
  registerFileWorkflowRoutes(app, upload, computeContentHash);
  registerPdfConversionRoutes(app, upload);
  registerPeriodRoutes(app);
  registerReconciliationReadRoutes(app);
  registerReconciliationWriteRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
