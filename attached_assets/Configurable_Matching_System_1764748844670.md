# Configurable Matching System
## User-Defined Reconciliation Rules

**Core Principle:** Every user/client has different matching requirements. Rules MUST be configurable, not hardcoded.

---

## 🎯 The Problem with Hardcoding

### Current Approach (WRONG)
```typescript
// ❌ Hardcoded in backend
const AMOUNT_TOLERANCE = 0.10;
const DATE_WINDOW = 3;
const GROUP_BY_INVOICE = true;

// Every client forced to use same rules
// Can't adapt to different business processes
```

### User-Configurable Approach (CORRECT)
```typescript
// ✅ User sets rules per period
const rules = {
  amountTolerance: userSelected,      // Each client chooses
  dateWindowDays: userSelected,       // Based on their bank
  groupByInvoice: userSelected,       // Based on their POS system
  requireCardMatch: userSelected,     // Some clients care, some don't
  minimumConfidence: userSelected     // Risk tolerance varies
};
```

---

## 📊 Database Schema for Configurable Rules

### Table: matching_rules

```sql
CREATE TABLE matching_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID REFERENCES reconciliation_periods(id),
  
  -- Basic Matching Rules
  amount_tolerance DECIMAL(10,2) DEFAULT 0.10,  -- ±R0.10
  date_window_days INTEGER DEFAULT 3,           -- 0-3 days
  time_window_minutes INTEGER DEFAULT 60,       -- 60 minutes
  
  -- Grouping Rules
  group_by_invoice BOOLEAN DEFAULT true,
  group_by_card_number BOOLEAN DEFAULT false,
  group_by_terminal BOOLEAN DEFAULT false,
  
  -- Matching Requirements
  require_card_match BOOLEAN DEFAULT false,
  require_same_day BOOLEAN DEFAULT false,
  require_reference_match BOOLEAN DEFAULT false,
  
  -- Confidence Thresholds
  minimum_confidence INTEGER DEFAULT 70,         -- 0-100
  auto_match_threshold INTEGER DEFAULT 85,       -- Auto-accept if above
  manual_review_threshold INTEGER DEFAULT 70,    -- Needs review if between
  
  -- Advanced Rules (JSON for flexibility)
  custom_rules JSONB DEFAULT '[]',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT,
  
  -- Ensure one rule set per period
  UNIQUE(period_id)
);

-- Example custom rule structure in JSONB:
-- {
--   "name": "Large Transaction Rule",
--   "condition": "amount > 1000",
--   "action": "require_manual_review",
--   "priority": 1
-- }
```

---

## 🎨 User Interface for Rule Configuration

### Component 1: Matching Rules Panel

