import { useState, useCallback, useEffect, useMemo } from "react";
import { useDataStore } from "../../../store/dataStore";
import api from "../../../services/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  BarChart3, 
  FileDown, 
  IndianRupee, 
  ShoppingCart, 
  FileText, 
  Warehouse, 
  AlertTriangle, 
  Calendar,
  Clock,
  Activity,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

export default function Reports() {
  const [activeTab, setActiveTab] = useState("sales");

  // Date Range (default: last 30 days)
  const todayStr = new Date().toISOString().split("T")[0];
  const defaultStartStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(defaultStartStr);
  const [endDate, setEndDate] = useState(todayStr);

  // Applied date params — only updated when user clicks "Generate"
  const [appliedStart, setAppliedStart] = useState(defaultStartStr);
  const [appliedEnd, setAppliedEnd] = useState(todayStr);

  // ── Read from Zustand store (survives module navigation) ──────────────────
  const {
    reports,
    fetchSalesReport,
    fetchPurchaseReport,
    fetchInventoryReport,
    selectedBranchId,
  } = useDataStore();

  const [storeSettings, setStoreSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const params: any = {};
        if (selectedBranchId !== undefined) {
          params.branch_id = selectedBranchId;
        }
        const res = await api.get("/settings/", { params });
        setStoreSettings(res.data);
      } catch (e) {
        console.error("Failed to fetch settings in Reports", e);
      }
    };
    fetchSettings();
  }, [selectedBranchId]);

  const loadLogo = (): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = "/logo.png";
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
    });
  };

  const {
    salesReport,
    purchaseReport,
    inventoryReport,
    salesLoading,
    purchasesLoading,
    inventoryLoading,
  } = reports;

  // ── Sales Report Pagination States ────────────────────────────
  const [salesPage, setSalesPage] = useState<number>(1);
  const [salesRowsPerPage, setSalesRowsPerPage] = useState<number>(10);

  const salesList = useMemo(() => {
    return reports.salesReport?.daily_summary || [];
  }, [reports.salesReport]);

  const salesTotalPages = Math.max(1, Math.ceil(salesList.length / salesRowsPerPage));
  const currentSalesPage = Math.min(salesPage, salesTotalPages);
  const paginatedSales = useMemo(() => {
    const start = (currentSalesPage - 1) * salesRowsPerPage;
    return salesList.slice(start, start + salesRowsPerPage);
  }, [salesList, currentSalesPage, salesRowsPerPage]);

  // ── Purchase Report Pagination States ─────────────────────────
  const [purchasePage, setPurchasePage] = useState<number>(1);
  const [purchaseRowsPerPage, setPurchaseRowsPerPage] = useState<number>(10);

  const purchaseList = useMemo(() => {
    return reports.purchaseReport?.daily_summary || [];
  }, [reports.purchaseReport]);

  const purchaseTotalPages = Math.max(1, Math.ceil(purchaseList.length / purchaseRowsPerPage));
  const currentPurchasePage = Math.min(purchasePage, purchaseTotalPages);
  const paginatedPurchases = useMemo(() => {
    const start = (currentPurchasePage - 1) * purchaseRowsPerPage;
    return purchaseList.slice(start, start + purchaseRowsPerPage);
  }, [purchaseList, currentPurchasePage, purchaseRowsPerPage]);

  // ── Inventory Alert Filters & Pagination States ────────────────────────────
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [customLowStockInput, setCustomLowStockInput] = useState<string>("10");
  const [isCustomLowStock, setIsCustomLowStock] = useState<boolean>(false);
  const [lowStockPage, setLowStockPage] = useState<number>(1);
  const [lowStockRowsPerPage, setLowStockRowsPerPage] = useState<number>(10);

  const [expiryDays, setExpiryDays] = useState<number>(30);
  const [customExpiryInput, setCustomExpiryInput] = useState<string>("30");
  const [isCustomExpiry, setIsCustomExpiry] = useState<boolean>(false);
  const [expiringPage, setExpiringPage] = useState<number>(1);
  const [expiringRowsPerPage, setExpiringRowsPerPage] = useState<number>(10);

  const filteredLowStock = useMemo(() => {
    if (!inventoryReport) return [];
    const source = inventoryReport.all_batches || inventoryReport.low_stock_items || [];
    return [...source]
      .filter((item: any) => Number(item.quantity_available ?? 0) <= lowStockThreshold)
      .sort((a: any, b: any) => Number(a.quantity_available ?? 0) - Number(b.quantity_available ?? 0));
  }, [inventoryReport, lowStockThreshold]);

  const filteredExpiring = useMemo(() => {
    if (!inventoryReport) return [];
    const source = inventoryReport.all_batches || inventoryReport.expiring_soon_items || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + expiryDays);
    maxDate.setHours(23, 59, 59, 999);

    return [...source]
      .filter((item: any) => {
        if (!item.expiry_date) return false;
        const exp = new Date(item.expiry_date);
        exp.setHours(0, 0, 0, 0);
        return exp >= today && exp <= maxDate;
      })
      .sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
  }, [inventoryReport, expiryDays]);

  const lowStockTotalPages = Math.max(1, Math.ceil(filteredLowStock.length / lowStockRowsPerPage));
  const currentLowStockPage = Math.min(lowStockPage, lowStockTotalPages);
  const paginatedLowStock = useMemo(() => {
    const start = (currentLowStockPage - 1) * lowStockRowsPerPage;
    return filteredLowStock.slice(start, start + lowStockRowsPerPage);
  }, [filteredLowStock, currentLowStockPage, lowStockRowsPerPage]);

  const expiringTotalPages = Math.max(1, Math.ceil(filteredExpiring.length / expiringRowsPerPage));
  const currentExpiringPage = Math.min(expiringPage, expiringTotalPages);
  const paginatedExpiring = useMemo(() => {
    const start = (currentExpiringPage - 1) * expiringRowsPerPage;
    return filteredExpiring.slice(start, start + expiringRowsPerPage);
  }, [filteredExpiring, currentExpiringPage, expiringRowsPerPage]);

  const getDaysUntilExpiry = (expiryDateStr: string) => {
    if (!expiryDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDateStr);
    exp.setHours(0, 0, 0, 0);
    const diffTime = exp.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Auto-fetch on first mount
  const triggerFetch = useCallback(() => {
    fetchSalesReport(appliedStart, appliedEnd);
    fetchPurchaseReport(appliedStart, appliedEnd);
    fetchInventoryReport();
  }, [appliedStart, appliedEnd, fetchSalesReport, fetchPurchaseReport, fetchInventoryReport]);

  useEffect(() => {
    triggerFetch();
  }, [triggerFetch]);

  useEffect(() => {
    if (activeTab === "sales" && !salesReport && !salesLoading) {
      fetchSalesReport(appliedStart, appliedEnd);
    } else if (activeTab === "purchases" && !purchaseReport && !purchasesLoading) {
      fetchPurchaseReport(appliedStart, appliedEnd);
    } else if (activeTab === "inventory" && !inventoryReport && !inventoryLoading) {
      fetchInventoryReport();
    }
  }, [activeTab, salesReport, purchaseReport, inventoryReport, salesLoading, purchasesLoading, inventoryLoading, appliedStart, appliedEnd, fetchSalesReport, fetchPurchaseReport, fetchInventoryReport]);

  const loading =
    activeTab === "sales" ? salesLoading :
    activeTab === "purchases" ? purchasesLoading :
    inventoryLoading;

  const handleGenerate = useCallback(() => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    if (activeTab === "sales") {
      setSalesPage(1);
      fetchSalesReport(startDate, endDate, true);
    } else if (activeTab === "purchases") {
      setPurchasePage(1);
      fetchPurchaseReport(startDate, endDate, true);
    } else {
      fetchInventoryReport(true);
    }
  }, [activeTab, startDate, endDate, fetchSalesReport, fetchPurchaseReport, fetchInventoryReport]);

  // PDF Generators
  // PDF Helpers & Styling
  const drawDefaultReportHeader = async (doc: jsPDF, badgeText: string) => {
    // Top Accent Bar (Indigo #4338CA)
    doc.setFillColor(67, 56, 202);
    doc.rect(14, 15, 182, 3, "F");

    let textXOffset = 14;
    try {
      const logoImg = await loadLogo();
      doc.addImage(logoImg, "JPEG", 14, 22, 12, 12, undefined, "FAST");
      textXOffset = 28;
    } catch (e) {
      console.error("Failed to load logo.png, printing without it", e);
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(67, 56, 202); // #4338CA (Indigo)
    doc.text("Med-X Pharmacy", textXOffset, 31);

    // Subtitle / Branch Metadata
    const branchAddress = storeSettings?.address || "Jaipur, Rajasthan";
    const branchPhone = storeSettings?.phone || "";
    const branchEmail = storeSettings?.email || "medxpharmacy7170@gmail.com";
    const printGstinEnabled = storeSettings?.print_gstin ?? true;
    let branchGstin = "";
    if (printGstinEnabled && storeSettings?.gstin) {
      branchGstin = `GSTIN: ${storeSettings.gstin}`;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(branchAddress, textXOffset, 37);
    
    let contactLine = `Contact: ${branchPhone} | ${branchEmail}`;
    if (branchGstin) {
      contactLine += ` | ${branchGstin}`;
    }
    doc.text(contactLine, textXOffset, 42);

    // Badge Label (on the right)
    doc.setFillColor(67, 56, 202);
    doc.rect(130, 22, 66, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, 133, 27.5);

    // Thin dividing line
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.line(14, 46, 196, 46);
  };

  const exportSalesReportPDF = async () => {
    if (!salesReport) return;
    const doc = new jsPDF({ compress: true });
    
    await drawDefaultReportHeader(doc, "SALES SUMMARY REPORT");

    // Print metadata about report period
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(`REPORT PERIOD: ${appliedStart} to ${appliedEnd}`, 14, 53);
    doc.text(`GENERATED: ${new Date().toLocaleString()}`, 110, 53);

    const pm = salesReport.payment_methods || {};

    // Summary Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.rect(14, 58, 182, 26, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Total Revenue: Rs ${Number(salesReport.total_revenue ?? 0).toFixed(2)}`, 18, 64);
    doc.text(`Total Tax Collected: Rs ${Number(salesReport.total_tax ?? 0).toFixed(2)}`, 18, 71);
    doc.text(`Total Invoices: ${salesReport.total_invoices ?? 0}`, 18, 78);

    doc.text("Payment Breakdown:", 120, 64);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`- Cash: Rs ${Number(pm.Cash ?? 0).toFixed(2)}`, 120, 70);
    doc.text(`- UPI: Rs ${Number(pm.UPI ?? 0).toFixed(2)}`, 120, 75);
    doc.text(`- Card: Rs ${Number(pm.Card ?? 0).toFixed(2)}`, 120, 80);

    const headers = [["Date", "Invoices", "Subtotal", "Tax Collected", "Grand Total"]];
    const rows = salesReport.daily_summary.map((day: any) => [
      day.date,
      day.invoice_count,
      `Rs ${Number(day.subtotal ?? 0).toFixed(2)}`,
      `Rs ${Number(day.tax ?? 0).toFixed(2)}`,
      `Rs ${Number(day.grand_total ?? 0).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 90,
      head: headers,
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [67, 56, 202] }, // Match indigo
      styles: { fontSize: 8.5 },
    });

    doc.save(`Sales_Report_${appliedStart}_to_${appliedEnd}.pdf`);
  };

  const exportPurchaseReportPDF = async () => {
    if (!purchaseReport) return;
    const doc = new jsPDF({ compress: true });
    
    await drawDefaultReportHeader(doc, "PURCHASE EXPENSE REPORT");

    // Print metadata about report period
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(`REPORT PERIOD: ${appliedStart} to ${appliedEnd}`, 14, 53);
    doc.text(`GENERATED: ${new Date().toLocaleString()}`, 110, 53);

    // Summary Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.rect(14, 58, 182, 22, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Total Expenses: Rs ${Number(purchaseReport.total_expense ?? 0).toFixed(2)}`, 18, 64);
    doc.text(`Total Purchases: ${purchaseReport.total_purchases}`, 18, 71);
    doc.text(`Total Tax Paid: Rs ${Number(purchaseReport.total_tax ?? 0).toFixed(2)}`, 120, 64);

    const headers = [["Date", "Purchases Count", "Grand Total"]];
    const rows = purchaseReport.daily_summary.map((day: any) => [
      day.date,
      day.purchase_count,
      `Rs ${Number(day.grand_total ?? 0).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 86,
      head: headers,
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [67, 56, 202] }, // Match indigo
      styles: { fontSize: 8.5 },
    });

    doc.save(`Purchase_Report_${appliedStart}_to_${appliedEnd}.pdf`);
  };

  const exportInventoryReportPDF = async () => {
    if (!inventoryReport) return;
    const doc = new jsPDF({ compress: true });
    
    await drawDefaultReportHeader(doc, "INVENTORY VALUATION");

    // Print metadata about generation time
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(`GENERATED: ${new Date().toLocaleString()}`, 14, 53);

    // Summary Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.rect(14, 58, 182, 26, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Total Unique Products: ${inventoryReport.total_products}`, 18, 64);
    doc.text(`Total Active Batches: ${inventoryReport.total_batches}`, 18, 71);
    doc.text(`Total Stock Quantity: ${inventoryReport.total_stock_qty}`, 18, 78);

    doc.text("Valuation Summary:", 120, 64);
    doc.setFont("helvetica", "normal");
    doc.text(`- Cost Price: Rs ${Number(inventoryReport.valuation_purchase ?? 0).toFixed(2)}`, 120, 70);
    doc.text(`- Selling Price: Rs ${Number(inventoryReport.valuation_selling ?? 0).toFixed(2)}`, 120, 75);
    doc.text(`- MRP Price: Rs ${Number(inventoryReport.valuation_mrp ?? 0).toFixed(2)}`, 120, 80);
    if (inventoryReport.potential_profit !== undefined) {
      doc.text(`- Est. Profit: Rs ${Number(inventoryReport.potential_profit ?? 0).toFixed(2)} (${Number(inventoryReport.profit_margin_pct ?? 0).toFixed(1)}%)`, 120, 85);
    }

    // Low Stock Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(217, 119, 6); // amber-600
    doc.text(`Low Stock Items (<= ${lowStockThreshold} qty)`, 14, 93);
    
    const lowStockHeaders = [["Product", "Batch", "Qty Left", "MRP", "Selling Price"]];
    const lowStockRows = filteredLowStock.map((item: any) => [
      item.product_name,
      item.batch_number,
      item.quantity_available,
      `Rs ${item.mrp}`,
      `Rs ${item.selling_price}`
    ]);

    autoTable(doc, {
      startY: 97,
      head: lowStockHeaders,
      body: lowStockRows,
      theme: "grid",
      headStyles: { fillColor: [217, 119, 6] },
      styles: { fontSize: 8 },
    });

    // Expiring Soon Table
    const nextY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38); // red-600
    doc.text(`Expiring Soon Items (within ${expiryDays} days)`, 14, nextY);

    const expiringHeaders = [["Product", "Batch", "Expiry Date", "Qty Left", "MRP"]];
    const expiringRows = filteredExpiring.map((item: any) => [
      item.product_name,
      item.batch_number,
      item.expiry_date,
      item.quantity_available,
      `Rs ${item.mrp}`
    ]);

    autoTable(doc, {
      startY: nextY + 4,
      head: expiringHeaders,
      body: expiringRows,
      theme: "grid",
      headStyles: { fillColor: [220, 38, 38] },
      styles: { fontSize: 8 },
    });

    doc.save("Inventory_Valuation_Report.pdf");
  };

  return (
    <div className="space-y-6 relative z-10 pb-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Reports & Valuation</h1>
          <p className="text-slate-400 mt-1">Generate sales audit reports, analyze purchases, and view inventory valuations.</p>
        </div>

        {/* Date Selector (only for sales/purchases) */}
        {activeTab !== "inventory" && (
          <div className="flex items-end gap-3 flex-wrap bg-slate-900/50 backdrop-blur-sm p-4 rounded-xl border border-slate-800">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400 flex items-center gap-1">
                <Calendar size={12} /> Start Date
              </Label>
              <Input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="h-9 bg-slate-950 border-slate-700 text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400 flex items-center gap-1">
                <Calendar size={12} /> End Date
              </Label>
              <Input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="h-9 bg-slate-950 border-slate-700 text-white text-sm"
              />
            </div>
            <Button onClick={handleGenerate} className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 text-sm font-medium">
              Generate
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6">
        <button 
          onClick={() => setActiveTab("sales")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "sales" 
              ? "border-indigo-500 text-indigo-400" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Sales Report
        </button>
        <button 
          onClick={() => setActiveTab("purchases")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "purchases" 
              ? "border-indigo-500 text-indigo-400" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Purchase Expenses
        </button>
        <button 
          onClick={() => setActiveTab("inventory")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "inventory" 
              ? "border-indigo-500 text-indigo-400" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Inventory Summary & Valuation
        </button>
      </div>

      {loading ? (
        <div className="p-20 text-center text-slate-400 flex items-center justify-center">
          <Activity className="animate-ecg-pulse mr-2 text-indigo-400" size={24} /> Generating Report...
        </div>
      ) : (
        <>


          {activeTab === "sales" && (
            salesReport ? (
              <div className="space-y-6 animate-fade-in">
              {/* KPI Summary Cards */}
              {(() => {
                const pm = salesReport.payment_methods || {};
                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-indigo-500">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                          TOTAL REVENUE <IndianRupee size={14} className="text-indigo-400" />
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">₹{Number(salesReport.total_revenue ?? 0).toFixed(2)}</div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-emerald-500">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                          TAX COLLECTED <FileText size={14} className="text-emerald-400" />
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">₹{Number(salesReport.total_tax ?? 0).toFixed(2)}</div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-amber-500">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                          INVOICES COUNT <ShoppingCart size={14} className="text-amber-400" />
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">{salesReport.total_invoices ?? 0}</div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-rose-500 flex flex-col justify-between">
                      <div className="px-6 py-4 flex-1">
                        <div className="text-xs font-semibold text-slate-400 mb-2">PAYMENT BREAKDOWN</div>
                        <div className="text-xs space-y-1 text-slate-300">
                          <div className="flex justify-between"><span>Cash:</span><span className="font-semibold">₹{Number(pm.Cash ?? 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>UPI:</span><span className="font-semibold">₹{Number(pm.UPI ?? 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Card:</span><span className="font-semibold">₹{Number(pm.Card ?? 0).toFixed(2)}</span></div>
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })()}

              {/* Data Table */}
              <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
                <CardHeader className="bg-slate-900/80 border-b border-slate-800 flex flex-row items-center justify-between py-4 px-6">
                  <div>
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      Sales Audit Records
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                        {salesList.length} days
                      </span>
                    </CardTitle>
                    <CardDescription className="text-slate-400">Daily sales aggregates for the selected range.</CardDescription>
                  </div>
                  <Button onClick={exportSalesReportPDF} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs">
                    <FileDown className="mr-1.5" size={14} /> Export PDF
                  </Button>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Date</TableHead>
                      <TableHead className="text-slate-400 text-center">Invoices Issued</TableHead>
                      <TableHead className="text-slate-400">Subtotal</TableHead>
                      <TableHead className="text-slate-400">Tax Collected</TableHead>
                      <TableHead className="text-slate-400 font-bold">Grand Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                          No sales recorded in this interval.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedSales.map((day: any) => (
                        <TableRow key={day.date} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="font-medium text-slate-200">{day.date}</TableCell>
                          <TableCell className="text-center text-slate-300">{day.invoice_count}</TableCell>
                          <TableCell className="text-slate-300">₹{Number(day.subtotal ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="text-slate-300">₹{Number(day.tax ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="font-bold text-emerald-400">₹{Number(day.grand_total ?? 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* Pagination Footer */}
                <div className="p-3 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    {salesList.length === 0 ? (
                      <span>0 records</span>
                    ) : (
                      <span>
                        Showing <span className="text-slate-200 font-medium">{(currentSalesPage - 1) * salesRowsPerPage + 1}</span>-
                        <span className="text-slate-200 font-medium">{Math.min(currentSalesPage * salesRowsPerPage, salesList.length)}</span> of{" "}
                        <span className="text-slate-200 font-medium">{salesList.length}</span> days
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]">Rows:</span>
                      <select
                        value={salesRowsPerPage}
                        onChange={(e) => {
                          setSalesRowsPerPage(Number(e.target.value));
                          setSalesPage(1);
                        }}
                        className="bg-slate-950 border border-slate-700/80 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentSalesPage <= 1}
                        onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                        className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={14} />
                      </Button>
                      <span className="text-xs px-1.5 text-slate-300">
                        {currentSalesPage} / {salesTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentSalesPage >= salesTotalPages}
                        onClick={() => setSalesPage((p) => Math.min(salesTotalPages, p + 1))}
                        className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="p-20 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
              <Activity className="animate-ecg-pulse text-indigo-400" size={32} />
              <p className="text-sm font-medium">Loading sales audit records...</p>
            </div>
          )
        )}

          {activeTab === "purchases" && (
            purchaseReport ? (
              <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                        TOTAL EXPENSES <IndianRupee size={14} className="text-indigo-400" />
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">₹{Number(purchaseReport.total_expense ?? 0).toFixed(2)}</div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                        TAX PAID <FileText size={14} className="text-emerald-400" />
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">₹{Number(purchaseReport.total_tax ?? 0).toFixed(2)}</div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                        PURCHASES COUNT <ShoppingCart size={14} className="text-amber-400" />
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">{purchaseReport.total_purchases ?? 0}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Purchases Table */}
                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
                  <CardHeader className="bg-slate-900/80 border-b border-slate-800 flex flex-row items-center justify-between py-4 px-6">
                    <div>
                      <CardTitle className="text-white text-lg flex items-center gap-2">
                        Purchase Expense Breakdown
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-medium">
                          {purchaseList.length} days
                        </span>
                      </CardTitle>
                      <CardDescription className="text-slate-400">Daily procurement expenses across suppliers.</CardDescription>
                    </div>
                    <Button onClick={exportPurchaseReportPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 text-xs">
                      <FileDown className="mr-1.5" size={14} /> Export PDF
                    </Button>
                  </CardHeader>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Date</TableHead>
                        <TableHead className="text-slate-400 text-center">Inward Invoices</TableHead>
                        <TableHead className="text-slate-400 font-bold">Total Expense</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPurchases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-10 text-slate-500">
                            No purchases recorded in this interval.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedPurchases.map((day: any) => (
                          <TableRow key={day.date} className="border-slate-800 hover:bg-slate-800/50">
                            <TableCell className="font-medium text-slate-200">{day.date}</TableCell>
                            <TableCell className="text-center text-slate-300">{day.purchase_count}</TableCell>
                            <TableCell className="font-bold text-indigo-400">₹{Number(day.grand_total ?? 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {/* Pagination Footer */}
                  <div className="p-3 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <div>
                      {purchaseList.length === 0 ? (
                        <span>0 records</span>
                      ) : (
                        <span>
                          Showing <span className="text-slate-200 font-medium">{(currentPurchasePage - 1) * purchaseRowsPerPage + 1}</span>-
                          <span className="text-slate-200 font-medium">{Math.min(currentPurchasePage * purchaseRowsPerPage, purchaseList.length)}</span> of{" "}
                          <span className="text-slate-200 font-medium">{purchaseList.length}</span> days
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px]">Rows:</span>
                        <select
                          value={purchaseRowsPerPage}
                          onChange={(e) => {
                            setPurchaseRowsPerPage(Number(e.target.value));
                            setPurchasePage(1);
                          }}
                          className="bg-slate-950 border border-slate-700/80 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPurchasePage <= 1}
                          onClick={() => setPurchasePage((p) => Math.max(1, p - 1))}
                          className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={14} />
                        </Button>
                        <span className="text-xs px-1.5 text-slate-300">
                          {currentPurchasePage} / {purchaseTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPurchasePage >= purchaseTotalPages}
                          onClick={() => setPurchasePage((p) => Math.min(purchaseTotalPages, p + 1))}
                          className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="p-20 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
                <Activity className="animate-ecg-pulse text-indigo-400" size={32} />
                <p className="text-sm font-medium">Loading purchase expenses...</p>
              </div>
            )
          )}

          {activeTab === "inventory" && inventoryReport && (
            <div className="space-y-6 animate-fade-in">
              {/* Stats grids */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                      TOTAL PRODUCTS <Warehouse size={14} className="text-indigo-400" />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">{inventoryReport.total_products ?? 0}</div>
                    <p className="text-xs text-slate-500 mt-1">Across {inventoryReport.total_batches ?? 0} active batches</p>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                      TOTAL VALUATION (COST) <IndianRupee size={14} className="text-emerald-400" />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">₹{Number(inventoryReport.valuation_purchase ?? 0).toFixed(2)}</div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      <p className="text-xs text-emerald-400 font-medium">Selling Value: ₹{Number(inventoryReport.valuation_selling ?? 0).toFixed(2)}</p>
                      {inventoryReport.potential_profit !== undefined && (
                        <p className="text-xs text-indigo-400 font-medium">
                          Est. Profit: ₹{Number(inventoryReport.potential_profit ?? 0).toFixed(2)} ({Number(inventoryReport.profit_margin_pct ?? 0).toFixed(1)}%)
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                      TOTAL STOCK QUANTITY <BarChart3 size={14} className="text-amber-400" />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">{inventoryReport.total_stock_qty ?? 0} Items</div>
                    <p className="text-xs text-slate-500 mt-1">MRP Value: ₹{Number(inventoryReport.valuation_mrp ?? 0).toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Alert Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Low Stock Items */}
                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden flex flex-col justify-between">
                  <div>
                    <CardHeader className="bg-slate-900/80 border-b border-slate-800 py-3.5 px-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="text-amber-400" size={18} />
                          <div>
                            <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                              Low Stock Items
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium">
                                {filteredLowStock.length} batches
                              </span>
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400 mt-0.5">
                              Batches with quantity &le; {lowStockThreshold}
                            </CardDescription>
                          </div>
                        </div>
                      </div>

                      {/* Filter Toolbar */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/60">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-medium text-slate-400 mr-1 flex items-center gap-1">
                            <Filter size={11} className="text-slate-400" /> Stock:
                          </span>
                          {[10, 50, 100, 200].map((preset) => {
                            const isActive = !isCustomLowStock && lowStockThreshold === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setLowStockThreshold(preset);
                                  setCustomLowStockInput(String(preset));
                                  setIsCustomLowStock(false);
                                  setLowStockPage(1);
                                }}
                                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                                  isActive
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20"
                                    : "bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:text-white"
                                }`}
                              >
                                &lt; {preset}
                              </button>
                            );
                          })}
                          
                          {/* Custom Threshold Input */}
                          <div className={`flex items-center gap-1 ml-1 bg-slate-950/80 rounded-md border px-2 py-0.5 transition-all ${
                            isCustomLowStock ? "border-amber-500/60 ring-1 ring-amber-500/30" : "border-slate-800 focus-within:border-amber-500/50"
                          }`}>
                            <span className="text-[11px] text-slate-400 font-mono">&le;</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Custom"
                              value={isCustomLowStock ? customLowStockInput : (![10, 50, 100, 200].includes(lowStockThreshold) ? lowStockThreshold : "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomLowStockInput(val);
                                setIsCustomLowStock(true);
                                const num = parseFloat(val);
                                if (!isNaN(num) && num >= 0) {
                                  setLowStockThreshold(num);
                                  setLowStockPage(1);
                                }
                              }}
                              onFocus={() => setIsCustomLowStock(true)}
                              className="w-14 bg-transparent text-xs text-amber-300 placeholder:text-slate-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-800 hover:bg-transparent">
                          <TableHead className="text-slate-400 text-xs">Product</TableHead>
                          <TableHead className="text-slate-400 text-xs">Batch</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right pr-4">Stock Left</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLowStock.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-xs text-slate-500">
                              No batches found with stock &le; {lowStockThreshold}.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedLowStock.map((item: any) => (
                            <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/50">
                              <TableCell className="font-semibold text-slate-300 text-xs">
                                <div>{item.product_name}</div>
                                {item.sku && <div className="text-[10px] text-slate-500 font-mono">{item.sku}</div>}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-400">{item.batch_number}</TableCell>
                              <TableCell className="text-right pr-4">
                                {Number(item.quantity_available) <= 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                    0 Out of Stock
                                  </span>
                                ) : Number(item.quantity_available) <= 5 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    {item.quantity_available} Left
                                  </span>
                                ) : (
                                  <span className="font-bold text-yellow-400 text-xs">
                                    {item.quantity_available}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="p-3 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <div>
                      {filteredLowStock.length === 0 ? (
                        <span>0 batches</span>
                      ) : (
                        <span>
                          Showing <span className="text-slate-200 font-medium">{(currentLowStockPage - 1) * lowStockRowsPerPage + 1}</span>-
                          <span className="text-slate-200 font-medium">{Math.min(currentLowStockPage * lowStockRowsPerPage, filteredLowStock.length)}</span> of{" "}
                          <span className="text-slate-200 font-medium">{filteredLowStock.length}</span>
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px]">Rows:</span>
                        <select
                          value={lowStockRowsPerPage}
                          onChange={(e) => {
                            setLowStockRowsPerPage(Number(e.target.value));
                            setLowStockPage(1);
                          }}
                          className="bg-slate-950 border border-slate-700/80 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentLowStockPage <= 1}
                          onClick={() => setLowStockPage((p) => Math.max(1, p - 1))}
                          className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={14} />
                        </Button>
                        <span className="text-xs px-1.5 text-slate-300">
                          {currentLowStockPage} / {lowStockTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentLowStockPage >= lowStockTotalPages}
                          onClick={() => setLowStockPage((p) => Math.min(lowStockTotalPages, p + 1))}
                          className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Expiring Soon Items */}
                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden flex flex-col justify-between">
                  <div>
                    <CardHeader className="bg-slate-900/80 border-b border-slate-800 py-3.5 px-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="text-rose-400" size={18} />
                          <div>
                            <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                              Expiring Soon
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium">
                                {filteredExpiring.length} batches
                              </span>
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400 mt-0.5">
                              Expiring in the next {expiryDays} days
                            </CardDescription>
                          </div>
                        </div>
                      </div>

                      {/* Filter Toolbar */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/60">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-medium text-slate-400 mr-1 flex items-center gap-1">
                            <Filter size={11} className="text-slate-400" /> Range:
                          </span>
                          {[15, 30, 60, 90, 180].map((preset) => {
                            const isActive = !isCustomExpiry && expiryDays === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setExpiryDays(preset);
                                  setCustomExpiryInput(String(preset));
                                  setIsCustomExpiry(false);
                                  setExpiringPage(1);
                                }}
                                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                                  isActive
                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20"
                                    : "bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:text-white"
                                }`}
                              >
                                {preset}D
                              </button>
                            );
                          })}
                          
                          {/* Custom Expiry Days Input */}
                          <div className={`flex items-center gap-1 ml-1 bg-slate-950/80 rounded-md border px-2 py-0.5 transition-all ${
                            isCustomExpiry ? "border-rose-500/60 ring-1 ring-rose-500/30" : "border-slate-800 focus-within:border-rose-500/50"
                          }`}>
                            <input
                              type="number"
                              min="1"
                              placeholder="Custom"
                              value={isCustomExpiry ? customExpiryInput : (![15, 30, 60, 90, 180].includes(expiryDays) ? expiryDays : "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomExpiryInput(val);
                                setIsCustomExpiry(true);
                                const num = parseInt(val, 10);
                                if (!isNaN(num) && num > 0) {
                                  setExpiryDays(num);
                                  setExpiringPage(1);
                                }
                              }}
                              onFocus={() => setIsCustomExpiry(true)}
                              className="w-14 bg-transparent text-xs text-rose-300 placeholder:text-slate-500 focus:outline-none"
                            />
                            <span className="text-[11px] text-slate-400 font-mono">D</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-800 hover:bg-transparent">
                          <TableHead className="text-slate-400 text-xs">Product</TableHead>
                          <TableHead className="text-slate-400 text-xs">Batch</TableHead>
                          <TableHead className="text-slate-400 text-xs text-right pr-4">Expiry Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedExpiring.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-xs text-slate-500">
                              No batches expiring within the next {expiryDays} days.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedExpiring.map((item: any) => {
                            const daysLeft = getDaysUntilExpiry(item.expiry_date);
                            return (
                              <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/50">
                                <TableCell className="font-semibold text-slate-300 text-xs">
                                  <div>{item.product_name}</div>
                                  {item.sku && <div className="text-[10px] text-slate-500 font-mono">{item.sku}</div>}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-slate-400">{item.batch_number}</TableCell>
                                <TableCell className="text-right pr-4">
                                  <div className="font-bold text-rose-400 text-xs">{item.expiry_date}</div>
                                  <div className="text-[10px] mt-0.5 font-medium">
                                    {daysLeft === null ? null : daysLeft <= 0 ? (
                                      <span className="text-rose-500 font-semibold">Expires today</span>
                                    ) : daysLeft === 1 ? (
                                      <span className="text-rose-400">in 1 day</span>
                                    ) : (
                                      <span className="text-slate-400">in {daysLeft} days</span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="p-3 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <div>
                      {filteredExpiring.length === 0 ? (
                        <span>0 batches</span>
                      ) : (
                        <span>
                          Showing <span className="text-slate-200 font-medium">{(currentExpiringPage - 1) * expiringRowsPerPage + 1}</span>-
                          <span className="text-slate-200 font-medium">{Math.min(currentExpiringPage * expiringRowsPerPage, filteredExpiring.length)}</span> of{" "}
                          <span className="text-slate-200 font-medium">{filteredExpiring.length}</span>
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px]">Rows:</span>
                        <select
                          value={expiringRowsPerPage}
                          onChange={(e) => {
                            setExpiringRowsPerPage(Number(e.target.value));
                            setExpiringPage(1);
                          }}
                          className="bg-slate-950 border border-slate-700/80 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentExpiringPage <= 1}
                          onClick={() => setExpiringPage((p) => Math.max(1, p - 1))}
                          className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={14} />
                        </Button>
                        <span className="text-xs px-1.5 text-slate-300">
                          {currentExpiringPage} / {expiringTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentExpiringPage >= expiringTotalPages}
                          onClick={() => setExpiringPage((p) => Math.min(expiringTotalPages, p + 1))}
                          className="h-7 w-7 p-0 bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Action bar */}
              <div className="flex justify-end pt-4">
                <Button onClick={exportInventoryReportPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-900/30">
                  <FileDown className="mr-2" size={18} /> Download Valuation PDF
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
