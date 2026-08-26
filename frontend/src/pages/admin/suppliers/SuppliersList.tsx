import { useState } from "react";
import { Link } from "react-router-dom";
import { useCachedGet } from "../../../services/api";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit } from "lucide-react";

export default function SuppliersList() {
  const [search, setSearch] = useState("");
  const { data: suppliers = [], loading } = useCachedGet<any[]>("/suppliers/", []);

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.company_name && s.company_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search suppliers..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Link to="/admin/suppliers/new">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="mr-2" size={18} /> Add Supplier
          </Button>
        </Link>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm rounded-md border border-slate-800 shadow-xl shadow-black/10">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-400">Supplier Info</TableHead>
              <TableHead className="text-slate-400">Contact</TableHead>
              <TableHead className="text-slate-400">GST Number</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                  Loading suppliers...
                </TableCell>
              </TableRow>
            ) : filteredSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                  No suppliers found.
                </TableCell>
              </TableRow>
            ) : (
              filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id} className="border-slate-800 hover:bg-slate-800/50">
                  <TableCell>
                    <div className="font-medium text-slate-200">{supplier.name}</div>
                    <div className="text-sm text-slate-500">{supplier.company_name || "N/A"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-300">{supplier.phone || "N/A"}</div>
                    <div className="text-sm text-slate-500">{supplier.email || "N/A"}</div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-slate-300">{supplier.gst_number || "N/A"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={supplier.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}>
                      {supplier.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10">
                      <Edit size={18} />
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
