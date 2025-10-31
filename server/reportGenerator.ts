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
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  discrepancy: number;
}

export class ReportGenerator {
  private parseAmount(amount: string): number {
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
  }

  calculateSummary(data: ReportData): ReportSummary {
    const fuelTransactions = data.transactions.filter(t => t.sourceType === 'fuel');
    const bankTransactions = data.transactions.filter(t => t.sourceType === 'bank');
    const matchedTransactions = data.transactions.filter(t => t.matchStatus === 'matched');

    const totalFuelAmount = fuelTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);
    const totalBankAmount = bankTransactions.reduce((sum, t) => sum + this.parseAmount(t.amount), 0);

    return {
      totalTransactions: data.transactions.length,
      fuelTransactions: fuelTransactions.length,
      bankTransactions: bankTransactions.length,
      matchedTransactions: matchedTransactions.length,
      unmatchedTransactions: data.transactions.length - matchedTransactions.length,
      matchRate: data.transactions.length > 0 
        ? (matchedTransactions.length / data.transactions.length) * 100 
        : 0,
      totalFuelAmount,
      totalBankAmount,
      discrepancy: Math.abs(totalFuelAmount - totalBankAmount),
    };
  }

  generatePDF(data: ReportData): Buffer {
    const doc = new jsPDF();
    const summary = this.calculateSummary(data);

    doc.setFontSize(18);
    doc.text('Fuel Station Reconciliation Report', 14, 20);

    doc.setFontSize(12);
    doc.text(`Period: ${data.period.name}`, 14, 30);
    doc.text(`${data.period.startDate} to ${data.period.endDate}`, 14, 37);

    doc.setFontSize(14);
    doc.text('Summary', 14, 50);

    const summaryData = [
      ['Total Transactions', summary.totalTransactions.toString()],
      ['Fuel Transactions', summary.fuelTransactions.toString()],
      ['Bank Transactions', summary.bankTransactions.toString()],
      ['Matched Transactions', summary.matchedTransactions.toString()],
      ['Unmatched Transactions', summary.unmatchedTransactions.toString()],
      ['Match Rate', `${summary.matchRate.toFixed(2)}%`],
      ['Total Fuel Amount', `$${summary.totalFuelAmount.toFixed(2)}`],
      ['Total Bank Amount', `$${summary.totalBankAmount.toFixed(2)}`],
      ['Discrepancy', `$${summary.discrepancy.toFixed(2)}`],
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
        `$${this.parseAmount(t.amount).toFixed(2)}`,
        t.referenceNumber || '-',
        t.description || '-',
      ]);

      autoTable(doc, {
        startY: finalY + 20,
        head: [['Date', 'Source', 'Amount', 'Reference', 'Description']],
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
      ['Fuel Station Reconciliation Report'],
      [`Period: ${data.period.name}`],
      [`${data.period.startDate} to ${data.period.endDate}`],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Transactions', summary.totalTransactions],
      ['Fuel Transactions', summary.fuelTransactions],
      ['Bank Transactions', summary.bankTransactions],
      ['Matched Transactions', summary.matchedTransactions],
      ['Unmatched Transactions', summary.unmatchedTransactions],
      ['Match Rate', `${summary.matchRate.toFixed(2)}%`],
      ['Total Fuel Amount', summary.totalFuelAmount],
      ['Total Bank Amount', summary.totalBankAmount],
      ['Discrepancy', summary.discrepancy],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const allTransactionsData: any[][] = [
      ['Date', 'Source', 'Amount', 'Reference', 'Description', 'Match Status']
    ];
    
    data.transactions.forEach(t => {
      allTransactionsData.push([
        t.transactionDate,
        t.sourceType,
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
        ['Date', 'Source', 'Amount', 'Reference', 'Description']
      ];
      
      unmatchedTransactions.forEach(t => {
        unmatchedData.push([
          t.transactionDate,
          t.sourceType,
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
    
    let csv = 'Fuel Station Reconciliation Report\n';
    csv += `Period: ${data.period.name}\n`;
    csv += `${data.period.startDate} to ${data.period.endDate}\n\n`;
    
    csv += 'Summary\n';
    csv += 'Metric,Value\n';
    csv += `Total Transactions,${summary.totalTransactions}\n`;
    csv += `Fuel Transactions,${summary.fuelTransactions}\n`;
    csv += `Bank Transactions,${summary.bankTransactions}\n`;
    csv += `Matched Transactions,${summary.matchedTransactions}\n`;
    csv += `Unmatched Transactions,${summary.unmatchedTransactions}\n`;
    csv += `Match Rate,${summary.matchRate.toFixed(2)}%\n`;
    csv += `Total Fuel Amount,${summary.totalFuelAmount.toFixed(2)}\n`;
    csv += `Total Bank Amount,${summary.totalBankAmount.toFixed(2)}\n`;
    csv += `Discrepancy,${summary.discrepancy.toFixed(2)}\n\n`;

    csv += 'All Transactions\n';
    csv += 'Date,Source,Amount,Reference,Description,Match Status\n';
    data.transactions.forEach(t => {
      csv += `${t.transactionDate},${t.sourceType},${this.parseAmount(t.amount).toFixed(2)},${t.referenceNumber || ''},${t.description || ''},${t.matchStatus}\n`;
    });

    const unmatchedTransactions = data.transactions.filter(t => t.matchStatus === 'unmatched');
    if (unmatchedTransactions.length > 0) {
      csv += '\nUnmatched Transactions\n';
      csv += 'Date,Source,Amount,Reference,Description\n';
      unmatchedTransactions.forEach(t => {
        csv += `${t.transactionDate},${t.sourceType},${this.parseAmount(t.amount).toFixed(2)},${t.referenceNumber || ''},${t.description || ''}\n`;
      });
    }

    return csv;
  }
}

export const reportGenerator = new ReportGenerator();
