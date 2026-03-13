import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Transaction, Match, ReconciliationPeriod } from '../shared/schema';

interface ReportData {
  period: ReconciliationPeriod;
  transactions: Transaction[];
  matches: Match[];
}

interface ReportSummary {
  totalTransactions: number;
  fuelTransactions: number;
  bankTransactions: number;
  bankTransactionsMatchable: number;   // Bank transactions within fuel date range
  bankTransactionsUnmatchable: number; // Bank transactions outside fuel date range
  matchedTransactions: number;
  matchedPairs: number; // Unique matched pairs (more meaningful for reconciliation)
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  matchableBankAmount: number;
  unmatchableBankAmount: number;
  discrepancy: number;
  // Card vs Cash vs Unknown breakdown for fuel transactions
  cardFuelTransactions: number;
  cashFuelTransactions: number;
  unknownFuelTransactions: number;
  cardFuelAmount: number;
  cashFuelAmount: number;
  unknownFuelAmount: number;
  // Match rates
  bankMatchRate: number;   // % of MATCHABLE bank transactions that found a fuel match (key metric)
  cardMatchRate: number;   // % of fuel card transactions that found a bank match
  // Match breakdown by date difference (for processing delay analysis)
  matchesSameDay: number;
  matches1Day: number;
  matches2Day: number;
  matches3Day: number;
  // Unmatched transactions (within date range but not matched)
  unmatchedBankTransactions: number;
  unmatchedBankAmount: number;
  unmatchedCardTransactions: number;
  unmatchedCardAmount: number;
}

export class ReportGenerator {
  private parseAmount(amount: string): number {
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
  }

  calculateSummary(data: ReportData): ReportSummary {
    const fuelTransactions = data.transactions.filter(t => t.sourceType === 'fuel');
    // Check for any sourceType starting with 'bank' (bank, bank2, bank_account, etc.)
    const bankTransactions = data.transactions.filter(t => t.sourceType && t.sourceType.startsWith('bank'));
    const matchedTransactions = data.transactions.filter(t => t.matchStatus === 'matched');

    // Separate matchable vs unmatchable bank transactions
    // 'unmatchable' = outside fuel date range, cannot be matched
    // Matchable statuses are: 'matched', 'unmatched', 'partial', or null/undefined (pending)
    const unmatchableBankTransactions = bankTransactions.filter(t => t.matchStatus === 'unmatchable');
    const matchableBankTransactions = bankTransactions.filter(t => 
      t.matchStatus === 'matched' || 
      t.matchStatus === 'unmatched' || 
      t.matchStatus === 'partial' ||
      !t.matchStatus // null/undefined = pending, still matchable
    );

    // Card vs Cash breakdown - only 'yes' is a confirmed card transaction
    const cardFuelTransactions = fuelTransactions.filter(t => t.isCardTransaction === 'yes');
    const cashFuelTransactions = fuelTransactions.filter(t => t.isCardTransaction === 'no');
    const unknownFuelTransactions = fuelTransactions.filter(t => t.isCardTransaction === 'unknown');

    const totalFuelAmount = fuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const totalBankAmount = bankTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const matchableBankAmount = matchableBankTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const unmatchableBankAmount = unmatchableBankTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const cardFuelAmount = cardFuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const cashFuelAmount = cashFuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const unknownFuelAmount = unknownFuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);

    // Bank match rate - what % of MATCHABLE bank transactions found a matching fuel transaction
    // Uses matchable transactions (excludes those outside fuel date range)
    const matchedBankTransactions = matchableBankTransactions.filter(t => t.matchStatus === 'matched');
    const bankMatchRate = matchableBankTransactions.length > 0
      ? (matchedBankTransactions.length / matchableBankTransactions.length) * 100
      : 0;

    // Card match rate - what % of fuel card transactions found a bank match
    const matchedCardFuel = cardFuelTransactions.filter(t => t.matchStatus === 'matched');
    const cardMatchRate = cardFuelTransactions.length > 0 
      ? (matchedCardFuel.length / cardFuelTransactions.length) * 100 
      : 0;

    // Matched pairs = number of unique matches (each match links 2 transactions)
    const matchedPairs = data.matches.length;

