/**
 * DataQualityValidator Service
 * 
 * Analyzes uploaded file data for quality issues like:
 * - Column shifts (data not matching headers)
 * - Page break rows (junk from PDF exports)
 * - Repeated headers mid-file
 * - Empty columns
 * - Type mismatches
 * - Inconsistent data patterns
 */

import { ParsedFileData, DataNormalizer, SOURCE_PRESETS, SourcePreset } from './fileParser';

export interface DataQualityIssue {
  type: 'COLUMN_SHIFT' | 'PAGE_BREAK_ROWS' | 'REPEATED_HEADERS' | 'EMPTY_COLUMN' | 'DATA_TYPE_MISMATCH' | 'INCONSISTENT_DATA' | 'MISSING_REQUIRED_DATA';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  details: Record<string, any>;
  affectedRows?: number[];
  suggestedFix?: string;
}

export interface ColumnAnalysis {
  columnName: string;
  columnIndex: number;
  inferredType: 'date' | 'datetime' | 'time' | 'amount' | 'text' | 'number' | 'cardNumber' | 'empty' | 'mixed';
  nullCount: number;
  nonNullCount: number;
  uniqueValues: number;
  sampleValues: string[];
  headerLikeValues: number;
  pageLikeValues: number;
  hasDatePattern: boolean;
  hasAmountPattern: boolean;
  hasCardPattern: boolean;
}

export interface DataQualityReport {
  hasIssues: boolean;
  hasCriticalIssues: boolean;
  totalRows: number;
  cleanRows: number;
  problematicRows: number;
  issues: DataQualityIssue[];
  columnAnalysis: ColumnAnalysis[];
  suggestedColumnMapping: Record<string, string>;
  rowsToRemove: number[];
  columnShiftDetected: boolean;
  shiftDetails?: {
    expectedColumn: string;
    actualDataType: string;
    examples: string[];
  };
  detectedPreset?: string;
}

export class DataQualityValidator {
  private datePatterns = [
    /^\d{4}[-/]\d{2}[-/]\d{2}$/,
    /^\d{2}[-/]\d{2}[-/]\d{4}$/,
    /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i,
    /^\d{5,}(\.\d+)?$/, // Excel serial date
  ];

  private timePatterns = [
    /^\d{2}:\d{2}(:\d{2})?$/,
    /^\d{1,2}:\d{2}\s*(AM|PM)?$/i,
  ];

  private amountPatterns = [
    /^-?R?\s*[\d,]+\.?\d*$/,
    /^-?\$?\s*[\d,]+\.?\d*$/,
    /^\([\d,]+\.?\d*\)$/, // Negative in parentheses
    /^-?[\d,]+\.?\d*\s*(CR|DR)?$/i,
  ];

  private cardNumberPatterns = [
    /^\*{4}\d{4}$/,
    /^x{4}[-\s]?x{4}[-\s]?x{4}[-\s]?\d{4}$/i,
    /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/,
    /^\d{16}$/,
    /^\d{4}$/,
  ];

  private headerLikePatterns = [
    /^(date|time|amount|description|reference|invoice|shift|card|pan|terminal|transaction|type|receipt|total|quantity|price|unit|fuel|diesel|petrol|payment)$/i,
  ];

  private pageBreakPatterns = [
    /^page\s*\d+/i,
    /^\d+\s*of\s*\d+/i,
    /^generated|^printed|^report/i,
    /^-{3,}$/,
    /^={3,}$/,
    /^total[:\s]/i,
    /^subtotal/i,
    /^grand total/i,
  ];