```tsx
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Slider,
  Switch,
  FormControl,
  FormLabel,
  FormControlLabel,
  TextField,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Chip,
  Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';

interface MatchingRules {
  amountTolerance: number;
  dateWindowDays: number;
  timeWindowMinutes: number;
  groupByInvoice: boolean;
  requireCardMatch: boolean;
  minimumConfidence: number;
  autoMatchThreshold: number;
}

const PRESET_RULES = {
  conservative: {
    name: 'Conservative',
    description: 'Strict matching - fewer false positives',
    rules: {
      amountTolerance: 0.01,
      dateWindowDays: 1,
      timeWindowMinutes: 30,
      groupByInvoice: true,
      requireCardMatch: true,
      minimumConfidence: 90,
      autoMatchThreshold: 95
    }
  },
  moderate: {
    name: 'Moderate (Recommended)',
    description: 'Balanced approach for most clients',
    rules: {
      amountTolerance: 0.10,
      dateWindowDays: 3,
      timeWindowMinutes: 60,
      groupByInvoice: true,
      requireCardMatch: false,
      minimumConfidence: 70,
      autoMatchThreshold: 85
    }
  },
  aggressive: {
    name: 'Aggressive',
    description: 'More matches - may need review',
    rules: {
      amountTolerance: 0.50,
      dateWindowDays: 7,
      timeWindowMinutes: 120,
      groupByInvoice: true,
      requireCardMatch: false,
      minimumConfidence: 60,
      autoMatchThreshold: 75
    }
  }
};

export function MatchingRulesPanel({ 
  periodId, 
  onSave 
}: { 
  periodId: string; 
  onSave: (rules: MatchingRules) => void;
}) {
  const [rules, setRules] = useState<MatchingRules>(PRESET_RULES.moderate.rules);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handlePresetSelect = (preset: keyof typeof PRESET_RULES) => {
    setRules(PRESET_RULES[preset].rules);
  };

  const expectedMatchRate = () => {
    // Estimate based on rules
    if (rules.amountTolerance <= 0.01 && rules.minimumConfidence >= 90) {
      return '50-70%';
    } else if (rules.amountTolerance <= 0.10 && rules.minimumConfidence >= 70) {
      return '75-90%';
    } else {
      return '85-95%';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Matching Rules Configuration
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        These rules determine how bank transactions are matched to fuel sales.
        You can adjust them based on your business needs.
      </Alert>

      {/* Preset Selection */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Quick Presets
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {Object.entries(PRESET_RULES).map(([key, preset]) => (
            <Button
              key={key}
              variant="outlined"
              onClick={() => handlePresetSelect(key as keyof typeof PRESET_RULES)}
              sx={{ flex: 1 }}
            >
              <Box>
                <Typography variant="button">{preset.name}</Typography>
                <Typography variant="caption" display="block">
                  {preset.description}
                </Typography>
              </Box>
            </Button>
          ))}
        </Box>
      </Box>

      {/* Basic Rules */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Basic Matching Rules
        </Typography>

        {/* Amount Tolerance */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <FormLabel>Amount Tolerance: ±R{rules.amountTolerance.toFixed(2)}</FormLabel>
            <Tooltip title="Bank and fuel amounts can differ by this much and still match. Example: R100.00 (bank) matches R100.05 (fuel) if tolerance is ±R0.10">
              <InfoIcon sx={{ ml: 1, fontSize: 18, color: 'text.secondary' }} />
            </Tooltip>
          </Box>
          <Slider
            value={rules.amountTolerance}
            onChange={(_, value) => setRules({ ...rules, amountTolerance: value as number })}
            min={0.01}
            max={1.00}
            step={0.01}
            marks={[
              { value: 0.01, label: 'R0.01\n(Strict)' },
              { value: 0.10, label: 'R0.10\n(Recommended)' },
              { value: 0.50, label: 'R0.50' },
              { value: 1.00, label: 'R1.00\n(Loose)' }
            ]}
            valueLabelDisplay="auto"
          />
          <Typography variant="caption" color="text.secondary">
            Common scenario: Customer wants R100, attendant stops at R100.05
          </Typography>
        </FormControl>

        {/* Date Window */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <FormLabel>Date Window: {rules.dateWindowDays} days</FormLabel>
            <Tooltip title="Bank transactions can post 1-3 days after fuel purchase due to card processing delays">
              <InfoIcon sx={{ ml: 1, fontSize: 18, color: 'text.secondary' }} />
            </Tooltip>
          </Box>
          <Slider
            value={rules.dateWindowDays}
            onChange={(_, value) => setRules({ ...rules, dateWindowDays: value as number })}
            min={0}
            max={7}
            step={1}
            marks={[
              { value: 0, label: 'Same Day' },
              { value: 1, label: '1 Day' },
              { value: 3, label: '3 Days\n(Recommended)' },
              { value: 7, label: '7 Days' }
            ]}
            valueLabelDisplay="auto"
          />
          <Typography variant="caption" color="text.secondary">
            Transactions within this window can match. Accounts for banking delays.
          </Typography>
        </FormControl>

        {/* Time Window */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <FormLabel>Time Window: {rules.timeWindowMinutes} minutes</FormLabel>
            <Tooltip title="Only used if both transactions have time stamps. Accounts for clock differences.">
              <InfoIcon sx={{ ml: 1, fontSize: 18, color: 'text.secondary' }} />
            </Tooltip>
          </Box>
          <Slider
            value={rules.timeWindowMinutes}
            onChange={(_, value) => setRules({ ...rules, timeWindowMinutes: value as number })}
            min={15}
            max={180}
            step={15}
            marks={[
              { value: 15, label: '15 min' },
              { value: 60, label: '60 min\n(Recommended)' },
              { value: 120, label: '120 min' },
              { value: 180, label: '180 min' }
            ]}
            valueLabelDisplay="auto"
          />
        </FormControl>

        {/* Invoice Grouping */}
        <FormControlLabel
          control={
            <Switch
              checked={rules.groupByInvoice}
              onChange={(e) => setRules({ ...rules, groupByInvoice: e.target.checked })}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography>Group by Invoice Number</Typography>
              <Tooltip title="Groups multiple fuel items (diesel + oil + snacks) into one invoice before matching. HIGHLY RECOMMENDED.">
                <InfoIcon sx={{ ml: 1, fontSize: 18, color: 'text.secondary' }} />
              </Tooltip>
            </Box>
          }
        />
        <Typography variant="caption" display="block" sx={{ ml: 4, mb: 2 }}>
          Example: Customer buys diesel + oil + snacks (3 items) = 1 bank transaction
        </Typography>

        {/* Card Matching */}
        <FormControlLabel
          control={
            <Switch
              checked={rules.requireCardMatch}
              onChange={(e) => setRules({ ...rules, requireCardMatch: e.target.checked })}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography>Require Card Number Match</Typography>
              <Tooltip title="Only match if card numbers match. Turn OFF if card numbers are unreliable in your data.">
                <InfoIcon sx={{ ml: 1, fontSize: 18, color: 'text.secondary' }} />
              </Tooltip>
            </Box>
          }
        />
        <Typography variant="caption" display="block" sx={{ ml: 4, mb: 2 }}>
          Only match if card ending (****1234) is the same in both files
        </Typography>

        {/* Minimum Confidence */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <FormLabel>Minimum Confidence: {rules.minimumConfidence}%</FormLabel>
            <Tooltip title="Matches below this confidence won't be created. Higher = safer but fewer matches.">
              <InfoIcon sx={{ ml: 1, fontSize: 18, color: 'text.secondary' }} />
            </Tooltip>
          </Box>
          <Slider
            value={rules.minimumConfidence}
            onChange={(_, value) => setRules({ ...rules, minimumConfidence: value as number })}
            min={50}
            max={100}
            step={5}
            marks={[
              { value: 50, label: '50%' },
              { value: 70, label: '70%\n(Recommended)' },
              { value: 85, label: '85%' },
              { value: 100, label: '100%' }
            ]}
            valueLabelDisplay="auto"
          />
        </FormControl>
      </Box>

      {/* Advanced Rules (Collapsible) */}
      <Accordion expanded={showAdvanced} onChange={() => setShowAdvanced(!showAdvanced)}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Advanced Settings</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormControl fullWidth sx={{ mb: 3 }}>
            <FormLabel>Auto-Match Threshold: {rules.autoMatchThreshold}%</FormLabel>
            <Slider
              value={rules.autoMatchThreshold}
              onChange={(_, value) => setRules({ ...rules, autoMatchThreshold: value as number })}
              min={70}
              max={100}
              step={5}
              marks
              valueLabelDisplay="auto"
            />
            <Typography variant="caption" color="text.secondary">
              Matches above this confidence are auto-accepted without review
            </Typography>
          </FormControl>

          <Alert severity="warning">
            <Typography variant="subtitle2">Custom Rules (Coming Soon)</Typography>
            <Typography variant="body2">
              You'll be able to add custom conditions like:
              <ul>
                <li>"Transactions over R1000 require manual review"</li>
                <li>"Match by terminal ID if amounts are close"</li>
                <li>"Flag if card number doesn't match"</li>
              </ul>
            </Typography>
          </Alert>
        </AccordionDetails>
      </Accordion>

      {/* Expected Results */}
      <Alert severity="success" sx={{ mt: 3 }}>
        <Typography variant="subtitle2">Expected Match Rate</Typography>
        <Typography variant="body2">
          With these settings, you should see approximately <strong>{expectedMatchRate()}</strong> of 
          bank transactions matched to fuel sales.
        </Typography>
      </Alert>

      {/* Action Buttons */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={() => setRules(PRESET_RULES.moderate.rules)}>
          Reset to Defaults
        </Button>
        <Button 
          variant="contained" 
          onClick={() => onSave(rules)}
        >
          Save & Run Matching
        </Button>
      </Box>
    </Box>
  );
}
```

