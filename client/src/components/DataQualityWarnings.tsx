/**
 * DataQualityWarnings Component V2
 * 
 * User-friendly display of data quality issues with:
 * - Plain English explanations
 * - Clear indication of automatic vs manual actions
 * - Contextual help for resolving issues
 * - Reassuring tone that guides users through the process
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2,
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Info,
  AlertTriangle,
  Trash2,
  TableProperties,
  HelpCircle,
  ArrowRight,
  Wrench,
  Loader2
} from 'lucide-react';

export interface DataQualityIssue {
  type: string;
  severity: string;
  message: string;
  details?: Record<string, unknown>;
  affectedRows?: number[];
  affectedColumns?: string[];
  rowNumbers?: number[];
  suggestedFix?: string;
}

export interface ColumnAnalysis {
  columnName?: string;
  columnIndex?: number;
  inferredType?: string;
  nullCount?: number;
  nonNullCount?: number;
  uniqueValues?: number;
  sampleValues?: string[];
  headerLikeValues?: number;
  pageLikeValues?: number;
  expectedType?: string;
  actualType?: string;
  nullPercentage?: number;
  consistencyScore?: number;
}

export interface DataQualityReport {
  hasIssues: boolean;
  hasCriticalIssues?: boolean;
  overallScore?: number;
  totalRows: number;
  cleanRows: number;
  problematicRows: number;
  issues: DataQualityIssue[];
  columnAnalysis: ColumnAnalysis[] | Record<string, ColumnAnalysis>;
  suggestedColumnMapping?: Record<string, string>;
  suggestedMapping?: Record<string, string>;
  rowsToRemove?: number[];
  columnShiftDetected?: boolean;
  shiftDetails?: {
    expectedColumn: string;
    actualDataType: string;
    examples: string[];
  };
  detectedPreset?: string;
}

interface DataQualityWarningsProps {
  report: DataQualityReport;
  fileName: string;
  onContinue?: () => void;
  onCancel?: () => void;
  onPreviewRows?: (rowIndices: number[]) => void;
  onUseSuggestedMapping?: (mapping: Record<string, string>) => void;
  isProcessing?: boolean;
}

interface IssueExplanation {
  title: string;
  whatHappened: string;
  whyItHappened: string;
  whatWeDo: string;
  userAction: 'none' | 'review' | 'required';
  userActionText?: string;
  icon: React.ReactNode;
  color: 'success' | 'info' | 'warning' | 'error';
}

function getIssueExplanation(issue: DataQualityIssue, report: DataQualityReport): IssueExplanation {
  const normalizedType = issue.type.toUpperCase().replace(/-/g, '_');
  const details = issue.details as Record<string, unknown> | undefined;
  
  switch (normalizedType) {
    case 'PAGE_BREAK_ROWS':
    case 'PAGE_BREAK':
      return {
        title: 'Page breaks detected',
        whatHappened: `Found ${(details?.count as number)?.toLocaleString() || (issue.affectedRows?.length || 'some')} rows that contain page numbers or print headers instead of actual data.`,
        whyItHappened: 'This happens when a file is exported from a paginated report or printed view. The page numbers (like "Page 1 of 10") get included as data rows.',
        whatWeDo: "We'll automatically remove these rows before processing. Your actual transaction data won't be affected.",
        userAction: 'none',
        icon: <Trash2 className="h-5 w-5" />,
        color: 'success'
      };

    case 'REPEATED_HEADERS':
    case 'REPEATED_HEADER':
      const rowCount = (details?.count as number) || (details?.rows as number[])?.length || issue.affectedRows?.length;
      return {
        title: 'Repeated headers in data',
        whatHappened: `Found ${rowCount?.toLocaleString() || 'some'} rows where the column headers appear again in the middle of the data.`,
        whyItHappened: 'This file was exported from a paginated view. Every few rows the headers repeat. This happens when Excel repeats headers on each printed page.',
        whatWeDo: "We'll automatically remove these duplicate header rows. Only your actual data will be processed.",
        userAction: 'none',
        icon: <Trash2 className="h-5 w-5" />,
        color: 'success'
      };

    case 'COLUMN_SHIFT':
      return {
        title: "Column headers don't match the data",
        whatHappened: "The data in some columns doesn't match what the column header says it should be.",
        whyItHappened: 'This can happen when columns get shifted during export, or when the source system uses generic column names. For example, a column named "Description" might actually contain quantity values.',
        whatWeDo: "We've analyzed the actual data and will suggest the correct mapping.",
        userAction: 'review',
        userActionText: "In the next step, each dropdown shows sample values next to column names. Use these samples - not the column headers - to pick the right mapping.",
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'warning'
      };

    case 'EMPTY_COLUMN':
      return {
        title: 'Empty columns found',
        whatHappened: `Found ${(details?.columns as string[])?.length || 'some'} columns that are empty or mostly empty.`,
        whyItHappened: 'These columns may be unused in your export, or the data might be in different columns than expected.',
        whatWeDo: 'Empty columns will be available but you can skip them during mapping.',
        userAction: 'none',
        userActionText: 'You can ignore these columns when setting up your mapping.',
        icon: <Info className="h-5 w-5" />,
        color: 'info'
      };

    case 'DATA_TYPE_MISMATCH':
    case 'TYPE_MISMATCH':
      return {
        title: 'Column mapping needed',
        whatHappened: "Some columns have data that doesn't match their header names.",
        whyItHappened: "This is common when column names are generic or the export format varies.",
        whatWeDo: "We'll help you map columns correctly in the next step using sample data.",
        userAction: 'none',
        userActionText: '',
        icon: <TableProperties className="h-5 w-5" />,
        color: 'info'
      };

    case 'MISSING_REQUIRED_DATA':
    case 'MISSING_DATA':
      return {
        title: 'Required data may be missing',
        whatHappened: issue.message,
        whyItHappened: 'The file may not contain all the required columns, or the data is in unexpected columns.',
        whatWeDo: "We'll help you identify and map the correct columns in the next step.",
        userAction: 'review',
        userActionText: 'Look for columns that contain date and amount information during mapping.',
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'warning'
      };

    default:
      return {
        title: issue.message,
        whatHappened: issue.message,
        whyItHappened: 'An unexpected data quality issue was detected.',
        whatWeDo: issue.suggestedFix || 'Please review before continuing.',
        userAction: 'review',
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'warning'
      };
  }
}

function IssueCard({ 
  issue, 
  report,
  onPreviewRows 
}: { 
  issue: DataQualityIssue; 
  report: DataQualityReport;
  onPreviewRows?: (rows: number[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const explanation = getIssueExplanation(issue, report);

  const actionBadge = {
    none: { label: '✓ Auto-fixed', variant: 'default' as const, className: 'bg-[#DCFCE7] text-[#166534] dark:bg-emerald-950/30 dark:text-emerald-400' },
    review: { label: 'Review recommended', variant: 'outline' as const, className: 'border-[#B45309]/20 text-[#B45309] dark:border-amber-600 dark:text-amber-400' },
    required: { label: 'Action required', variant: 'destructive' as const, className: '' }
  }[explanation.userAction];

  const borderColor = {
    success: 'border-l-[#166534]',
    info: 'border-l-[#1A1200]',
    warning: 'border-l-[#B45309]',
    error: 'border-l-[#B91C1C]'
  }[explanation.color];

  const iconColor = {
    success: 'text-[#166534] dark:text-emerald-400',
    info: 'text-[#1A1200] dark:text-[#F0EAE0]',
    warning: 'text-[#B45309] dark:text-amber-400',
    error: 'text-red-600 dark:text-red-400'
  }[explanation.color];

  return (
    <Card className={`mb-3 border-l-4 ${borderColor}`} data-testid={`card-issue-${issue.type}`}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger 
          className="w-full" 
          aria-label={`${expanded ? 'Collapse' : 'Expand'} details for ${explanation.title}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <div className={`mt-0.5 ${iconColor}`}>
                  {explanation.icon}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm">{explanation.title}</span>
                    <Badge variant={actionBadge.variant} className={`text-xs ${actionBadge.className}`}>
                      {actionBadge.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {explanation.whatHappened}
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                {expanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-4 pb-4 ml-8 space-y-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Why did this happen?</p>
                  <p className="text-sm">{explanation.whyItHappened}</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Wrench className="h-4 w-4 text-[#166534] dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">What we'll do</p>
                <p className="text-sm">{explanation.whatWeDo}</p>
              </div>
            </div>

            {explanation.userAction !== 'none' && explanation.userActionText && (
              <Alert className="border-[#E5E3DC] bg-[#FAFAF6] dark:border-[#2A2218] dark:bg-[#1A1200]/10">
                <Info className="h-4 w-4 text-[#1A1200] dark:text-[#F0EAE0]" />
                <AlertDescription className="text-[#1A1200] dark:text-[#F0EAE0] text-sm">
                  <strong>Your action:</strong> {explanation.userActionText}
                </AlertDescription>
              </Alert>
            )}

            {issue.affectedRows && issue.affectedRows.length > 0 && onPreviewRows && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  const rowsToPreview = issue.affectedRows!.length <= 10 
                    ? issue.affectedRows! 
                    : issue.affectedRows!.slice(0, 10);
                  onPreviewRows(rowsToPreview);
                }}
                aria-label={`Preview ${Math.min(issue.affectedRows.length, 10)} affected rows`}
                data-testid={`button-preview-rows-${issue.type}`}
              >
                {issue.affectedRows.length <= 10 
                  ? `Preview ${issue.affectedRows.length} affected rows`
                  : `Preview first 10 of ${issue.affectedRows.length.toLocaleString()} affected rows`}
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function SummaryCard({ report }: { report: DataQualityReport }) {
  const autoFixCount = report.issues.filter(i => {
    const type = i.type.toUpperCase();
    return type.includes('PAGE_BREAK') || type.includes('REPEATED_HEADER') || type.includes('EMPTY_COLUMN');
  }).length;
  
  const reviewCount = report.issues.filter(i => {
    const type = i.type.toUpperCase();
    return type.includes('COLUMN_SHIFT') || type.includes('TYPE_MISMATCH') || type.includes('MISSING');
  }).length;

  const hasCritical = report.hasCriticalIssues || reviewCount > 0;

  return (
    <div 
      className={`p-4 mb-4 rounded-lg border ${
        hasCritical 
          ? 'bg-[#FEF9C3] border-[#B45309]/20 dark:bg-amber-950/30 dark:border-amber-800'
          : 'bg-[#DCFCE7] border-[#166534]/20 dark:bg-emerald-950/30 dark:border-emerald-800'
      }`}
      data-testid="card-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {hasCritical ? (
            <AlertTriangle className="h-6 w-6 text-[#B45309] dark:text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-[#166534] dark:text-emerald-400 shrink-0" />
          )}
          <div>
            <h3 className="text-lg font-semibold mb-1">
              {hasCritical 
                ? 'A few things need your attention'
                : 'Your file looks good!'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {report.problematicRows > 0 
                ? `We'll automatically clean ${report.problematicRows.toLocaleString()} rows (${((report.problematicRows / report.totalRows) * 100).toFixed(1)}%) from your file.`
                : 'No cleanup needed.'}
            </p>
          </div>
        </div>

        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-[#166534] dark:text-emerald-400">
              {report.cleanRows.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Clean rows</p>
          </div>
          {autoFixCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#166534] dark:text-emerald-400">
                {autoFixCount}
              </p>
              <p className="text-xs text-muted-foreground">Auto-fixed</p>
            </div>
          )}
          {reviewCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#B45309] dark:text-amber-400">
                {reviewCount}
              </p>
              <p className="text-xs text-muted-foreground">To review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ColumnMappingTip({ report, onUseSuggestedMapping }: {
  report: DataQualityReport;
  onUseSuggestedMapping?: (mapping: Record<string, string>) => void;
}) {
  const hasColumnShift = report.columnShiftDetected ||
    report.issues.some(i => i.type.toUpperCase().includes('COLUMN_SHIFT'));

  if (!hasColumnShift) return null;

  return (
    <Alert className="mb-4 border-[#E5E3DC] bg-[#FAFAF6] dark:border-[#2A2218] dark:bg-[#1A1200]/10" data-testid="alert-column-tip">
      <TableProperties className="h-4 w-4 text-[#1A1200] dark:text-[#F0EAE0]" />
      <AlertTitle className="text-[#1A1200] dark:text-[#F0EAE0]">Tip for Column Mapping</AlertTitle>
      <AlertDescription className="text-[#1A1200] dark:text-[#F0EAE0]">
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li><strong>Look at the sample data</strong> shown for each column, not just the header name</li>
          <li><strong>Use the suggested mappings</strong> — we've analyzed the actual data to recommend the right columns</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function DataQualityWarnings({
  report,
  fileName,
  onContinue,
  onCancel,
  onPreviewRows,
  onUseSuggestedMapping,
  isProcessing = false
}: DataQualityWarningsProps) {
  
  if (!report.hasIssues) {
    return (
      <div className="py-4 text-center" data-testid="quality-success">
        <div className="mx-auto w-16 h-16 rounded-full bg-[#DCFCE7] dark:bg-emerald-950/30 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-[#166534] dark:text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold mb-1">File looks great!</h3>
        <p className="text-muted-foreground mb-6">
          {report.totalRows.toLocaleString()} rows ready to process
        </p>
        
        {onContinue && (
          <Button onClick={onContinue} disabled={isProcessing} size="lg" data-testid="button-continue">
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing {report.cleanRows?.toLocaleString() || ''} transactions...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  const [showDetails, setShowDetails] = useState(false);
  
  const autoFixIssues = report.issues.filter(i => {
    const type = i.type.toUpperCase();
    return type.includes('PAGE_BREAK') || type.includes('REPEATED_HEADER') || type.includes('EMPTY_COLUMN');
  });
  
  const reviewIssues = report.issues.filter(i => {
    const type = i.type.toUpperCase();
    return type.includes('COLUMN_SHIFT') || type.includes('TYPE_MISMATCH') || 
           type.includes('INCONSISTENT') || type.includes('MISSING');
  });

  const hasCritical = report.hasCriticalIssues || reviewIssues.length > 0;

  return (
    <div className="py-4" data-testid="data-quality-warnings">
      <div className="text-center mb-6">
        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
          hasCritical 
            ? 'bg-[#FEF9C3] dark:bg-amber-950/30'
            : 'bg-[#DCFCE7] dark:bg-emerald-950/30'
        }`}>
          {hasCritical ? (
            <AlertTriangle className="h-8 w-8 text-[#B45309] dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-[#166534] dark:text-emerald-400" />
          )}
        </div>
        <h3 className="text-lg font-semibold mb-1">
          {hasCritical ? 'Minor issues found' : 'File looks good!'}
        </h3>
        <p className="text-muted-foreground">
          {report.cleanRows.toLocaleString()} of {report.totalRows.toLocaleString()} rows ready to process
          {report.problematicRows > 0 && (
            <span className="text-sm"> ({report.problematicRows} will be cleaned automatically)</span>
          )}
        </p>
      </div>

      {report.issues.length > 0 && (
        <Collapsible open={showDetails} onOpenChange={setShowDetails} className="mb-6">
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between" 
              data-testid="button-toggle-details"
            >
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                View {report.issues.length} issue{report.issues.length !== 1 ? 's' : ''} found
              </span>
              {showDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4">
            <ColumnMappingTip report={report} onUseSuggestedMapping={onUseSuggestedMapping} />

            {autoFixIssues.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Sparkles className="h-4 w-4 text-[#166534]" />
                  <span className="font-medium">Auto-fixed ({autoFixIssues.length})</span>
                </div>
                {autoFixIssues.map((issue, index) => (
                  <IssueCard 
                    key={`auto-${index}`} 
                    issue={issue} 
                    report={report}
                    onPreviewRows={onPreviewRows}
                  />
                ))}
              </div>
            )}

            {reviewIssues.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <AlertTriangle className="h-4 w-4 text-[#B45309]" />
                  <span className="font-medium">Review recommended ({reviewIssues.length})</span>
                </div>
                {reviewIssues.map((issue, index) => (
                  <IssueCard 
                    key={`review-${index}`} 
                    issue={issue} 
                    report={report}
                    onPreviewRows={onPreviewRows}
                  />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {onContinue && (
        <div className="text-center">
          <Button 
            onClick={onContinue}
            disabled={isProcessing}
            size="lg"
            data-testid="button-continue"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue with {report.cleanRows.toLocaleString()} Rows
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default DataQualityWarnings;
