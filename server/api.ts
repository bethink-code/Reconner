import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";

const app = express();

// Security headers
app.use(helmet());

// CORS — restrict to known origins
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://reconner.vercel.app',
  credentials: true,
}));

// Rate limiting — general API protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // 200 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api/", apiLimiter);

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
      console.error("Unhandled error:", err);
      // Never leak internal error details to the client
      res.status(status).json({ message: status >= 500 ? "Internal Server Error" : (err.message || "Error") });
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
