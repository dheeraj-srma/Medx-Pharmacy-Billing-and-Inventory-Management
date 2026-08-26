import { useState, useEffect, useMemo, useRef } from "react";
import api from "../../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Trash2, Search, Printer, CheckCircle, Package, Calendar, AlertCircle } from "lucide-react";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface BatchItem {
  id: number;
  product_id: number;
  product_name: string;
  generic_name?: string | null;
  brand?: string | null;
  barcode?: string | null;
  sku?: string | null;
  pack_size?: string | null;
  image_url?: string | null;
  batch_number: string;
  expiry_date: string;
  quantity_available: number;
  mrp: number;
  selling_price: number;
}

interface MatchResult {
  batch: BatchItem;
  tier: number;
  matchIndex: number;
  alphabeticalKey: string;
}

/**
 * Evaluates whether a batch contains the search query and assigns
 * its match tier and position. Returns null if there is no match
 * (strictly excluding items that do not contain the query).
 */
function matchAndRankBatch(batch: BatchItem, rawQuery: string): MatchResult | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return null;

  const name = (batch.product_name || "").toLowerCase();
  const generic = (batch.generic_name || "").toLowerCase();
  const brand = (batch.brand || "").toLowerCase();
  const sku = (batch.sku || "").toLowerCase();
  const barcode = (batch.barcode || "").toLowerCase();
  const batchNum = (batch.batch_number || "").toLowerCase();

  // Strict inclusion check: must match at least one field
  const hasMatch = 
    name.includes(q) ||
    generic.includes(q) ||
    brand.includes(q) ||
    sku.includes(q) ||
    barcode.includes(q) ||
    batchNum.includes(q);

  if (!hasMatch) {
    return null; // Do not display items that do not match
  }

  // 1. Exact match on Barcode or SKU
  if (barcode === q || sku === q) {
    return { batch, tier: 0, matchIndex: 0, alphabeticalKey: batch.product_name };
  }

  // 2. Exact match on Medicine Name
  if (name === q) {
    return { batch, tier: 1, matchIndex: 0, alphabeticalKey: batch.product_name };
  }

  // 3. Medicine Name starts with query at 1st alphabet (Index 0 - True Dictionary Prefix)
  if (name.startsWith(q)) {
    return { batch, tier: 2, matchIndex: 0, alphabeticalKey: batch.product_name };
  }

  // 4. Any Word in Medicine Name starts with query (e.g. "500" in "Paracetamol 500mg")
  const nameWords = name.split(/[\s\-_\/()]+/);
  const wordMatchIdx = nameWords.findIndex(w => w.startsWith(q));
  if (wordMatchIdx !== -1) {
    return { batch, tier: 3, matchIndex: wordMatchIdx, alphabeticalKey: batch.product_name };
  }

  // 5. Generic / Salt Name starts with query at Index 0
  if (generic.startsWith(q)) {
    return { batch, tier: 4, matchIndex: 0, alphabeticalKey: batch.generic_name || batch.product_name };
  }

  // 6. Brand Name starts with query at Index 0
  if (brand.startsWith(q)) {
    return { batch, tier: 5, matchIndex: 0, alphabeticalKey: batch.brand || batch.product_name };
  }

  // 7. Substring match inside Medicine Name ordered by earliest character index (1st, 2nd, 3rd, etc.)
  const namePos = name.indexOf(q);
  if (namePos !== -1) {
    return { batch, tier: 6, matchIndex: namePos, alphabeticalKey: batch.product_name };
  }

  // 8. Substring match inside Generic / Salt Name ordered by character index
  const genericPos = generic.indexOf(q);
  if (genericPos !== -1) {
    return { batch, tier: 7, matchIndex: genericPos, alphabeticalKey: batch.generic_name || batch.product_name };
  }

  // 9. Substring match inside Brand Name
  const brandPos = brand.indexOf(q);
  if (brandPos !== -1) {
    return { batch, tier: 8, matchIndex: brandPos, alphabeticalKey: batch.brand || batch.product_name };
  }

  // 10. Substring match in Batch Number, SKU, or Barcode
  const otherPos = Math.min(
    batchNum.includes(q) ? batchNum.indexOf(q) : 999,
    sku.includes(q) ? sku.indexOf(q) : 999,
    barcode.includes(q) ? barcode.indexOf(q) : 999
  );
  return { batch, tier: 9, matchIndex: otherPos, alphabeticalKey: batch.product_name };
}

