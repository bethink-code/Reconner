import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Transaction, Match, ReconciliationPeriod } from '@shared/schema';

interface ReportData {
  period: ReconciliationPeriod;
  transactions: Transaction[];
  matches: Match[];
}

interface ReportSummary {
  totalTransactions: number;
  fuelTransactions: number;
  bankTransactions: number;
  matchedTransactions: number;
  matchedPairs: number; // Unique matched pairs (more meaningful for reconciliation)
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  discrepancy: number;
  // Card vs Cash vs Unknown breakdown for fuel transactions
  cardFuelTransactions: number;
  cashFuelTransactions: number;
  unknownFuelTransactions: number;
  cardFuelAmount: number;
  cashFuelAmount: number;
  unknownFuelAmount: number;
  // Match rates
  bankMatchRate: number;   // % of bank transactions that found a fuel match (key metric)
  cardMatchRate: number;   // % of fuel card transactions that found a bank match
  // Match breakdown by date difference (for processing delay analysis)
  matchesSameDay: number;
  matches1Day: number;
  matches2Day: number;
  matches3Day: number;
  // Unmatched transactions
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

    // Card vs Cash breakdown - only 'yes' is a confirmed card transaction
    const cardFuelTransactions = fuelTransactions.filter(t => t.isCardTransaction === 'yes');
    const cashFuelTransactions = fuelTransactions.filter(t => t.isCardTransaction === 'no');
    const unknownFuelTransactions = fuelTransactions.filter(t => t.isCardTransaction === 'unknown');

