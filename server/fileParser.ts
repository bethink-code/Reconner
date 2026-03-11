import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';

export interface ParsedFileData {
  headers: string[];
  rows: Record<string, any>[];
  rowCount: number;
}

export interface ColumnMapping {
  detectedColumn: string;
  suggestedMapping: 'date' | 'amount' | 'reference' | 'description' | 'time' | 'paymentType' | 'cardNumber' | 'ignore';
  confidence: number;
}

// Source-specific preset definitions based on known file structures
export interface SourcePreset {
  name: string;
  description: string;
  category: 'bank' | 'fuel'; // Source category for validation
  detectPattern: (headers: string[]) => boolean;
  mappings: Record<string, 'date' | 'amount' | 'reference' | 'description' | 'time' | 'paymentType' | 'cardNumber' | 'ignore'>;
  columnLabels: Record<string, string>; // Human-readable labels for cryptic column names
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    name: 'FNB Merchant',
    description: 'FNB Bank merchant transaction export',
    category: 'bank',
    detectPattern: (headers) => {
      const normalized = headers.map(h => h.toLowerCase().trim());
      return normalized.includes('transaction date') && 
             normalized.includes('terminal id') &&
             normalized.includes('pan');
    },
    mappings: {
      'Transaction date': 'date',
      'Transaction Date': 'date',
      'Amount': 'amount',
      'Terminal ID': 'reference',
      'Transaction type': 'description',
      'Transaction Type': 'description',
      'PAN': 'cardNumber',
      'Source': 'ignore',
    },
    columnLabels: {
      'Transaction date': 'Date & Time (e.g., "28 Feb 23:38:59")',
      'Transaction Date': 'Date & Time (e.g., "28 Feb 23:38:59")',
      'Amount': 'Transaction Amount (R currency)',
      'Terminal ID': 'Terminal Reference ID',
      'Transaction type': 'Transaction Type (Purchase, etc.)',
      'Transaction Type': 'Transaction Type (Purchase, etc.)',
      'PAN': 'Card Number (masked)',
      'Source': 'Source System',
    },
  },
  {
    name: 'ABSA Merchant',
    description: 'ABSA Bank merchant portal export',
    category: 'bank',
    detectPattern: (headers) => {
      const normalized = headers.map(h => h.toLowerCase().trim());
      const hasAmount = normalized.some(h => h.includes('transaction amount') || h === 'amount');
      const hasReference = normalized.some(h => h.includes('short reference') || h === 'uti short reference');
      const hasMerchant = normalized.some(h => h.includes('merchant'));
      return hasAmount && hasReference && hasMerchant;
    },
    mappings: {
      'Date': 'date',
      'Time': 'time',
      'Transaction Amount': 'amount',
      'Amount': 'amount',
      'Short Reference': 'reference',
      'UTI Short Reference': 'reference',
      'Merchant Name': 'description',
      'MerchantName': 'description',
      'Receipt No': 'ignore',
      'Terminal ID': 'ignore',
      'Card Number': 'cardNumber',
      'PAN': 'cardNumber',
      'Card Type': 'ignore',
      'Payment Method': 'paymentType',
      'Invoice No': 'ignore',
      'MID': 'ignore',
      'Batch': 'ignore',
      'RRN': 'ignore',
      'Invoice No': 'ignore',
      'Sequence No': 'ignore',
      'STAN': 'ignore',
    },
    columnLabels: {
      'Date': 'Transaction Date (YYYY/MM/DD)',
      'Time': 'Transaction Time',
      'Transaction Amount': 'Amount (R currency format)',
      'Amount': 'Amount (R currency format)',
      'Short Reference': 'Short Reference Code',
      'UTI Short Reference': 'Short Reference Code',
      'Merchant Name': 'Merchant/Store Name',
      'MerchantName': 'Merchant/Store Name',
      'Receipt No': 'Receipt Number',
      'Terminal ID': 'Terminal ID',
      'Card Number': 'Masked Card Number',
      'PAN': 'Masked Card Number',
      'Card Type': 'Card Type (Visa, MC)',
      'Payment Method': 'Payment Method',
    },
  },
  {
    name: 'Fuel Master',
    description: 'Fuel Master shift/sales export',
    category: 'fuel',
    detectPattern: (headers) => {
      const normalized = headers.map(h => h.toLowerCase().trim());
      // Fuel Master has cryptic column names like _1, _2, _3, _4, _5
      const hasCrypticColumns = headers.some(h => /^_\d+$/.test(h.trim()));
      const hasInvoice = normalized.includes('invoice');
      const hasShift = normalized.includes('shift');
      return (hasCrypticColumns && hasInvoice) || (hasShift && hasInvoice);
    },
    mappings: {
      '_1': 'date',  // Date/Time combined
      '_2': 'ignore', // Shift identifier
      '_3': 'description', // Fuel type (DSL50, ULP95)
      '_4': 'ignore', // Unit price
      '_5': 'amount', // Total amount
      'Invoice': 'reference',
      'Description': 'ignore', // Actually contains quantity, not description
      'Shift': 'paymentType', // Contains "Card" or other payment type
      'Card Number': 'cardNumber',
      'Card No': 'cardNumber',
      'CardNo': 'cardNumber',
    },
    columnLabels: {
      '_1': 'Date & Time (combined)',
      '_2': 'Shift Number',
      '_3': 'Fuel Type (DSL50, ULP95)',
      '_4': 'Unit Price per Liter',
      '_5': 'Total Amount',
      'Invoice': 'Invoice Number',
      'Description': 'Quantity (liters)',
      'Shift': 'Payment Type (Card/Cash)',
      'Card Number': 'Masked Card Number',
      'Card No': 'Masked Card Number',
      'CardNo': 'Masked Card Number',
    },
  },
  {
    name: 'Standard Bank Digital',
    description: 'Standard Bank / TotalEnergies merchant export',
    category: 'bank',
    detectPattern: (headers) => {
      const normalized = headers.map(h => h.toLowerCase().trim().replace(/\s+/g, ' '));
      return normalized.includes('transaction amount') &&
             normalized.includes('transaction date') &&
             normalized.includes('batch id') &&
             normalized.includes('card number');
    },
    mappings: {
      'Transaction  Date': 'date',
      'Transaction  Time': 'time',
      'Transaction  Amount': 'amount',
      'Reference  Number': 'reference',
      'Transaction  Type': 'description',
      'Card  Number': 'cardNumber',
      // Ignore the rest
      'Batch  ID': 'ignore',
      'Card  Type': 'ignore',
      'Merchant  Number': 'ignore',
      'Reject  Code': 'ignore',
      'Settlement  Date': 'ignore',
      'Terminal  ID': 'ignore',
      'Authorisation  Code': 'ignore',
      'Batch  Sequence  Number': 'ignore',
      'Cashback  Amount': 'ignore',
      'Cashier  Number': 'ignore',
      'GUID': 'ignore',
      'Interchange  Rate': 'ignore',
      'Item  Rate': 'ignore',
      'Origin  ID': 'ignore',
      'POS Entry  Mode': 'ignore',
      'Record  Type': 'ignore',
      'RRN': 'ignore',
      'STAN': 'ignore',
    },
    columnLabels: {
      'Transaction  Date': 'Transaction Date (DD/MM/YYYY)',
      'Transaction  Time': 'Transaction Time',
      'Transaction  Amount': 'Transaction Amount',
      'Reference  Number': 'Reference Number',
      'Transaction  Type': 'Transaction Type',
      'Card  Number': 'Card Number (masked)',
    },
  },
  {
    name: 'Sale Master',
    description: 'Sale Master fuel POS export (semicolon-delimited)',
    category: 'fuel',
    detectPattern: (headers) => {
      const normalized = headers.map(h => h.toLowerCase().trim());
      return normalized.includes('transdatetime') &&
             normalized.includes('saletotal') &&
             normalized.includes('invoicenumber');
    },
    mappings: {
      'transdatetime': 'date',
      'TransTime': 'time',
      'SaleTotal': 'amount',
      'InvoiceNumber': 'reference',
      'Description': 'description',
      'PayType': 'paymentType',
      'accnum': 'cardNumber',
      // Ignore the rest
      'AutoInPumpDisplayNumber': 'ignore',
      'branch': 'ignore',
      'TransDate': 'ignore',
      'unitname': 'ignore',
      'shiftnumber': 'ignore',
      'pump': 'ignore',
      'hose': 'ignore',
      'PluCode': 'ignore',
      'allgroups': 'ignore',
      'subgroups': 'ignore',
      'AttendantKey': 'ignore',
      'AttendantMiniPOSKey': 'ignore',
      'Attendant': 'ignore',
      'Cashier': 'ignore',
      'UnitCost': 'ignore',
      'CostPrice': 'ignore',
      'UnitVAT': 'ignore',
      'UnitTotalCurr': 'ignore',
      'VAT': 'ignore',
      'TotalCurr': 'ignore',
      'Selling': 'ignore',
      'Quantity': 'ignore',
      'WANPLU': 'ignore',
      'MiniPOSCode': 'ignore',
      'MiniPOSLineItemNumber': 'ignore',
      'FuelSale': 'ignore',
      'SaleType': 'ignore',
      'Standalone': 'ignore',
      'Debtor': 'ignore',
      'accname': 'ignore',
      'RegNum': 'ignore',
      'OdoMeter': 'ignore',
      'OrderNum': 'ignore',
      'paytypedescription': 'ignore',
      'AccountCode': 'ignore',
      'MemoNumber': 'ignore',
      'ManagerApproval': 'ignore',
      'Updated': 'ignore',
      'ExternalAccount': 'ignore',
      'UniqueID': 'ignore',
      'DriverName': 'ignore',
      'PostCount': 'ignore',
      'DayEndshiftnumber': 'ignore',
      'RequestNum': 'ignore',
      'FleetNum': 'ignore',
      'vatnumber': 'ignore',
      'TotaliserLiter': 'ignore',
      'PreAuthNumber': 'ignore',
      'salelineuniqueid': 'ignore',
      'fuelsalekey': 'ignore',
    },
    columnLabels: {
      'transdatetime': 'Transaction Date & Time',
      'TransTime': 'Transaction Time',
      'SaleTotal': 'Sale Total Amount',
      'InvoiceNumber': 'Invoice Number',
      'Description': 'Product Description (fuel type)',
      'PayType': 'Payment Type (Card/Cash)',
      'accnum': 'Account/Card Number',
    },
  },
];