  /**
   * Validate parsed file data and generate quality report
   */
  validate(
    parsedData: ParsedFileData,
    sourceType: 'fuel' | 'bank',
    sourceName?: string
  ): DataQualityReport {
    const issues: DataQualityIssue[] = [];
    const rowsToRemove: number[] = [];
    
    // Analyze each column
    const columnAnalysis = this.analyzeColumns(parsedData);
    
    // Detect source preset
    const detectedPreset = this.detectPreset(parsedData.headers);
    
    // Check for column shift
    const shiftResult = this.detectColumnShift(parsedData, columnAnalysis, detectedPreset);
    if (shiftResult.detected) {
      issues.push({
        type: 'COLUMN_SHIFT',
        severity: 'CRITICAL',
        message: `Data appears to be shifted from expected columns. ${shiftResult.description}`,
        details: shiftResult.details,
        suggestedFix: 'Use the suggested column mapping to correct the data alignment.',
      });
    }

    // Check for repeated headers in data rows
    const repeatedHeaders = this.detectRepeatedHeaders(parsedData);
    if (repeatedHeaders.rows.length > 0) {
      rowsToRemove.push(...repeatedHeaders.rows);
      issues.push({
        type: 'REPEATED_HEADERS',
        severity: 'WARNING',
        message: `Found ${repeatedHeaders.rows.length} rows that appear to be repeated header rows`,
        details: { rows: repeatedHeaders.rows, samples: repeatedHeaders.samples },
        affectedRows: repeatedHeaders.rows,
        suggestedFix: 'These rows will be excluded from processing.',
      });
    }

    // Check for page break/junk rows
    const pageBreaks = this.detectPageBreakRows(parsedData);
    if (pageBreaks.rows.length > 0) {
      rowsToRemove.push(...pageBreaks.rows);
      issues.push({
        type: 'PAGE_BREAK_ROWS',
        severity: 'WARNING',
        message: `Found ${pageBreaks.rows.length} rows that appear to be page breaks or report metadata`,
        details: { rows: pageBreaks.rows, samples: pageBreaks.samples },
        affectedRows: pageBreaks.rows,
        suggestedFix: 'These rows will be excluded from processing.',
      });
    }

    // Check for empty columns
    const emptyColumns = this.detectEmptyColumns(columnAnalysis);
    if (emptyColumns.length > 0) {
      issues.push({
        type: 'EMPTY_COLUMN',
        severity: 'INFO',
        message: `Found ${emptyColumns.length} empty or mostly empty columns`,
        details: { columns: emptyColumns },
        suggestedFix: 'These columns can be ignored during mapping.',
      });
    }

    // Check for type mismatches based on expected vs actual data
    const typeMismatches = this.detectTypeMismatches(parsedData, columnAnalysis, detectedPreset);
    for (const mismatch of typeMismatches) {
      issues.push({
        type: 'DATA_TYPE_MISMATCH',
        severity: 'WARNING',
        message: mismatch.message,
        details: mismatch.details,
        affectedRows: mismatch.affectedRows,
        suggestedFix: mismatch.suggestedFix,
      });
    }

    // Check for missing required data (amounts, dates)
    const missingData = this.detectMissingRequiredData(parsedData, columnAnalysis, sourceType);
    if (missingData.issues.length > 0) {
      issues.push(...missingData.issues);
    }

    // Generate suggested column mapping
    const suggestedMapping = this.generateSuggestedMapping(parsedData, columnAnalysis, detectedPreset);

    // Calculate clean vs problematic rows
    const uniqueRowsToRemove = Array.from(new Set(rowsToRemove)).sort((a, b) => a - b);
    const problematicRows = uniqueRowsToRemove.length;
    const cleanRows = parsedData.rowCount - problematicRows;

    return {
      hasIssues: issues.length > 0,
      hasCriticalIssues: issues.some(i => i.severity === 'CRITICAL'),
      totalRows: parsedData.rowCount,
      cleanRows,
      problematicRows,
      issues,
      columnAnalysis,
      suggestedColumnMapping: suggestedMapping,
      rowsToRemove: uniqueRowsToRemove,
      columnShiftDetected: shiftResult.detected,
      shiftDetails: shiftResult.detected ? {
        expectedColumn: shiftResult.details.problems?.[0] ?? '',
        actualDataType: shiftResult.details.mappingIssues ? JSON.stringify(Object.keys(shiftResult.details.mappingIssues)) : '',
        examples: shiftResult.details.problems?.slice(0, 3) ?? [],
      } : undefined,
      detectedPreset: detectedPreset?.name,
    };
  }

