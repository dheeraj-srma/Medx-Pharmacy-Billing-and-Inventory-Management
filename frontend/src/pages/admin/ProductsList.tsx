import { useEffect, useState, useMemo } from "react";
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
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Activity, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight 
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MedicineIcon } from "../../lib/medicineIcon";
import { searchAndRank, HighlightedText } from "@/lib/searchEngine";

export default function ProductsList() {
  const { showAlert, showConfirm } = useModal();
  const { products, fetchProducts, invalidate } = useDataStore();
  const { data: productsData, loading } = products;
  
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "healthy" | "low" | "critical" | "out_of_stock">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    // No-op if data is fresh; background-sync if stale
    fetchProducts();
  }, [fetchProducts]);

  // Compute stock counts for filter pills
  const counts = useMemo(() => {
    let healthy = 0;
    let low = 0;
    let critical = 0;
    let outOfStock = 0;

    productsData.forEach(p => {
      const qty = Number(p.total_stock ?? 0);
      const reorder = Number(p.reorder_level ?? 10);
      const criticalThreshold = Math.max(2, Math.floor(reorder / 2));

      if (qty <= 0) {
        outOfStock++;
      } else if (qty <= criticalThreshold) {
        critical++;
      } else if (qty <= reorder) {
        low++;
      } else {
        healthy++;
      }
    });

    return {
      all: productsData.length,
      healthy,
      low,
      critical,
      outOfStock
    };
  }, [productsData]);

  const filteredProducts = useMemo(() => {
    // 1. Filter by stock status pills
    let list = productsData.filter(p => {
      const qty = Number(p.total_stock ?? 0);
      const reorder = Number(p.reorder_level ?? 10);
      const criticalThreshold = Math.max(2, Math.floor(reorder / 2));

      if (stockFilter === "healthy") {
        return qty > reorder;
      } else if (stockFilter === "low") {
        return qty > criticalThreshold && qty <= reorder;
      } else if (stockFilter === "critical") {
        return qty > 0 && qty <= criticalThreshold;
      } else if (stockFilter === "out_of_stock") {
        return qty <= 0;
      }
      return true;
    });

    // 2. Multi-tier search and ranking (Exact matches -> Best matches -> Words in order)
    if (search.trim()) {
      const ranked = searchAndRank(
        list,
        search,
        (p) => [p.name, p.generic_name, p.brand, p.sku, p.barcode, p.hsn_code]
      );
      list = ranked.map((r) => r.item);
    }

    return list;
  }, [productsData, search, stockFilter]);

  // Pagination calculations
  const totalItems = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

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

  const getStockBadge = (product: any) => {
    const qty = Number(product.total_stock ?? 0);
    const reorder = Number(product.reorder_level ?? 10);
    const criticalThreshold = Math.max(2, Math.floor(reorder / 2));

    if (qty <= 0) {
      return (
        <Badge 
          variant="outline" 
          className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-semibold px-2.5 py-0.5 text-xs inline-flex items-center"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 animate-pulse" />
          0 • Out of Stock
        </Badge>
      );
    }

    if (qty <= criticalThreshold) {
      return (
        <Badge 
          variant="outline" 
          className="bg-orange-500/10 text-orange-400 border-orange-500/20 font-semibold px-2.5 py-0.5 text-xs inline-flex items-center"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mr-1.5" />
          {qty} • Critical
        </Badge>
      );
    }

    if (qty <= reorder) {
      return (
        <Badge 
          variant="outline" 
          className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-semibold px-2.5 py-0.5 text-xs inline-flex items-center"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
          {qty} • Low Stock
        </Badge>
      );
    }

    return (
      <Badge 
        variant="outline" 
        className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-semibold px-2.5 py-0.5 text-xs inline-flex items-center"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
        {qty} in stock
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Quick Filters on Left, Search Bar next to it, Add Product Button on Right */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Quick Filters to the left of the search bar */}
          <div className="flex flex-wrap items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800 gap-1 shadow-sm">
            <button
              type="button"
              onClick={() => { setStockFilter("all"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                stockFilter === "all"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              All
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${stockFilter === "all" ? "bg-indigo-700 text-white" : "bg-slate-800 text-slate-400"}`}>
                {counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setStockFilter("healthy"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                stockFilter === "healthy"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Healthy
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${stockFilter === "healthy" ? "bg-emerald-500/30 text-emerald-200" : "bg-slate-800 text-slate-400"}`}>
                {counts.healthy}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setStockFilter("low"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                stockFilter === "low"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                  : "text-slate-400 hover:text-amber-400 hover:bg-slate-800/50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Low
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${stockFilter === "low" ? "bg-amber-500/30 text-amber-200" : "bg-slate-800 text-slate-400"}`}>
                {counts.low}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setStockFilter("critical"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                stockFilter === "critical"
                  ? "bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm"
                  : "text-slate-400 hover:text-orange-400 hover:bg-slate-800/50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Critical
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${stockFilter === "critical" ? "bg-orange-500/30 text-orange-200" : "bg-slate-800 text-slate-400"}`}>
                {counts.critical}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setStockFilter("out_of_stock"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                stockFilter === "out_of_stock"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm"
                  : "text-slate-400 hover:text-rose-400 hover:bg-slate-800/50"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Out of Stock
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${stockFilter === "out_of_stock" ? "bg-rose-500/30 text-rose-200" : "bg-slate-800 text-slate-400"}`}>
                {counts.outOfStock}
              </span>
            </button>
          </div>

          {/* Search bar immediately adjacent to filters */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input 
              type="text" 
              placeholder="Search name, generic, SKU..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>

        {/* Action Button */}
        <Link to="/admin/products/new" className="shrink-0">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
            <Plus className="mr-2" size={18} /> Add Product
          </Button>
        </Link>
      </div>

      {/* Table Container */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-16 text-slate-400">Image</TableHead>
              <TableHead className="text-slate-400">Product Info</TableHead>
              <TableHead className="text-slate-400">Pricing</TableHead>
              <TableHead className="text-slate-400">Stock Qty</TableHead>
              <TableHead className="text-slate-400">SKU / HSN</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <Activity size={20} className="animate-ecg-pulse text-indigo-400" />
                    <span>Loading products...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                  No products found matching the criteria.
                </TableCell>
              </TableRow>
            ) : (
              paginatedProducts.map((product) => (
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
                    <div className="font-semibold text-slate-200">
                      <HighlightedText text={product.name} query={search} />
                    </div>
                    <div className="text-xs text-slate-400">
                      {product.generic_name ? `${product.generic_name} • ` : ""}
                      {product.pack_size || "1 Unit"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-emerald-400">₹{product.selling_price}</div>
                    <div className="text-xs text-slate-500 line-through">MRP: ₹{product.mrp}</div>
                  </TableCell>
                  <TableCell>
                    {getStockBadge(product)}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-slate-300">
                      {product.sku || product.hsn_code || "—"}
                    </span>
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

        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Showing {startIndex + 1} to {endIndex} of {totalItems} products</span>
              <span className="text-slate-600">|</span>
              <span>Rows per page:</span>
              <Select 
                value={pageSize.toString()} 
                onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
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
              <span className="mr-2">Page {safeCurrentPage} of {totalPages}</span>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1}
                className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                title="First Page"
              >
                <ChevronsLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={safeCurrentPage <= 1}
                className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="h-7 w-7 bg-slate-900 border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800"
                title="Next Page"
              >
                <ChevronRight size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages}
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
  );
}
