import { useModal } from "@/providers/ModalProvider";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import api from "../../../services/api";
import { useDataStore } from "../../../store/dataStore";
import { searchAndRank, HighlightedText } from "@/lib/searchEngine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  Sliders, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  AlertTriangle,
  Receipt,
  FileText,
  Truck,
  Layers,
  X,
  User,
  Phone,
  Mail,
  Building,
  CreditCard
} from "lucide-react";
import { formatDateDDMMYYYY } from "@/lib/utils";

export default function InventoryList() {
  const { showAlert } = useModal();
  const [activeTab, setActiveTab] = useState("batches");

  // Filters and Search
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Pagination for Batches
  const [batchesPage, setBatchesPage] = useState(1);
  const [batchesPageSize, setBatchesPageSize] = useState(50);

  // Pagination for Transactions
  const [txnsPage, setTxnsPage] = useState(1);
  const [txnsPageSize, setTxnsPageSize] = useState(50);
  const [txnSearch, setTxnSearch] = useState("");
  const [txnTypeFilter, setTxnTypeFilter] = useState("all");

  // Adjustment Modal State
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [newQuantity, setNewQuantity] = useState("");
  const [quantityChange, setQuantityChange] = useState("0");
  const [adjustmentType, setAdjustmentType] = useState("ADJUSTMENT");
  const [notes, setNotes] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Modals for viewing individual Sale Bill, Inward Purchase, and Batch
  const [viewingSale, setViewingSale] = useState<any>(null);
  const [loadingSale, setLoadingSale] = useState(false);

  const [viewingPurchase, setViewingPurchase] = useState<any>(null);
  const [loadingPurchase, setLoadingPurchase] = useState(false);

  const [viewingBatch, setViewingBatch] = useState<any>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);

  useEffect(() => {
    if (selectedBatch || viewingSale || viewingPurchase || viewingBatch) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [selectedBatch, viewingSale, viewingPurchase, viewingBatch]);

  // Global data store
  const { batches: batchesSlice, transactions: transactionsSlice, fetchBatches, fetchTransactions, invalidate, selectedBranchId } = useDataStore();
  const { data: batches = [], loading: batchesLoading } = batchesSlice;
  const { data: transactions = [], loading: transactionsLoading } = transactionsSlice;

  const loading = activeTab === "batches" ? batchesLoading : transactionsLoading;

  // Build filter params
  const statusParam = filterStatus !== "all" ? filterStatus : undefined;
  const filterParams = {
    search: appliedSearch || undefined,
    filter_status: statusParam,
  };

  // Fetch on mount and whenever applied filters or branch change
  useEffect(() => {
    fetchBatches(filterParams, true);
    setBatchesPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, filterStatus, selectedBranchId]);

  // Transactions: fetch on mount and whenever branch changes
  useEffect(() => {
    fetchTransactions(true);
  }, [fetchTransactions, selectedBranchId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search);
    setBatchesPage(1);
  };

  const refetchBatches = useCallback(() => {
    fetchBatches(filterParams, true);
    setBatchesPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, filterStatus]);

  const refetchTransactions = useCallback(() => {
    fetchTransactions(true);
  }, [fetchTransactions]);

  // Open adjustment modal with initialized stock quantities
  const openAdjustModal = (batch: any) => {
    setSelectedBatch(batch);
    const curr = Number(batch.quantity_available || 0);
    setNewQuantity(curr.toString());
    setQuantityChange("0");
    setAdjustmentType("ADJUSTMENT");
    setNotes("");
  };

  // Synchronized inputs for adjustment modal
  const handleNewQuantityChange = (val: string) => {
    setNewQuantity(val);
    const curr = Number(selectedBatch?.quantity_available || 0);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      setQuantityChange((parsed - curr).toString());
    } else {
      setQuantityChange("");
    }
  };

  const handleQuantityChangeChange = (val: string) => {
    setQuantityChange(val);
    const curr = Number(selectedBatch?.quantity_available || 0);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      setNewQuantity((curr + parsed).toString());
    } else {
      setNewQuantity("");
    }
  };

  // Quick Delta Shortcut Buttons
  const applyDelta = (delta: number) => {
    const curr = Number(selectedBatch?.quantity_available || 0);
    const currentDelta = parseFloat(quantityChange) || 0;
    const nextDelta = currentDelta + delta;
    setQuantityChange(nextDelta.toString());
    setNewQuantity((curr + nextDelta).toString());
  };

  const resetToZero = () => {
    const curr = Number(selectedBatch?.quantity_available || 0);
    setNewQuantity("0");
    setQuantityChange((-curr).toString());
  };

  // Compute live projected quantity
  const currentStock = Number(selectedBatch?.quantity_available || 0);
  const parsedChange = parseFloat(quantityChange) || 0;
  const projectedStock = Number((currentStock + parsedChange).toFixed(4));
  const isAdjustmentInvalid = isNaN(projectedStock) || projectedStock < 0 || parsedChange === 0;

  const getStatusBadge = (batch: any) => {
    const today = new Date();
    const expiry = new Date(batch.expiry_date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    const qty = Number(batch.quantity_available || 0);

    if (expiry < today) {
      return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/10" variant="outline">Expired</Badge>;
    } else if (qty <= 0) {
      return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/10" variant="outline">Out of Stock</Badge>;
    } else if (expiry <= thirtyDaysFromNow) {
      return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/10" variant="outline">Expiring Soon</Badge>;
    } else if (qty <= 5) {
      return <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/10" variant="outline">Critical</Badge>;
    } else if (qty <= 10) {
      return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10" variant="outline">Low Stock</Badge>;
    } else {
      return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10" variant="outline">Healthy</Badge>;
    }
  };

  const handleAdjustStock = async () => {
    if (!selectedBatch || isAdjustmentInvalid) return;
    setIsAdjusting(true);
    try {
      const payload = {
        batch_id: selectedBatch.id,
        quantity_change: parsedChange,
        transaction_type: adjustmentType,
        notes: notes || null
      };

      await api.post("/inventory/adjust", payload);
      showAlert("Success", "Stock adjusted successfully!");
      setSelectedBatch(null);
      setQuantityChange("0");
      setNewQuantity("");
      setNotes("");
      // Invalidate inventory slices so next fetch is fresh
      invalidate('batches');
      invalidate('transactions');
      refetchBatches();
      refetchTransactions();
    } catch (error: any) {
      console.error("Adjustment failed", error);
      showAlert("Error", error.response?.data?.detail || "Adjustment failed");
    } finally {
      setIsAdjusting(false);
    }
  };

  // Handlers to open detailed transaction view modals
  const handleOpenSale = async (txn: any) => {
    setLoadingSale(true);
    setViewingSale({ loading: true, invoice_number: txn.notes?.match(/Sale Invoice:\s*([^\s,]+)/)?.[1] || "..." });
    try {
      const refId = txn.reference_id;
      if (refId && !isNaN(Number(refId))) {
        const res = await api.get(`/sales/${refId}`);
        setViewingSale(res.data);
      } else {
        const notes = txn.notes || "";
        const res = await api.get("/sales");
        const match = res.data.find((s: any) => 
          (s.invoice_number && notes.includes(s.invoice_number)) || 
          s.id === Number(txn.reference_id)
        );
        if (match) {
          const detailRes = await api.get(`/sales/${match.id}`);
          setViewingSale(detailRes.data);
        } else {
          showAlert("Error", "Could not locate sale invoice record for this transaction.");
          setViewingSale(null);
        }
      }
    } catch (err: any) {
      showAlert("Error", err.response?.data?.detail || "Failed to load sale bill details.");
      setViewingSale(null);
    } finally {
      setLoadingSale(false);
    }
  };

  const handleOpenPurchase = async (txn: any) => {
    setLoadingPurchase(true);
    setViewingPurchase({ loading: true, invoice_number: txn.notes?.match(/Inward Stock Invoice:\s*([^\s,]+)/)?.[1] || "..." });
    try {
      const refId = txn.reference_id;
      if (refId && !isNaN(Number(refId))) {
        const res = await api.get(`/purchases/${refId}`);
        setViewingPurchase(res.data);
      } else {
        const notes = txn.notes || "";
        const res = await api.get("/purchases");
        const match = res.data.find((p: any) => 
          (p.invoice_number && notes.includes(p.invoice_number)) || 
          p.id === Number(txn.reference_id)
        );
        if (match) {
          const detailRes = await api.get(`/purchases/${match.id}`);
          setViewingPurchase(detailRes.data);
        } else {
          showAlert("Error", "Could not locate inward purchase record for this transaction.");
          setViewingPurchase(null);
        }
      }
    } catch (err: any) {
      showAlert("Error", err.response?.data?.detail || "Failed to load inward purchase details.");
      setViewingPurchase(null);
    } finally {
      setLoadingPurchase(false);
    }
  };

  const handleOpenBatch = async (batchId: number | string) => {
    if (!batchId) return;
    setLoadingBatch(true);
    setViewingBatch({ loading: true });
    try {
      const res = await api.get(`/inventory/batches/${batchId}`);
      setViewingBatch(res.data);
    } catch (err: any) {
      showAlert("Error", err.response?.data?.detail || "Failed to load batch details.");
      setViewingBatch(null);
    } finally {
      setLoadingBatch(false);
    }
  };

  // Ranked Batches: Exact matches -> Best matches -> Words in order
  const rankedBatches = useMemo(() => {
    if (!appliedSearch.trim()) return batches;
    const ranked = searchAndRank(
      batches,
      appliedSearch,
      (b: any) => [b.product_name, b.product_sku, b.batch_number]
    );
    return ranked.map((r) => r.item);
  }, [batches, appliedSearch]);

  // Batches pagination calculation
  const totalBatches = rankedBatches.length;
  const totalBatchesPages = Math.max(1, Math.ceil(totalBatches / batchesPageSize));
  const safeBatchesPage = Math.min(batchesPage, totalBatchesPages);
  const batchesStartIdx = (safeBatchesPage - 1) * batchesPageSize;
  const batchesEndIdx = Math.min(batchesStartIdx + batchesPageSize, totalBatches);
  const paginatedBatches = rankedBatches.slice(batchesStartIdx, batchesEndIdx);

  // Transactions filtering & pagination calculation with multi-tier ranking
  const filteredTxns = useMemo(() => {
    let list = transactions.filter((txn: any) => {
      if (txnTypeFilter !== "all" && txn.transaction_type !== txnTypeFilter) {
        return false;
      }
      return true;
    });

    if (txnSearch.trim()) {
      const ranked = searchAndRank(
        list,
        txnSearch,
        (txn: any) => [txn.product_name, txn.batch_number, txn.notes, txn.user_name]
      );
      list = ranked.map((r) => r.item);
    }
    return list;
  }, [transactions, txnTypeFilter, txnSearch]);

  const totalTxns = filteredTxns.length;
  const totalTxnsPages = Math.max(1, Math.ceil(totalTxns / txnsPageSize));
  const safeTxnsPage = Math.min(txnsPage, totalTxnsPages);
  const txnsStartIdx = (safeTxnsPage - 1) * txnsPageSize;
  const txnsEndIdx = Math.min(txnsStartIdx + txnsPageSize, totalTxns);
  const paginatedTxns = filteredTxns.slice(txnsStartIdx, txnsEndIdx);

  return (
    <div className="space-y-6 relative z-10 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Inventory Management</h1>
        <p className="text-slate-400 mt-1">Monitor active batches, log stock updates, and audit transactions.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6">
        <button 
          onClick={() => setActiveTab("batches")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "batches" 
              ? "border-indigo-500 text-indigo-400" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Stock Batches
        </button>
        <button 
          onClick={() => setActiveTab("transactions")}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "transactions" 
              ? "border-indigo-500 text-indigo-400" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Audit Log / Transactions
        </button>
      </div>

      {activeTab === "batches" ? (
        <div className="space-y-4">
          {/* Quick Filters on the Left + Search Bar next to it */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {/* Quick filter pills on the left */}
              <div className="flex flex-wrap items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800 gap-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => { setFilterStatus("all"); setBatchesPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    filterStatus === "all"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  All
                </button>

                <button
                  type="button"
                  onClick={() => { setFilterStatus("healthy"); setBatchesPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    filterStatus === "healthy"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Healthy
                </button>

                <button
                  type="button"
                  onClick={() => { setFilterStatus("low_stock"); setBatchesPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    filterStatus === "low_stock"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                      : "text-slate-400 hover:text-amber-400 hover:bg-slate-800/50"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Low
                </button>

                <button
                  type="button"
                  onClick={() => { setFilterStatus("critical"); setBatchesPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    filterStatus === "critical"
                      ? "bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm"
                      : "text-slate-400 hover:text-orange-400 hover:bg-slate-800/50"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  Critical
                </button>

                <button
                  type="button"
                  onClick={() => { setFilterStatus("out_of_stock"); setBatchesPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    filterStatus === "out_of_stock"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm"
                      : "text-slate-400 hover:text-rose-400 hover:bg-slate-800/50"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Out of Stock
                </button>

                <button
                  type="button"
                  onClick={() => { setFilterStatus("expiring"); setBatchesPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    filterStatus === "expiring"
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  Expiring Soon
                </button>

                <button
                  type="button"
                  onClick={() => { setFilterStatus("expired"); setBatchesPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    filterStatus === "expired"
                      ? "bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  Expired
                </button>
              </div>

              {/* Search form adjacent to filters */}
              <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <Input 
                  type="text" 
                  placeholder="Search product or batch..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-1.5 h-9 bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 rounded-md focus:outline-none text-sm"
                />
              </form>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <Button type="button" onClick={refetchBatches} className="bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800">
                Refresh Batches
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Product Info</TableHead>
                  <TableHead className="text-slate-400">Batch Number</TableHead>
                  <TableHead className="text-slate-400">Expiry Date</TableHead>
                  <TableHead className="text-slate-400">Stock Qty</TableHead>
                  <TableHead className="text-slate-400">Pricing</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-right text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      Loading stock batches...
                    </TableCell>
                  </TableRow>
                ) : batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      No stock batches found matching the selected filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedBatches.map((batch) => (
                    <TableRow key={batch.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell>
                        <div className="font-semibold text-slate-200">
                          <HighlightedText text={batch.product_name} query={appliedSearch} />
                        </div>
                        <div className="text-xs text-slate-500">
                          SKU: {batch.product_sku || "N/A"}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-300">
                        {batch.batch_number || "N/A"}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {new Date(batch.expiry_date).getFullYear() >= 9999 ? (
                          <span className="text-slate-500 italic text-xs">Not Set</span>
                        ) : (
                          formatDateDDMMYYYY(batch.expiry_date)
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {Number(batch.quantity_available || 0) <= 0 ? (
                          <span className="text-rose-400 font-bold">0</span>
                        ) : (
                          <span className="text-slate-200">{batch.quantity_available}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-200">Selling: ₹{batch.selling_price}</div>
                        <div className="text-xs text-slate-500">Cost: ₹{batch.purchase_price} | MRP: ₹{batch.mrp}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(batch)}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          onClick={() => openAdjustModal(batch)}
                          className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 text-xs h-8 px-3 rounded-md transition-all shadow-sm"
                        >
                          <Sliders className="mr-1" size={14} /> Adjust Stock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination Footer for Stock Batches */}
            {totalBatches > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Showing {batchesStartIdx + 1} to {batchesEndIdx} of {totalBatches} batches</span>
                  <span className="text-slate-600">|</span>
                  <span>Rows per page:</span>
                  <Select 
                    value={batchesPageSize.toString()} 
                    onValueChange={(val) => { setBatchesPageSize(Number(val)); setBatchesPage(1); }}
                  >
                    <SelectTrigger className="h-7 w-20 bg-slate-900 border-slate-700 text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white text-xs">
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="mr-2">Page {safeBatchesPage} of {totalBatchesPages}</span>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setBatchesPage(1)}
                    disabled={safeBatchesPage <= 1}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="First Page"
                  >
                    <ChevronsLeft size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setBatchesPage(prev => Math.max(1, prev - 1))}
                    disabled={safeBatchesPage <= 1}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="Previous Page"
                  >
                    <ChevronLeft size={14} />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setBatchesPage(prev => Math.min(totalBatchesPages, prev + 1))}
                    disabled={safeBatchesPage >= totalBatchesPages}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="Next Page"
                  >
                    <ChevronRight size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setBatchesPage(totalBatchesPages)}
                    disabled={safeBatchesPage >= totalBatchesPages}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="Last Page"
                  >
                    <ChevronsRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Audit Log / Transactions */
        <div className="space-y-4">
          {/* Quick Filters & Search for Audit Transactions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            {/* Quick Type Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { id: "all", label: "All Logs" },
                { id: "SALE", label: "Sales (Bills)" },
                { id: "PURCHASE", label: "Inward (Purchases)" },
                { id: "ADJUSTMENT", label: "Adjustments" },
                { id: "INITIAL_STOCK", label: "Initial Stock" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setTxnTypeFilter(tab.id); setTxnsPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    txnTypeFilter === tab.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Transaction Search Box */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <Input
                placeholder="Search bill, batch, product, notes..."
                value={txnSearch}
                onChange={(e) => { setTxnSearch(e.target.value); setTxnsPage(1); }}
                className="pl-9 h-8 bg-slate-950/80 border-slate-800 text-xs text-white placeholder-slate-500 rounded-lg focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 w-44 text-xs">Timestamp</TableHead>
                  <TableHead className="text-slate-400 text-xs">Product</TableHead>
                  <TableHead className="text-slate-400 w-28 text-xs">Type</TableHead>
                  <TableHead className="text-slate-400 w-24 text-xs">Qty Change</TableHead>
                  <TableHead className="text-slate-400 text-xs">Notes & References</TableHead>
                  <TableHead className="text-slate-400 text-right pr-4 w-44 text-xs">View Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 text-xs">
                      Loading transaction logs...
                    </TableCell>
                  </TableRow>
                ) : filteredTxns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 text-xs">
                      No matching transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTxns.map((txn) => {
                    const isSale = txn.transaction_type === 'SALE' || txn.reference_type === 'Sale';
                    const isPurchase = txn.transaction_type === 'PURCHASE' || txn.reference_type === 'Purchase';

                    return (
                      <TableRow key={txn.id} className="border-slate-800 hover:bg-slate-800/50">
                        <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                          {formatDateDDMMYYYY(txn.timestamp, true)}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-200 text-xs truncate" title={txn.product_name}>
                          <HighlightedText text={txn.product_name} query={txnSearch} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] px-2 py-0.5
                            ${txn.transaction_type === 'PURCHASE' || txn.transaction_type === 'INITIAL_STOCK' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}
                            ${txn.transaction_type === 'SALE' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : ''}
                            ${txn.transaction_type === 'DAMAGE' || txn.transaction_type === 'EXPIRED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : ''}
                            ${txn.transaction_type === 'ADJUSTMENT' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : ''}
                          `}>
                            {txn.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-semibold font-mono text-xs ${Number(txn.quantity_change) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {Number(txn.quantity_change) > 0 ? `+${txn.quantity_change}` : txn.quantity_change}
                        </TableCell>
                        <TableCell className="text-xs text-slate-400 truncate" title={txn.notes || "None"}>
                          <span className="italic text-slate-500">
                            <HighlightedText text={txn.notes || "None"} query={txnSearch} />
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {isSale && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenSale(txn)}
                                className="h-7 px-2.5 text-xs bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20 hover:text-white"
                                title="View Customer Bill & Line Items"
                              >
                                <Receipt size={13} className="mr-1 text-blue-400" />
                                View Bill
                              </Button>
                            )}

                            {isPurchase && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPurchase(txn)}
                                className="h-7 px-2.5 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                title="View Supplier Inward Invoice & Batches"
                              >
                                <Truck size={13} className="mr-1 text-emerald-400" />
                                View Inward
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenBatch(txn.batch_id)}
                              className="h-7 px-2 text-xs text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                              title="View Batch details & stock"
                            >
                              <Layers size={13} className="mr-1 text-indigo-400" />
                              Batch
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination Footer for Transactions */}
            {totalTxns > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Showing {txnsStartIdx + 1} to {txnsEndIdx} of {totalTxns} transactions</span>
                  <span className="text-slate-600">|</span>
                  <span>Rows per page:</span>
                  <Select 
                    value={txnsPageSize.toString()} 
                    onValueChange={(val) => { setTxnsPageSize(Number(val)); setTxnsPage(1); }}
                  >
                    <SelectTrigger className="h-7 w-20 bg-slate-900 border-slate-700 text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white text-xs">
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="mr-2">Page {safeTxnsPage} of {totalTxnsPages}</span>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setTxnsPage(1)}
                    disabled={safeTxnsPage <= 1}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="First Page"
                  >
                    <ChevronsLeft size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setTxnsPage(prev => Math.max(1, prev - 1))}
                    disabled={safeTxnsPage <= 1}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="Previous Page"
                  >
                    <ChevronLeft size={14} />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setTxnsPage(prev => Math.min(totalTxnsPages, prev + 1))}
                    disabled={safeTxnsPage >= totalTxnsPages}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="Next Page"
                  >
                    <ChevronRight size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setTxnsPage(totalTxnsPages)}
                    disabled={safeTxnsPage >= totalTxnsPages}
                    className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                    title="Last Page"
                  >
                    <ChevronsRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Stock Adjustment Dialog Overlay */}
      {selectedBatch && createPortal(
        <div data-modal-overlay="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in">
          <Card className="w-full max-w-lg bg-slate-900 border-slate-800 shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-800 pb-4 bg-slate-950/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Sliders size={20} className="text-indigo-400" />
                  Adjust Stock Quantity
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs bg-slate-800 text-slate-300 border-slate-700">
                  Batch: {selectedBatch.batch_number || "N/A"}
                </Badge>
              </div>
              <CardDescription className="text-slate-400 text-xs mt-1">
                Product: <strong className="text-slate-200">{selectedBatch.product_name}</strong>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-5">
              {/* Prominent Live Projection Banner */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Live Quantity Projection</span>
                  <span className="text-[11px] text-slate-500">Auto-calculated</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center items-center">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">Current Stock</div>
                    <div className="text-lg font-bold text-slate-200 mt-0.5">{currentStock}</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">Change</div>
                    <div className={`text-lg font-bold mt-0.5 ${parsedChange > 0 ? 'text-emerald-400' : parsedChange < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {parsedChange > 0 ? `+${parsedChange}` : parsedChange}
                    </div>
                  </div>

                  <div className={`p-2.5 rounded-lg border transition-all ${
                    projectedStock < 0 
                      ? 'bg-rose-950/40 border-rose-800/80 shadow-inner' 
                      : projectedStock === 0
                      ? 'bg-amber-950/30 border-amber-800/60'
                      : 'bg-indigo-950/30 border-indigo-700/60 shadow-sm'
                  }`}>
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Projected Stock</div>
                    <div className={`text-lg font-bold mt-0.5 ${
                      projectedStock < 0 
                        ? 'text-rose-400' 
                        : projectedStock === 0 
                        ? 'text-amber-400' 
                        : 'text-indigo-300'
                    }`}>
                      {isNaN(projectedStock) ? '—' : `${projectedStock}`}
                    </div>
                  </div>
                </div>

                {projectedStock < 0 && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/25 p-2 rounded-lg">
                    <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                    <span>Cannot reduce stock below 0. Maximum deduction is -{currentStock}.</span>
                  </div>
                )}
              </div>

              {/* Synchronized Input Boxes: Target New Quantity & Quantity Change */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="newQty" className="text-slate-300 text-xs font-semibold flex items-center justify-between">
                    <span>New Target Stock</span>
                    <span className="text-[11px] text-indigo-400 font-normal">Sets total</span>
                  </Label>
                  <Input 
                    id="newQty" 
                    type="number"
                    step="any"
                    placeholder={`e.g. ${currentStock + 10}`}
                    value={newQuantity} 
                    onChange={(e) => handleNewQuantityChange(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qtyChange" className="text-slate-300 text-xs font-semibold flex items-center justify-between">
                    <span>Quantity Change</span>
                    <span className="text-[11px] text-indigo-400 font-normal">Add / Deduct</span>
                  </Label>
                  <Input 
                    id="qtyChange" 
                    type="number"
                    step="any"
                    placeholder="e.g. +10 or -5"
                    value={quantityChange} 
                    onChange={(e) => handleQuantityChangeChange(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Quick Delta Helper Buttons */}
              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-400">Quick Adjustments:</div>
                <div className="flex flex-wrap gap-1.5">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => applyDelta(1)}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                  >
                    +1
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => applyDelta(5)}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                  >
                    +5
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => applyDelta(10)}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                  >
                    +10
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => applyDelta(50)}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                  >
                    +50
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => applyDelta(-1)}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30"
                  >
                    -1
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => applyDelta(-5)}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30"
                  >
                    -5
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => applyDelta(-10)}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30"
                  >
                    -10
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={resetToZero}
                    className="h-7 px-2 text-xs bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                  >
                    Set to 0
                  </Button>
                </div>
              </div>

              {/* Adjustment Reason & Type */}
              <div className="space-y-1.5">
                <Label htmlFor="adjustType" className="text-slate-300 text-xs">Adjustment Classification</Label>
                <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white text-xs">
                    <SelectItem value="ADJUSTMENT">Stock Adjustment (Audit / Physical Count)</SelectItem>
                    <SelectItem value="DAMAGE">Damaged / Broken stock</SelectItem>
                    <SelectItem value="EXPIRED">Expired stock discard</SelectItem>
                    <SelectItem value="RETURN">Sales / Purchase Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adjustNotes" className="text-slate-300 text-xs">Reason / Audit Notes</Label>
                <Textarea 
                  id="adjustNotes" 
                  rows={2}
                  placeholder="Explain why this adjustment is being made..."
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white text-xs placeholder-slate-500 focus:border-indigo-500"
                />
              </div>

              {/* Modal Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedBatch(null)}
                  className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 text-xs h-9"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAdjustStock}
                  disabled={isAdjusting || isAdjustmentInvalid}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md shadow-indigo-600/20 text-xs h-9 disabled:opacity-40"
                >
                  {isAdjusting ? "Applying..." : `Apply (${parsedChange > 0 ? `+${parsedChange}` : parsedChange} units)`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body
      )}

      {/* 1. Sale Bill Detail Modal */}
      {viewingSale && createPortal(
        <div 
          data-modal-overlay="true" 
          onClick={(e) => { if (e.target === e.currentTarget) setViewingSale(null); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in"
        >
          <Card className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border-slate-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden">
            <CardHeader className="border-b border-slate-800 pb-3 bg-slate-950/60 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      <span>Sale Invoice</span>
                      <span className="font-mono text-blue-400">#{viewingSale.invoice_number || "..."}</span>
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Date: {viewingSale.sale_date ? formatDateDDMMYYYY(viewingSale.sale_date, true) : "N/A"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/20 font-medium">
                    {viewingSale.status || "COMPLETED"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setViewingSale(null)}
                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4 overflow-y-auto flex-1 pr-3 scrollbar-thin">
              {loadingSale || viewingSale.loading ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Loading complete sale invoice details...
                </div>
              ) : (
                <>
                  {/* Customer & Billing Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1.5">
                        <User size={12} className="text-slate-400" /> Customer Information
                      </div>
                      <div className="font-semibold text-slate-200 text-sm">
                        {viewingSale.customer?.name || "Walk-in Retail Customer"}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3">
                        {viewingSale.customer?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} className="text-slate-500" /> {viewingSale.customer.phone}
                          </span>
                        )}
                        {viewingSale.customer?.gst_number && (
                          <span>GSTIN: {viewingSale.customer.gst_number}</span>
                        )}
                      </div>
                      {viewingSale.customer?.address && (
                        <div className="text-[11px] text-slate-500 truncate max-w-sm">
                          {viewingSale.customer.address}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 md:border-l md:border-slate-800 md:pl-4">
                      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1.5">
                        <CreditCard size={12} className="text-slate-400" /> Payment & Billing
                      </div>
                      <div className="text-xs text-slate-300">
                        Method: <strong className="text-white">{viewingSale.payment_method || "Cash"}</strong>
                      </div>
                      <div className="text-xs text-slate-400">
                        Invoice ID: <span className="font-mono text-slate-300">#{viewingSale.id}</span> | Branch #{viewingSale.branch_id}
                      </div>
                      {viewingSale.payments && viewingSale.payments.length > 0 && (
                        <div className="text-[11px] text-slate-500">
                          {viewingSale.payments.map((p: any) => `${p.method}: ₹${Number(p.amount).toFixed(2)}`).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* All Items Dispensed Under This Bill */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>Dispensed Products ({viewingSale.items?.length || 0} items)</span>
                      <span className="text-[11px] text-slate-500">All line items on this customer bill</span>
                    </div>

                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-800 bg-slate-900/60 hover:bg-transparent">
                            <TableHead className="text-[11px] text-slate-400 w-10">#</TableHead>
                            <TableHead className="text-[11px] text-slate-400">Product</TableHead>
                            <TableHead className="text-[11px] text-slate-400">Batch</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right">Qty</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right">Unit Rate</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right">Discount</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right pr-4">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(!viewingSale.items || viewingSale.items.length === 0) ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-6 text-slate-500 text-xs">
                                No items found on this bill.
                              </TableCell>
                            </TableRow>
                          ) : (
                            viewingSale.items.map((item: any, idx: number) => (
                              <TableRow key={item.id || idx} className="border-slate-800/80 hover:bg-slate-900/40">
                                <TableCell className="text-xs text-slate-500">{idx + 1}</TableCell>
                                <TableCell className="text-xs font-semibold text-slate-200">
                                  {item.product_name || `Product #${item.product_id}`}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-400">
                                  {item.batch_number || `Batch #${item.batch_id}`}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-300 text-right">
                                  {item.quantity}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-400 text-right">
                                  ₹{Number(item.unit_price).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-rose-400 text-right">
                                  {Number(item.discount || 0) > 0 ? `-₹${Number(item.discount).toFixed(2)}` : "—"}
                                </TableCell>
                                <TableCell className="text-xs font-mono font-semibold text-emerald-400 text-right pr-4">
                                  ₹{Number(item.total_price).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Financial Bill Breakdown */}
                  <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Item Subtotal:</span>
                      <span className="font-mono text-slate-200">₹{Number(viewingSale.total_amount).toFixed(2)}</span>
                    </div>
                    {Number(viewingSale.discount_amount) > 0 && (
                      <div className="flex items-center justify-between text-xs text-rose-400">
                        <span>Invoice Discount:</span>
                        <span className="font-mono">-₹{Number(viewingSale.discount_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>GST / Taxes:</span>
                      <span className="font-mono text-slate-200">+₹{Number(viewingSale.tax_amount).toFixed(2)}</span>
                    </div>
                    {Number(viewingSale.round_off || 0) !== 0 && (
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Round Off:</span>
                        <span className="font-mono">₹{Number(viewingSale.round_off).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                      <span>Grand Total:</span>
                      <span className="text-emerald-400 font-mono text-base">₹{Number(viewingSale.grand_total).toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end shrink-0">
              <Button
                variant="outline"
                onClick={() => setViewingSale(null)}
                className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 text-xs h-8"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {/* 2. Inward Purchase Detail Modal */}
      {viewingPurchase && createPortal(
        <div 
          data-modal-overlay="true" 
          onClick={(e) => { if (e.target === e.currentTarget) setViewingPurchase(null); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in"
        >
          <Card className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border-slate-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden">
            <CardHeader className="border-b border-slate-800 pb-3 bg-slate-950/60 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
                    <Truck size={20} />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      <span>Inward Stock Invoice</span>
                      <span className="font-mono text-emerald-400">#{viewingPurchase.invoice_number || "N/A"}</span>
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Purchase Date: {viewingPurchase.purchase_date ? formatDateDDMMYYYY(viewingPurchase.purchase_date, false) : "N/A"}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 font-medium">
                    INWARD ENTRY
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setViewingPurchase(null)}
                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4 overflow-y-auto flex-1 pr-3 scrollbar-thin">
              {loadingPurchase || viewingPurchase.loading ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Loading complete inward purchase details...
                </div>
              ) : (
                <>
                  {/* Supplier / Seller Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1.5">
                        <Building size={12} className="text-slate-400" /> Seller / Supplier Information
                      </div>
                      <div className="font-semibold text-slate-200 text-sm">
                        {viewingPurchase.supplier?.name || "Direct Supplier"}
                        {viewingPurchase.supplier?.company_name && (
                          <span className="text-slate-400 text-xs font-normal"> ({viewingPurchase.supplier.company_name})</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3">
                        {viewingPurchase.supplier?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} className="text-slate-500" /> {viewingPurchase.supplier.phone}
                          </span>
                        )}
                        {viewingPurchase.supplier?.email && (
                          <span className="flex items-center gap-1">
                            <Mail size={11} className="text-slate-500" /> {viewingPurchase.supplier.email}
                          </span>
                        )}
                      </div>
                      {viewingPurchase.supplier?.gst_number && (
                        <div className="text-[11px] text-slate-400">
                          GSTIN: <span className="font-mono text-slate-300">{viewingPurchase.supplier.gst_number}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 md:border-l md:border-slate-800 md:pl-4">
                      <div className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider flex items-center gap-1.5">
                        <FileText size={12} className="text-slate-400" /> Inward Details
                      </div>
                      <div className="text-xs text-slate-300">
                        Inward ID: <span className="font-mono text-white">#{viewingPurchase.id}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Received At: {viewingPurchase.created_at ? formatDateDDMMYYYY(viewingPurchase.created_at, true) : "N/A"}
                      </div>
                      {viewingPurchase.notes && (
                        <div className="text-[11px] text-slate-400 italic mt-1">
                          Remarks: "{viewingPurchase.notes}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* All Inward Products Under This Bill */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>Inward Products ({viewingPurchase.items?.length || 0} items)</span>
                      <span className="text-[11px] text-slate-500">All batches supplied under this invoice</span>
                    </div>

                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-800 bg-slate-900/60 hover:bg-transparent">
                            <TableHead className="text-[11px] text-slate-400 w-10">#</TableHead>
                            <TableHead className="text-[11px] text-slate-400">Product</TableHead>
                            <TableHead className="text-[11px] text-slate-400">Batch</TableHead>
                            <TableHead className="text-[11px] text-slate-400">Expiry</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right">Qty</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right">Cost Rate</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right">Selling</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right">MRP</TableHead>
                            <TableHead className="text-[11px] text-slate-400 text-right pr-4">Cost Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(!viewingPurchase.items || viewingPurchase.items.length === 0) ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-6 text-slate-500 text-xs">
                                No items found on this inward invoice.
                              </TableCell>
                            </TableRow>
                          ) : (
                            viewingPurchase.items.map((item: any, idx: number) => {
                              const lineTotal = Number(item.quantity || 0) * Number(item.purchase_price || 0);
                              return (
                                <TableRow key={item.id || idx} className="border-slate-800/80 hover:bg-slate-900/40">
                                  <TableCell className="text-xs text-slate-500">{idx + 1}</TableCell>
                                  <TableCell className="text-xs font-semibold text-slate-200">
                                    {item.product?.name || `Product #${item.product_id}`}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono text-slate-300">
                                    {item.batch_number}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-400">
                                    {item.expiry_date ? formatDateDDMMYYYY(item.expiry_date, false) : "N/A"}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono font-semibold text-emerald-400 text-right">
                                    +{item.quantity}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono text-slate-300 text-right">
                                    ₹{Number(item.purchase_price).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono text-slate-400 text-right">
                                    ₹{Number(item.selling_price).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono text-slate-400 text-right">
                                    ₹{Number(item.mrp).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono font-semibold text-slate-200 text-right pr-4">
                                    ₹{lineTotal.toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Financial Purchase Summary */}
                  <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Purchase Subtotal:</span>
                      <span className="font-mono text-slate-200">₹{Number(viewingPurchase.total_amount || 0).toFixed(2)}</span>
                    </div>
                    {Number(viewingPurchase.discount_amount || 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-rose-400">
                        <span>Discount Received:</span>
                        <span className="font-mono">-₹{Number(viewingPurchase.discount_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Taxes / GST:</span>
                      <span className="font-mono text-slate-200">+₹{Number(viewingPurchase.tax_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                      <span>Grand Total Inward:</span>
                      <span className="text-emerald-400 font-mono text-base">₹{Number(viewingPurchase.grand_total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end shrink-0">
              <Button
                variant="outline"
                onClick={() => setViewingPurchase(null)}
                className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 text-xs h-8"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {/* 3. Batch Details Modal */}
      {viewingBatch && createPortal(
        <div 
          data-modal-overlay="true" 
          onClick={(e) => { if (e.target === e.currentTarget) setViewingBatch(null); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in"
        >
          <Card className="w-full max-w-lg bg-slate-900 border-slate-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden">
            <CardHeader className="border-b border-slate-800 pb-3 bg-slate-950/60 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20">
                    <Layers size={20} />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      <span>Batch Details</span>
                      <span className="font-mono text-indigo-400">{viewingBatch.batch_number || "N/A"}</span>
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs">
                      Product: <strong className="text-slate-200">{viewingBatch.product_name}</strong>
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setViewingBatch(null)}
                  className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X size={16} />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {loadingBatch || viewingBatch.loading ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Loading batch details...
                </div>
              ) : (
                <>
                  {/* Stock & Expiry Snapshot */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] uppercase font-semibold text-slate-500">Available Stock</div>
                      <div className={`text-xl font-bold font-mono mt-0.5 ${
                        Number(viewingBatch.quantity_available || 0) <= 0 
                          ? 'text-rose-400' 
                          : Number(viewingBatch.quantity_available || 0) <= 5 
                          ? 'text-orange-400' 
                          : 'text-emerald-400'
                      }`}>
                        {viewingBatch.quantity_available} units
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-[10px] uppercase font-semibold text-slate-500">Expiry Date</div>
                      <div className="text-sm font-semibold text-slate-200 mt-1">
                        {viewingBatch.expiry_date ? formatDateDDMMYYYY(viewingBatch.expiry_date, false) : "N/A"}
                      </div>
                    </div>
                  </div>

                  {/* Pricing, Costing & Margin Matrix */}
                  <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="text-[11px] uppercase font-semibold text-slate-400 tracking-wider">
                      Pricing & Margin Breakdown
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase">Cost Price</div>
                        <div className="text-sm font-bold text-slate-200 mt-0.5 font-mono">
                          ₹{Number(viewingBatch.purchase_price || viewingBatch.cost_price || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase">Selling Price</div>
                        <div className="text-sm font-bold text-emerald-400 mt-0.5 font-mono">
                          ₹{Number(viewingBatch.selling_price || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase">MRP</div>
                        <div className="text-sm font-bold text-indigo-300 mt-0.5 font-mono">
                          ₹{Number(viewingBatch.mrp || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Unit Margin */}
                    {(() => {
                      const cost = Number(viewingBatch.purchase_price || viewingBatch.cost_price || 0);
                      const sp = Number(viewingBatch.selling_price || 0);
                      const margin = sp - cost;
                      const marginPct = sp > 0 ? ((margin / sp) * 100).toFixed(1) : "0.0";
                      return (
                        <div className="flex items-center justify-between text-xs px-2 py-1.5 bg-slate-900 rounded-lg text-slate-300">
                          <span>Gross Margin / Profit per Unit:</span>
                          <span className={`font-mono font-semibold ${margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ₹{margin.toFixed(2)} ({marginPct}%)
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Identification & Supplier */}
                  <div className="space-y-1.5 text-xs text-slate-400 px-1">
                    {viewingBatch.generic_name && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Generic Name:</span>
                        <span className="text-slate-300">{viewingBatch.generic_name}</span>
                      </div>
                    )}
                    {viewingBatch.sku && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">SKU:</span>
                        <span className="font-mono text-slate-300">{viewingBatch.sku}</span>
                      </div>
                    )}
                    {viewingBatch.supplier_name && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Supplier:</span>
                        <span className="text-slate-300">{viewingBatch.supplier_name}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const b = viewingBatch;
                  setViewingBatch(null);
                  openAdjustModal(b);
                }}
                className="bg-indigo-600/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/20 text-xs h-8"
              >
                <Sliders size={13} className="mr-1 text-indigo-400" />
                Adjust Stock
              </Button>

              <Button
                variant="outline"
                onClick={() => setViewingBatch(null)}
                className="border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 text-xs h-8"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>,
        document.body
      )}
    </div>
  );
}