---

## 🔧 Backend Implementation

### Service: ConfigurableMatchingService

```typescript
import { Pool } from 'pg';

interface MatchingRules {
  amountTolerance: number;
  dateWindowDays: number;
  timeWindowMinutes: number;
  groupByInvoice: boolean;
  requireCardMatch: boolean;
  minimumConfidence: number;
  autoMatchThreshold: number;
}

interface FuelInvoice {
  invoiceNumber: string;
  items: any[];
  totalAmount: number;
  firstDate: Date;
  firstTime: string | null;
  cardNumber: string | null;
}

export class ConfigurableMatchingService {
  constructor(private db: Pool) {}

  /**
   * Save matching rules for a period
   */
  async saveMatchingRules(periodId: string, rules: MatchingRules, userId: string) {
    await this.db.query(`
      INSERT INTO matching_rules (
        period_id,
        amount_tolerance,
        date_window_days,
        time_window_minutes,
        group_by_invoice,
        require_card_match,
        minimum_confidence,
        auto_match_threshold,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (period_id) DO UPDATE SET
        amount_tolerance = EXCLUDED.amount_tolerance,
        date_window_days = EXCLUDED.date_window_days,
        time_window_minutes = EXCLUDED.time_window_minutes,
        group_by_invoice = EXCLUDED.group_by_invoice,
        require_card_match = EXCLUDED.require_card_match,
        minimum_confidence = EXCLUDED.minimum_confidence,
        auto_match_threshold = EXCLUDED.auto_match_threshold,
        updated_at = NOW()
    `, [
      periodId,
      rules.amountTolerance,
      rules.dateWindowDays,
      rules.timeWindowMinutes,
      rules.groupByInvoice,
      rules.requireCardMatch,
      rules.minimumConfidence,
      rules.autoMatchThreshold,
      userId
    ]);
  }

  /**
   * Get matching rules for a period (or defaults)
   */
  async getMatchingRules(periodId: string): Promise<MatchingRules> {
    const result = await this.db.query(`
      SELECT * FROM matching_rules WHERE period_id = $1
    `, [periodId]);

    if (result.rows.length === 0) {
      // Return default (moderate) rules
      return {
        amountTolerance: 0.10,
        dateWindowDays: 3,
        timeWindowMinutes: 60,
        groupByInvoice: true,
        requireCardMatch: false,
        minimumConfidence: 70,
        autoMatchThreshold: 85
      };
    }

    const row = result.rows[0];
    return {
      amountTolerance: parseFloat(row.amount_tolerance),
      dateWindowDays: row.date_window_days,
      timeWindowMinutes: row.time_window_minutes,
      groupByInvoice: row.group_by_invoice,
      requireCardMatch: row.require_card_match,
      minimumConfidence: row.minimum_confidence,
      autoMatchThreshold: row.auto_match_threshold
    };
  }

  /**
   * Group fuel transactions by invoice (if enabled in rules)
   */
  private groupFuelByInvoice(fuelTransactions: any[], groupByInvoice: boolean): FuelInvoice[] {
    if (!groupByInvoice) {
      // Treat each transaction as its own "invoice"
      return fuelTransactions.map(tx => ({
        invoiceNumber: tx.id,
        items: [tx],
        totalAmount: parseFloat(tx.amount),
        firstDate: tx.transaction_date,
        firstTime: tx.transaction_time,
        cardNumber: tx.card_number
      }));
    }

    const invoices: Record<string, FuelInvoice> = {};

    for (const tx of fuelTransactions) {
      const invoiceNum = tx.reference_number || tx.id;

      if (!invoices[invoiceNum]) {
        invoices[invoiceNum] = {
          invoiceNumber: invoiceNum,
          items: [],
          totalAmount: 0,
          firstDate: tx.transaction_date,
          firstTime: tx.transaction_time,
          cardNumber: tx.card_number
        };
      }

      invoices[invoiceNum].items.push(tx);
      invoices[invoiceNum].totalAmount += parseFloat(tx.amount);
    }

    return Object.values(invoices);
  }

  /**
   * Calculate match confidence based on rules
   */
  private calculateConfidence(
    bankTx: any,
    invoice: FuelInvoice,
    rules: MatchingRules
  ): { confidence: number; reasons: string[] } {
    let confidence = 100;
    const reasons: string[] = [];

    // Amount scoring
    const amountDiff = Math.abs(parseFloat(bankTx.amount) - invoice.totalAmount);
    const amountPct = (amountDiff / parseFloat(bankTx.amount)) * 100;

    if (amountDiff === 0) {
      reasons.push('Exact amount match');
    } else if (amountDiff <= rules.amountTolerance / 2) {
      confidence -= 2;
      reasons.push(`Amount within R${amountDiff.toFixed(2)} (${amountPct.toFixed(1)}%)`);
    } else if (amountDiff <= rules.amountTolerance) {
      confidence -= 5;
      reasons.push(`Amount within tolerance (R${amountDiff.toFixed(2)})`);
    } else {
      return { confidence: 0, reasons: ['Amount outside tolerance'] };
    }

    // Date scoring
    const bankDate = new Date(bankTx.transaction_date);
    const fuelDate = new Date(invoice.firstDate);
    const dateDiffMs = Math.abs(bankDate.getTime() - fuelDate.getTime());
    const dateDiffDays = dateDiffMs / (1000 * 60 * 60 * 24);

    if (dateDiffDays === 0) {
      reasons.push('Same day transaction');
    } else if (dateDiffDays <= 1) {
      confidence -= 5;
      reasons.push('1 day difference');
    } else if (dateDiffDays <= rules.dateWindowDays) {
      confidence -= (dateDiffDays * 7);
      reasons.push(`${Math.round(dateDiffDays)} days difference`);
    } else {
      return { confidence: 0, reasons: ['Date outside window'] };
    }

    // Time scoring (if available)
    if (bankTx.transaction_time && invoice.firstTime) {
      const timeDiffMin = this.calculateTimeDifference(
        bankTx.transaction_time,
        invoice.firstTime
      );

      if (timeDiffMin <= 5) {
        confidence += 5;
        reasons.push('Times very close');
      } else if (timeDiffMin <= 30) {
        reasons.push(`${timeDiffMin} min time difference`);
      } else if (timeDiffMin <= rules.timeWindowMinutes) {
        confidence -= 3;
        reasons.push(`${timeDiffMin} min time difference`);
      } else {
        confidence -= 10;
        reasons.push(`Large time difference (${timeDiffMin} min)`);
      }
    }

    // Card number check
    if (rules.requireCardMatch) {
      if (bankTx.card_number && invoice.cardNumber) {
        if (bankTx.card_number === invoice.cardNumber) {
          confidence += 10;
          reasons.push('Card numbers match');
        } else {
          return { confidence: 0, reasons: ['Card numbers do not match (required)'] };
        }
      } else {
        return { confidence: 0, reasons: ['Missing card number (required)'] };
      }
    } else {
      // Optional card check
      if (bankTx.card_number && invoice.cardNumber) {
        if (bankTx.card_number === invoice.cardNumber) {
          confidence += 10;
          reasons.push('Card numbers match (bonus)');
        } else {
          confidence -= 15;
          reasons.push('Card numbers differ');
        }
      }
    }

    // Multi-line invoice penalty
    if (invoice.items.length > 1) {
      confidence -= 3;
      reasons.push(`Multi-line invoice (${invoice.items.length} items)`);
    }

    // Cap confidence at 100
    confidence = Math.min(100, Math.max(0, confidence));

    return { confidence, reasons };
  }

  private calculateTimeDifference(time1: string, time2: string): number {
    // Parse time strings (HH:MM:SS) and return difference in minutes
    const [h1, m1, s1] = time1.split(':').map(Number);
    const [h2, m2, s2] = time2.split(':').map(Number);

    const ms1 = h1 * 3600000 + m1 * 60000 + s1 * 1000;
    const ms2 = h2 * 3600000 + m2 * 60000 + s2 * 1000;

    return Math.abs(ms1 - ms2) / 60000;
  }

  /**
   * Run auto-matching with user-configured rules
   */
  async autoMatch(periodId: string): Promise<{
    bankCount: number;
    fuelCount: number;
    invoiceCount: number;
    matchesFound: number;
    autoMatched: number;
    needsReview: number;
    matchRate: string;
  }> {
    // Get rules for this period
    const rules = await this.getMatchingRules(periodId);

    console.log('Running auto-match with rules:', rules);

    // Load unmatched transactions
    const bankResult = await this.db.query(`
      SELECT * FROM transactions
      WHERE period_id = $1
        AND source_type = 'bank'
        AND is_card_transaction = 'yes'
        AND match_status = 'unmatched'
      ORDER BY transaction_date, amount
    `, [periodId]);

    const fuelResult = await this.db.query(`
      SELECT * FROM transactions
      WHERE period_id = $1
        AND source_type = 'fuel'
        AND is_card_transaction = 'yes'
        AND match_status = 'unmatched'
      ORDER BY reference_number, transaction_date
    `, [periodId]);

    const bankTxs = bankResult.rows;
    const fuelTxs = fuelResult.rows;

    console.log(`Loaded ${bankTxs.length} bank, ${fuelTxs.length} fuel transactions`);

    // Group fuel by invoice (if enabled)
    const fuelInvoices = this.groupFuelByInvoice(fuelTxs, rules.groupByInvoice);

    console.log(`Grouped into ${fuelInvoices.length} invoices`);

    // Find matches
    const matches: Array<{
      bankTx: any;
      invoice: FuelInvoice;
      confidence: number;
      reasons: string[];
      needsReview: boolean;
    }> = [];

    for (const bankTx of bankTxs) {
      let bestMatch: typeof matches[0] | null = null;

      for (const invoice of fuelInvoices) {
        // Skip if already matched
        if (invoice.items.some(item => item.match_status === 'matched')) {
          continue;
        }

        const { confidence, reasons } = this.calculateConfidence(bankTx, invoice, rules);

        if (confidence >= rules.minimumConfidence) {
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = {
              bankTx,
              invoice,
              confidence,
              reasons,
              needsReview: confidence < rules.autoMatchThreshold
            };
          }
        }
      }

      if (bestMatch) {
        matches.push(bestMatch);
      }
    }

    console.log(`Found ${matches.length} potential matches`);

    // Create matches in database
    let autoMatched = 0;
    let needsReview = 0;

    for (const match of matches) {
      const matchId = this.generateUUID();
      const matchType = match.needsReview ? 'auto_review' : 'auto';

      if (match.needsReview) {
        needsReview++;
      } else {
        autoMatched++;
      }

      // Create match record
      await this.db.query(`
        INSERT INTO matches (
          id,
          period_id,
          confidence,
          match_type,
          date_difference_in_days,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        matchId,
        periodId,
        match.confidence,
        matchType,
        Math.round((new Date(match.bankTx.transaction_date).getTime() - 
                    new Date(match.invoice.firstDate).getTime()) / (1000 * 60 * 60 * 24)),
        JSON.stringify({
          reasons: match.reasons,
          invoiceItems: match.invoice.items.length,
          rules: rules
        })
      ]);

      // Update bank transaction
      await this.db.query(`
        UPDATE transactions
        SET match_status = $1, match_id = $2
        WHERE id = $3
      `, [match.needsReview ? 'partial' : 'matched', matchId, match.bankTx.id]);

      // Update all fuel transactions in invoice
      for (const fuelItem of match.invoice.items) {
        await this.db.query(`
          UPDATE transactions
          SET match_status = $1, match_id = $2
          WHERE id = $3
        `, [match.needsReview ? 'partial' : 'matched', matchId, fuelItem.id]);
      }
    }

    return {
      bankCount: bankTxs.length,
      fuelCount: fuelTxs.length,
      invoiceCount: fuelInvoices.length,
      matchesFound: matches.length,
      autoMatched,
      needsReview,
      matchRate: `${((matches.length / bankTxs.length) * 100).toFixed(1)}%`
    };
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
```

---

## 🎯 API Endpoints

```typescript
// Save matching rules
router.post('/periods/:periodId/matching-rules', async (req, res) => {
  const { periodId } = req.params;
  const rules = req.body;
  const userId = req.user.id;

  const service = new ConfigurableMatchingService(db);
  await service.saveMatchingRules(periodId, rules, userId);

  res.json({ success: true, rules });
});

