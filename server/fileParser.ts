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
