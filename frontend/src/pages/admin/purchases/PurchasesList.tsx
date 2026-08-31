import { useModal } from "@/providers/ModalProvider";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useDataStore } from "../../../store/dataStore";
import api from "../../../services/api";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Search, Eye, X, Building2, Calendar, FileText, Printer, Loader2, Package } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export default function PurchasesList() {
  const { showAlert } = useModal();
  const { purchases, fetchPurchases, branches, fetchBranches } = useDataStore();
  const { data: purchasesData, loading } = purchases;
  const [search, setSearch] = useState("");
  
  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const getBranchName = (id?: number) => {
    const found = branches.find((b: any) => b.id === id);
    if (found) return found.name;
    return id ? `Branch ${id}` : "Branch";
  };
  
  // Inward Details Modal State
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null);
  const [purchaseDetail, setPurchaseDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    // No-op if data is fresh; background-sync if stale
    fetchPurchases();
  }, [fetchPurchases]);

  // Load purchase detail when modal opens
  useEffect(() => {
    if (selectedPurchaseId) {
      setIsLoadingDetail(true);
      api.get(`/purchases/${selectedPurchaseId}?_cb=${Date.now()}`)
        .then(res => {
          console.log("Loaded purchase details:", res.data);
          setPurchaseDetail(res.data);
        })
        .catch(err => {
          console.error("Failed to load purchase details", err);
          showAlert("Error", `Failed to load inward stock details: ${err.response?.data?.detail || err.message}`);
          setSelectedPurchaseId(null);
        })
        .finally(() => setIsLoadingDetail(false));
    } else {
      setPurchaseDetail(null);
    }
  }, [selectedPurchaseId]);

  const filteredPurchases = purchasesData.filter(p => 
    (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase())) ||
    (p.supplier?.name && p.supplier.name.toLowerCase().includes(search.toLowerCase())) ||
    (p.supplier?.company_name && p.supplier.company_name.toLowerCase().includes(search.toLowerCase()))
  );

  const loadLogo = (): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = "/logo.png";
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
    });
  };

  const getBranchDetails = (id?: number) => {
    const found = branches.find((b: any) => b.id === id);
    if (found) {
      return {
        name: found.name || "MedX Pharmacy",
        address: found.address || "",
        phone: found.phone || "",
        email: found.email || "",
        gstin: found.gstin || "08GSFPD9061R1ZY"
      };
    }
    return {
      name: "MedX Pharmacy",
      address: "",
      phone: "",
      email: "",
      gstin: "08GSFPD9061R1ZY"
    };
  };

  const handlePrintInwardPDF = async () => {
    if (!purchaseDetail) return;
    
    const doc = new jsPDF({ compress: true });
    
    // Top Accent Bar (Inspired by POS/HTML template)
    doc.setFillColor(67, 56, 202); // #4338CA
    doc.rect(14, 15, 182, 3, "F");
    
    let textXOffset = 14;
    try {
      const logoImg = await loadLogo();
      doc.addImage(logoImg, "JPEG", 14, 22, 12, 12, undefined, "FAST");
      textXOffset = 28;
    } catch (e) {
      console.error("Failed to load logo.png, printing without it", e);
    }
    
    // Header Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(67, 56, 202); // #4338CA
    doc.text("Med-X Pharmacy", textXOffset, 31);
    
    const details = getBranchDetails(purchaseDetail.branch_id);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(details.address, textXOffset, 37);
    doc.text(`Contact: ${details.phone} | Email: ${details.email} | GSTIN: ${details.gstin}`, textXOffset, 42);
    
    // Goods Inward Note Badge
    doc.setFillColor(67, 56, 202);
    doc.rect(130, 22, 66, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("GOODS INWARD NOTE", 135, 27.5);
    
    // Summary Box
    doc.setFillColor(247, 248, 252);
    doc.setDrawColor(230, 231, 238);
    doc.rect(14, 48, 182, 24, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("SUPPLIER INVOICE #:", 18, 54);
    doc.text("INWARD DATE:", 18, 60);
    doc.text("VENDOR / SUPPLIER:", 18, 66);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(28, 30, 41);
    doc.text(purchaseDetail.invoice_number || "N/A", 60, 54);
    doc.text(purchaseDetail.purchase_date || "N/A", 60, 60);
    doc.text(purchaseDetail.supplier?.name || `Supplier #${purchaseDetail.supplier_id}`, 60, 66);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("COMPANY:", 115, 54);
    doc.text("GSTIN:", 115, 60);
    doc.text("TOTAL AMOUNT:", 115, 66);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(28, 30, 41);
    doc.text(purchaseDetail.supplier?.company_name || "N/A", 145, 54);
    doc.text(purchaseDetail.supplier?.gst_number || "N/A", 145, 60);
    doc.text(`Rs. ${Number(purchaseDetail.grand_total ?? 0).toFixed(2)}`, 145, 66);
    
    // Items table
    const tableData = (purchaseDetail.items || []).map((item: any, idx: number) => [
      idx + 1,
      item.product?.name || `Product #${item.product_id}`,
      item.batch_number,
      item.expiry_date,
      item.quantity,
      `Rs. ${Number(item.purchase_price ?? 0).toFixed(2)}`,
      `Rs. ${Number(item.mrp ?? 0).toFixed(2)}`,
      `Rs. ${Number(item.selling_price ?? 0).toFixed(2)}`,
      `Rs. ${(item.quantity * Number(item.purchase_price ?? 0)).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 78,
      head: [["#", "Product Name", "Batch", "Expiry", "Qty", "Cost (Rs.)", "MRP (Rs.)", "Selling (Rs.)", "Total (Rs.)"]],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [67, 56, 202], 
        textColor: 255, 
        fontStyle: 'bold',
        fontSize: 8.5
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: [28, 30, 41]
      },
      alternateRowStyles: {
        fillColor: [251, 251, 254]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    
    // Total Box
    doc.setFillColor(247, 248, 252);
    doc.setDrawColor(230, 231, 238);
    doc.rect(120, finalY, 76, 14, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(28, 30, 41);
    doc.text("Inward Grand Total:", 124, finalY + 9);
    doc.setFontSize(10.5);
    doc.setTextColor(67, 56, 202);
    doc.text(`Rs. ${Number(purchaseDetail.grand_total ?? 0).toFixed(2)}`, 192, finalY + 9, { align: "right" });
    
    doc.save(`Inward_Receipt_${purchaseDetail.invoice_number || purchaseDetail.id}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search invoice or supplier..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Link to="/admin/purchases/new">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="mr-2" size={18} /> Inward Stock (Purchase)
          </Button>
        </Link>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm rounded-md border border-slate-800 shadow-xl shadow-black/10">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-400">Invoice #</TableHead>
              <TableHead className="text-slate-400">Inward Date</TableHead>
              <TableHead className="text-slate-400">Supplier / Vendor</TableHead>
              <TableHead className="text-slate-400">Branch</TableHead>
              <TableHead className="text-slate-400">Total Amount</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  Loading purchases...
                </TableCell>
              </TableRow>
            ) : filteredPurchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  No purchases found.
                </TableCell>
              </TableRow>
            ) : (
              filteredPurchases.map((purchase) => (
                <TableRow key={purchase.id} className="border-slate-800 hover:bg-slate-800/50">
                  <TableCell>
                    <div className="font-mono text-sm font-semibold text-slate-200">{purchase.invoice_number || "N/A"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-300 flex items-center gap-1.5">
                      <Calendar size={13} className="text-slate-500" />
                      {new Date(purchase.purchase_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-200">{purchase.supplier?.name || `Supplier #${purchase.supplier_id}`}</div>
                    {purchase.supplier?.company_name && (
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 size={11} className="text-slate-500" />
                        {purchase.supplier.company_name}
                      </div>
                    )}
                  </TableCell>
                    <span className="text-xs text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {getBranchName(purchase.branch_id)}
                    </span>
                  <TableCell>
                    <div className="font-bold text-emerald-400 font-mono">₹{Number(purchase.grand_total ?? 0).toFixed(2)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setSelectedPurchaseId(purchase.id)}
                          className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                        >
                          <Eye size={18} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Inward Details</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Inward Purchase Details Modal */}
      {selectedPurchaseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border-slate-800 shadow-2xl overflow-hidden flex flex-col">
            
            {/* Header */}
            <CardHeader className="border-b border-slate-800 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl flex items-center gap-2">
                  <FileText className="text-indigo-400" size={22} />
                  Inward Stock Details
                </CardTitle>
                <CardDescription className="text-slate-400 mt-1">
                  Invoice Number: <span className="text-white font-mono font-semibold">{purchaseDetail?.invoice_number || "—"}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {purchaseDetail && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handlePrintInwardPDF}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-xs h-8"
                  >
                    <Printer className="mr-1.5" size={14} /> Print PDF
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setSelectedPurchaseId(null)}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 w-8"
                >
                  <X size={18} />
                </Button>
              </div>
            </CardHeader>

            {/* Content Body */}
            <CardContent className="p-6 overflow-y-auto space-y-6 flex-1">
              {isLoadingDetail || !purchaseDetail ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
                  <Loader2 className="animate-spin text-indigo-400" size={32} />
                  <p className="text-sm font-medium">Loading inward invoice records...</p>
                </div>
              ) : (
                <>
                  {/* Summary Header Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-500 font-medium">Vendor / Supplier</span>
                      <div className="text-base font-semibold text-white">{purchaseDetail.supplier?.name || "N/A"}</div>
                      <div className="text-xs text-slate-400">{purchaseDetail.supplier?.company_name || ""}</div>
                      {purchaseDetail.supplier?.phone && (
                        <div className="text-xs text-slate-500 mt-1 font-mono">{purchaseDetail.supplier.phone}</div>
                      )}
                    </div>

                    <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-500 font-medium">Invoice Info</span>
                      <div className="text-sm font-medium text-slate-200">
                        Date: <span className="text-white">{purchaseDetail.purchase_date}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-200">
                        Branch: <span className="text-white">{getBranchName(purchaseDetail.branch_id)}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        GSTIN: {purchaseDetail.supplier?.gst_number || "N/A"}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-500 font-medium">Payment & Totals</span>
                      <div className="text-2xl font-bold text-emerald-400 font-mono">
                        ₹{Number(purchaseDetail.grand_total ?? 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400">
                        Tax: ₹{Number(purchaseDetail.tax_amount ?? 0).toFixed(2)} • Items: {purchaseDetail.items?.length || 0}
                      </div>
                    </div>
                  </div>

                  {/* Received Items Table */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                      <Package size={16} className="text-indigo-400" /> Received Batches & Items
                    </h3>
                    <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="text-slate-400">#</TableHead>
                            <TableHead className="text-slate-400">Product</TableHead>
                            <TableHead className="text-slate-400">Batch</TableHead>
                            <TableHead className="text-slate-400">Expiry</TableHead>
                            <TableHead className="text-center text-slate-400">Qty</TableHead>
                            <TableHead className="text-right text-slate-400">Purchase Cost</TableHead>
                            <TableHead className="text-right text-slate-400">MRP</TableHead>
                            <TableHead className="text-right text-slate-400">Selling Price</TableHead>
                            <TableHead className="text-right text-slate-400">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(!purchaseDetail.items || purchaseDetail.items.length === 0) ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-6 text-slate-500">
                                No items recorded for this purchase.
                              </TableCell>
                            </TableRow>
                          ) : (
                            purchaseDetail.items.map((item: any, idx: number) => (
                              <TableRow key={item.id || idx} className="border-slate-800/80 hover:bg-slate-900/50">
                                <TableCell className="text-xs text-slate-500">{idx + 1}</TableCell>
                                <TableCell>
                                  <div className="font-semibold text-slate-200 text-sm">
                                    {item.product?.name || `Product #${item.product_id}`}
                                  </div>
                                  {item.product?.pack_size && (
                                    <div className="text-xs text-slate-500">{item.product.pack_size}</div>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-slate-300">
                                  {item.batch_number}
                                </TableCell>
                                <TableCell className="text-xs text-slate-300">
                                  {item.expiry_date}
                                </TableCell>
                                <TableCell className="text-center font-bold text-white">
                                  {item.quantity}
                                </TableCell>
                                <TableCell className="text-right font-mono text-slate-300">
                                  ₹{Number(item.purchase_price ?? 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-slate-400">
                                  ₹{Number(item.mrp ?? 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-emerald-400">
                                  ₹{Number(item.selling_price ?? 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-slate-100">
                                  ₹{(item.quantity * Number(item.purchase_price ?? 0)).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Notes & Summary */}
                  {purchaseDetail.notes && (
                    <div className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-800">
                      <span className="text-xs text-slate-500 font-medium">Remarks / Notes:</span>
                      <p className="text-xs text-slate-300 mt-0.5">{purchaseDetail.notes}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => setSelectedPurchaseId(null)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
