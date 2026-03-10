import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

let isReady = false;
let initError: Error | null = null;

const readyPromise = (async () => {
  try {
    await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    isReady = true;
  } catch (err: any) {
    console.error("INIT ERROR:", err);
    initError = err;
  }
})();

export default async function handler(req: any, res: any) {
  if (!isReady) {
    await readyPromise;
  }
  if (initError) {
    res.status(500).json({ error: "Server initialization failed" });
    return;
  }
  return app(req, res);
}
