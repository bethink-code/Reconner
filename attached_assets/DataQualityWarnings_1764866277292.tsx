/**
 * DataQualityWarnings Component
 * 
 * Displays data quality issues detected during file upload.
 * Shows warnings, allows user to review issues, and provides
 * suggested fixes.
 */

import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AutoFixHigh as AutoFixIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';

// Types matching the validator output
interface DataQualityIssue {
  type: 'COLUMN_SHIFT' | 'PAGE_BREAK_ROWS' | 'REPEATED_HEADERS' | 'EMPTY_COLUMN' | 'DATA_TYPE_MISMATCH' | 'INCONSISTENT_DATA';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  details: Record<string, any>;
  affectedRows?: number[];
  suggestedFix?: string;
}

interface ColumnAnalysis {
  columnName: string;
  columnIndex: number;
  inferredType: string;
  nullCount: number;
  nonNullCount: number;
  uniqueValues: number;
  sampleValues: string[];
  headerLikeValues: number;
  pageLikeValues: number;
}

interface DataQualityReport {
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
  shiftDetails?: any;
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
  const [expandedIssues, setExpandedIssues] = React.useState<Set<number>>(new Set());
  const [showColumnAnalysis, setShowColumnAnalysis] = React.useState(false);

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
    switch (severity) {
      case 'CRITICAL':
        return <ErrorIcon color="error" />;
      case 'WARNING':
        return <WarningIcon color="warning" />;
      default:
        return <InfoIcon color="info" />;
    }
  };

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' | 'success' => {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
      case 'WARNING':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getIssueTypeLabel = (type: string): string => {
    switch (type) {
      case 'COLUMN_SHIFT':
        return 'Column Shift';
      case 'PAGE_BREAK_ROWS':
        return 'Page Breaks';
      case 'REPEATED_HEADERS':
        return 'Repeated Headers';
      case 'EMPTY_COLUMN':
        return 'Empty Columns';
      case 'DATA_TYPE_MISMATCH':
        return 'Type Mismatch';
      default:
        return type;
    }
  };

  // No issues - show success
  if (!report.hasIssues) {
    return (
      <Alert severity="success" icon={<CheckIcon />}>
        <AlertTitle>File Validated Successfully</AlertTitle>
        <Typography variant="body2">
          {fileName} contains {report.totalRows.toLocaleString()} clean rows ready for processing.
        </Typography>
      </Alert>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Summary Alert */}
      <Alert 
        severity={report.hasCriticalIssues ? 'error' : 'warning'}
        sx={{ mb: 2 }}
      >
        <AlertTitle>
          {report.hasCriticalIssues 
            ? '⚠️ Critical Data Quality Issues Detected' 
            : 'Data Quality Warnings'}
        </AlertTitle>
        <Typography variant="body2">
          Found {report.issues.length} issue(s) in <strong>{fileName}</strong>.
          {' '}
          {report.problematicRows > 0 && (
            <>
              {report.problematicRows.toLocaleString()} of {report.totalRows.toLocaleString()} rows 
              ({((report.problematicRows / report.totalRows) * 100).toFixed(1)}%) need attention.
            </>
          )}
        </Typography>
      </Alert>

      {/* Column Shift Warning - Most Critical */}
      {report.columnShiftDetected && (
        <Card sx={{ mb: 2, border: '2px solid', borderColor: 'error.main' }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <ErrorIcon color="error" />
              <Typography variant="h6" color="error">
                Column Shift Detected
              </Typography>
              <Chip label="CRITICAL" color="error" size="small" />
            </Stack>
            
            <Typography variant="body2" sx={{ mb: 2 }}>
              The data in this file appears to be shifted from the expected columns. 
              The column headers don't match the actual data they contain.
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
              <Typography variant="subtitle2" gutterBottom>
                Example of the Problem:
              </Typography>
              <Typography variant="body2" component="div">
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>Column named <code>"Shift"</code> actually contains <strong>Pay Type</strong> (Card, Cash, Debtor)</li>
                  <li>Column named <code>"Description"</code> actually contains <strong>Quantity</strong></li>
                  <li>Column named <code>"_5"</code> contains the actual <strong>Transaction Amount</strong></li>
                </ul>
              </Typography>
            </Paper>

            {Object.keys(report.suggestedColumnMapping).length > 0 && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Suggested Column Mapping:
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Field</TableCell>
                        <TableCell>Use Column</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(report.suggestedColumnMapping).map(([field, column]) => (
                        <TableRow key={field}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {field.charAt(0).toUpperCase() + field.slice(1)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={column} 
                              size="small" 
                              variant="outlined"
                              color="primary"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                {onUseSuggestedMapping && (
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AutoFixIcon />}
                    onClick={() => onUseSuggestedMapping(report.suggestedColumnMapping)}
                  >
                    Apply Suggested Mapping
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Other Issues List */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            All Issues ({report.issues.length})
          </Typography>
          
          <List disablePadding>
            {report.issues.map((issue, index) => (
              <React.Fragment key={index}>
                <ListItem
                  sx={{ 
                    flexDirection: 'column', 
                    alignItems: 'stretch',
                    bgcolor: expandedIssues.has(index) ? 'action.hover' : 'transparent'
                  }}
                >
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      width: '100%',
                      cursor: 'pointer'
                    }}
                    onClick={() => toggleIssue(index)}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {getSeverityIcon(issue.severity)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body1">
                            {issue.message}
                          </Typography>
                          <Chip 
                            label={getIssueTypeLabel(issue.type)} 
                            size="small"
                            color={getSeverityColor(issue.severity)}
                            variant="outlined"
                          />
                        </Stack>
                      }
                      secondary={issue.suggestedFix}
                    />
                    <IconButton size="small">
                      {expandedIssues.has(index) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                  
                  <Collapse in={expandedIssues.has(index)} timeout="auto" unmountOnExit>
                    <Box sx={{ pl: 7, pr: 2, pb: 2 }}>
                      {/* Issue Details */}
                      {issue.details && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                            Details:
                          </Typography>
                          <pre style={{ 
                            margin: 0, 
                            fontSize: '0.75rem',
                            overflow: 'auto',
                            maxHeight: 200
                          }}>
                            {JSON.stringify(issue.details, null, 2)}
                          </pre>
                        </Paper>
                      )}
                      
                      {/* View affected rows button */}
                      {issue.affectedRows && issue.affectedRows.length > 0 && onViewProblematicRows && (
                        <Button
                          size="small"
                          startIcon={<ViewIcon />}
                          onClick={() => onViewProblematicRows(issue.affectedRows!)}
                          sx={{ mt: 1 }}
                        >
                          View {issue.affectedRows.length} Affected Rows
                        </Button>
                      )}
                    </Box>
                  </Collapse>
                </ListItem>
                {index < report.issues.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </CardContent>
      </Card>

      {/* Column Analysis (Collapsible) */}
      <Card>
        <CardContent>
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
            onClick={() => setShowColumnAnalysis(!showColumnAnalysis)}
          >
            <Typography variant="h6">
              Column Analysis
            </Typography>
            <IconButton size="small">
              {showColumnAnalysis ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          
          <Collapse in={showColumnAnalysis}>
            <TableContainer sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Column</TableCell>
                    <TableCell>Inferred Type</TableCell>
                    <TableCell align="right">Non-Null</TableCell>
                    <TableCell align="right">Headers</TableCell>
                    <TableCell align="right">Pages</TableCell>
                    <TableCell>Sample Values</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.columnAnalysis.map((col) => (
                    <TableRow 
                      key={col.columnName}
                      sx={{
                        bgcolor: col.headerLikeValues > 0 || col.pageLikeValues > 0 
                          ? 'warning.light' 
                          : 'transparent'
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {col.columnName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={col.inferredType} 
                          size="small"
                          color={col.inferredType === 'mixed' ? 'warning' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {col.nonNullCount.toLocaleString()}
                        <Typography variant="caption" color="text.secondary" display="block">
                          ({((col.nonNullCount / report.totalRows) * 100).toFixed(0)}%)
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {col.headerLikeValues > 0 ? (
                          <Chip 
                            label={col.headerLikeValues} 
                            size="small" 
                            color="warning"
                          />
                        ) : (
                          <Typography color="text.secondary">0</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {col.pageLikeValues > 0 ? (
                          <Chip 
                            label={col.pageLikeValues} 
                            size="small" 
                            color="warning"
                          />
                        ) : (
                          <Typography color="text.secondary">0</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={col.sampleValues.join(', ')}>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              maxWidth: 200, 
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {col.sampleValues.slice(0, 3).join(', ')}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {report.problematicRows > 0 && onAcceptSuggestions && (
        <Box sx={{ mt: 2, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AutoFixIcon />}
            onClick={onAcceptSuggestions}
          >
            Clean {report.problematicRows} Problematic Rows & Continue
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default DataQualityWarnings;
