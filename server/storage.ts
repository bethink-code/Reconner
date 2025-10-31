import { 
  type User, 
  type InsertUser,
  type ReconciliationPeriod,
  type InsertReconciliationPeriod,
  type UploadedFile,
  type InsertUploadedFile,
  type Transaction,
  type InsertTransaction,
  type Match,
  type InsertMatch,
  users,
  reconciliationPeriods,
  uploadedFiles,
  transactions,
  matches
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getPeriods(): Promise<ReconciliationPeriod[]>;
  getPeriod(id: string): Promise<ReconciliationPeriod | undefined>;
  createPeriod(period: InsertReconciliationPeriod): Promise<ReconciliationPeriod>;
  updatePeriod(id: string, data: Partial<InsertReconciliationPeriod>): Promise<ReconciliationPeriod | undefined>;
  deletePeriod(id: string): Promise<void>;
  
  getFilesByPeriod(periodId: string): Promise<UploadedFile[]>;
  getFile(id: string): Promise<UploadedFile | undefined>;
  createFile(file: InsertUploadedFile): Promise<UploadedFile>;
  updateFile(id: string, data: Partial<InsertUploadedFile>): Promise<UploadedFile | undefined>;
  deleteFile(id: string): Promise<void>;
  
  getTransactionsByPeriod(periodId: string): Promise<Transaction[]>;
  getTransactionsByFile(fileId: string): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  createTransactions(transactions: InsertTransaction[]): Promise<Transaction[]>;
  updateTransaction(id: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  deleteTransactionsByFile(fileId: string): Promise<void>;
  
  getMatchesByPeriod(periodId: string): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  deleteMatch(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getPeriods(): Promise<ReconciliationPeriod[]> {
    return await db.select().from(reconciliationPeriods).orderBy(desc(reconciliationPeriods.createdAt));
  }

  async getPeriod(id: string): Promise<ReconciliationPeriod | undefined> {
    const [period] = await db.select().from(reconciliationPeriods).where(eq(reconciliationPeriods.id, id));
    return period || undefined;
  }

  async createPeriod(period: InsertReconciliationPeriod): Promise<ReconciliationPeriod> {
    const [newPeriod] = await db.insert(reconciliationPeriods).values(period).returning();
    return newPeriod;
  }

  async updatePeriod(id: string, data: Partial<InsertReconciliationPeriod>): Promise<ReconciliationPeriod | undefined> {
    const [updated] = await db.update(reconciliationPeriods)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reconciliationPeriods.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePeriod(id: string): Promise<void> {
    await db.delete(reconciliationPeriods).where(eq(reconciliationPeriods.id, id));
  }

  async getFilesByPeriod(periodId: string): Promise<UploadedFile[]> {
    return await db.select().from(uploadedFiles)
      .where(eq(uploadedFiles.periodId, periodId))
      .orderBy(desc(uploadedFiles.uploadedAt));
  }

  async getFile(id: string): Promise<UploadedFile | undefined> {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
    return file || undefined;
  }

  async createFile(file: InsertUploadedFile): Promise<UploadedFile> {
    const [newFile] = await db.insert(uploadedFiles).values(file).returning();
    return newFile;
  }

  async updateFile(id: string, data: Partial<InsertUploadedFile>): Promise<UploadedFile | undefined> {
    const [updated] = await db.update(uploadedFiles)
      .set(data)
      .where(eq(uploadedFiles.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
  }

  async getTransactionsByPeriod(periodId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.periodId, periodId))
      .orderBy(desc(transactions.transactionDate));
  }

  async getTransactionsByFile(fileId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.fileId, fileId))
      .orderBy(desc(transactions.transactionDate));
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async createTransactions(transactionList: InsertTransaction[]): Promise<Transaction[]> {
    if (transactionList.length === 0) return [];
    return await db.insert(transactions).values(transactionList).returning();
  }

  async updateTransaction(id: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const [updated] = await db.update(transactions)
      .set(data)
      .where(eq(transactions.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTransactionsByFile(fileId: string): Promise<void> {
    await db.delete(transactions).where(eq(transactions.fileId, fileId));
  }

  async getMatchesByPeriod(periodId: string): Promise<Match[]> {
    return await db.select().from(matches)
      .where(eq(matches.periodId, periodId))
      .orderBy(desc(matches.createdAt));
  }

  async getMatch(id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match || undefined;
  }

  async createMatch(match: InsertMatch): Promise<Match> {
    const [newMatch] = await db.insert(matches).values(match).returning();
    return newMatch;
  }

  async deleteMatch(id: string): Promise<void> {
    await db.delete(matches).where(eq(matches.id, id));
  }
}

export const storage = new DatabaseStorage();
