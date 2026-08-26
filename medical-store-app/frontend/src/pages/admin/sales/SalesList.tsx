import { useState, useEffect } from "react";
import api from "../../../services/api";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export default function SalesList() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await api.get("/sales/");
        setSales(res.data);
      } catch (error) {
        console.error("Failed to fetch sales", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSales();
  }, []);

  const filteredSales = sales.filter(s => 
    s.invoice_number.toLowerCase().includes(search.toLowerCase())
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
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm rounded-md border border-slate-800 shadow-xl shadow-black/10">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-400">Invoice #</TableHead>
              <TableHead className="text-slate-400">Date & Time</TableHead>
              <TableHead className="text-slate-400">Customer ID</TableHead>
              <TableHead className="text-slate-400">Payment Method</TableHead>
              <TableHead className="text-slate-400">Amount</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  Loading sales...
                </TableCell>
              </TableRow>
            ) : filteredSales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  No sales found.
                </TableCell>
              </TableRow>
            ) : (
              filteredSales.map((sale) => (
                <TableRow key={sale.id} className="border-slate-800 hover:bg-slate-800/50">
                  <TableCell className="font-mono text-sm font-medium text-slate-300">{sale.invoice_number}</TableCell>
                  <TableCell className="text-sm text-slate-300">
                    {new Date(sale.sale_date).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-slate-300">{sale.customer_id || "Walk-in"}</TableCell>
                  <TableCell className="text-slate-300">{sale.payment_method}</TableCell>
                  <TableCell className="font-bold text-emerald-400">₹{sale.grand_total.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={sale.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ''}>
                      {sale.status}
                    </Badge>
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