export default function POS() {
  const [activeBatches, setActiveBatches] = useState<BatchItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  
  // Sale states
  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState<number | null>(null);
  const [branch, setBranch] = useState("C-Scheme");
  
  const [printSnapshot, setPrintSnapshot] = useState<any>(null);

  useEffect(() => {
    // Fetch available batches and customers
    api.get("/inventory/active-batches").then(res => setActiveBatches(res.data)).catch(console.error);
    api.get("/customers/").then(res => setCustomers(res.data)).catch(console.error);
  }, []);

  // Close dropdown when clicked outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  // Compute matched and ranked batches in strict dictionary matching order
  const filteredBatches = useMemo(() => {
    const q = search.trim();
    if (!q) return [];

    const matched: MatchResult[] = [];
    for (const batch of activeBatches) {
      const res = matchAndRankBatch(batch, q);
      if (res) {
        matched.push(res);
      }
    }

    // Sort:
    // 1. Tier (Prefix matches at index 0 come first)
    // 2. Match Index (Alphabet position 1st, 2nd, 3rd, etc.)
    // 3. Alphabetical order (Dictionary A -> Z)
    // 4. Earliest Expiry (FEFO)
    matched.sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      if (a.matchIndex !== b.matchIndex) {
        return a.matchIndex - b.matchIndex;
      }
      const alpha = a.alphabeticalKey.localeCompare(b.alphabeticalKey, undefined, { sensitivity: 'base' });
      if (alpha !== 0) {
        return alpha;
      }
      return new Date(a.batch.expiry_date).getTime() - new Date(b.batch.expiry_date).getTime();
    });

    return matched.slice(0, 20).map(item => item.batch);
  }, [activeBatches, search]);

  // Reset selected index and ensure dropdown opens when searching
  useEffect(() => {
    setSelectedIndex(0);
    if (search.trim()) {
      setIsDropdownOpen(true);
    }
  }, [search]);

  // Auto-scroll dropdown list to keep keyboard-selected item visible
  useEffect(() => {
    if (listRef.current && filteredBatches.length > 0 && isDropdownOpen) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, filteredBatches.length, isDropdownOpen]);

  const addToCart = (batch: BatchItem) => {
    const existingItem = cart.find(item => item.batch_id === batch.id);
    if (existingItem) {
      if (existingItem.quantity < batch.quantity_available) {
        setCart(cart.map(item => 
          item.batch_id === batch.id 
            ? { ...item, quantity: item.quantity + 1, total_price: (item.quantity + 1) * item.unit_price }
            : item
        ));
      } else {
        alert("Cannot exceed available stock.");
      }
    } else {
      setCart([...cart, {
        product_id: batch.product_id,
        batch_id: batch.id,
        product_name: batch.product_name,
        generic_name: batch.generic_name,
        batch_number: batch.batch_number,
        quantity: 1,
        unit_price: batch.selling_price,
        discount: 0,
        total_price: batch.selling_price,
        max_qty: batch.quantity_available
      }]);
    }
    setSearch("");
    setIsDropdownOpen(false);
    searchInputRef.current?.focus();
  };

  // Keyboard navigation for search input (ArrowUp, ArrowDown, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!search.trim()) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setSelectedIndex(0);
      } else if (filteredBatches.length > 0) {
        setSelectedIndex(prev => (prev + 1) % filteredBatches.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setSelectedIndex(filteredBatches.length - 1);
      } else if (filteredBatches.length > 0) {
        setSelectedIndex(prev => (prev - 1 + filteredBatches.length) % filteredBatches.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isDropdownOpen && filteredBatches.length > 0 && filteredBatches[selectedIndex]) {
        addToCart(filteredBatches[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsDropdownOpen(false);
    }
  };

  const removeFromCart = (batch_id: number) => {
    setCart(cart.filter(item => item.batch_id !== batch_id));
  };

  const updateQuantity = (batch_id: number, newQty: number) => {
    setCart(cart.map(item => {
      if (item.batch_id === batch_id) {
        const validQty = Math.max(1, Math.min(newQty, item.max_qty));
        return { ...item, quantity: validQty, total_price: validQty * item.unit_price };
      }
      return item;
    }));
  };

  const grandTotal = cart.reduce((sum, item) => sum + item.total_price, 0);

  const handlePhoneChange = (val: string) => {
    let cleaned = val.replace(/[^\d+]/g, "");
    if (/^\d{10}$/.test(cleaned)) {
      cleaned = "+91" + cleaned;
    }
    setWalkInPhone(cleaned);

    const cleanNumber = cleaned.replace(/[^\d]/g, "");
    if (cleanNumber.length >= 10) {
      const match = customers.find(c => c.phone && c.phone.replace(/[^\d]/g, "").includes(cleanNumber.slice(-10)));
      if (match) {
        setWalkInName(match.name);
        setMatchedCustomerId(match.id);
      } else {
        setMatchedCustomerId(null);
      }
    } else {
      setMatchedCustomerId(null);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    
    try {
      let finalCustomerId: number | null = null;
      let custName = "Walk-in";
      let custPhone = "N/A";

      if (customerId !== "walk-in") {
        finalCustomerId = parseInt(customerId);
        const c = customers.find(x => x.id.toString() === customerId);
        if (c) {
          custName = c.name;
          custPhone = c.phone || "N/A";
        }
      } else if (matchedCustomerId) {
        finalCustomerId = matchedCustomerId;
        custName = walkInName;
        custPhone = walkInPhone;
      } else if (walkInPhone) {
        const nameToSave = walkInName.trim() || `Customer (${walkInPhone})`;
        try {
          const custRes = await api.post("/customers/", {
            name: nameToSave,
            phone: walkInPhone
          });
          finalCustomerId = custRes.data.id;
          custName = custRes.data.name;
          custPhone = custRes.data.phone || "N/A";
          api.get("/customers/").then(r => setCustomers(r.data));
        } catch (err) {
          console.error("Failed to auto-create customer", err);
          custName = nameToSave;
          custPhone = walkInPhone;
        }
      } else if (walkInName) {
        custName = walkInName;
      }

      const payload = {
        customer_id: finalCustomerId,
        total_amount: grandTotal,
        grand_total: grandTotal,
        payment_method: paymentMethod,
        branch: branch,
        items: cart.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          total_price: item.total_price
        }))
      };

      const res = await api.post("/sales/", payload);

      setPrintSnapshot({
        cart: [...cart],
        grandTotal,
        customerName: custName,
        customerPhone: custPhone,
        invoiceNumber: res.data.invoice_number,
        branch: branch,
        date: new Date().toLocaleString()
      });

      setCompletedSale(res.data);
      setCart([]);
      setWalkInName("");
      setWalkInPhone("");
      setMatchedCustomerId(null);
      
      // Refresh batches to reflect new quantities
      api.get("/inventory/active-batches").then(r => setActiveBatches(r.data));
      
    } catch (error: any) {
      console.error("Checkout failed", error);
      alert(error.response?.data?.detail || "Checkout failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintPDF = () => {
    if (!printSnapshot) return;
    
    const doc = new jsPDF();
    
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(1.5);
    doc.line(14, 15, 196, 15);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(30, 41, 59);
    doc.text("Med-X Pharmacy", 14, 28);
    
    const branchAddress = printSnapshot.branch === "Mansarovar"
      ? "Sector 10, Mansarovar, Jaipur, Rajasthan"
      : "C-Scheme, Jaipur, Rajasthan";
    const branchPhone = printSnapshot.branch === "Mansarovar"
      ? "+91 141-8765432"
      : "+91 9145887170";
    const branchGstin = printSnapshot.branch === "Mansarovar"
      ? "GSTIN: 22AAAAA0000A2Z6"
      : "GSTIN: 22AAAAA0000A1Z5";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(branchAddress, 14, 34);
    doc.text(`Contact: ${branchPhone} | support@medex.com`, 14, 39);
    doc.text(branchGstin, 14, 44);
    
    doc.setFillColor(79, 70, 229);
    doc.rect(130, 22, 66, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("RETAIL BILL / INVOICE", 144, 27.5);
    
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.rect(14, 50, 182, 22, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("INVOICE NO:", 18, 57);
    doc.text("DATE & TIME:", 18, 63);
    doc.text("BRANCH:", 18, 69);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(printSnapshot.invoiceNumber, 48, 57);
    doc.text(printSnapshot.date, 48, 63);
    doc.text(printSnapshot.branch, 48, 69);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("CUSTOMER:", 115, 57);
    doc.text("PHONE:", 115, 63);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(printSnapshot.customerName, 145, 57);
    doc.text(printSnapshot.customerPhone, 145, 63);
    
    const tableData = printSnapshot.cart.map((item: any, index: number) => [
      index + 1,
      item.product_name,
      item.batch_number,
      item.quantity,
      `₹${item.unit_price.toFixed(2)}`,
      `₹${item.total_price.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 78,
      head: [["#", "Product Description", "Batch No", "Qty", "Rate (₹)", "Amount (₹)"]],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [79, 70, 229], 
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'left',
        fontSize: 8.5
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 70 },
        2: { halign: 'center', cellWidth: 32 },
        3: { halign: 'center', cellWidth: 16 },
        4: { halign: 'right', cellWidth: 26 },
        5: { halign: 'right', cellWidth: 28 },
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: [51, 65, 85]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(125, finalY, 71, 14, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Grand Total:", 130, finalY + 9);
    doc.setFontSize(13);
    doc.setTextColor(79, 70, 229);
    doc.text(`₹${printSnapshot.grandTotal.toFixed(2)}`, 160, finalY + 9);
    
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(14, finalY + 20, 196, finalY + 20);
    doc.setLineDashPattern([], 0);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Terms & Conditions:", 14, finalY + 24);
    doc.text("1. Medicines once sold cannot be returned without a valid prescription/bill.", 14, finalY + 28);
    doc.text("2. Please store medicines under recommended conditions.", 14, finalY + 32);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(10);
    doc.text("Thank you for choosing Med-X Pharmacy!", 14, finalY + 40);
    
    doc.save(`Invoice_${printSnapshot.invoiceNumber}.pdf`);
  };

  if (completedSale) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <Card className="text-center p-8 bg-slate-900 border-slate-800 shadow-2xl shadow-black/50 text-white">
          <CheckCircle className="mx-auto text-emerald-400 mb-4 animate-pulse" size={64} />
          <h2 className="text-3xl font-bold text-white mb-2">Sale Completed!</h2>
          <p className="text-slate-400 mb-6">Invoice Number: <strong className="text-emerald-400 font-mono">{completedSale.invoice_number}</strong></p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={handlePrintPDF} className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">
              <Printer className="mr-2" size={18} /> Print PDF Bill
            </Button>
            <Button onClick={() => setCompletedSale(null)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              New Sale
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      {/* Left side: Search and Cart */}
      <div className="col-span-8 flex flex-col space-y-4">
        
        {/* Search Bar with Ranked Dropdown */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400" size={20} />
            <Input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search medicine by name, salt/generic, brand, barcode, SKU..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (search.trim()) setIsDropdownOpen(true); }}
              className="pl-11 pr-24 py-6 text-base w-full bg-slate-900 border-slate-700 text-white placeholder-slate-400 shadow-xl rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
            />
            {search && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                <span>↑↓ Navigate</span>
                <span className="text-indigo-400 font-bold ml-1">↵ Add</span>
              </div>
            )}
          </div>
          
          {isDropdownOpen && search.trim() && (
            <div className="absolute z-50 w-full mt-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl shadow-black/80 overflow-hidden">
              {filteredBatches.length > 0 ? (
                <ul ref={listRef} className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
                  {filteredBatches.map((batch, index) => {
                    const isSelected = index === selectedIndex;
                    const isExpiringSoon = (() => {
                      const today = new Date();
                      const exp = new Date(batch.expiry_date);
                      const diffDays = (exp.getTime() - today.getTime()) / (1000 * 3600 * 24);
                      return diffDays <= 45;
                    })();

                    return (
                      <li 
                        key={batch.id} 
                        className={`p-3.5 cursor-pointer flex justify-between items-center transition-all ${
                          isSelected ? "bg-indigo-600/20 border-l-4 border-indigo-500 pl-2.5" : "hover:bg-slate-800/60"
                        }`}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => addToCart(batch)}
                      >
                        <div className="space-y-1 flex-1 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-100 text-sm">{batch.product_name}</span>
                            {batch.generic_name && (
                              <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                {batch.generic_name}
                              </span>
                            )}
                            {batch.brand && (
                              <span className="text-[11px] text-slate-400">
                                ({batch.brand})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                            <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">
                              Batch: {batch.batch_number}
                            </span>
                            <span className={`flex items-center gap-1 ${isExpiringSoon ? "text-amber-400 font-medium" : "text-slate-400"}`}>
                              <Calendar size={12} /> Exp: {new Date(batch.expiry_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                            </span>
                            {batch.pack_size && (
                              <span className="text-slate-400">• {batch.pack_size}</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end gap-1">
                          <div className="font-bold text-emerald-400 text-base">₹{batch.selling_price.toFixed(2)}</div>
                          <Badge 
                            variant="outline" 
                            className={batch.quantity_available <= 10 
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[11px]" 
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px]"
                            }
                          >
                            {batch.quantity_available} in stock
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-6 text-center text-slate-400 space-y-1">
                  <AlertCircle className="mx-auto text-slate-500 mb-1" size={24} />
                  <p className="font-medium text-slate-300">No matching in-stock medicine found</p>
                  <p className="text-xs text-slate-500">Check spelling or search by generic name, salt, or batch number.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart Table */}
        <Card className="flex-1 overflow-hidden flex flex-col bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader className="bg-slate-900/80 py-3 border-b border-slate-800">
            <CardTitle className="text-lg flex items-center justify-between text-slate-200">
              <span className="flex items-center gap-2">
                <ShoppingCart className="text-indigo-400" size={20} /> Current Bill
              </span>
              <span className="text-xs font-normal text-slate-400">
                {cart.length} {cart.length === 1 ? "item" : "items"} added
              </span>
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-900 sticky top-0 z-0 shadow-sm">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="w-24 text-slate-400 text-center">Qty</TableHead>
                  <TableHead className="text-slate-400">Rate</TableHead>
                  <TableHead className="text-slate-400">Total</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-24 text-slate-500">
                      <Package className="mx-auto text-slate-600 mb-2" size={32} />
                      <p className="font-medium text-slate-400">Cart is empty</p>
                      <p className="text-xs text-slate-600 mt-0.5">Use the search box above to add medicines</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map(item => (
                    <TableRow key={item.batch_id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell>
                        <div className="font-medium text-slate-200">{item.product_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span className="font-mono text-slate-400">Batch: {item.batch_number}</span>
                          {item.generic_name && (
                            <span className="text-indigo-400/80">• {item.generic_name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input 
                          type="number" 
                          min="1" 
                          max={item.max_qty}
                          value={item.quantity} 
                          onChange={(e) => updateQuantity(item.batch_id, parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center p-1 bg-slate-950 border-slate-700 text-white mx-auto font-semibold"
                        />
                      </TableCell>
                      <TableCell className="text-slate-300 font-mono">₹{item.unit_price.toFixed(2)}</TableCell>
                      <TableCell className="font-bold text-emerald-400 font-mono">₹{item.total_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 h-8 w-8" 
                          onClick={() => removeFromCart(item.batch_id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Right side: Checkout Panel */}
      <div className="col-span-4 h-full">
        <Card className="h-full flex flex-col bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader className="bg-slate-900/80 text-white py-4 border-b border-slate-800">
            <CardTitle className="text-lg">Checkout Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-4 space-y-6">
            
            <div className="space-y-4 flex-1">
              <div className="space-y-2">
                <Label className="text-slate-300">Billing Branch</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="C-Scheme">C-Scheme Branch (Jaipur)</SelectItem>
                    <SelectItem value="Mansarovar">Mansarovar Branch (Jaipur)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-white">
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.phone || 'N/A'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {customerId === "walk-in" && (
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Name (Optional)</Label>
                      <Input 
                        placeholder="Customer Name" 
                        value={walkInName}
                        onChange={(e) => setWalkInName(e.target.value)}
                        className="h-8 text-sm bg-slate-950 border-slate-700 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Phone (Optional)</Label>
                      <Input 
                        placeholder="Phone Number" 
                        value={walkInPhone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        className="h-8 text-sm bg-slate-950 border-slate-700 text-white"
                      />
                    </div>
                    {matchedCustomerId && (
                      <div className="col-span-2 text-xs text-emerald-400 font-medium mt-1">
                        ✓ Recognized Saved Customer: {walkInName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal ({cart.length} items)</span>
                <span className="font-mono">₹{grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Discount</span>
                <span className="font-mono">₹0.00</span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-dashed border-slate-700">
                <span className="text-xl font-bold text-slate-200">Total Pay</span>
                <span className="text-3xl font-bold text-emerald-400 font-mono">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <Button 
              className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/20"
              disabled={cart.length === 0 || isSubmitting}
              onClick={handleCheckout}
            >
              {isSubmitting ? "Processing..." : "Complete Checkout"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