    // Calculate match breakdown by date difference
    // Build a map of transaction IDs to transactions for quick lookup
    const txMap = new Map(data.transactions.map(t => [t.id, t]));
    
    let matchesSameDay = 0;
    let matches1Day = 0;
    let matches2Day = 0;
    let matches3Day = 0;

    for (const match of data.matches) {
      const fuelTx = txMap.get(match.fuelTransactionId);
      const bankTx = txMap.get(match.bankTransactionId);
      
      if (fuelTx && bankTx && fuelTx.transactionDate && bankTx.transactionDate) {
        const fuelDate = new Date(fuelTx.transactionDate);
        const bankDate = new Date(bankTx.transactionDate);
        const diffDays = Math.abs(Math.round((bankDate.getTime() - fuelDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        if (diffDays === 0) matchesSameDay++;
        else if (diffDays === 1) matches1Day++;
        else if (diffDays === 2) matches2Day++;
        else matches3Day++;
      }
    }

    // Unmatched transactions (within date range, not matched, exclude zero-value)
    // Note: 'unmatched' means within date range but not matched yet
    // 'unmatchable' means outside fuel date range
    const unmatchedBank = matchableBankTransactions.filter(t => 
      t.matchStatus === 'unmatched' && this.parseAmount(t.amount) > 0
    );
    const unmatchedCard = cardFuelTransactions.filter(t => 
      t.matchStatus !== 'matched' && this.parseAmount(t.amount) > 0
    );
    const unmatchedBankAmountCalc = unmatchedBank.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const unmatchedCardAmount = unmatchedCard.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);

    // Calculate unmatched count excluding unmatchable (they shouldn't count as failures)
    const unmatchableTransactions = data.transactions.filter(t => t.matchStatus === 'unmatchable');
    const trulyUnmatched = data.transactions.length - matchedTransactions.length - unmatchableTransactions.length;

    return {
      totalTransactions: data.transactions.length,
      fuelTransactions: fuelTransactions.length,
      bankTransactions: bankTransactions.length,
      bankTransactionsMatchable: matchableBankTransactions.length,
      bankTransactionsUnmatchable: unmatchableBankTransactions.length,
      matchedTransactions: matchedTransactions.length,
      matchedPairs, // Unique reconciled pairs (more meaningful for reports)
      unmatchedTransactions: trulyUnmatched, // Excludes unmatchable (those shouldn't count as failures)
      matchRate: (data.transactions.length - unmatchableTransactions.length) > 0 
        ? (matchedTransactions.length / (data.transactions.length - unmatchableTransactions.length)) * 100 
        : 0,
      totalFuelAmount,
      totalBankAmount,
      matchableBankAmount,
      unmatchableBankAmount,
      discrepancy: Math.abs(cardFuelAmount - matchableBankAmount), // Compare card fuel to matchable bank
      cardFuelTransactions: cardFuelTransactions.length,
      cashFuelTransactions: cashFuelTransactions.length,
      unknownFuelTransactions: unknownFuelTransactions.length,
      cardFuelAmount,
      cashFuelAmount,
      unknownFuelAmount,
      bankMatchRate,
      cardMatchRate,
      matchesSameDay,
      matches1Day,
      matches2Day,
      matches3Day,
      unmatchedBankTransactions: unmatchedBank.length,
      unmatchedBankAmount: unmatchedBankAmountCalc,
      unmatchedCardTransactions: unmatchedCard.length,
      unmatchedCardAmount,
    };
  }

  generatePDF(data: ReportData): Buffer {
    const doc = new jsPDF();
    const summary = this.calculateSummary(data);

    doc.setFontSize(18);
    doc.text("Reconciliation Report", 14, 20);

    doc.setFontSize(12);
    doc.text(`Period: ${data.period.name}`, 14, 30);
    doc.text(`${data.period.startDate} to ${data.period.endDate}`, 14, 37);

    doc.setFontSize(14);
    doc.text('Summary', 14, 50);

    const summaryData = [
      ['Total Transactions', summary.totalTransactions.toString()],
      ['Fuel Transactions (Total)', summary.fuelTransactions.toString()],
      ['  - Card Transactions', summary.cardFuelTransactions.toString()],
      ['  - Cash Transactions', summary.cashFuelTransactions.toString()],
      ['  - Unknown Type', summary.unknownFuelTransactions.toString()],
      ['Bank Transactions (Total)', summary.bankTransactions.toString()],
      ['  - Matchable (within date range)', summary.bankTransactionsMatchable.toString()],
      ['  - Unmatchable (outside date range)', `${summary.bankTransactionsUnmatchable} (R ${summary.unmatchableBankAmount.toFixed(2)})`],
      ['Matched Pairs', summary.matchedPairs.toString()],
      ['  - Same Day', summary.matchesSameDay.toString()],
      ['  - 1 Day Later', summary.matches1Day.toString()],
      ['  - 2 Days Later', summary.matches2Day.toString()],
      ['  - 3 Days Later', summary.matches3Day.toString()],
      ['Bank Match Rate (of matchable)', `${summary.bankMatchRate.toFixed(2)}%`],
      ['Card Match Rate (Fuel Side)', `${summary.cardMatchRate.toFixed(2)}%`],
      ['Unmatched Bank Transactions', `${summary.unmatchedBankTransactions} (R ${summary.unmatchedBankAmount.toFixed(2)})`],
      ['Unmatched Card Transactions', `${summary.unmatchedCardTransactions} (R ${summary.unmatchedCardAmount.toFixed(2)})`],
      ['Card Fuel Amount', `R ${summary.cardFuelAmount.toFixed(2)}`],
      ['Cash Fuel Amount', `R ${summary.cashFuelAmount.toFixed(2)}`],
      ['Unknown Fuel Amount', `R ${summary.unknownFuelAmount.toFixed(2)}`],
      ['Total Bank Amount', `R ${summary.totalBankAmount.toFixed(2)}`],
      ['Matchable Bank Amount', `R ${summary.matchableBankAmount.toFixed(2)}`],
      ['Discrepancy (Card vs Matchable Bank)', `R ${summary.discrepancy.toFixed(2)}`],
    ];

    autoTable(doc, {
      startY: 55,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
    });

    // Filter out zero-value transactions from unmatched list
    const unmatchedTransactions = data.transactions.filter(t => 
      t.matchStatus === 'unmatched' && this.parseAmount(t.amount) > 0
    );
    
    if (unmatchedTransactions.length > 0) {
      const finalY = (doc as any).lastAutoTable.finalY || 140;
      
      doc.setFontSize(14);
      doc.text('Unmatched Transactions', 14, finalY + 15);

      const unmatchedData = unmatchedTransactions.map(t => [
        t.transactionDate,
        t.sourceType,
        t.paymentType || '-',
        `R ${this.parseAmount(t.amount).toFixed(2)}`,
        t.referenceNumber || '-',
        t.description || '-',
      ]);

      autoTable(doc, {
        startY: finalY + 20,
        head: [['Date', 'Source', 'Payment Type', 'Amount', 'Reference', 'Description']],
        body: unmatchedData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: 8 },
      });
    }

    // Missing Fuel Records — bank transactions with no matching fuel sale
    const missingFuelRecords = data.transactions.filter(t =>
      t.sourceType?.startsWith('bank') &&
      t.matchStatus === 'unmatched' &&
      this.parseAmount(t.amount) > 0
    );
    if (missingFuelRecords.length > 0) {
      const prevY = (doc as any).lastAutoTable?.finalY || 140;
      if (prevY > 250) doc.addPage();
      const startY = prevY > 250 ? 20 : prevY + 15;

      doc.setFontSize(14);
      doc.text('Missing Fuel Records (Bank tx with no fuel match)', 14, startY);

      const missingData = missingFuelRecords
        .sort((a, b) => (a.transactionDate || '').localeCompare(b.transactionDate || ''))
        .map(t => [
          t.transactionDate,
          t.sourceName || t.sourceType,
          `R ${this.parseAmount(t.amount).toFixed(2)}`,
          t.cardNumber || '-',
          t.referenceNumber || '-',
          t.description || '-',
        ]);

      autoTable(doc, {
        startY: startY + 5,
        head: [['Date', 'Bank', 'Amount', 'Card', 'Reference', 'Description']],
        body: missingData,
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: 8 },
      });
    }

