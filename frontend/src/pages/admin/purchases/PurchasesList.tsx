import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useDataStore } from "../../../store/dataStore";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Search, Eye } from "lucide-react";

export default function PurchasesList() {
  const { purchases, fetchPurchases } = useDataStore();
  const { data: purchasesData, loading } = purchases;
  const [search, setSearch] = useState("");

  useEffect(() => {
    // No-op if data is fresh; background-sync if stale
    fetchPurchases();
  }, [fetchPurchases]);

  const filteredPurchases = purchasesData.filter(p => 
    (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search invoice number..." 
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
              <TableHead className="text-slate-400">Date</TableHead>
              <TableHead className="text-slate-400">Supplier</TableHead>
              <TableHead className="text-slate-400">Total Amount</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                  Loading purchases...
                </TableCell>
              </TableRow>
            ) : filteredPurchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                  No purchases found.
                </TableCell>
              </TableRow>
            ) : (
              filteredPurchases.map((purchase) => (
                <TableRow key={purchase.id} className="border-slate-800 hover:bg-slate-800/50">
                  <TableCell>
                    <div className="font-medium text-slate-200">{purchase.invoice_number || "N/A"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-300">{purchase.purchase_date}</div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-300">{purchase.supplier?.name || purchase.supplier_id}</span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-emerald-400">₹{purchase.grand_total}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10">
                      <Eye size={18} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
