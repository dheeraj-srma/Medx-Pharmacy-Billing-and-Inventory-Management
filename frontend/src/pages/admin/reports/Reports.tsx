import { useState, useCallback } from "react";
import { useDataStore } from "../../../store/dataStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  BarChart3, 
  TrendingUp, 
  FileDown, 
  IndianRupee, 
  ShoppingCart, 
  FileText, 
  Warehouse, 
  AlertTriangle, 
  Calendar,
  Clock,
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
  } = useDataStore();

  const {
    salesReport,
    purchaseReport,
    inventoryReport,
    salesLoading,
    purchasesLoading,
    inventoryLoading,
  } = reports;

  // Auto-fetch on first mount (no-op if data is fresh and date range matches)
  // Using useCallback to stabilize the reference
  const triggerFetch = useCallback(() => {
    fetchSalesReport(appliedStart, appliedEnd);
    fetchPurchaseReport(appliedStart, appliedEnd);
    fetchInventoryReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run once on mount — Zustand will skip if data is already fresh
  useState(() => { triggerFetch(); });

  const loading =
    activeTab === "sales" ? salesLoading :
    activeTab === "purchases" ? purchasesLoading :
    inventoryLoading;

  const handleGenerate = useCallback(() => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    if (activeTab === "sales") fetchSalesReport(startDate, endDate, true);
    else if (activeTab === "purchases") fetchPurchaseReport(startDate, endDate, true);
    else fetchInventoryReport(true);
  }, [activeTab, startDate, endDate, fetchSalesReport, fetchPurchaseReport, fetchInventoryReport]);

  // PDF Generators
  const exportSalesReportPDF = () => {
    if (!salesReport) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(41, 128, 185);
    doc.text("Med-X Pharmacy: Sales Report", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 30);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 35);
    doc.line(14, 40, 196, 40);

    const pm = salesReport.payment_methods || {};

    // Summary Box
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Revenue: Rs ${(salesReport.total_revenue ?? 0).toFixed(2)}`, 14, 50);
    doc.text(`Total Tax Collected: Rs ${(salesReport.total_tax ?? 0).toFixed(2)}`, 14, 57);
    doc.text(`Total Invoices: ${salesReport.total_invoices ?? 0}`, 14, 64);

    doc.text("Payment Breakdown:", 120, 50);
    doc.text(`- Cash: Rs ${(pm.Cash ?? 0).toFixed(2)}`, 120, 57);
    doc.text(`- UPI: Rs ${(pm.UPI ?? 0).toFixed(2)}`, 120, 64);
    doc.text(`- Card: Rs ${(pm.Card ?? 0).toFixed(2)}`, 120, 71);

    const headers = [["Date", "Invoices", "Subtotal", "Tax Collected", "Grand Total"]];
    const rows = salesReport.daily_summary.map((day: any) => [
      day.date,
      day.invoice_count,
      `Rs ${day.subtotal.toFixed(2)}`,
      `Rs ${day.tax.toFixed(2)}`,
      `Rs ${day.grand_total.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 80,
      head: headers,
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`Sales_Report_${startDate}_to_${endDate}.pdf`);
  };

  const exportPurchaseReportPDF = () => {
    if (!purchaseReport) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(41, 128, 185);
    doc.text("Med-X Pharmacy: Purchase Expenses Report", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 30);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 35);
    doc.line(14, 40, 196, 40);

    // Summary Box
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Expenses: Rs ${purchaseReport.total_expense.toFixed(2)}`, 14, 50);
    doc.text(`Total Purchases: ${purchaseReport.total_purchases}`, 14, 57);
    doc.text(`Total Tax Paid: Rs ${purchaseReport.total_tax.toFixed(2)}`, 14, 64);

    const headers = [["Date", "Purchases Count", "Grand Total"]];
    const rows = purchaseReport.daily_summary.map((day: any) => [
      day.date,
      day.purchase_count,
      `Rs ${day.grand_total.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 75,
      head: headers,
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`Purchase_Report_${startDate}_to_${endDate}.pdf`);
  };

  const exportInventoryReportPDF = () => {
    if (!inventoryReport) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(41, 128, 185);
    doc.text("Med-X Pharmacy: Inventory Summary & Valuation", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 30);
    doc.line(14, 35, 196, 35);

    // Summary Box
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Unique Products: ${inventoryReport.total_products}`, 14, 45);
    doc.text(`Total Active Batches: ${inventoryReport.total_batches}`, 14, 52);
    doc.text(`Total Stock Quantity: ${inventoryReport.total_stock_qty}`, 14, 59);

    doc.text("Valuation summary:", 120, 45);
    doc.text(`- Cost Price: Rs ${inventoryReport.valuation_purchase.toFixed(2)}`, 120, 52);
    doc.text(`- Selling Price: Rs ${inventoryReport.valuation_selling.toFixed(2)}`, 120, 59);
    doc.text(`- MRP Price: Rs ${inventoryReport.valuation_mrp.toFixed(2)}`, 120, 66);

    // Low Stock Table
    doc.setFontSize(14);
    doc.setTextColor(41, 128, 185);
    doc.text("Low Stock Items (<= 10 qty)", 14, 78);
    const lowStockHeaders = [["Product", "Batch", "Qty Left", "MRP", "Selling Price"]];
    const lowStockRows = inventoryReport.low_stock_items.map((item: any) => [
      item.product_name,
      item.batch_number,
      item.quantity_available,
      `Rs ${item.mrp}`,
      `Rs ${item.selling_price}`
    ]);

    autoTable(doc, {
      startY: 83,
      head: lowStockHeaders,
      body: lowStockRows,
      theme: "grid",
      headStyles: { fillColor: [243, 156, 18] }, // Orange/Yellow
    });

    // Expiring Soon Table
    const nextY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setTextColor(192, 57, 43); // Red
    doc.text("Expiring Soon Items (within 30 days)", 14, nextY);

    const expiringHeaders = [["Product", "Batch", "Expiry Date", "Qty Left", "MRP"]];
    const expiringRows = inventoryReport.expiring_soon_items.map((item: any) => [
      item.product_name,
      item.batch_number,
      item.expiry_date,
      item.quantity_available,
      `Rs ${item.mrp}`
    ]);

    autoTable(doc, {
      startY: nextY + 5,
      head: expiringHeaders,
      body: expiringRows,
      theme: "grid",
      headStyles: { fillColor: [192, 57, 43] },
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
        <div className="p-20 text-center text-slate-500 flex items-center justify-center">
          <TrendingUp className="animate-spin mr-2 text-indigo-400" size={24} /> Generating Report...
        </div>
      ) : (
        <>


          {activeTab === "sales" && salesReport && (
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
                        <div className="text-2xl font-bold text-white">₹{(salesReport.total_revenue ?? 0).toFixed(2)}</div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-emerald-500">
                      <CardHeader className="pb-2">
                        <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                          TAX COLLECTED <FileText size={14} className="text-emerald-400" />
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">₹{(salesReport.total_tax ?? 0).toFixed(2)}</div>
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
                          <div className="flex justify-between"><span>Cash:</span><span className="font-semibold">₹{(pm.Cash ?? 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>UPI:</span><span className="font-semibold">₹{(pm.UPI ?? 0).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Card:</span><span className="font-semibold">₹{(pm.Card ?? 0).toFixed(2)}</span></div>
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
                    <CardTitle className="text-white text-lg">Sales Audit Records</CardTitle>
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
                    {(salesReport.daily_summary ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                          No sales recorded in this interval.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (salesReport.daily_summary ?? []).map((day: any) => (
                        <TableRow key={day.date} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="font-medium text-slate-200">{day.date}</TableCell>
                          <TableCell className="text-center text-slate-300">{day.invoice_count}</TableCell>
                          <TableCell className="text-slate-300">₹{(day.subtotal ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="text-slate-300">₹{(day.tax ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="font-bold text-emerald-400">₹{(day.grand_total ?? 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {activeTab === "purchases" && purchaseReport && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-indigo-500">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                      TOTAL EXPENSES <IndianRupee size={14} className="text-indigo-400" />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">₹{(purchaseReport.total_expense ?? 0).toFixed(2)}</div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-emerald-500">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                      TAX PAID <FileText size={14} className="text-emerald-400" />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">₹{(purchaseReport.total_tax ?? 0).toFixed(2)}</div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 border-l-4 border-l-amber-500">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-slate-400 flex items-center justify-between text-xs">
                      PURCHASES LOGGED <ShoppingCart size={14} className="text-amber-400" />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">{purchaseReport.total_purchases ?? 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
                <CardHeader className="bg-slate-900/80 border-b border-slate-800 flex flex-row items-center justify-between py-4 px-6">
                  <div>
                    <CardTitle className="text-white text-lg">Purchase Audit Records</CardTitle>
                    <CardDescription className="text-slate-400">Daily expenses recorded during inventory inwarding.</CardDescription>
                  </div>
                  <Button onClick={exportPurchaseReportPDF} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs">
                    <FileDown className="mr-1.5" size={14} /> Export PDF
                  </Button>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Date</TableHead>
                      <TableHead className="text-slate-400 text-center">Purchases Recorded</TableHead>
                      <TableHead className="text-slate-400 font-bold">Grand Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(purchaseReport.daily_summary ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-10 text-slate-500">
                          No purchases recorded in this interval.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (purchaseReport.daily_summary ?? []).map((day: any) => (
                        <TableRow key={day.date} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="font-medium text-slate-200">{day.date}</TableCell>
                          <TableCell className="text-center text-slate-300">{day.purchase_count}</TableCell>
                          <TableCell className="font-bold text-emerald-400">₹{(day.grand_total ?? 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
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
                    <div className="text-2xl font-bold text-white">₹{(inventoryReport.valuation_purchase ?? 0).toFixed(2)}</div>
                    <p className="text-xs text-emerald-500 font-medium mt-1">Selling Value: ₹{(inventoryReport.valuation_selling ?? 0).toFixed(2)}</p>
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
                    <p className="text-xs text-slate-500 mt-1">MRP Value: ₹{(inventoryReport.valuation_mrp ?? 0).toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Alert Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Low Stock Items */}
                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
                  <CardHeader className="bg-slate-900/80 border-b border-slate-800 flex flex-row items-center justify-between py-4 px-6">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="text-yellow-400" size={18} />
                      <div>
                        <CardTitle className="text-white text-sm">Low Stock Items</CardTitle>
                        <CardDescription className="text-xs text-slate-400">Batches with quantity &le; 10</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs">Product</TableHead>
                        <TableHead className="text-slate-400 text-xs">Batch</TableHead>
                        <TableHead className="text-slate-400 text-xs">Stock Left</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(inventoryReport.low_stock_items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-6 text-xs text-slate-500">
                            No low stock items.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (inventoryReport.low_stock_items ?? []).map((item: any) => (
                          <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/50">
                            <TableCell className="font-semibold text-slate-300 text-xs">{item.product_name}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">{item.batch_number}</TableCell>
                            <TableCell className="font-bold text-yellow-400 text-xs">{item.quantity_available}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </Card>

                {/* Expiring Soon Items */}
                <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
                  <CardHeader className="bg-slate-900/80 border-b border-slate-800 flex flex-row items-center justify-between py-4 px-6">
                    <div className="flex items-center gap-2">
                      <Clock className="text-rose-400" size={18} />
                      <div>
                        <CardTitle className="text-white text-sm">Expiring Soon</CardTitle>
                        <CardDescription className="text-xs text-slate-400">Expiring in the next 30 days</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400 text-xs">Product</TableHead>
                        <TableHead className="text-slate-400 text-xs">Batch</TableHead>
                        <TableHead className="text-slate-400 text-xs">Expiry Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(inventoryReport.expiring_soon_items ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-6 text-xs text-slate-500">
                            No items expiring soon.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (inventoryReport.expiring_soon_items ?? []).map((item: any) => (
                          <TableRow key={item.id} className="border-slate-800 hover:bg-slate-800/50">
                            <TableCell className="font-semibold text-slate-300 text-xs">{item.product_name}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">{item.batch_number}</TableCell>
                            <TableCell className="font-bold text-rose-400 text-xs">{item.expiry_date}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
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