  /**
   * Analyze each column to infer data types and patterns
   */
  private analyzeColumns(parsedData: ParsedFileData): ColumnAnalysis[] {
    const analysis: ColumnAnalysis[] = [];

    for (let i = 0; i < parsedData.headers.length; i++) {
      const header = parsedData.headers[i];
      const values = parsedData.rows.map(row => String(row[header] ?? '').trim());
      
      const nonEmptyValues = values.filter(v => v !== '');
      const uniqueValues = new Set(nonEmptyValues);
      const sampleValues = nonEmptyValues.slice(0, 5);

      // Count pattern matches
      let dateCount = 0;
      let timeCount = 0;
      let amountCount = 0;
      let cardCount = 0;
      let headerLikeCount = 0;
      let pageLikeCount = 0;

      for (const value of nonEmptyValues) {
        if (this.matchesPatterns(value, this.datePatterns)) dateCount++;
        if (this.matchesPatterns(value, this.timePatterns)) timeCount++;
        if (this.matchesPatterns(value, this.amountPatterns)) amountCount++;
        if (this.matchesPatterns(value, this.cardNumberPatterns)) cardCount++;
        if (this.matchesPatterns(value, this.headerLikePatterns)) headerLikeCount++;
        if (this.matchesPatterns(value, this.pageBreakPatterns)) pageLikeCount++;
      }

      // Infer column type
      const total = nonEmptyValues.length || 1;
      let inferredType: ColumnAnalysis['inferredType'] = 'text';
      
      if (total === 0) {
        inferredType = 'empty';
      } else if (dateCount / total > 0.7) {
        // Check if it also has time component
        if (nonEmptyValues.some(v => v.includes(':') || (parseFloat(v) > 40000 && v.includes('.')))) {
          inferredType = 'datetime';
        } else {
          inferredType = 'date';
        }
      } else if (timeCount / total > 0.7) {
        inferredType = 'time';
      } else if (amountCount / total > 0.7) {
        inferredType = 'amount';
      } else if (cardCount / total > 0.5) {
        inferredType = 'cardNumber';
      } else if (amountCount / total > 0.3 && dateCount / total > 0.3) {
        inferredType = 'mixed';
      }

      analysis.push({
        columnName: header,
        columnIndex: i,
        inferredType,
        nullCount: values.filter(v => v === '').length,
        nonNullCount: nonEmptyValues.length,
        uniqueValues: uniqueValues.size,
        sampleValues,
        headerLikeValues: headerLikeCount,
        pageLikeValues: pageLikeCount,
        hasDatePattern: dateCount > 0,
        hasAmountPattern: amountCount > 0,
        hasCardPattern: cardCount > 0,
      });
    }

    return analysis;
  }

  /**
   * Detect if column data is shifted from expected positions
   */
  private detectColumnShift(
    parsedData: ParsedFileData,
    columnAnalysis: ColumnAnalysis[],
    preset: SourcePreset | null
  ): { detected: boolean; description: string; details: Record<string, any> } {
    const result = { detected: false, description: '', details: {} as Record<string, any> };

    if (!preset) return result;

    // Check each expected mapping against actual data
    const problems: string[] = [];
    const mappingIssues: Record<string, { expected: string; actual: string; examples: string[] }> = {};

    for (const [columnName, expectedType] of Object.entries(preset.mappings)) {
      if (expectedType === 'ignore') continue;

      const colAnalysis = columnAnalysis.find(c => c.columnName === columnName);
      if (!colAnalysis) continue;

      // Check if the inferred type matches expected type
      const isMatch = this.typeMatchesExpected(colAnalysis.inferredType, expectedType);
      
      if (!isMatch && colAnalysis.nonNullCount > 0) {
        problems.push(`Column "${columnName}" expected to contain ${expectedType} but contains ${colAnalysis.inferredType}`);
        mappingIssues[columnName] = {
          expected: expectedType,
          actual: colAnalysis.inferredType,
          examples: colAnalysis.sampleValues,
        };
      }
    }

    if (problems.length >= 2) {
      result.detected = true;
      result.description = `Multiple columns have unexpected data types: ${problems.slice(0, 3).join('; ')}`;
      result.details = {
        problems,
        mappingIssues,
        presetName: preset.name,
      };
    }

    return result;
  }

