import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedFileData {
  headers: string[];
  rows: Record<string, any>[];
  rowCount: number;
}

export interface ColumnMapping {
  detectedColumn: string;
  suggestedMapping: 'date' | 'amount' | 'reference' | 'description' | 'ignore';
  confidence: number;
}

export class FileParser {
  parseCSV(buffer: Buffer): ParsedFileData {
    const text = buffer.toString('utf-8');
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (result.errors.length > 0) {
      throw new Error(`CSV parsing error: ${result.errors[0].message}`);
    }

    const headers = result.meta.fields || [];
    const rows = result.data as Record<string, any>[];

    return {
      headers,
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

    const headers = data[0].map(h => String(h).trim());
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

  parse(buffer: Buffer, fileType: string): ParsedFileData {
    if (fileType === 'csv' || fileType === 'text/csv') {
      return this.parseCSV(buffer);
    } else if (
      fileType === 'xlsx' || 
      fileType === 'xls' || 
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileType === 'application/vnd.ms-excel'
    ) {
      return this.parseExcel(buffer);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  autoDetectColumns(headers: string[]): ColumnMapping[] {
    const mappings: ColumnMapping[] = [];

    for (const header of headers) {
      const normalized = header.toLowerCase().trim();
      let suggestedMapping: ColumnMapping['suggestedMapping'] = 'ignore';
      let confidence = 0;

      if (
        normalized.includes('date') ||
        normalized.includes('time') ||
        normalized.includes('transaction date') ||
        normalized.includes('posted') ||
        normalized === 'dt'
      ) {
        suggestedMapping = 'date';
        confidence = normalized === 'date' || normalized === 'transaction date' ? 1.0 : 0.8;
      } else if (
        normalized.includes('amount') ||
        normalized.includes('total') ||
        normalized.includes('price') ||
        normalized.includes('value') ||
        normalized === 'amt'
      ) {
        suggestedMapping = 'amount';
        confidence = normalized === 'amount' || normalized === 'total' ? 1.0 : 0.8;
      } else if (
        normalized.includes('reference') ||
        normalized.includes('ref') ||
        normalized.includes('transaction id') ||
        normalized.includes('id') ||
        normalized.includes('number') ||
        normalized.includes('receipt')
      ) {
        suggestedMapping = 'reference';
        confidence = normalized === 'reference' || normalized === 'ref' ? 1.0 : 0.7;
      } else if (
        normalized.includes('description') ||
        normalized.includes('desc') ||
        normalized.includes('memo') ||
        normalized.includes('details') ||
        normalized.includes('merchant') ||
        normalized.includes('vendor')
      ) {
        suggestedMapping = 'description';
        confidence = normalized === 'description' || normalized === 'desc' ? 1.0 : 0.8;
      }

      mappings.push({
        detectedColumn: header,
        suggestedMapping,
        confidence,
      });
    }

    return mappings;
  }

  extractTransactionData(
    row: Record<string, any>,
    columnMapping: Record<string, string>
  ): {
    transactionDate: string;
    amount: string;
    referenceNumber: string;
    description: string;
  } {
    let transactionDate = '';
    let amount = '';
    let referenceNumber = '';
    let description = '';

    for (const [column, mapping] of Object.entries(columnMapping)) {
      const value = row[column] || '';
      
      switch (mapping) {
        case 'date':
          transactionDate = String(value).trim();
          break;
        case 'amount':
          let rawAmount = String(value).trim();
          const isNegative = rawAmount.startsWith('(') && rawAmount.endsWith(')') || 
                            rawAmount.startsWith('-') ||
                            rawAmount.endsWith('-') ||
                            rawAmount.toLowerCase().includes('cr');
          rawAmount = rawAmount.replace(/[^0-9.]/g, '');
          
          if (rawAmount) {
            amount = isNegative ? `-${rawAmount}` : rawAmount;
          } else {
            amount = '0';
          }
          break;
        case 'reference':
          referenceNumber = String(value).trim();
          break;
        case 'description':
          description = String(value).trim();
          break;
      }
    }

    return {
      transactionDate,
      amount,
      referenceNumber,
      description,
    };
  }
}

export const fileParser = new FileParser();
