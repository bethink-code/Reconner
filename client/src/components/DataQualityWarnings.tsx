import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  Wand2,
  Eye
} from 'lucide-react';

export interface DataQualityIssue {
  type: string; // Supports both uppercase (COLUMN_SHIFT) and lowercase (column_shift) formats
  severity: string; // Supports both uppercase (CRITICAL) and lowercase (critical) formats
  message: string;
  details?: Record<string, any>;
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
  suggestedColumnMapping?: Record<string, string>; // Legacy format
  suggestedMapping?: Record<string, string>; // New normalized format
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
  onAcceptSuggestions?: () => void;
  onViewProblematicRows?: (rowIndices: number[]) => void;
  onUseSuggestedMapping?: (mapping: Record<string, string>) => void;
}

export function DataQualityWarnings({
  report,
  fileName,
  onAcceptSuggestions,
  onViewProblematicRows,
  onUseSuggestedMapping
}: DataQualityWarningsProps) {
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set());
  const [showColumnAnalysis, setShowColumnAnalysis] = useState(false);

  const toggleIssue = (index: number) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedIssues(newExpanded);
  };

  const getSeverityIcon = (severity: string) => {
    const normalizedSeverity = severity.toUpperCase();
    switch (normalizedSeverity) {
      case 'CRITICAL':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'WARNING':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getSeverityVariant = (severity: string): 'destructive' | 'secondary' | 'outline' => {
    const normalizedSeverity = severity.toUpperCase();
    switch (normalizedSeverity) {
      case 'CRITICAL':
        return 'destructive';
      case 'WARNING':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getIssueTypeLabel = (type: string): string => {
    const normalizedType = type.toUpperCase().replace(/_/g, '_');
    switch (normalizedType) {
      case 'COLUMN_SHIFT':
        return 'Column Shift';
      case 'PAGE_BREAK_ROWS':
      case 'PAGE_BREAK':
        return 'Page Breaks';
      case 'REPEATED_HEADERS':
      case 'REPEATED_HEADER':
        return 'Repeated Headers';
      case 'EMPTY_COLUMN':
        return 'Empty Columns';
      case 'DATA_TYPE_MISMATCH':
      case 'TYPE_MISMATCH':
        return 'Type Mismatch';
      case 'MISSING_REQUIRED_DATA':
        return 'Missing Data';
      default:
        return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  // Helper to get suggested mapping from either format
  const getSuggestedMapping = (): Record<string, string> => {
    return report.suggestedMapping || report.suggestedColumnMapping || {};
  };

  // Helper to check for column shift
  const hasColumnShift = (): boolean => {
    return report.columnShiftDetected || 
           report.issues.some(i => i.type.toUpperCase().includes('COLUMN_SHIFT'));
  };

  // Helper to get column analysis as array
  const getColumnAnalysisArray = (): ColumnAnalysis[] => {
    if (Array.isArray(report.columnAnalysis)) {
      return report.columnAnalysis;
    }
    return Object.entries(report.columnAnalysis).map(([name, analysis]) => ({
      columnName: name,
      ...analysis
    }));
  };

  // Check for critical issues
  const hasCriticalIssues = (): boolean => {
    return report.hasCriticalIssues || 
           report.issues.some(i => i.severity.toUpperCase() === 'CRITICAL');
  };

  if (!report.hasIssues) {
    return (
      <Alert data-testid="alert-quality-success">
        <CheckCircle className="h-5 w-5 text-green-500" />
        <AlertTitle>File Validated Successfully</AlertTitle>
        <AlertDescription>
          <strong>{fileName}</strong> contains {report.totalRows.toLocaleString()} clean rows ready for processing.
        </AlertDescription>
      </Alert>
    );
  }

  const suggestedMapping = getSuggestedMapping();
  const columnShiftDetected = hasColumnShift();
  const criticalIssues = hasCriticalIssues();
  const columnAnalysisArray = getColumnAnalysisArray();

  return (
    <div className="space-y-4" data-testid="data-quality-warnings">
      <Alert variant={criticalIssues ? 'destructive' : 'default'} data-testid="alert-quality-summary">
        {criticalIssues ? (
          <AlertCircle className="h-5 w-5" />
        ) : (
          <AlertTriangle className="h-5 w-5" />
        )}
        <AlertTitle>
          {criticalIssues 
            ? 'Critical Data Quality Issues Detected' 
            : 'Data Quality Warnings'}
        </AlertTitle>
        <AlertDescription>
          Found {report.issues.length} issue(s) in <strong>{fileName}</strong>.
          {report.problematicRows > 0 && (
            <span className="ml-1">
              {report.problematicRows.toLocaleString()} of {report.totalRows.toLocaleString()} rows 
              ({((report.problematicRows / report.totalRows) * 100).toFixed(1)}%) need attention.
            </span>
          )}
        </AlertDescription>
      </Alert>

      {columnShiftDetected && (
        <Card className="border-2 border-destructive" data-testid="card-column-shift">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive">Column Shift Detected</CardTitle>
              <Badge variant="destructive">CRITICAL</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The data in this file appears to be shifted from the expected columns. 
              The column headers don't match the actual data they contain.
            </p>

            <div className="bg-muted p-4 rounded-md">
              <p className="text-sm font-medium mb-2">Example of the Problem:</p>
              <ul className="text-sm list-disc list-inside space-y-1 text-muted-foreground">
                <li>Column named <code className="bg-background px-1 rounded">"Shift"</code> actually contains <strong>Pay Type</strong> (Card, Cash, Debtor)</li>
                <li>Column named <code className="bg-background px-1 rounded">"Description"</code> actually contains <strong>Quantity</strong></li>
                <li>Column named <code className="bg-background px-1 rounded">"_5"</code> contains the actual <strong>Transaction Amount</strong></li>
              </ul>
            </div>

            {Object.keys(suggestedMapping).length > 0 && (
              <>
                <div>
                  <p className="text-sm font-medium mb-2">Suggested Column Mapping:</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Use Column</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(suggestedMapping).map(([field, column]) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium">
                            {field.charAt(0).toUpperCase() + field.slice(1)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{column}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                {onUseSuggestedMapping && (
                  <Button
                    onClick={() => onUseSuggestedMapping(suggestedMapping)}
                    data-testid="button-apply-suggested-mapping"
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Apply Suggested Mapping
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-all-issues">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">All Issues ({report.issues.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.issues.map((issue, index) => (
            <Collapsible 
              key={index} 
              open={expandedIssues.has(index)}
              onOpenChange={() => toggleIssue(index)}
            >
              <div 
                className={`p-3 rounded-md border ${
                  expandedIssues.has(index) ? 'bg-muted' : 'hover-elevate'
                }`}
              >
                <CollapsibleTrigger className="w-full" data-testid={`trigger-issue-${index}`}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      {getSeverityIcon(issue.severity)}
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{issue.message}</span>
                          <Badge variant={getSeverityVariant(issue.severity)} className="text-xs">
                            {getIssueTypeLabel(issue.type)}
                          </Badge>
                        </div>
                        {issue.suggestedFix && (
                          <p className="text-xs text-muted-foreground mt-1">{issue.suggestedFix}</p>
                        )}
                      </div>
                    </div>
                    {expandedIssues.has(index) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="pt-3">
                  {issue.details && Object.keys(issue.details).length > 0 && (
                    <div className="border rounded-md p-3 bg-background">
                      <p className="text-xs text-muted-foreground mb-2">Details:</p>
                      <pre className="text-xs overflow-auto max-h-48 text-muted-foreground">
                        {JSON.stringify(issue.details, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {issue.affectedRows && issue.affectedRows.length > 0 && onViewProblematicRows && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewProblematicRows(issue.affectedRows!)}
                      className="mt-2"
                      data-testid={`button-view-affected-rows-${index}`}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View {issue.affectedRows.length} Affected Rows
                    </Button>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      <Collapsible 
        open={showColumnAnalysis} 
        onOpenChange={setShowColumnAnalysis}
      >
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger className="w-full" data-testid="trigger-column-analysis">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Column Analysis</CardTitle>
                {showColumnAnalysis ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column</TableHead>
                    <TableHead>Inferred Type</TableHead>
                    <TableHead>Non-Null</TableHead>
                    <TableHead>Unique</TableHead>
                    <TableHead>Sample Values</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnAnalysisArray.map((col, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{col.columnName || `Column ${index + 1}`}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{col.inferredType || col.expectedType || 'unknown'}</Badge>
                      </TableCell>
                      <TableCell>{col.nonNullCount ?? '-'}</TableCell>
                      <TableCell>{col.uniqueValues ?? '-'}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {col.sampleValues?.slice(0, 3).join(', ') || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