  /**
   * Detect rows that look like repeated headers
   */
  private detectRepeatedHeaders(parsedData: ParsedFileData): { rows: number[]; samples: Record<string, any>[] } {
    const headerSet = new Set(parsedData.headers.map(h => h.toLowerCase().trim()));
    const repeatedRows: number[] = [];
    const samples: Record<string, any>[] = [];

    parsedData.rows.forEach((row, index) => {
      const values = Object.values(row).map(v => String(v ?? '').toLowerCase().trim());
      const matchCount = values.filter(v => headerSet.has(v)).length;
      
      // If more than half the values match header names, it's likely a repeated header
      if (matchCount >= Math.min(3, parsedData.headers.length / 2)) {
        repeatedRows.push(index);
        if (samples.length < 3) samples.push(row);
      }
    });

    return { rows: repeatedRows, samples };
  }

  /**
   * Detect page break, total, and other junk rows
   */
  private detectPageBreakRows(parsedData: ParsedFileData): { rows: number[]; samples: Record<string, any>[] } {
    const pageBreakRows: number[] = [];
    const samples: Record<string, any>[] = [];

    parsedData.rows.forEach((row, index) => {
      const values = Object.values(row).map(v => String(v ?? '').trim()).filter(v => v);
      
      // Check if row matches page break patterns
      const isPageBreak = values.some(v => this.matchesPatterns(v, this.pageBreakPatterns));
      
      // Check if row is mostly empty (less than 2 values)
      const isMostlyEmpty = values.length < 2 && parsedData.headers.length > 3;
      
      // Check for "Total" rows that shouldn't be transaction data
      const isTotalRow = values.some(v => /^(sub)?total\s*:?$/i.test(v));

      if (isPageBreak || isMostlyEmpty || isTotalRow) {
        pageBreakRows.push(index);
        if (samples.length < 3) samples.push(row);
      }
    });

    return { rows: pageBreakRows, samples };
  }

  /**
   * Detect columns that are empty or mostly empty
   */
  private detectEmptyColumns(columnAnalysis: ColumnAnalysis[]): string[] {
    return columnAnalysis
      .filter(col => col.inferredType === 'empty' || col.nullCount / (col.nullCount + col.nonNullCount) > 0.9)
      .map(col => col.columnName);
  }

  /**
   * Detect type mismatches in data
   */
  private detectTypeMismatches(
    parsedData: ParsedFileData,
    columnAnalysis: ColumnAnalysis[],
    preset: SourcePreset | null
  ): Array<{ message: string; details: Record<string, any>; affectedRows?: number[]; suggestedFix: string }> {
    const mismatches: Array<{ message: string; details: Record<string, any>; affectedRows?: number[]; suggestedFix: string }> = [];

    // Check for amount columns with non-numeric values
    const amountColumns = columnAnalysis.filter(c => 
      c.inferredType === 'amount' || 
      c.columnName.toLowerCase().includes('amount') ||
      (preset?.mappings[c.columnName] === 'amount')
    );

    for (const col of amountColumns) {
      const badRows: number[] = [];
      parsedData.rows.forEach((row, index) => {
        const value = String(row[col.columnName] ?? '').trim();
        if (value && !this.matchesPatterns(value, this.amountPatterns) && !/^[\d.-]+$/.test(value.replace(/[R$,\s]/g, ''))) {
          badRows.push(index);
        }
      });

      if (badRows.length > 0 && badRows.length < parsedData.rowCount * 0.3) {
        mismatches.push({
          message: `Column "${col.columnName}" contains ${badRows.length} non-numeric values`,
          details: { 
            column: col.columnName, 
            badRowCount: badRows.length,
            sampleBadValues: badRows.slice(0, 3).map(i => parsedData.rows[i][col.columnName]),
          },
          affectedRows: badRows.slice(0, 10),
          suggestedFix: 'Review these rows for data entry errors or adjust column mapping.',
        });
      }
    }

    return mismatches;
  }