// Get matching rules
router.get('/periods/:periodId/matching-rules', async (req, res) => {
  const { periodId } = req.params;

  const service = new ConfigurableMatchingService(db);
  const rules = await service.getMatchingRules(periodId);

  res.json(rules);
});

// Run auto-match with configured rules
router.post('/periods/:periodId/auto-match', async (req, res) => {
  const { periodId } = req.params;

  const service = new ConfigurableMatchingService(db);
  const results = await service.autoMatch(periodId);

  res.json(results);
});
```

---

## 🎨 Complete User Workflow

### Step 1: User Uploads Files
```
User: Uploads Fuel Master + Bank files
System: Parses and stores transactions
```

### Step 2: User Configures Matching Rules
```tsx
<MatchingRulesPanel
  periodId={periodId}
  onSave={async (rules) => {
    await api.saveMatchingRules(periodId, rules);
    // Automatically run matching
    const results = await api.autoMatch(periodId);
    showResults(results);
  }}
/>
```

### Step 3: System Shows Results
```tsx
<MatchingResults>
  <Alert severity="success">
    Found {results.matchesFound} matches ({results.matchRate})
    
    • {results.autoMatched} auto-matched (high confidence)
    • {results.needsReview} need manual review (moderate confidence)
  </Alert>

  {results.needsReview > 0 && (
    <Button onClick={() => navigate('/review')}>
      Review {results.needsReview} Matches
    </Button>
  )}
