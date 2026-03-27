import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileBarChart, Download, Sparkles, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";

type ConvertState = "idle" | "uploading" | "preview" | "ai-extracting" | "ai-preview";

interface ExtractResult {
  headers: string[];
  rows: Record<string, any>[];
  rowCount: number;
  confidence?: number;
  aiAvailable?: boolean;
}

export default function Convert() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<ConvertState>("idle");
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setFileName(file.name);
    setPdfFile(file);
    setError(null);
    setState("uploading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/convert/parse", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setResult(data);
      setState("preview");
    } catch (err: any) {
      setError(err.message || "Failed to extract data from PDF");
      setState("idle");
    }
  }, []);

  const handleAiExtract = useCallback(async () => {
    if (!pdfFile) return;
    setState("ai-extracting");
    setError(null);

    const formData = new FormData();
    formData.append("file", pdfFile);

    try {
      const res = await fetch("/api/convert/ai-extract", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI extraction failed");
      setResult(data);
      setState("ai-preview");
    } catch (err: any) {
      setError(err.message || "AI extraction failed");
      setState("preview"); // fall back to traditional preview
    }
  }, [pdfFile]);

  const downloadCSV = useCallback(() => {
    if (!result) return;
    const escapeCsv = (val: string) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      result.headers.map(escapeCsv).join(","),
      ...result.rows.map(row => result.headers.map(h => escapeCsv(row[h])).join(","))
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.pdf$/i, "") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [result, fileName]);

  const downloadExcel = useCallback(() => {
    if (!result) return;
    const wsData = [result.headers, ...result.rows.map(row => result.headers.map(h => row[h] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extracted Data");
    XLSX.writeFile(wb, fileName.replace(/\.pdf$/i, "") + ".xlsx");
  }, [result, fileName]);

  const reset = () => {
    setState("idle");
    setResult(null);
    setError(null);
    setFileName("");
    setPdfFile(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const confidenceBadge = (score: number) => {
    if (score >= 80) return { color: "bg-emerald-100 text-emerald-800", label: "High confidence" };
    if (score >= 60) return { color: "bg-amber-100 text-amber-800", label: "Medium confidence" };
    return { color: "bg-red-100 text-red-800", label: "Low confidence" };
  };

  const previewRows = result?.rows.slice(0, 50) ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E3DC] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-[#1A1200]/50 hover:text-[#1A1200] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <FileBarChart className="w-5 h-5 text-[#1A1200]/60" />
            <h1 className="font-heading text-lg font-semibold text-[#1A1200]">PDF Converter</h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Idle: Upload area */}
        {state === "idle" && (
          <div className="max-w-lg mx-auto">
            <p className="text-sm text-[#1A1200]/60 mb-6 text-center">
              Upload a PDF bank statement to extract transaction data as CSV or Excel.
              Review the output before using it in your reconciliation.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                dragOver ? "border-[#1A1200]/40 bg-[#1A1200]/5" : "border-[#E5E3DC] bg-white hover:border-[#1A1200]/20"
              }`}
              onClick={() => document.getElementById("pdf-input")?.click()}
            >
              <Upload className="w-10 h-10 text-[#1A1200]/30 mx-auto mb-3" />
              <p className="font-heading font-semibold text-sm text-[#1A1200] mb-1">
                Drop a PDF here or click to browse
              </p>
              <p className="text-xs text-[#1A1200]/40">PDF files only, up to 50MB</p>
              <input
                id="pdf-input"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Uploading/Parsing */}
        {state === "uploading" && (
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-10 h-10 border-3 border-[#1A1200]/20 border-t-[#1A1200] rounded-full animate-spin mx-auto mb-4" />
            <p className="font-heading font-semibold text-[#1A1200]">Extracting data...</p>
            <p className="text-sm text-[#1A1200]/50 mt-1">{fileName}</p>
          </div>
        )}

        {/* AI Extracting */}
        {state === "ai-extracting" && (
          <div className="max-w-lg mx-auto text-center py-16">
            <Sparkles className="w-10 h-10 text-[#FC6722] mx-auto mb-4 animate-pulse" />
            <p className="font-heading font-semibold text-[#1A1200]">AI is analyzing your document...</p>
            <p className="text-sm text-[#1A1200]/50 mt-1">This may take 10-30 seconds depending on document size</p>
          </div>
        )}

        {/* Preview (traditional or AI) */}
        {(state === "preview" || state === "ai-preview") && result && (
          <div>
            {/* Header bar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-heading font-semibold text-[#1A1200]">
                  {state === "ai-preview" ? "AI Extraction Result" : "Extraction Result"}
                </h2>
                {state === "preview" && result.confidence !== undefined && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${confidenceBadge(result.confidence).color}`}>
                    {confidenceBadge(result.confidence).label} ({result.confidence}%)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#1A1200]/50">
                  {result.rowCount} rows, {result.headers.length} columns
                </span>
              </div>
            </div>

            {/* Low confidence warning + AI button */}
            {state === "preview" && result.confidence !== undefined && result.confidence < 60 && result.aiAvailable && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-amber-800">The extracted data may not be accurate.</p>
                  <p className="text-xs text-amber-600 mt-0.5">Complex PDF layouts can cause data misalignment. Try AI extraction for better results.</p>
                </div>
                <button
                  onClick={handleAiExtract}
                  className="inline-flex items-center gap-2 bg-[#1A1200] text-[#F5EDE6] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-85 transition-opacity"
                >
                  <Sparkles className="w-4 h-4" />
                  Try AI extraction
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Data table */}
            <div className="bg-white rounded-xl border border-[#E5E3DC] overflow-hidden mb-4">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-background sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[#1A1200]/60 w-10">#</th>
                      {result.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-[#1A1200]/60 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-[#E5E3DC]/50 hover:bg-background/50">
                        <td className="px-3 py-2 text-xs text-[#1A1200]/30">{i + 1}</td>
                        {result.headers.map((h, j) => (
                          <td key={j} className="px-3 py-2 text-[#1A1200] whitespace-nowrap max-w-[200px] truncate">
                            {row[h] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.rowCount > 50 && (
                <div className="px-4 py-2 bg-background text-xs text-[#1A1200]/50 text-center border-t border-[#E5E3DC]">
                  Showing 50 of {result.rowCount} rows. Download for full data.
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={downloadCSV}
                className="inline-flex items-center gap-2 bg-[#1A1200] text-[#F5EDE6] px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-85 transition-opacity"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
              <button
                onClick={downloadExcel}
                className="inline-flex items-center gap-2 bg-[#1A1200] text-[#F5EDE6] px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-85 transition-opacity"
              >
                <Download className="w-4 h-4" />
                Download Excel
              </button>

              {state === "preview" && result.confidence !== undefined && result.confidence >= 60 && result.aiAvailable && (
                <button
                  onClick={handleAiExtract}
                  className="inline-flex items-center gap-2 bg-transparent text-[#1A1200] border border-[#E5E3DC] px-4 py-2.5 rounded-lg text-sm hover:bg-background transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Try AI extraction
                </button>
              )}

              <button
                onClick={reset}
                className="inline-flex items-center gap-2 bg-transparent text-[#1A1200]/60 px-4 py-2.5 rounded-lg text-sm hover:text-[#1A1200] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Upload another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
