import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useModal } from "../../providers/ModalProvider";
import { useDataStore } from "../../store/dataStore";
import api from "../../services/api";
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
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MedicineIcon } from "../../lib/medicineIcon";

export default function ProductsList() {
  const { showAlert, showConfirm } = useModal();
  const { products, fetchProducts, invalidate } = useDataStore();
  const { data: productsData, loading } = products;
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    // No-op if data is fresh; background-sync if stale
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = productsData.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.generic_name && p.generic_name.toLowerCase().includes(search.toLowerCase())) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDeleteProduct = async (product: any) => {
    if (!await showConfirm("Confirm Action", `Are you sure you want to deactivate/archive "${product.name}"?`)) {
      return;
    }

    try {
      setDeletingId(product.id);
      await api.delete(`/products/${product.id}`);
      invalidate('products');
      fetchProducts(true);
    } catch (err: any) {
      console.error("Failed to delete product", err);
      showAlert("Error", err.response?.data?.detail || "Failed to delete product.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search name, generic, SKU..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Link to="/admin/products/new">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="mr-2" size={18} /> Add Product
          </Button>
        </Link>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm rounded-md border border-slate-800 shadow-xl shadow-black/10">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-16 text-slate-400">Image</TableHead>
              <TableHead className="text-slate-400">Product Info</TableHead>
              <TableHead className="text-slate-400">Pricing</TableHead>
              <TableHead className="text-slate-400">SKU / HSN</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  Loading products...
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id} className="border-slate-800 hover:bg-slate-800/50">
                  <TableCell>
                    <div className="w-10 h-10 bg-slate-800 rounded overflow-hidden flex items-center justify-center border border-slate-700">
                      {product.image_url ? (
                        <img 
                          src={product.image_url.startsWith("http") ? product.image_url : `http://localhost:8000${product.image_url}`} 
                          alt={product.name} 
                          className="w-full h-full object-cover" 
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = "none";
                            target.parentElement?.querySelector(".img-fallback")?.classList.remove("hidden");
                          }}
                        />
                      ) : null}
                      <div className={`img-fallback flex items-center justify-center w-full h-full ${product.image_url ? "hidden" : ""}`}>
                        <MedicineIcon product={product} size={20} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-slate-200">{product.name}</div>
                    <div className="text-xs text-slate-400">
                      {product.generic_name ? `${product.generic_name} • ` : ""}{product.pack_size || "1 Unit"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-emerald-400">₹{product.selling_price}</div>
                    <div className="text-xs text-slate-500 line-through">MRP: ₹{product.mrp}</div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-slate-300">{product.sku || product.hsn_code || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={product.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}>
                      {product.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/admin/products/edit/${product.id}`}>
                        <Tooltip><TooltipTrigger asChild><Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                          
                        >
                          <Edit size={16} />
                        </Button></TooltipTrigger><TooltipContent>Edit Product</TooltipContent></Tooltip>
                      </Link>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            disabled={deletingId === product.id}
                            onClick={() => handleDeleteProduct(product)}
                            className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Archive Product</TooltipContent>
                      </Tooltip>
                    </div>
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