// Data normalization utilities
export class DataNormalizer {
  // Format Excel serial date/time for display in preview
  // Converts "45901.63006944444" to "2025-09-01 15:07:18"
  static formatExcelSerialForDisplay(value: any): string {
    if (value === null || value === undefined || value === '') return '';
    const trimmed = String(value).trim();
    
    // Check if it looks like an Excel serial number (5-digit number with optional decimals)
    const serial = parseFloat(trimmed);
    if (!isNaN(serial) && serial > 40000 && serial < 60000) {
      // Extract date
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      const wholeDays = Math.floor(serial);
      const date = new Date(excelEpoch.getTime() + wholeDays * 86400 * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Extract time from fractional part
      const fractionalDay = serial - wholeDays;
      if (fractionalDay > 0) {
        const totalSeconds = Math.round(fractionalDay * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      
      return `${year}-${month}-${day}`;
    }
    
    return trimmed;
  }

  // Normalize preview rows: convert Excel serial dates to readable format
  static normalizePreviewRows(rows: Record<string, any>[]): Record<string, any>[] {
    return rows.map(row => {
      const normalizedRow: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        normalizedRow[key] = this.formatExcelSerialForDisplay(value);
      }
      return normalizedRow;
    });
  }

  // Normalize ABSA amount: "R 1,337.20" → 1337.20
  static normalizeABSAAmount(value: string): string {
    if (!value) return '0';
    let cleaned = String(value).trim();
    // Remove "R " prefix and any currency symbols
    cleaned = cleaned.replace(/^R\s*/i, '');
    // Remove commas (thousands separator)
    cleaned = cleaned.replace(/,/g, '');
    // Handle negative amounts in parentheses or with CR
    const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')') || 
                       cleaned.startsWith('-') ||
                       cleaned.toLowerCase().includes('cr');
    cleaned = cleaned.replace(/[^0-9.]/g, '');
    return isNegative ? `-${cleaned}` : cleaned;
  }

  // Normalize FNB amount: "R100,00" → "100.00" (comma is decimal separator in SA format)
  static normalizeFNBAmount(value: string): string {
    if (!value) return '0';
    let cleaned = String(value).trim();
    // Remove "R" prefix and spaces
    cleaned = cleaned.replace(/^R\s*/i, '');
    // Handle negative
    const isNegative = cleaned.startsWith('-') || (cleaned.startsWith('(') && cleaned.endsWith(')'));
    cleaned = cleaned.replace(/[()]/g, '');
    // Remove spaces (thousands separator in some SA formats: "1 000,00")
    cleaned = cleaned.replace(/\s/g, '');
    // Replace comma with period (comma is decimal separator)
    // Only if there's exactly one comma and it's followed by 1-2 digits at the end
    if (/,\d{1,2}$/.test(cleaned) && !cleaned.includes('.')) {
      cleaned = cleaned.replace(',', '.');
    }
    cleaned = cleaned.replace(/[^0-9.]/g, '');
    if (!cleaned) return '0';
    return isNegative ? `-${cleaned}` : cleaned;
  }

  // Normalize FNB date: "27 Nov" → "2025-11-27" (uses provided year)
  static normalizeFNBDate(value: string, year: string = String(new Date().getFullYear())): string {
    if (!value) return '';
    const trimmed = String(value).trim();
    // Pattern: "DD Mon" (e.g., "27 Nov")
    const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const monthStr = match[2];
      const months: Record<string, string> = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      };
      const month = months[monthStr.toLowerCase()];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }
    return trimmed;
  }

  // Normalize ABSA date: "2025/11/27" → "2025-11-27"
  static normalizeABSADate(value: string): string {
    if (!value) return '';
    return String(value).trim().replace(/\//g, '-');
  }

  // Normalize Fuel Master datetime: extract date portion from datetime
  static normalizeFuelMasterDate(value: string): string {
    if (!value) return '';
    const trimmed = String(value).trim();
    // Try parsing as ISO datetime or common formats
    // Common formats: "2025-11-27 14:30:00" or Excel serial number
    
    // If it looks like a date-time string
    const dateMatch = trimmed.match(/^(\d{4}[-/]\d{2}[-/]\d{2})/);
    if (dateMatch) {
      return dateMatch[1].replace(/\//g, '-');
    }
    
    // Excel serial date number (Excel uses 1900-01-01 as epoch)
    const serial = parseFloat(trimmed);
    if (!isNaN(serial) && serial > 40000 && serial < 60000) {
      // Excel date serial: integer part is days since 1899-12-30
      // Using the correct Excel epoch calculation
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      const wholeDays = Math.floor(serial);
      const date = new Date(excelEpoch.getTime() + wholeDays * 86400 * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    return trimmed;
  }

  // Extract time from Fuel Master datetime (Excel serial or HH:MM:SS format)
  static normalizeFuelMasterTime(value: string): string {
    if (!value) return '';
    const trimmed = String(value).trim();
    
    // First check for HH:MM:SS pattern
    const timeMatch = trimmed.match(/(\d{2}:\d{2}(:\d{2})?)/);
    if (timeMatch) {
      return timeMatch[1];
    }
    
    // Excel serial: fractional part represents time of day
    const serial = parseFloat(trimmed);
    if (!isNaN(serial) && serial > 40000 && serial < 60000) {
      const fractionalDay = serial - Math.floor(serial);
      const totalSeconds = Math.round(fractionalDay * 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    return '';
  }

  // General amount normalization
  static normalizeAmount(value: string, sourceType?: string, presetName?: string): string {
    if (!value) return '0';

    // FNB uses comma as decimal separator: "R100,00"
    if (presetName === 'FNB Merchant' || (String(value).match(/^R\s*[\d\s]*,\d{2}$/) && !String(value).includes('.'))) {
      return this.normalizeFNBAmount(value);
    }

    // For bank sources (ABSA, etc.), use special handling for R currency
    if (sourceType && sourceType.startsWith('bank') && String(value).includes('R')) {
      return this.normalizeABSAAmount(value);
    }
    
    let rawAmount = String(value).trim();
    const isNegative = rawAmount.startsWith('(') && rawAmount.endsWith(')') || 
                       rawAmount.startsWith('-') ||
                       rawAmount.endsWith('-') ||
                       rawAmount.toLowerCase().includes('cr');
    
    // Remove currency symbols, commas, spaces
    rawAmount = rawAmount.replace(/[R$€£,\s]/g, '');
    rawAmount = rawAmount.replace(/[^0-9.-]/g, '');
    
    if (!rawAmount || rawAmount === '-') return '0';
    
    return isNegative && !rawAmount.startsWith('-') ? `-${rawAmount}` : rawAmount;
  }

  // Check if a value looks like a card payment
  static isCardPayment(value: string): boolean {
    if (!value) return false;
    const lower = String(value).toLowerCase().trim();
    return lower === 'card' || 
           lower.includes('credit') || 
           lower.includes('debit') ||
           lower.includes('visa') ||
           lower.includes('mastercard') ||
           lower.includes('card');
  }

  // Normalize card number to last 4 digits format for matching
  // Input can be: "****1234", "1234", "5412751234561234", "xxxx-xxxx-xxxx-1234"
  // Output: "1234" (last 4 digits only for comparison)
  static normalizeCardNumber(value: string): string {
    if (!value) return '';
    const cleaned = String(value).trim();
    
    // Extract only digits
    const digits = cleaned.replace(/\D/g, '');
    
    // Return last 4 digits if available
    if (digits.length >= 4) {
      return digits.slice(-4);
    }
    
    // If less than 4 digits but some exist, return what we have
    if (digits.length > 0) {
      return digits;
    }
    
    return '';
  }
}

export class FileParser {
  parseCSV(buffer: Buffer): ParsedFileData {
    const text = buffer.toString('utf-8');

    // Auto-detect delimiter: check tabs, semicolons, commas in the first line
    const firstLine = text.split('\n')[0] || '';
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    // Tabs take priority (TSV files like FNB .txt exports), then semicolons, then commas
    let delimiter = tabCount > semicolonCount && tabCount > commaCount ? '\t'
                    : semicolonCount > commaCount ? ';' : ',';

    let result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      delimiter,
    });

    let headers = result.meta.fields || [];

    // Fallback: if only 1 column detected, try tab delimiter
    if (headers.length <= 1 && delimiter !== '\t') {
      const tabResult = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: '\t',
      });
      const tabHeaders = tabResult.meta.fields || [];
      if (tabHeaders.length > 1) {
        result = tabResult;
        headers = tabHeaders;
        delimiter = '\t';
      }
    }

    // Fallback: if still 1 column, try fixed-width/whitespace parsing (e.g., FNB .txt exports)
    if (headers.length <= 1) {
      console.log(`[PARSER] Only ${headers.length} column(s) detected with delimiter "${delimiter}", trying fixed-width parser`);
      const parsed = this.parseFixedWidth(text);
      if (parsed && parsed.headers.length > 1) {
        console.log(`[PARSER] Fixed-width parser found ${parsed.headers.length} columns: ${parsed.headers.join(', ')}`);
        return parsed;
      }
      console.log(`[PARSER] Fixed-width parser also failed`);
    }

    // Filter out non-critical errors (field count mismatches are common in real-world CSVs)
    const criticalErrors = result.errors.filter(
      (e) => e.type !== 'FieldMismatch'
    );
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing error: ${criticalErrors[0].message}`);
    }

    headers = result.meta.fields || [];
    const rows = result.data as Record<string, any>[];

    return {
      headers,
      rows,
      rowCount: rows.length,
    };
  }

  // Parse fixed-width or space-delimited text files (e.g., FNB .txt exports)
  // Uses known header patterns to identify column boundaries
  parseFixedWidth(text: string): ParsedFileData | null {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return null;

    const headerLine = lines[0];
    console.log(`[PARSER] Fixed-width: header line = "${headerLine.substring(0, 120)}..."`);

    // Strategy 1: try splitting header by 2+ spaces
    let headerParts = headerLine.split(/\s{2,}/).map(h => h.trim()).filter(Boolean);
    let columnStarts: number[] = [];

    if (headerParts.length >= 2) {
      // Find header positions
      let searchFrom = 0;
      for (const part of headerParts) {
        const idx = headerLine.indexOf(part, searchFrom);
        columnStarts.push(idx);
        searchFrom = idx + part.length;
      }
    }

    // Strategy 2: match known multi-word header names in the header line
    // This handles files where columns are separated by single spaces
    if (headerParts.length < 2) {
      // Known header patterns (order matters — longer/multi-word first)
      const knownHeaders = [
        'Transaction date', 'Transaction Date', 'Transaction time', 'Transaction Time',
        'Transaction type', 'Transaction Type', 'Transaction amount', 'Transaction Amount',
        'Terminal ID', 'Card Number', 'Card number', 'Reference Number', 'Reference number',
        'PAN', 'Source', 'Amount', 'Date', 'Time', 'Description', 'Type',
      ];

      // Find which known headers appear in the header line, in order
      const found: { name: string; start: number }[] = [];
      const headerLower = headerLine;

      for (const kh of knownHeaders) {
        let searchPos = 0;
        while (true) {
          const idx = headerLower.indexOf(kh, searchPos);
          if (idx === -1) break;
          // Check it's not already part of a longer match
          const alreadyMatched = found.some(f =>
            idx >= f.start && idx < f.start + f.name.length
          );
          if (!alreadyMatched) {
            found.push({ name: kh, start: idx });
          }
          searchPos = idx + 1;
        }
      }

      if (found.length < 2) return null;

      // Sort by position
      found.sort((a, b) => a.start - b.start);
      headerParts = found.map(f => f.name);
      columnStarts = found.map(f => f.start);

      console.log(`[PARSER] Fixed-width: matched ${found.length} known headers: ${headerParts.join(', ')}`);
    }

    if (headerParts.length < 2 || columnStarts.length < 2) return null;

    // Parse data rows using column positions
    const rows: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const row: Record<string, any> = {};
      for (let c = 0; c < headerParts.length; c++) {
        const start = columnStarts[c];
        const end = c < headerParts.length - 1 ? columnStarts[c + 1] : line.length;
        row[headerParts[c]] = line.substring(start, end).trim();
      }
      rows.push(row);
    }

    return {
      headers: headerParts,
      rows,
      rowCount: rows.length,
    };
  }

  parseExcel(buffer: Buffer): ParsedFileData {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    
    if (!sheetName) {
      throw new Error('Excel file has no sheets');
    }

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: '',
    }) as any[][];

    if (data.length === 0) {
      throw new Error('Excel file is empty');
    }

    let headers = data[0].map(h => String(h).trim());

    // Detect semicolon-delimited data packed into a single Excel column
    // This happens when a CSV-like file is saved as .xlsx without proper column separation
    if (headers.length === 1 && headers[0].includes(';')) {
      headers = headers[0].split(';').map(h => h.trim());
      const rows = data.slice(1).map(row => {
        const cellValue = String(row[0] || '');
        const values = cellValue.split(';');
        const obj: Record<string, any> = {};
        headers.forEach((header, index) => {
          obj[header] = values[index] !== undefined ? values[index].trim() : '';
        });
        return obj;
      });
      return { headers, rows, rowCount: rows.length };
    }

    const rows = data.slice(1).map(row => {
      const obj: Record<string, any> = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] !== undefined ? String(row[index]).trim() : '';
      });
      return obj;
    });

    return {
      headers,
      rows,
      rowCount: rows.length,
    };
  }

  async parsePDF(buffer: Buffer): Promise<ParsedFileData> {
    const pdfExtract = new PDFExtract();
    const data = await pdfExtract.extractBuffer(buffer, {});

    if (!data.pages || data.pages.length === 0) {
      throw new Error('PDF file is empty or unreadable');
    }

    const allTextItems: { text: string; x: number; y: number; width: number }[] = [];
    
    for (const page of data.pages) {
      if (page.content) {
        for (const item of page.content) {
          if (item.str && item.str.trim()) {
            allTextItems.push({
              text: item.str.trim(),
              x: item.x,
              y: item.y,
              width: item.width,
            });
          }
        }
      }
    }

    if (allTextItems.length === 0) {
      throw new Error('No text found in PDF');
    }

    const rowsByY = new Map<number, { text: string; x: number; width: number }[]>();
    const yTolerance = 3;

    for (const item of allTextItems) {
      let foundRow = false;
      const entries = Array.from(rowsByY.entries());
      for (const [existingY, items] of entries) {
        if (Math.abs(existingY - item.y) < yTolerance) {
          items.push({ text: item.text, x: item.x, width: item.width });
          foundRow = true;
          break;
        }
      }
      if (!foundRow) {
        rowsByY.set(item.y, [{ text: item.text, x: item.x, width: item.width }]);
      }
    }

    const sortedRowsWithCoords = Array.from(rowsByY.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, items]) => items.sort((a, b) => a.x - b.x));

    if (sortedRowsWithCoords.length < 1) {
      throw new Error('No data rows detected in PDF');
    }

    const allXPositions = new Set<number>();
    for (const row of sortedRowsWithCoords.slice(0, Math.min(10, sortedRowsWithCoords.length))) {
      for (const item of row) {
        allXPositions.add(Math.round(item.x));
      }
    }

    const sortedXPositions = Array.from(allXPositions).sort((a, b) => a - b);
    
    const columnXRanges: Array<{ min: number; max: number; index: number }> = [];
    let currentGroup: number[] = [];
    const xGapThreshold = 15;

    for (let i = 0; i < sortedXPositions.length; i++) {
      if (currentGroup.length === 0) {
        currentGroup.push(sortedXPositions[i]);
      } else {
        const lastX = currentGroup[currentGroup.length - 1];
        if (sortedXPositions[i] - lastX <= xGapThreshold) {
          currentGroup.push(sortedXPositions[i]);
        } else {
          columnXRanges.push({
            min: Math.min(...currentGroup),
            max: Math.max(...currentGroup),
            index: columnXRanges.length,
          });
          currentGroup = [sortedXPositions[i]];
        }
      }
    }
    if (currentGroup.length > 0) {
      columnXRanges.push({
        min: Math.min(...currentGroup),
        max: Math.max(...currentGroup),
        index: columnXRanges.length,
      });
    }

    function getColumnIndex(x: number): number {
      for (const range of columnXRanges) {
        if (x >= range.min - 5 && x <= range.max + 5) {
          return range.index;
        }
      }
      for (let i = 0; i < columnXRanges.length - 1; i++) {
        if (x > columnXRanges[i].max && x < columnXRanges[i + 1].min) {
          const distToLeft = x - columnXRanges[i].max;
          const distToRight = columnXRanges[i + 1].min - x;
          return distToLeft < distToRight ? i : i + 1;
        }
      }
      return columnXRanges.length - 1;
    }

    const numColumns = columnXRanges.length;
    const structuredRows: string[][] = [];

    for (const rowItems of sortedRowsWithCoords) {
      const row = new Array(numColumns).fill('');
      for (const item of rowItems) {
        const colIndex = getColumnIndex(Math.round(item.x));
        if (row[colIndex]) {
          row[colIndex] += ' ' + item.text;
        } else {
          row[colIndex] = item.text;
        }
      }
      structuredRows.push(row);
    }

    if (structuredRows.length === 0) {
      throw new Error('No table structure detected in PDF');
    }

    const headers = structuredRows[0].map((h, i) => h || `Column ${i + 1}`);
    const dataRows = structuredRows.slice(1);

    const rows = dataRows.map(row => {
      const obj: Record<string, any> = {};
      headers.forEach((header, index) => {
        obj[header] = (row[index] || '').trim();
      });
      return obj;
    });

    return {
      headers,
      rows,
      rowCount: rows.length,
    };
  }

  async parse(buffer: Buffer, fileType: string): Promise<ParsedFileData> {
    if (fileType === 'csv' || fileType === 'text/csv') {
      return this.parseCSV(buffer);
    } else if (
      fileType === 'xlsx' || 
      fileType === 'xls' || 
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileType === 'application/vnd.ms-excel'
    ) {
      return this.parseExcel(buffer);
    } else if (
      fileType === 'pdf' ||
      fileType === 'application/pdf'
    ) {
      return await this.parsePDF(buffer);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  // Detect which source preset matches the headers
  detectSourcePreset(headers: string[]): SourcePreset | null {
    for (const preset of SOURCE_PRESETS) {
      if (preset.detectPattern(headers)) {
        return preset;
      }
    }
    return null;
  }

  autoDetectColumns(headers: string[]): ColumnMapping[] {
    const mappings: ColumnMapping[] = [];
    const usedFields = new Set<string>(); // Track already-mapped fields to prevent duplicates
    
    // First, try to match a known source preset
    const detectedPreset = this.detectSourcePreset(headers);
    
    if (detectedPreset) {
      // Use preset mappings with high confidence
      for (const header of headers) {
        const presetMapping = detectedPreset.mappings[header];
        if (presetMapping && presetMapping !== 'ignore') {
          // Check if this field is already mapped
          if (usedFields.has(presetMapping)) {
            // Field already used, set to ignore
            mappings.push({
              detectedColumn: header,
              suggestedMapping: 'ignore',
              confidence: 0,
            });
          } else {
            usedFields.add(presetMapping);
            mappings.push({
              detectedColumn: header,
              suggestedMapping: presetMapping,
              confidence: 1.0,
            });
          }
        } else if (presetMapping === 'ignore') {
          mappings.push({
            detectedColumn: header,
            suggestedMapping: 'ignore',
            confidence: 1.0,
          });
        } else {
          // Header not in preset, try generic detection
          const detected = this.detectColumnGeneric(header);
          if (detected.suggestedMapping !== 'ignore' && usedFields.has(detected.suggestedMapping)) {
            // Field already used, set to ignore
            mappings.push({
              detectedColumn: header,
              suggestedMapping: 'ignore',
              confidence: 0,
            });
          } else {
            if (detected.suggestedMapping !== 'ignore') {
              usedFields.add(detected.suggestedMapping);
            }
            mappings.push(detected);
          }
        }
      }
      return mappings;
    }

    // Fallback to generic column detection - also prevent duplicates
    for (const header of headers) {
      const detected = this.detectColumnGeneric(header);
      if (detected.suggestedMapping !== 'ignore' && usedFields.has(detected.suggestedMapping)) {
        // Field already used, set to ignore
        mappings.push({
          detectedColumn: header,
          suggestedMapping: 'ignore',
          confidence: 0,
        });
      } else {
        if (detected.suggestedMapping !== 'ignore') {
          usedFields.add(detected.suggestedMapping);
        }
        mappings.push(detected);
      }
    }

    return mappings;
  }

  // Generic column detection based on column name patterns
  private detectColumnGeneric(header: string): ColumnMapping {
    const normalized = header.toLowerCase().trim().replace(/\s+/g, ' ');
    let suggestedMapping: ColumnMapping['suggestedMapping'] = 'ignore';
    let confidence = 0;

    if (
      normalized.includes('date') ||
      normalized.includes('transaction date') ||
      normalized.includes('posted') ||
      normalized === 'dt' ||
      normalized === '_1'  // Fuel Master date column
    ) {
      suggestedMapping = 'date';
      confidence = normalized === 'date' || normalized === 'transaction date' ? 1.0 : 0.8;
    } else if (
      normalized === 'time' ||
      normalized.includes('time') && !normalized.includes('date')
    ) {
      suggestedMapping = 'time';
      confidence = normalized === 'time' ? 1.0 : 0.7;
    } else if (
      // Only map specific amount columns - not all columns containing "amount"
      normalized === 'amount' ||
      normalized === 'transaction amount' ||
      normalized === 'gross amount' ||
      normalized === 'original amount' ||
      normalized === 'amt' ||
      normalized === '_5'  // Fuel Master amount column
    ) {
      suggestedMapping = 'amount';
      confidence = normalized === 'amount' || normalized === 'transaction amount' ? 1.0 : 0.9;
    } else if (
      normalized.includes('reference') ||
      normalized.includes('ref') ||
      normalized.includes('transaction id') ||
      normalized === 'invoice' ||
      normalized.includes('short reference') ||
      normalized.includes('terminal id') ||
      normalized.includes('receipt')
    ) {
      suggestedMapping = 'reference';
      confidence = normalized === 'reference' || normalized === 'invoice' ? 1.0 : 0.7;
    } else if (
      // Card number detection - check BEFORE description to avoid conflicts
      normalized === 'pan' ||
      normalized.includes('pan') ||
      normalized === 'card number' ||
      normalized === 'card no' ||
      normalized === 'cardno' ||
      normalized.includes('card num') ||
      normalized.includes('card #') ||
      normalized.includes('masked') ||
      normalized.includes('card pan') ||
      normalized === 'payment identifier' ||
      normalized.includes('payment id')
    ) {
      suggestedMapping = 'cardNumber';
      confidence = normalized === 'pan' || normalized === 'card number' || normalized === 'payment identifier' ? 1.0 : 0.9;
    } else if (
      normalized.includes('description') ||
      normalized.includes('desc') ||
      normalized.includes('memo') ||
      normalized.includes('details') ||
      normalized.includes('merchant') ||
      normalized.includes('vendor') ||
      normalized === '_3'  // Fuel Master fuel type column
    ) {
      suggestedMapping = 'description';
      confidence = normalized === 'description' ? 1.0 : 0.8;
    } else if (
      normalized === 'shift' ||
      normalized.includes('payment method') ||
      normalized.includes('payment type') ||
      normalized.includes('card type') ||
      normalized.includes('transaction type')
    ) {
      suggestedMapping = 'paymentType';
      confidence = 0.9;
    }

    return {
      detectedColumn: header,
      suggestedMapping,
      confidence,
    };
  }

  // Get human-readable label for a column based on detected preset
  getColumnLabel(header: string, headers: string[]): string {
    const preset = this.detectSourcePreset(headers);
    if (preset && preset.columnLabels[header]) {
      return preset.columnLabels[header];
    }
    return header;
  }

  extractTransactionData(
    row: Record<string, any>,
    columnMapping: Record<string, string>,
    headers: string[],
    sourceType?: string
  ): {
    transactionDate: string;
    transactionTime: string;
    amount: string;
    referenceNumber: string;
    description: string;
    cardNumber: string;
    paymentType: string;
    isCardTransaction: 'yes' | 'no' | 'unknown';
  } {
    let transactionDate = '';
    let transactionTime = '';
    let amount = '';
    let referenceNumber = '';
    let description = '';
    let cardNumber = '';
    let paymentType = '';
    let isCardTransaction: 'yes' | 'no' | 'unknown' = 'unknown';

    // Detect preset for source-specific normalization
    const preset = this.detectSourcePreset(headers);

    // Track which fields have been processed (first-value-wins for duplicate mappings)
    const processedFields = new Set<string>();

    for (const [column, mapping] of Object.entries(columnMapping)) {
      if (mapping === 'ignore') continue;
      
      // Skip if we've already processed this field (first-value-wins)
      if (processedFields.has(mapping)) {
        continue;
      }
      
      const value = row[column] || '';
      
      switch (mapping) {
        case 'date':
          const rawDate = String(value).trim();
          // Skip if empty value
          if (!rawDate) break;
          
          // Apply source-specific date normalization
          if (preset?.name === 'FNB Merchant') {
            // FNB has combined date+time: "28 Feb 23:38:59"
            const normalizedDate = DataNormalizer.normalizeFNBDate(rawDate);
            if (normalizedDate) {
              transactionDate = normalizedDate;
              processedFields.add('date');
            }
            // Extract time from the combined field
            if (!transactionTime) {
              const timeMatch = rawDate.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
              if (timeMatch) {
                transactionTime = timeMatch[1];
              }
            }
          } else if (preset?.name === 'ABSA Merchant') {
            const normalizedDate = DataNormalizer.normalizeABSADate(rawDate);
            if (normalizedDate) {
              transactionDate = normalizedDate;
              processedFields.add('date');
            }
          } else if (preset?.name === 'Standard Bank Digital') {
            // DD/MM/YYYY → YYYY-MM-DD
            const parts = rawDate.split('/');
            if (parts.length === 3) {
              transactionDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              processedFields.add('date');
            } else {
              transactionDate = rawDate;
              processedFields.add('date');
            }
          } else if (preset?.name === 'Sale Master') {
            // "2026-02-01 00:03" → extract date and time
            const spaceIdx = rawDate.indexOf(' ');
            if (spaceIdx > 0) {
              transactionDate = rawDate.substring(0, spaceIdx);
              processedFields.add('date');
              if (!transactionTime) {
                transactionTime = rawDate.substring(spaceIdx + 1).trim();
              }
            } else {
              transactionDate = rawDate;
              processedFields.add('date');
            }
          } else if (preset?.name === 'Fuel Master') {
            const normalizedDate = DataNormalizer.normalizeFuelMasterDate(rawDate);
            if (normalizedDate) {
              transactionDate = normalizedDate;
              processedFields.add('date');
            }
            // Also extract time from combined field
            if (!transactionTime) {
              transactionTime = DataNormalizer.normalizeFuelMasterTime(rawDate);
            }
          } else {
            // Generic handling - check if it's an Excel serial number
            const serial = parseFloat(rawDate);
            if (!isNaN(serial) && serial > 40000 && serial < 60000) {
              const normalizedDate = DataNormalizer.normalizeFuelMasterDate(rawDate);
              if (normalizedDate) {
                transactionDate = normalizedDate;
                processedFields.add('date');
              }
              if (!transactionTime) {
                transactionTime = DataNormalizer.normalizeFuelMasterTime(rawDate);
              }
            } else if (rawDate) {
              transactionDate = rawDate;
              processedFields.add('date');
            }
          }
          break;
        case 'time':
          const timeVal = String(value).trim();
          if (timeVal) {
            transactionTime = timeVal;
            processedFields.add('time');
          }
          break;
        case 'amount':
          const amtVal = DataNormalizer.normalizeAmount(String(value), sourceType, preset?.name);
          if (amtVal) {
            amount = amtVal;
            processedFields.add('amount');
          }
          break;
        case 'reference':
          const refVal = String(value).trim();
          if (refVal) {
            referenceNumber = refVal;
            processedFields.add('reference');
          }
          break;
        case 'description':
          const descVal = String(value).trim();
          if (descVal) {
            description = descVal;
            processedFields.add('description');
          }
          break;
        case 'cardNumber':
          const cardVal = DataNormalizer.normalizeCardNumber(String(value));
          if (cardVal) {
            cardNumber = cardVal;
            processedFields.add('cardNumber');
          }
          break;
        case 'paymentType':
          const ptVal = String(value).trim();
          if (ptVal) {
            paymentType = ptVal;
            processedFields.add('paymentType');
            // Determine if this is a card transaction
            if (DataNormalizer.isCardPayment(paymentType)) {
              isCardTransaction = 'yes';
            } else {
              isCardTransaction = 'no';
            }
          }
          break;
      }
    }

    // Bank transactions are always card transactions (they come from merchant portals)
    // Check for any source type starting with 'bank' (bank, bank2, bank_account, etc.)
    if (sourceType && sourceType.startsWith('bank')) {
      isCardTransaction = 'yes';
    }

    return {
      transactionDate,
      transactionTime,
      amount,
      referenceNumber,
      description,
      cardNumber,
      paymentType,
      isCardTransaction,
    };
  }

  /**
   * Validates if a transaction row is valid or should be skipped.
   * Returns { valid: true } or { valid: false, reason: string }
   */
  isValidTransactionRow(
    extracted: {
      transactionDate: string;
      transactionTime: string;
      amount: string;
      referenceNumber: string;
      description: string;
      cardNumber: string;
      paymentType: string;
      isCardTransaction: 'yes' | 'no' | 'unknown';
    },
    rawRow: Record<string, any>,
    columnMapping: Record<string, string>
  ): { valid: boolean; reason?: string } {
    // Rule 1: Skip header rows - date value equals column name
    const dateColumns = Object.entries(columnMapping)
      .filter(([_, mapping]) => mapping === 'date')
      .map(([col, _]) => col);
    
    for (const col of dateColumns) {
      const rawValue = String(rawRow[col] || '').trim();
      // Check if the value equals the column name (case-insensitive)
      if (rawValue.toLowerCase() === col.toLowerCase()) {
        return { valid: false, reason: 'header_row' };
      }
      // Check for common header patterns
      if (['date', 'date / time', 'date/time', 'transaction date', 'trans date'].includes(rawValue.toLowerCase())) {
        return { valid: false, reason: 'header_row' };
      }
    }

    // Rule 2: Skip rows with empty dates after normalization
    if (!extracted.transactionDate || extracted.transactionDate.trim() === '') {
      return { valid: false, reason: 'empty_date' };
    }

    // Rule 3: Skip rows with zero or invalid amounts
    const amountNum = parseFloat(extracted.amount);
    if (isNaN(amountNum) || amountNum === 0) {
      return { valid: false, reason: 'zero_or_invalid_amount' };
    }

    // Rule 4: Skip page break rows
    for (const value of Object.values(rawRow)) {
      const strValue = String(value || '').trim();
      // Check for page break patterns like "Page 405", "Page 1 of 50"
      if (/^Page\s+\d+/i.test(strValue)) {
        return { valid: false, reason: 'page_break' };
      }
    }

    // Rule 5: Skip rows where all key fields look like headers
    const headerPatterns = ['qty', 'cost', 'shift', 'total', 'account', 'invoice', 'description', 'amount'];
    const keyValues = [extracted.description, extracted.referenceNumber].filter(v => v);
    const allLookLikeHeaders = keyValues.length > 0 && keyValues.every(v => 
      headerPatterns.includes(v.toLowerCase())
    );
    if (allLookLikeHeaders && keyValues.length >= 2) {
      return { valid: false, reason: 'header_row' };
    }

    return { valid: true };
  }
}

export const fileParser = new FileParser();
