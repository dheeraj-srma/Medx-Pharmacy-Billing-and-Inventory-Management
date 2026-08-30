import { useModal } from "@/providers/ModalProvider";
import { useState, useEffect, useCallback } from "react";
import api from "../../../services/api";
import { useDataStore } from "../../../store/dataStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, Sliders } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function InventoryList() {
  const { showAlert } = useModal();
  const [activeTab, setActiveTab] = useState("batches");

  // Filters and Search
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Adjustment Modal State
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [quantityChange, setQuantityChange] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("ADJUSTMENT");
  const [notes, setNotes] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Global data store
  const { batches: batchesSlice, transactions: transactionsSlice, fetchBatches, fetchTransactions, invalidate } = useDataStore();
  const { data: batches = [], loading: batchesLoading } = batchesSlice;
  const { data: transactions = [], loading: transactionsLoading } = transactionsSlice;

  const loading = activeTab === "batches" ? batchesLoading : transactionsLoading;

  // Build filter params
  const statusParam = filterStatus !== "all" ? filterStatus : undefined;
  const filterParams = {
    search: appliedSearch || undefined,
    filter_status: statusParam,
  };

  // Fetch on mount and whenever applied filters change
  useEffect(() => {
    fetchBatches(filterParams, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, filterStatus]);

  // Transactions: fetch once on mount, no filters
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search);
  };

  const refetchBatches = useCallback(() => {
    fetchBatches(filterParams, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, filterStatus]);

  const refetchTransactions = useCallback(() => {
    fetchTransactions(true);
  }, [fetchTransactions]);

  const getStatusBadge = (batch: any) => {
    const today = new Date();
    const expiry = new Date(batch.expiry_date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    if (expiry < today) {
      return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/10" variant="outline">Expired</Badge>;
    } else if (expiry <= thirtyDaysFromNow) {
      return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/10" variant="outline">Expiring Soon</Badge>;
    } else if (batch.quantity_available <= 10) {
      return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10" variant="outline">Low Stock</Badge>;
    } else {
      return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10" variant="outline">Good</Badge>;
    }
  };

  const handleAdjustStock = async () => {
    if (!selectedBatch || !quantityChange) return;
    setIsAdjusting(true);
    try {
      const payload = {
        batch_id: selectedBatch.id,
        quantity_change: parseInt(quantityChange),
        transaction_type: adjustmentType,
        notes: notes || null
      };

      await api.post("/inventory/adjust", payload);
      showAlert("Success", "Stock adjusted successfully!");
      setSelectedBatch(null);
      setQuantityChange("");
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
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input 
                type="text" 
                placeholder="Search product or batch..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500 rounded-md focus:outline-none"
              />
            </form>
            
            <div className="flex gap-4 w-full sm:w-auto">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-48 bg-slate-900 border-slate-700 text-white">
                  <SelectValue placeholder="Filter Stock Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                  <SelectItem value="all">All Batches</SelectItem>
                  <SelectItem value="expired">Expired Batches</SelectItem>
                  <SelectItem value="expiring">Expiring Soon (30 Days)</SelectItem>
                  <SelectItem value="low_stock">Low Stock (≤10 qty)</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" onClick={refetchBatches} className="bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800">
                Apply Filters
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
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      Loading stock batches...
                    </TableCell>
                  </TableRow>
                ) : batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      No batches found.
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map((batch) => (
                    <TableRow key={batch.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell>
                        <div className="font-semibold text-slate-200">{batch.product_name}</div>
                        <div className="text-xs text-slate-500">SKU: {batch.product_sku || "N/A"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-300">{batch.batch_number || "N/A"}</TableCell>
                      <TableCell className="text-slate-300">
                        {new Date(batch.expiry_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-200">{batch.quantity_available}</TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-200">Selling: ₹{batch.selling_price}</div>
                        <div className="text-xs text-slate-500">Cost: ₹{batch.purchase_price} | MRP: ₹{batch.mrp}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(batch)}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          onClick={() => setSelectedBatch(batch)}
                          className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 text-xs h-8 px-3 rounded-md transition-all"
                        >
                          <Sliders className="mr-1" size={14} /> Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        /* Audit Log / Transactions */
        <div className="space-y-4">
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Timestamp</TableHead>
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-slate-400">Batch</TableHead>
                  <TableHead className="text-slate-400">Type</TableHead>
                  <TableHead className="text-slate-400">Change Qty</TableHead>
                  <TableHead className="text-slate-400">User</TableHead>
                  <TableHead className="text-slate-400">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      Loading audit logs...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                      No transactions recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((txn) => (
                    <TableRow key={txn.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-xs text-slate-400">
                        {new Date(txn.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-300">{txn.product_name}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">{txn.batch_number || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`
                          ${txn.transaction_type === 'PURCHASE' || txn.transaction_type === 'INITIAL_STOCK' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}
                          ${txn.transaction_type === 'SALE' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : ''}
                          ${txn.transaction_type === 'DAMAGE' || txn.transaction_type === 'EXPIRED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : ''}
                          ${txn.transaction_type === 'ADJUSTMENT' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : ''}
                        `}>
                          {txn.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-semibold ${txn.quantity_change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {txn.quantity_change > 0 ? `+${txn.quantity_change}` : txn.quantity_change}
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">{txn.user_name || "N/A"}</TableCell>
                      <Tooltip><TooltipTrigger asChild><TableCell className="text-sm text-slate-500 italic max-w-xs truncate" >
                        {txn.notes || "None"}
                      </TableCell></TooltipTrigger><TooltipContent>{txn.notes}</TooltipContent></Tooltip>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Adjustment Dialog Overlay */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <CardHeader className="border-b border-slate-800 pb-4">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Sliders size={20} className="text-indigo-400" />
                Adjust Stock Quantity
              </CardTitle>
              <CardDescription className="text-slate-400">
                Batch: {selectedBatch.batch_number} | Current Stock: {selectedBatch.quantity_available}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <Label className="text-slate-300 text-sm">Product</Label>
                <div className="text-white font-semibold mt-1">{selectedBatch.product_name}</div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qtyChange" className="text-slate-300">Quantity Change</Label>
                <Input 
                  id="qtyChange" 
                  type="number"
                  placeholder="e.g. -5 to deduct, 10 to add"
                  value={quantityChange} 
                  onChange={(e) => setQuantityChange(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white"
                />
                <p className="text-xs text-slate-500">Provide a negative number to deduct damaged/expired stock.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustType" className="text-slate-300">Adjustment Type</Label>
                <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="ADJUSTMENT">Stock Adjustment</SelectItem>
                    <SelectItem value="DAMAGE">Damaged / Broken</SelectItem>
                    <SelectItem value="EXPIRED">Expired stock discard</SelectItem>
                    <SelectItem value="RETURN">Sales / Purchase Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustNotes" className="text-slate-300">Reason / Notes</Label>
                <Textarea 
                  id="adjustNotes" 
                  rows={3}
                  placeholder="Explain the reason for this stock change..."
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedBatch(null)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAdjustStock}
                  disabled={isAdjusting || !quantityChange}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isAdjusting ? "Saving..." : "Apply Adjustment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
