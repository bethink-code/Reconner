import { Response } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private localStorageDir: string;

  constructor() {
    this.localStorageDir = process.env.PRIVATE_OBJECT_DIR || path.join(process.cwd(), "uploads");
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async uploadFile(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
    const fileId = randomUUID();
    const uploadDir = path.join(this.localStorageDir, fileId);
    this.ensureDir(uploadDir);

    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    // Store metadata
    fs.writeFileSync(filePath + ".meta", JSON.stringify({ contentType }));

    return `${fileId}/${fileName}`;
  }

  async downloadFile(objectPath: string, res: Response) {
    try {
      const filePath = path.join(this.localStorageDir, objectPath);
      if (!fs.existsSync(filePath)) {
        throw new ObjectNotFoundError();
      }

      let contentType = "application/octet-stream";
      const metaPath = filePath + ".meta";
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        contentType = meta.contentType || contentType;
      }

      const stat = fs.statSync(filePath);
      res.set({
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "private, max-age=3600",
      });

      const stream = fs.createReadStream(filePath);
      stream.on("error", (err: Error) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        if (error instanceof ObjectNotFoundError) {
          res.status(404).json({ error: "File not found" });
        } else {
          res.status(500).json({ error: "Error downloading file" });
        }
      }
    }
  }

  async getFile(objectPath: string): Promise<{ download: () => Promise<[Buffer]> }> {
    const filePath = path.join(this.localStorageDir, objectPath);
    if (!fs.existsSync(filePath)) {
      throw new ObjectNotFoundError();
    }
    return {
      download: async () => [fs.readFileSync(filePath)] as [Buffer],
    };
  }

  async deleteFile(objectPath: string): Promise<void> {
    try {
      const filePath = path.join(this.localStorageDir, objectPath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        const metaPath = filePath + ".meta";
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      }
    } catch (error) {
      // Ignore delete errors for non-existent files
    }
  }
}

export const objectStorageService = new ObjectStorageService();