    return Buffer.from(doc.output('arraybuffer'));
  }

  generateExcel(data: ReportData): Buffer {
    const wb = XLSX.utils.book_new();
    const summary = this.calculateSummary(data);

    const summaryData = [
      ["Reconciliation Report"],
      [`Period: ${data.period.name}`],
      [`${data.period.startDate} to ${data.period.endDate}`],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Transactions', summary.totalTransactions],
      ['Fuel Transactions (Total)', summary.fuelTransactions],
      ['  - Card Transactions', summary.cardFuelTransactions],
      ['  - Cash Transactions', summary.cashFuelTransactions],
      ['Bank Transactions (Total)', summary.bankTransactions],
      ['  - Matchable (within date range)', summary.bankTransactionsMatchable],
      ['  - Unmatchable (outside date range)', summary.bankTransactionsUnmatchable],
      ['Matched Pairs', summary.matchedPairs],
      ['Matched Transactions', summary.matchedTransactions],
      ['Bank Match Rate (of matchable)', `${summary.bankMatchRate.toFixed(2)}%`],
      ['Card Match Rate', `${summary.cardMatchRate.toFixed(2)}%`],
      ['Card Fuel Amount', summary.cardFuelAmount],
      ['Cash Fuel Amount', summary.cashFuelAmount],
      ['Total Bank Amount', summary.totalBankAmount],
      ['Matchable Bank Amount', summary.matchableBankAmount],
      ['Unmatchable Bank Amount', summary.unmatchableBankAmount],
      ['Discrepancy (Card vs Matchable Bank)', summary.discrepancy],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const allTransactionsData: any[][] = [
      ['Date', 'Source', 'Payment Type', 'Amount', 'Reference', 'Description', 'Match Status']
    ];
    
    data.transactions.forEach(t => {
      allTransactionsData.push([
        t.transactionDate,
        t.sourceType,
        t.paymentType || '',
        this.parseAmount(t.amount),
        t.referenceNumber || '',
        t.description || '',
        t.matchStatus,
      ]);
    });

    const wsAllTransactions = XLSX.utils.aoa_to_sheet(allTransactionsData);
    XLSX.utils.book_append_sheet(wb, wsAllTransactions, 'All Transactions');

    // Filter out zero-value transactions from unmatched list
    const unmatchedTransactions = data.transactions.filter(t => 
      t.matchStatus === 'unmatched' && this.parseAmount(t.amount) > 0
    );
    if (unmatchedTransactions.length > 0) {
      const unmatchedData: any[][] = [
        ['Date', 'Source', 'Payment Type', 'Amount', 'Reference', 'Description']
      ];
      
      unmatchedTransactions.forEach(t => {
        unmatchedData.push([
          t.transactionDate,
          t.sourceType,
          t.paymentType || '',
          this.parseAmount(t.amount),
          t.referenceNumber || '',
          t.description || '',
        ]);
      });

      const wsUnmatched = XLSX.utils.aoa_to_sheet(unmatchedData);
      XLSX.utils.book_append_sheet(wb, wsUnmatched, 'Unmatched');
    }

    // Missing Fuel Records — bank transactions that have no matching fuel sale
    const missingFuelRecords = data.transactions.filter(t =>
      t.sourceType?.startsWith('bank') &&
      t.matchStatus === 'unmatched' &&
      this.parseAmount(t.amount) > 0
    );
    if (missingFuelRecords.length > 0) {
      const missingFuelData: any[][] = [
        ['Date', 'Bank', 'Amount', 'Card Number', 'Reference', 'Description']
      ];
      const totalMissing = missingFuelRecords.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);

      missingFuelRecords
        .sort((a, b) => (a.transactionDate || '').localeCompare(b.transactionDate || ''))
        .forEach(t => {
          missingFuelData.push([
            t.transactionDate,
            t.sourceName || t.sourceType,
            this.parseAmount(t.amount),
            t.cardNumber || '',
            t.referenceNumber || '',
            t.description || '',
          ]);
        });

      missingFuelData.push([]);
      missingFuelData.push(['Total', '', totalMissing, '', '', `${missingFuelRecords.length} transactions`]);

      const wsMissing = XLSX.utils.aoa_to_sheet(missingFuelData);
      XLSX.utils.book_append_sheet(wb, wsMissing, 'Missing Fuel Records');
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  generateCSV(data: ReportData): string {
    const summary = this.calculateSummary(data);
    const lines: string[] = [];

    lines.push('Reconciliation Report');
    lines.push(`Period: ${data.period.name}`);
    lines.push(`${data.period.startDate} to ${data.period.endDate}`, '');
    lines.push('Summary');
    lines.push('Metric,Value');
    lines.push(`Total Transactions,${summary.totalTransactions}`);
    lines.push(`Fuel Transactions (Total),${summary.fuelTransactions}`);
    lines.push(`  - Card Transactions,${summary.cardFuelTransactions}`);
    lines.push(`  - Cash Transactions,${summary.cashFuelTransactions}`);
    lines.push(`Bank Transactions (Total),${summary.bankTransactions}`);
    lines.push(`  - Matchable (within date range),${summary.bankTransactionsMatchable}`);
    lines.push(`  - Unmatchable (outside date range),${summary.bankTransactionsUnmatchable}`);
    lines.push(`Matched Pairs,${summary.matchedPairs}`);
    lines.push(`Matched Transactions,${summary.matchedTransactions}`);
    lines.push(`Bank Match Rate (of matchable),${summary.bankMatchRate.toFixed(2)}%`);
    lines.push(`Card Match Rate,${summary.cardMatchRate.toFixed(2)}%`);
    lines.push(`Card Fuel Amount,${summary.cardFuelAmount.toFixed(2)}`);
    lines.push(`Cash Fuel Amount,${summary.cashFuelAmount.toFixed(2)}`);
    lines.push(`Total Bank Amount,${summary.totalBankAmount.toFixed(2)}`);
    lines.push(`Matchable Bank Amount,${summary.matchableBankAmount.toFixed(2)}`);
    lines.push(`Unmatchable Bank Amount,${summary.unmatchableBankAmount.toFixed(2)}`);
    lines.push(`Discrepancy (Card vs Matchable Bank),${summary.discrepancy.toFixed(2)}`, '');

    lines.push('All Transactions');
    lines.push('Date,Source,Payment Type,Amount,Reference,Description,Match Status');
    for (const t of data.transactions) {
      lines.push(`${t.transactionDate},${t.sourceType},${t.paymentType || ''},${this.parseAmount(t.amount).toFixed(2)},${t.referenceNumber || ''},${t.description || ''},${t.matchStatus}`);
    }

    const unmatchedTransactions = data.transactions.filter(t => t.matchStatus === 'unmatched');
    if (unmatchedTransactions.length > 0) {
      lines.push('', 'Unmatched Transactions (within date range)');
      lines.push('Date,Source,Payment Type,Amount,Reference,Description');
      for (const t of unmatchedTransactions) {
        lines.push(`${t.transactionDate},${t.sourceType},${t.paymentType || ''},${this.parseAmount(t.amount).toFixed(2)},${t.referenceNumber || ''},${t.description || ''}`);
      }
    }

    const unmatchableTransactions = data.transactions.filter(t => t.matchStatus === 'unmatchable');
    if (unmatchableTransactions.length > 0) {
      lines.push('', 'Unmatchable Transactions (outside fuel date range)');
      lines.push('Date,Source,Payment Type,Amount,Reference,Description');
      for (const t of unmatchableTransactions) {
        lines.push(`${t.transactionDate},${t.sourceType},${t.paymentType || ''},${this.parseAmount(t.amount).toFixed(2)},${t.referenceNumber || ''},${t.description || ''}`);
      }
    }

    const missingFuelRecords = data.transactions.filter(t =>
      t.sourceType?.startsWith('bank') &&
      t.matchStatus === 'unmatched' &&
      this.parseAmount(t.amount) > 0
    );
    if (missingFuelRecords.length > 0) {
      lines.push('', 'Missing Fuel Records (Bank transactions with no fuel match)');
      lines.push('Date,Bank,Amount,Card Number,Reference,Description');
      for (const t of missingFuelRecords) {
        lines.push(`${t.transactionDate},${t.sourceName || t.sourceType},${this.parseAmount(t.amount).toFixed(2)},${t.cardNumber || ''},${t.referenceNumber || ''},${t.description || ''}`);
      }
    }

    return lines.join('\n');
  }
}

export const reportGenerator = new ReportGenerator();
