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
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Building2, Phone, Mail } from "lucide-react";

export default function SuppliersList() {
  const { suppliers, fetchSuppliers } = useDataStore();
  const { data: suppliersData, loading } = suppliers;
  const [search, setSearch] = useState("");

  useEffect(() => {
    // No-op if data is fresh; background-sync if stale
    fetchSuppliers();
  }, [fetchSuppliers]);

  const filteredSuppliers = suppliersData.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.company_name && s.company_name.toLowerCase().includes(search.toLowerCase())) ||
    (s.phone && s.phone.includes(search)) ||
    (s.gst_number && s.gst_number.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search supplier, agency, GST..." 
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
                    <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Building2 size={12} className="text-slate-500" />
                      {supplier.company_name || "Independent"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-300 flex items-center gap-1.5">
                      <Phone size={12} className="text-slate-500" />
                      {supplier.phone || "N/A"}
                    </div>
                    {supplier.email && (
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Mail size={12} className="text-slate-500" />
                        {supplier.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {supplier.gst_number || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={supplier.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}>
                      {supplier.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to={`/admin/suppliers/edit/${supplier.id}`}>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                        title="Edit Supplier"
                      >
                        <Edit size={18} />
                      </Button>
                    </Link>
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