</MatchingResults>
```

### Step 4: User Reviews (If Needed)
```tsx
<MatchReviewWorkspace>
  {partialMatches.map(match => (
    <MatchReviewCard
      match={match}
      onAccept={() => acceptMatch(match.id)}
      onReject={() => rejectMatch(match.id)}
      showDetails={() => showMatchDetails(match)}
    />
  ))}
</MatchReviewWorkspace>
```

---

## 📊 Example Scenarios

### Scenario 1: Conservative Client (High Accuracy)
```javascript
rules = {
  amountTolerance: 0.01,      // ±1 cent
  dateWindowDays: 1,          // Same day or next day
  requireCardMatch: true,     // Must have matching card
  minimumConfidence: 90       // Very high confidence
}

Expected Result:
- Match Rate: 50-70%
- False Positives: Very low
- Manual Review: 20-30%
```

### Scenario 2: Typical Client (Balanced)
```javascript
rules = {
  amountTolerance: 0.10,      // ±10 cents
  dateWindowDays: 3,          // 3-day window
  groupByInvoice: true,       // Group multi-line
  requireCardMatch: false,    // Optional
  minimumConfidence: 70       // Moderate
}

Expected Result:
- Match Rate: 75-90%
- False Positives: Low
- Manual Review: 10-15%
```

### Scenario 3: Aggressive Client (Maximum Matches)
```javascript
rules = {
  amountTolerance: 0.50,      // ±50 cents
  dateWindowDays: 7,          // Full week
  groupByInvoice: true,
  requireCardMatch: false,
  minimumConfidence: 60       // Lower bar
}

