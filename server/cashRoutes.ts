import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import { assertPeriodOwner, assertPeriodWrite } from "./routeAccess";
import { storage } from "./storage";

const setReceivedSchema = z.object({
  amount: z.number().min(0).nullable(),
});

const createPaymentSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  paymentDate: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

export function registerCashRoutes(app: Express) {
  // Get cash inputs for a period — banked total + petty payments list.
  app.get("/api/periods/:periodId/cash", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const payments = await storage.getCashPayments(req.params.periodId);
      res.json({
        received: period.cashReceivedAmount === null
          ? null
          : Number(period.cashReceivedAmount),
        spent: payments.map(p => ({
          id: p.id,
          amount: Number(p.amount),
          paymentDate: p.paymentDate,
          reason: p.reason,
          userName: p.userName,
          createdAt: p.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching cash inputs:", error);
      res.status(500).json({ error: "Failed to fetch cash inputs" });
    }
  });

  // Set the period's cash-received amount. Null clears it.
  app.put("/api/periods/:periodId/cash/received", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      const { amount } = setReceivedSchema.parse(req.body);
      const updated = await storage.setCashReceivedAmount(req.params.periodId, amount);
      if (!updated) {
        return res.status(404).json({ error: "Period not found" });
      }

      audit(req, {
        action: "cash.received.set",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: amount === null ? "cleared" : `amount=${amount.toFixed(2)}`,
      });

      res.json({
        received: updated.cashReceivedAmount === null
          ? null
          : Number(updated.cashReceivedAmount),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid amount", details: error.flatten() });
      }
      console.error("Error setting cash received amount:", error);
      res.status(500).json({ error: "Failed to set cash received amount" });
    }
  });

  // Add a cash-spent item to a period.
  app.post("/api/periods/:periodId/cash/payments", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      const validated = createPaymentSchema.parse(req.body);
      const userId = req.user?.claims?.sub as string | undefined;
      const userName = [req.user?.claims?.first_name, req.user?.claims?.last_name]
        .filter(Boolean)
        .join(" ") || null;
      const userEmail = (req.user?.claims?.email as string | undefined) || null;

      const created = await storage.createCashPayment({
        periodId: req.params.periodId,
        amount: validated.amount.toFixed(2),
        paymentDate: validated.paymentDate,
        reason: validated.reason,
        userId: userId || null,
        userName,
        userEmail,
      });

      audit(req, {
        action: "cash.payment.create",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: `amount=${validated.amount.toFixed(2)} date=${validated.paymentDate}`,
      });

      res.json({
        id: created.id,
        amount: Number(created.amount),
        paymentDate: created.paymentDate,
        reason: created.reason,
        userName: created.userName,
        createdAt: created.createdAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payment", details: error.flatten() });
      }
      console.error("Error creating cash payment:", error);
      res.status(500).json({ error: "Failed to create cash payment" });
    }
  });

  // Delete a petty cash payment. Ownership verified by loading the payment, then
  // checking the parent period via assertPeriodWrite.
  app.delete("/api/cash-payments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const payment = await storage.getCashPayment(req.params.id);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      const period = await assertPeriodWrite(payment.periodId, req, res);
      if (!period) return;

      await storage.deleteCashPayment(req.params.id);

      audit(req, {
        action: "cash.payment.delete",
        resourceType: "period",
        resourceId: payment.periodId,
        detail: `paymentId=${req.params.id}`,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting cash payment:", error);
      res.status(500).json({ error: "Failed to delete cash payment" });
    }
  });
}