    const totalFuelAmount = fuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const totalBankAmount = bankTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const cardFuelAmount = cardFuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const cashFuelAmount = cashFuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const unknownFuelAmount = unknownFuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);

    // Bank match rate - what % of bank transactions found a matching fuel transaction
    // This is the key metric since bank is the source of truth
    const matchedBankTransactions = bankTransactions.filter(t => t.matchStatus === 'matched');
    const bankMatchRate = bankTransactions.length > 0
      ? (matchedBankTransactions.length / bankTransactions.length) * 100
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

    // Unmatched transactions
    const unmatchedBank = bankTransactions.filter(t => t.matchStatus !== 'matched');
    const unmatchedCard = cardFuelTransactions.filter(t => t.matchStatus !== 'matched');
    const unmatchedBankAmount = unmatchedBank.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const unmatchedCardAmount = unmatchedCard.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);

    return {
      totalTransactions: data.transactions.length,
      fuelTransactions: fuelTransactions.length,
      bankTransactions: bankTransactions.length,
      matchedTransactions: matchedTransactions.length,
      matchedPairs, // Unique reconciled pairs (more meaningful for reports)
      unmatchedTransactions: data.transactions.length - matchedTransactions.length,
      matchRate: data.transactions.length > 0 
        ? (matchedTransactions.length / data.transactions.length) * 100 
        : 0,
      totalFuelAmount,
      totalBankAmount,
      discrepancy: Math.abs(cardFuelAmount - totalBankAmount), // Compare card fuel to bank
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
      unmatchedBankAmount,
      unmatchedCardTransactions: unmatchedCard.length,
      unmatchedCardAmount,
    };
  }

  generatePDF(data: ReportData): Buffer {
    const doc = new jsPDF();
    const summary = this.calculateSummary(data);

    doc.setFontSize(18);
    doc.text("Pieter's Pomp Stasie Reconner - Report", 14, 20);

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
      ['Bank Transactions', summary.bankTransactions.toString()],
      ['Matched Pairs', summary.matchedPairs.toString()],
      ['  - Same Day', summary.matchesSameDay.toString()],
      ['  - 1 Day Later', summary.matches1Day.toString()],
      ['  - 2 Days Later', summary.matches2Day.toString()],
      ['  - 3 Days Later', summary.matches3Day.toString()],
      ['Bank Match Rate (Source of Truth)', `${summary.bankMatchRate.toFixed(2)}%`],
      ['Card Match Rate (Fuel Side)', `${summary.cardMatchRate.toFixed(2)}%`],
      ['Unmatched Bank Transactions', `${summary.unmatchedBankTransactions} (R ${summary.unmatchedBankAmount.toFixed(2)})`],
      ['Unmatched Card Transactions', `${summary.unmatchedCardTransactions} (R ${summary.unmatchedCardAmount.toFixed(2)})`],
      ['Card Fuel Amount', `R ${summary.cardFuelAmount.toFixed(2)}`],
      ['Cash Fuel Amount', `R ${summary.cashFuelAmount.toFixed(2)}`],
      ['Unknown Fuel Amount', `R ${summary.unknownFuelAmount.toFixed(2)}`],
      ['Total Bank Amount', `R ${summary.totalBankAmount.toFixed(2)}`],
      ['Discrepancy (Card vs Bank)', `R ${summary.discrepancy.toFixed(2)}`],
    ];

    autoTable(doc, {
      startY: 55,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
    });

    const unmatchedTransactions = data.transactions.filter(t => t.matchStatus === 'unmatched');
    
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

    return Buffer.from(doc.output('arraybuffer'));
  }

  generateExcel(data: ReportData): Buffer {
    const wb = XLSX.utils.book_new();
    const summary = this.calculateSummary(data);

    const summaryData = [
      ["Pieter's Pomp Stasie Reconner - Report"],
      [`Period: ${data.period.name}`],
      [`${data.period.startDate} to ${data.period.endDate}`],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Transactions', summary.totalTransactions],
      ['Fuel Transactions (Total)', summary.fuelTransactions],
      ['  - Card Transactions', summary.cardFuelTransactions],
      ['  - Cash Transactions', summary.cashFuelTransactions],
      ['Bank Transactions', summary.bankTransactions],
      ['Matched Pairs', summary.matchedPairs],
      ['Matched Transactions', summary.matchedTransactions],
      ['Card Match Rate', `${summary.cardMatchRate.toFixed(2)}%`],
      ['Card Fuel Amount', summary.cardFuelAmount],
      ['Cash Fuel Amount', summary.cashFuelAmount],
      ['Total Bank Amount', summary.totalBankAmount],
      ['Discrepancy (Card vs Bank)', summary.discrepancy],
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

    const unmatchedTransactions = data.transactions.filter(t => t.matchStatus === 'unmatched');
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

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  generateCSV(data: ReportData): string {
    const summary = this.calculateSummary(data);
    
    let csv = "Pieter's Pomp Stasie Reconner - Report\n";
    csv += `Period: ${data.period.name}\n`;
    csv += `${data.period.startDate} to ${data.period.endDate}\n\n`;
    
    csv += 'Summary\n';
    csv += 'Metric,Value\n';
    csv += `Total Transactions,${summary.totalTransactions}\n`;
    csv += `Fuel Transactions (Total),${summary.fuelTransactions}\n`;
    csv += `  - Card Transactions,${summary.cardFuelTransactions}\n`;
    csv += `  - Cash Transactions,${summary.cashFuelTransactions}\n`;
    csv += `Bank Transactions,${summary.bankTransactions}\n`;
    csv += `Matched Pairs,${summary.matchedPairs}\n`;
    csv += `Matched Transactions,${summary.matchedTransactions}\n`;
    csv += `Card Match Rate,${summary.cardMatchRate.toFixed(2)}%\n`;
    csv += `Card Fuel Amount,${summary.cardFuelAmount.toFixed(2)}\n`;
    csv += `Cash Fuel Amount,${summary.cashFuelAmount.toFixed(2)}\n`;
    csv += `Total Bank Amount,${summary.totalBankAmount.toFixed(2)}\n`;
    csv += `Discrepancy (Card vs Bank),${summary.discrepancy.toFixed(2)}\n\n`;

    csv += 'All Transactions\n';
    csv += 'Date,Source,Payment Type,Amount,Reference,Description,Match Status\n';
    data.transactions.forEach(t => {
      csv += `${t.transactionDate},${t.sourceType},${t.paymentType || ''},${this.parseAmount(t.amount).toFixed(2)},${t.referenceNumber || ''},${t.description || ''},${t.matchStatus}\n`;
    });

    const unmatchedTransactions = data.transactions.filter(t => t.matchStatus === 'unmatched');
    if (unmatchedTransactions.length > 0) {
      csv += '\nUnmatched Transactions\n';
      csv += 'Date,Source,Payment Type,Amount,Reference,Description\n';
      unmatchedTransactions.forEach(t => {
        csv += `${t.transactionDate},${t.sourceType},${t.paymentType || ''},${this.parseAmount(t.amount).toFixed(2)},${t.referenceNumber || ''},${t.description || ''}\n`;
      });
    }

    return csv;
  }
}

export const reportGenerator = new ReportGenerator();