Expected Result:
- Match Rate: 85-95%
- False Positives: Moderate
- Manual Review: 20-30%
```

---

## 🎯 Benefits of This Approach

### For Users
✅ **Full Control** - Every client sets their own rules
✅ **Transparency** - See exactly why things matched
✅ **Flexibility** - Adjust rules per period if needed
✅ **Learning** - System suggests based on past choices

### For Development
✅ **No Hardcoding** - Rules stored in database
✅ **Easy Updates** - Change rules without code deploy
✅ **Audit Trail** - Track which rules were used
✅ **A/B Testing** - Compare different rule sets

### For Business
✅ **Scalable** - Each client can have different needs
✅ **Professional** - Shows you understand their processes
✅ **Competitive Advantage** - Flexibility others don't offer

---

## 📚 Documentation for Users

### Help Text for Each Rule

**Amount Tolerance:**
> "How much can the bank and fuel amounts differ and still match? 
> Example: R100.00 (bank) and R100.05 (fuel) will match if tolerance is ±R0.10.
> Common reason for differences: Attendant stops pump at R100.05 when customer wants R100."

**Date Window:**
> "How many days after fuel purchase can the bank transaction post?
> Banks typically take 1-3 days to process card transactions.
> Weekend and holiday transactions may take longer."

**Group by Invoice:**
> "Should multiple fuel items be grouped before matching?
> Example: Customer buys diesel + oil + snacks (3 items) = 1 bank charge.
> RECOMMENDED: Turn this ON unless your fuel system doesn't use invoice numbers."

**Require Card Match:**
> "Only match if card numbers are the same?
> Turn ON if your data has reliable card numbers.
> Turn OFF if card numbers are often missing or incorrect."

---

## 🚀 Implementation Plan

### Week 1: Database & Backend
- [ ] Create `matching_rules` table
- [ ] Implement `ConfigurableMatchingService`
- [ ] Add API endpoints
- [ ] Write tests

### Week 2: Frontend UI
- [ ] Build `MatchingRulesPanel` component
- [ ] Add preset buttons
- [ ] Implement sliders and switches
- [ ] Add help tooltips

### Week 3: Integration & Testing
- [ ] Connect UI to backend
- [ ] Test with real data
- [ ] Fine-tune default rules
- [ ] User acceptance testing

### Week 4: Polish & Deploy
- [ ] Add animations and feedback
- [ ] Write user documentation
- [ ] Deploy to production
- [ ] Monitor results

---

**Status:** Ready to implement
**Priority:** HIGH - This is the core value of your product
**Complexity:** Medium - Well-defined requirements

Would you like me to start implementing any of these components?