  /**
   * Detect missing required data
   */
  private detectMissingRequiredData(
    parsedData: ParsedFileData,
    columnAnalysis: ColumnAnalysis[],
    sourceType: 'fuel' | 'bank'
  ): { issues: DataQualityIssue[] } {
    const issues: DataQualityIssue[] = [];

    // Check for date column
    const hasDateColumn = columnAnalysis.some(c => 
      c.inferredType === 'date' || c.inferredType === 'datetime'
    );
    if (!hasDateColumn && !detectedPreset) {
      issues.push({
        type: 'MISSING_REQUIRED_DATA',
        severity: 'CRITICAL',
        message: 'No date column detected in the file',
        details: { 
          requiredField: 'date',
          hint: 'Check if dates are formatted unusually or in a merged column'
        },
        suggestedFix: 'Manually map the correct column to the date field.',
      });
    }

    // Check for amount column (skip when a preset handles the mapping)
    const hasAmountColumn = columnAnalysis.some(c => c.inferredType === 'amount');
    if (!hasAmountColumn && !detectedPreset) {
      issues.push({
        type: 'MISSING_REQUIRED_DATA',
        severity: 'CRITICAL',
        message: 'No amount column detected in the file',
        details: {
          requiredField: 'amount',
          hint: 'Check if amounts include currency symbols or unusual formatting'
        },
        suggestedFix: 'Manually map the correct column to the amount field.',
      });
    }

    return { issues };
  }

  /**
   * Generate suggested column mapping based on analysis
   */
  private generateSuggestedMapping(
    parsedData: ParsedFileData,
    columnAnalysis: ColumnAnalysis[],
    preset: SourcePreset | null
  ): Record<string, string> {
    const mapping: Record<string, string> = {};

    // If we have a preset, use it as the base
    if (preset) {
      for (const [columnName, fieldType] of Object.entries(preset.mappings)) {
        if (fieldType !== 'ignore' && parsedData.headers.includes(columnName)) {
          mapping[fieldType] = columnName;
        }
      }
    }

    // Fill in any missing fields based on column analysis
    const fieldPriority: Array<{ field: string; types: ColumnAnalysis['inferredType'][] }> = [
      { field: 'date', types: ['date', 'datetime'] },
      { field: 'time', types: ['time'] },
      { field: 'amount', types: ['amount'] },
      { field: 'cardNumber', types: ['cardNumber'] },
    ];

    for (const { field, types } of fieldPriority) {
      if (!mapping[field]) {
        const candidate = columnAnalysis.find(c => 
          types.includes(c.inferredType) && 
          !Object.values(mapping).includes(c.columnName)
        );
        if (candidate) {
          mapping[field] = candidate.columnName;
        }
      }
    }

    // Try to find reference column by name
    if (!mapping['reference']) {
      const refColumn = columnAnalysis.find(c => 
        /invoice|ref|reference|receipt/i.test(c.columnName) &&
        !Object.values(mapping).includes(c.columnName)
      );
      if (refColumn) {
        mapping['reference'] = refColumn.columnName;
      }
    }

    // Try to find description column
    if (!mapping['description']) {
      const descColumn = columnAnalysis.find(c => 
        /desc|description|detail|narrative/i.test(c.columnName) &&
        c.inferredType === 'text' &&
        !Object.values(mapping).includes(c.columnName)
      );
      if (descColumn) {
        mapping['description'] = descColumn.columnName;
      }
    }

    return mapping;
  }

  /**
   * Detect which preset matches the file headers
   */
  private detectPreset(headers: string[]): SourcePreset | null {
    for (const preset of SOURCE_PRESETS) {
      if (preset.detectPattern(headers)) {
        return preset;
      }
    }
    return null;
  }

  /**
   * Check if inferred type matches expected type
   */
  private typeMatchesExpected(inferred: ColumnAnalysis['inferredType'], expected: string): boolean {
    if (expected === 'ignore') return true;
    
    const typeMap: Record<string, ColumnAnalysis['inferredType'][]> = {
      date: ['date', 'datetime'],
      time: ['time', 'datetime'],
      amount: ['amount', 'number'],
      reference: ['text', 'number'],
      description: ['text'],
      cardNumber: ['cardNumber', 'text'],
      paymentType: ['text'],
    };

    return typeMap[expected]?.includes(inferred) ?? false;
  }

  /**
   * Check if value matches any of the patterns
   */
  private matchesPatterns(value: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(value));
  }
}

export const dataQualityValidator = new DataQualityValidator();
