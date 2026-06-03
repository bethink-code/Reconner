import type { Express } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isAuthenticated } from "./auth";
import { isPlatformOwner } from "./routeAccess";
import { storage } from "./storage";
import { audit } from "./auditLog";

// The viability/pricing model is a self-contained HTML tool. It is served only
// to platform owners — the financials (rates, burn, strategy) must never be
// publicly reachable, so it deliberately does NOT live in the static client.
const __dirname = dirname(fileURLToPath(import.meta.url));
const toolHtml = readFileSync(
  join(__dirname, "pricing-tool", "lekana-viability.html"),
  "utf8",
);
// "Model 2" — the budget-envelope model. A parallel, self-contained tool that
// reframes the same economics as a monthly budget (pool = revenue, forced vs
// discretionary envelopes, cash vs loaded profit). Lives beside the viability
// model so both can be compared; same platform-owner gate.
const budgetHtml = readFileSync(
  join(__dirname, "pricing-tool", "lekana-budget.html"),
  "utf8",
);

// Scoped CSP for a hand-authored, platform-owner-only tool document. helmet's
// global default (default-src 'self') would block its inline script/styles +
// Google Fonts; relaxed for these gated routes only.
const TOOL_CSP = [
  "default-src 'self'",
  "script-src 'unsafe-inline' 'self'",
  "style-src 'unsafe-inline' 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
].join("; ");

export function registerPricingRoutes(app: Express): void {
  // Serve the gated tool document. The Admin "Pricing" tab embeds this in a
  // same-origin iframe, so the session cookie flows and the gate applies.
  app.get("/api/admin/pricing-tool", isAuthenticated, isPlatformOwner, (_req, res) => {
    res.setHeader("Content-Security-Policy", TOOL_CSP);
    res.type("html").send(toolHtml);
  });

  // "Model 2" — the budget-envelope model, embedded by the Admin "Model 2" tab.
  app.get("/api/admin/budget-tool", isAuthenticated, isPlatformOwner, (_req, res) => {
    res.setHeader("Content-Security-Policy", TOOL_CSP);
    res.type("html").send(budgetHtml);
  });

  // Shared saved scenarios — both platform owners read/write the same list.
  app.get("/api/admin/pricing-scenarios", isAuthenticated, isPlatformOwner, async (_req, res) => {
    try {
      const scenarios = await storage.getPricingScenarios();
      res.json(scenarios);
    } catch (error) {
      console.error("Error fetching pricing scenarios:", error);
      res.status(500).json({ error: "Failed to fetch scenarios" });
    }
  });

  app.post("/api/admin/pricing-scenarios", isAuthenticated, isPlatformOwner, async (req: any, res) => {
    try {
      const { name, inputs } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
        return res.status(400).json({ error: "inputs object is required" });
      }
      const scenario = await storage.createPricingScenario({
        name: name.trim(),
        inputs,
        createdBy: req.user?.claims?.sub ?? null,
        createdByEmail: req.user?.claims?.email ?? null,
      });
      audit(req, { action: "pricing.scenario_saved", resourceType: "pricing_scenario", resourceId: scenario.id, detail: name.trim() });
      res.json(scenario);
    } catch (error) {
      console.error("Error saving pricing scenario:", error);
      res.status(500).json({ error: "Failed to save scenario" });
    }
  });

  app.delete("/api/admin/pricing-scenarios/:id", isAuthenticated, isPlatformOwner, async (req: any, res) => {
    try {
      await storage.deletePricingScenario(req.params.id);
      audit(req, { action: "pricing.scenario_deleted", resourceType: "pricing_scenario", resourceId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting pricing scenario:", error);
      res.status(500).json({ error: "Failed to delete scenario" });
    }
  });
}
