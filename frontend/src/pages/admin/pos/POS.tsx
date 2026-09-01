import { useModal } from "@/providers/ModalProvider";
import { useState, useEffect, useMemo, useRef } from "react";
import api from "../../../services/api";
import { useAuthStore } from "../../../store/authStore";
import { useDataStore } from "../../../store/dataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Trash2, Search, Printer, CheckCircle, Calendar, AlertCircle } from "lucide-react";

import { formatDateDDMMYYYY, checkLooseEligibility } from "@/lib/utils";
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
  const { showAlert, showConfirm } = useModal();
  const { user } = useAuthStore();
  const { branches, fetchBranches } = useDataStore();
  const [selectedBranchId, setSelectedBranchId] = useState<number>(user?.branch_id || 1);
  const [activeBatches, setActiveBatches] = useState<BatchItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);
  
  // Sale states
  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState<number | null>(null);
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [taxPercent, setTaxPercent] = useState<number>(0);
  
  const [printSnapshot, setPrintSnapshot] = useState<any>(null);

  // Sync selectedBranchId when user object finishes loading
  useEffect(() => {
    if (user?.branch_id) {
      setSelectedBranchId(user.branch_id);
    }
  }, [user]);

  useEffect(() => {
    // Fetch available batches for the selected branch
    api.get("/inventory/active-batches", { params: { branch_id: selectedBranchId } })
      .then(res => {
        const normalized = (res.data || []).map((b: any) => ({
          ...b,
          quantity_available: Number(b.quantity_available) || 0,
          mrp: Number(b.mrp) || 0,
          selling_price: Number(b.selling_price) || 0,
        }));
        setActiveBatches(normalized);
      })
      .catch(console.error);
  }, [selectedBranchId]);

  useEffect(() => {
    // Fetch settings for the selected branch to print correct branch info on invoice
    api.get("/settings/", { params: { branch_id: selectedBranchId } })
      .then(res => {
        setStoreSettings(res.data);
        if (res.data?.default_tax_rate !== undefined) {
          setTaxPercent(res.data.default_tax_rate);
        }
      })
      .catch(console.error);
  }, [selectedBranchId]);

  useEffect(() => {
    api.get("/customers/").then(res => setCustomers(res.data)).catch(console.error);
  }, []);

  const handleBranchChange = async (value: string) => {
    const newBranchId = parseInt(value);
    if (cart.length > 0) {
      if (await showConfirm("Change Branch", "Changing the branch will clear your current cart. Do you want to proceed?")) {
        setCart([]);
        setSelectedBranchId(newBranchId);
      }
    } else {
      setSelectedBranchId(newBranchId);
    }
  };

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
    const eligibility = checkLooseEligibility(batch.pack_size, batch.product_name);
    const existingItem = cart.find(item => item.batch_id === batch.id);
    
    if (existingItem) {
      if (existingItem.quantity < batch.quantity_available) {
        setCart(cart.map(item => {
          if (item.cart_id === existingItem.cart_id) {
            const nextQty = item.quantity + 1;
            if (item.is_loose) {
              const nextPacks = (item.packs || 0) + 1;
              const looseTabs = item.loose_tablets || 0;
              const calculatedQty = Number((nextPacks + (looseTabs / (item.tablets_per_pack || 1))).toFixed(4));
              const totalPrice = Number(((nextPacks * item.unit_price) + (looseTabs * (item.unit_price / (item.tablets_per_pack || 1)))).toFixed(2));
              return { 
                ...item, 
                quantity: calculatedQty, 
                packs: nextPacks, 
                total_price: totalPrice 
              };
            } else {
              return { 
                ...item, 
                quantity: nextQty, 
                packs: nextQty, 
                total_price: Number((nextQty * item.unit_price).toFixed(2)) 
              };
            }
          }
          return item;
        }));
      } else {
        showAlert("Stock Limit", "Cannot exceed available stock.");
      }
    } else {
      const uniqueCartId = `cart_${batch.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setCart([...cart, {
        cart_id: uniqueCartId,
        product_id: batch.product_id,
        batch_id: batch.id,
        product_name: batch.product_name,
        generic_name: batch.generic_name,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        quantity: 1,
        unit_price: Number(batch.selling_price) || 0,
        discount: 0,
        total_price: Number(batch.selling_price) || 0,
        max_qty: Number(batch.quantity_available) || 0,
        can_sell_loose: eligibility.canSellLoose,
        unit_label: eligibility.unitLabel,
        tablets_per_pack: eligibility.unitsPerPack,
        is_loose: false,
        packs: 1,
        loose_tablets: 0
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

  const removeFromCart = (cart_id: string) => {
    setCart(prevCart => prevCart.filter(item => item.cart_id !== cart_id));
  };

  const toggleLoose = (cart_id: string) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.cart_id === cart_id) {
        const nextLoose = !item.is_loose;
        if (nextLoose) {
          // As requested: start with 0 packs, 0 tabs when selling loose
          return {
            ...item,
            is_loose: true,
            packs: 0,
            loose_tablets: 0,
            quantity: 0,
            total_price: 0
          };
        } else {
          // Switch back to whole pack: reset to 1 pack
          const finalPacks = Math.max(1, item.packs || 1);
          return {
            ...item,
            is_loose: false,
            packs: finalPacks,
            loose_tablets: 0,
            quantity: finalPacks,
            total_price: Number((finalPacks * item.unit_price).toFixed(2))
          };
        }
      }
      return item;
    }));
  };

  const updatePacks = (cart_id: string, newPacks: number) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.cart_id === cart_id) {
        const maxPacks = Math.floor(item.max_qty);
        const validPacks = Math.max(0, Math.min(newPacks, maxPacks));
        const currentLoose = item.loose_tablets || 0;
        const totalReq = validPacks + (currentLoose / (item.tablets_per_pack || 1));
        
        let finalPacks = validPacks;
        if (totalReq > item.max_qty) {
          finalPacks = Math.floor(item.max_qty - (currentLoose / (item.tablets_per_pack || 1)));
          if (finalPacks < 0) finalPacks = 0;
        }
        
        const calculatedQty = Number((finalPacks + (currentLoose / (item.tablets_per_pack || 1))).toFixed(4));
        const totalPrice = Number(((finalPacks * item.unit_price) + (currentLoose * (item.unit_price / (item.tablets_per_pack || 1)))).toFixed(2));
        
        return {
          ...item,
          packs: finalPacks,
          quantity: calculatedQty,
          total_price: totalPrice
        };
      }
      return item;
    }));
  };

  const updateLooseTablets = (cart_id: string, newTabs: number) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.cart_id === cart_id) {
        const perPack = item.tablets_per_pack || 10;
        const validTabs = Math.max(0, Math.min(newTabs, perPack - 1));
        const currentPacks = item.packs || 0;
        const totalReq = currentPacks + (validTabs / perPack);
        
        let finalTabs = validTabs;
        if (totalReq > item.max_qty) {
          const remainingPacks = item.max_qty - currentPacks;
          finalTabs = Math.floor(remainingPacks * perPack);
          if (finalTabs < 0) finalTabs = 0;
        }
        
        const calculatedQty = Number((currentPacks + (finalTabs / perPack)).toFixed(4));
        const totalPrice = Number(((currentPacks * item.unit_price) + (finalTabs * (item.unit_price / perPack))).toFixed(2));
        
        return {
          ...item,
          loose_tablets: finalTabs,
          quantity: calculatedQty,
          total_price: totalPrice
        };
      }
      return item;
    }));
  };

  const updateQuantity = (cart_id: string, newQty: number) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.cart_id === cart_id) {
        const validQty = Math.max(1, Math.min(newQty, item.max_qty));
        return { 
          ...item, 
          quantity: validQty, 
          packs: validQty, 
          loose_tablets: 0,
          total_price: Number((validQty * item.unit_price).toFixed(2)) 
        };
      }
      return item;
    }));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total_price, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (taxPercent / 100);
  const rawGrandTotal = Math.max(0, taxableAmount + taxAmount);
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = grandTotal - rawGrandTotal;

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

      // Validate that all cart items have quantity > 0
      const zeroQtyItem = cart.find(it => !it.quantity || it.quantity <= 0);
      if (zeroQtyItem) {
        showAlert(
          "Invalid Quantity", 
          `Please specify at least 1 pack or 1 tablet/capsule for "${zeroQtyItem.product_name}".`
        );
        setIsSubmitting(false);
        return;
      }

      const payload = {
        customer_id: finalCustomerId,
        total_amount: subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        round_off: roundOff,
        grand_total: grandTotal,
        payment_method: paymentMethod,
        branch_id: selectedBranchId,
        items: cart.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: Number(item.quantity.toFixed(4)),
          unit_price: item.unit_price,
          discount: item.discount,
          total_price: item.total_price
        }))
      };

      const res = await api.post("/sales/", payload);

      setPrintSnapshot({
        cart: res.data.items && res.data.items.length > 0 ? res.data.items.map((it: any) => {
          const matchedCartItem = cart.find(c => c.product_id === it.product_id || c.batch_id === it.batch_id);
          return {
            product_name: it.product_name || matchedCartItem?.product_name || "Medicine",
            batch_number: it.batch_number || matchedCartItem?.batch_number || "-",
            quantity: it.quantity,
            unit_price: Number(it.unit_price),
            discount: Number(it.discount),
            total_price: Number(it.total_price),
            is_loose: matchedCartItem?.is_loose,
            packs: matchedCartItem?.packs,
            loose_tablets: matchedCartItem?.loose_tablets,
            tablets_per_pack: matchedCartItem?.tablets_per_pack
          };
        }) : [...cart],
        subtotal: Number(res.data.total_amount ?? subtotal),
        discountPercent,
        discountAmount: Number(res.data.discount_amount ?? discountAmount),
        taxPercent,
        taxAmount: Number(res.data.tax_amount ?? taxAmount),
        roundOff: Number(res.data.round_off ?? roundOff),
        grandTotal: Number(res.data.grand_total ?? grandTotal),
        customerName: custName,
        customerPhone: custPhone,
        invoiceNumber: res.data.invoice_number,
        date: formatDateDDMMYYYY(res.data.sale_date || res.data.created_at || Date.now(), true)
      });

      setCompletedSale(res.data);
      setCart([]);
      setDiscountPercent(0);
      setTaxPercent(0);
      setWalkInName("");
      setWalkInPhone("");
      setMatchedCustomerId(null);
      
      // Refresh batches to reflect new quantities
      api.get("/inventory/active-batches", { params: { branch_id: selectedBranchId } })
        .then(r => {
          const normalized = (r.data || []).map((b: any) => ({
            ...b,
            quantity_available: Number(b.quantity_available) || 0,
            mrp: Number(b.mrp) || 0,
            selling_price: Number(b.selling_price) || 0,
          }));
          setActiveBatches(normalized);
        });
      
    } catch (error: any) {
      console.error("Checkout failed", error);
      const detail = error.response?.data?.detail;
      let msg = "Checkout failed. Please check stock and try again.";
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(", ");
      }
      showAlert("Checkout Failed", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadLogo = (): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = "/logo.png";
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
    });
  };

  const handlePrintPDF = async () => {
    if (!printSnapshot) return;
    
    const doc = new jsPDF({ compress: true });
    
    // Top Accent Bar (Inspired by HTML template)
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
    
    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(67, 56, 202); // #4338CA
    doc.text("Med-X Pharmacy", textXOffset, 31);
    
    const branchAddress = storeSettings?.address || "Jaipur, Rajasthan";
    const branchPhone = storeSettings?.phone || "";
    const branchEmail = storeSettings?.email || "medxpharmacy7170@gmail.com";
    
    const printGstinEnabled = storeSettings?.print_gstin ?? true;
    let branchGstin = "";
    if (printGstinEnabled && storeSettings?.gstin) {
      branchGstin = `GSTIN: ${storeSettings.gstin}`;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(branchAddress, textXOffset, 37);
    
    let contactLine = `Contact: ${branchPhone} | ${branchEmail}`;
    if (branchGstin) {
      contactLine += ` | ${branchGstin}`;
    }
    doc.text(contactLine, textXOffset, 42);
    
    // Badge Label
    doc.setFillColor(67, 56, 202);
    doc.rect(140, 22, 56, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("RETAIL BILL / INVOICE", 145, 27.5);
    
    // Info panels (Invoice & Customer details)
    doc.setFillColor(247, 248, 252);
    doc.setDrawColor(230, 231, 238);
    doc.setLineWidth(0.5);
    doc.rect(14, 50, 182, 22, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("INVOICE DETAILS", 18, 55);
    doc.text("CUSTOMER DETAILS", 115, 55);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Invoice No:", 18, 61);
    doc.text("Date:", 18, 67);
    
    doc.text("Name:", 115, 61);
    doc.text("Phone:", 115, 67);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 30, 41);
    doc.text(printSnapshot.invoiceNumber, 42, 61);
    doc.text(printSnapshot.date, 42, 67);
    
    doc.text(printSnapshot.customerName, 130, 61);
    doc.text(printSnapshot.customerPhone, 130, 67);
    
    const tableData = printSnapshot.cart.map((item: any, index: number) => [
      index + 1,
      item.product_name,
      item.batch_number,
      item.is_loose 
        ? `${item.packs || 0}p + ${item.loose_tablets || 0}t`
        : (typeof item.quantity === "number" && !Number.isInteger(item.quantity)
            ? item.quantity.toFixed(2)
            : `${item.quantity}`),
      `Rs. ${item.is_loose
        ? (item.unit_price / (item.tablets_per_pack || 1)).toFixed(2)
        : item.unit_price.toFixed(2)}`,
      `${printSnapshot.discountPercent}%`,
      `${printSnapshot.taxPercent}%`,
      `Rs. ${item.total_price.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 78,
      head: [["#", "Product", "Batch", "Qty", "Unit Price", "Discount", "Tax", "Total Price"]],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [67, 56, 202], 
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'left',
        fontSize: 8.5
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 54 },
        2: { halign: 'center', cellWidth: 26 },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 18 },
        6: { halign: 'center', cellWidth: 16 },
        7: { halign: 'right', cellWidth: 24 },
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
    
    // Draw breakdown box
    doc.setFillColor(247, 248, 252);
    doc.setDrawColor(230, 231, 238);
    doc.rect(120, finalY, 76, 32, "FD");
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    
    // Row 1: Subtotal
    doc.text("Subtotal:", 124, finalY + 7);
    doc.text(`Rs. ${Number(printSnapshot.subtotal ?? 0).toFixed(2)}`, 192, finalY + 7, { align: "right" });
    
    // Row 2: Discount
    doc.text(`Discount (${printSnapshot.discountPercent}%):`, 124, finalY + 14);
    doc.text(`-Rs. ${Number(printSnapshot.discountAmount ?? 0).toFixed(2)}`, 192, finalY + 14, { align: "right" });
    
    // Row 3: Tax
    doc.text(`Tax (${printSnapshot.taxPercent}%):`, 124, finalY + 21);
    doc.text(`+Rs. ${Number(printSnapshot.taxAmount ?? 0).toFixed(2)}`, 192, finalY + 21, { align: "right" });

    // Row 4: Round Off
    const roundOffVal = Number(printSnapshot.roundOff ?? 0);
    doc.text("Round Off:", 124, finalY + 28);
    doc.text(`${roundOffVal >= 0 ? "+Rs. " : "-Rs. "}${Math.abs(roundOffVal).toFixed(2)}`, 192, finalY + 28, { align: "right" });
    
    // Draw a divider line
    doc.setDrawColor(230, 231, 238);
    doc.line(124, finalY + 31, 192, finalY + 31);
    
    // Row 5: Total Pay
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(67, 56, 202);
    doc.text("Total Pay:", 124, finalY + 36);
    doc.text(`Rs. ${Number(printSnapshot.grandTotal ?? 0).toFixed(2)}`, 192, finalY + 36, { align: "right" });
    
    doc.setDrawColor(230, 231, 238);
    doc.line(14, finalY + 45, 196, finalY + 45);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("TERMS & CONDITIONS:", 14, finalY + 42);
    
    doc.setFont("helvetica", "normal");
    doc.text("1. Medicines once sold cannot be returned without a valid prescription/bill.", 14, finalY + 46);
    doc.text("2. Please store medicines under recommended conditions.", 14, finalY + 50);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(67, 56, 202);
    doc.setFontSize(10);
    doc.text("Thank you for choosing Med-X Pharmacy!", 14, finalY + 58);

    // Bottom Footer Strip
    doc.setFillColor(67, 56, 202);
    doc.rect(14, finalY + 62, 182, 1, "F");
    
    doc.save(`Invoice_${printSnapshot.invoiceNumber}.pdf`);
  };

  if (user?.role === "superadmin") {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <Card className="text-center p-8 bg-slate-900 border-slate-800 shadow-2xl shadow-black/50 text-white">
          <AlertCircle className="mx-auto text-amber-500 mb-4 animate-bounce" size={64} />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400 mb-6">
            Superadmin accounts have read-only access and are not allowed to create sales invoices or access the billing terminal.
          </p>
        </Card>
      </div>
    );
  }

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
                              <Calendar size={12} /> Exp: {formatDateDDMMYYYY(batch.expiry_date)}
                            </span>
                            {batch.pack_size && (
                              <span className="text-slate-400">• {batch.pack_size}</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end gap-1">
                          <div className="font-bold text-emerald-400 text-base">₹{Number(batch.selling_price || 0).toFixed(2)}</div>
                          <Badge 
                            variant="outline" 
                            className={Number(batch.quantity_available || 0) <= 10 
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[11px]" 
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px]"
                            }
                          >
                            {Number(batch.quantity_available || 0)} in stock
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
                      <ShoppingCart className="mx-auto text-slate-600 mb-2" size={32} />
                      <p className="font-medium text-slate-400">Cart is empty</p>
                      <p className="text-xs text-slate-600 mt-0.5">Use the search box above to add medicines</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map(item => (
                    <TableRow key={item.cart_id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell>
                        <div className="font-medium text-slate-200">{item.product_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-slate-400">Batch: {item.batch_number}</span>
                          {item.generic_name && (
                            <span className="text-indigo-400/80">• {item.generic_name}</span>
                          )}
                          {item.can_sell_loose && item.tablets_per_pack > 1 && (
                            <span className="text-slate-500">• {item.tablets_per_pack} {item.unit_label || "tabs"}/pack</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center py-2.5">
                        {item.is_loose ? (
                          <div className="flex flex-col gap-1 items-center">
                            <div className="flex items-center gap-1 justify-center">
                              <div className="flex flex-col items-center">
                                <Input 
                                  type="number" 
                                  min="0"
                                  value={item.packs} 
                                  onChange={(e) => updatePacks(item.cart_id, parseInt(e.target.value) || 0)}
                                  className="w-11 h-8 text-center p-1 bg-slate-950 border-slate-700 text-white font-semibold"
                                />
                                <span className="text-[8.5px] text-slate-500 font-medium mt-0.5">Packs</span>
                              </div>
                              <span className="text-slate-500 font-bold text-xs">+</span>
                              <div className="flex flex-col items-center">
                                <Input 
                                  type="number" 
                                  min="0" 
                                  max={item.tablets_per_pack - 1}
                                  value={item.loose_tablets} 
                                  onChange={(e) => updateLooseTablets(item.cart_id, parseInt(e.target.value) || 0)}
                                  className="w-11 h-8 text-center p-1 bg-slate-950 border-slate-700 text-white font-semibold"
                                />
                                <span className="text-[8.5px] text-slate-500 font-medium mt-0.5">{item.unit_label === "caps" ? "Caps" : "Tabs"}</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => toggleLoose(item.cart_id)} 
                              className="text-[9.5px] text-indigo-400 hover:text-indigo-300 font-semibold underline mt-0.5"
                            >
                              Switch to Pack
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 items-center">
                            <Input 
                              type="number" 
                              min="1" 
                              max={Math.floor(item.max_qty)}
                              value={item.quantity} 
                              onChange={(e) => updateQuantity(item.cart_id, parseInt(e.target.value) || 1)}
                              className="w-16 h-8 text-center p-1 bg-slate-950 border-slate-700 text-white mx-auto font-semibold"
                            />
                            {item.can_sell_loose && item.tablets_per_pack > 1 && (
                              <button 
                                onClick={() => toggleLoose(item.cart_id)} 
                                className="text-[9.5px] text-indigo-400 hover:text-indigo-300 font-semibold underline"
                              >
                                Sell Loose {item.unit_label === "caps" ? "Caps" : "Tabs"}
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-300 font-mono">
                        {item.is_loose ? (
                          <div className="flex flex-col text-xs">
                            <span className="text-slate-200">₹{(item.unit_price / (item.tablets_per_pack || 1)).toFixed(2)}/{item.unit_label === "caps" ? "cap" : "tab"}</span>
                            <span className="text-[9px] text-slate-500">₹{item.unit_price.toFixed(2)}/pk</span>
                          </div>
                        ) : (
                          <span>₹{item.unit_price.toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-emerald-400 font-mono">₹{item.total_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 h-8 w-8" 
                          onClick={() => removeFromCart(item.cart_id)}
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
        <Card className="h-full flex flex-col bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 overflow-hidden">
          <CardHeader className="bg-slate-900/80 text-white py-3 px-4 border-b border-slate-800 shrink-0">
            <CardTitle className="text-base font-semibold">Checkout Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-4 justify-between gap-3 overflow-hidden">
            
            <div className="space-y-3">
              {/* Billing Branch */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-300">Billing Branch</Label>
                <Select value={selectedBranchId.toString()} onValueChange={handleBranchChange}>
                  <SelectTrigger className="h-8.5 text-xs bg-slate-950 border-slate-700 text-white">
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    {branches.map((b: any) => (
                      <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Customer Selection */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-300">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-8.5 text-xs bg-slate-950 border-slate-700 text-white">
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
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/80">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Name (Optional)</Label>
                      <Input 
                        placeholder="Customer Name" 
                        value={walkInName}
                        onChange={(e) => setWalkInName(e.target.value)}
                        className="h-8 text-xs bg-slate-950 border-slate-700 text-white px-2.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Phone (Optional)</Label>
                      <Input 
                        placeholder="Phone Number" 
                        value={walkInPhone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        className="h-8 text-xs bg-slate-950 border-slate-700 text-white px-2.5"
                      />
                    </div>
                    {matchedCustomerId && (
                      <div className="col-span-2 text-xs text-emerald-400 font-medium truncate">
                        ✓ Recognized Saved Customer: {walkInName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-300">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8.5 text-xs bg-slate-950 border-slate-700 text-white">
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

            {/* Totals & Checkout Button */}
            <div className="space-y-3 pt-3 shrink-0 border-t border-slate-800">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal ({cart.length} items)</span>
                  <span className="font-mono text-slate-200">₹{subtotal.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span>Discount (</span>
                    <input 
                      type="number" 
                      min="0" 
                      max="100" 
                      value={discountPercent || ""} 
                      onChange={(e) => setDiscountPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                      className="w-12 h-6 text-center bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs px-1 font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span>%)</span>
                  </div>
                  <span className="font-mono text-rose-400">-₹{discountAmount.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span>Tax (</span>
                    <input 
                      type="number" 
                      min="0" 
                      max="100" 
                      value={taxPercent || ""} 
                      onChange={(e) => setTaxPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                      className="w-12 h-6 text-center bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs px-1 font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span>%)</span>
                  </div>
                  <span className="font-mono text-indigo-400">+₹{taxAmount.toFixed(2)}</span>
                </div>

                {/* Prominently displayed Round Off below Tax & Discount */}
                <div className="flex justify-between items-center text-slate-400">
                  <span>Round Off</span>
                  <span className={`font-mono font-medium ${roundOff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {roundOff >= 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}
                  </span>
                </div>

                <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-slate-700">
                  <span className="text-base font-bold text-slate-200">Total Pay</span>
                  <span className="text-2xl font-bold text-emerald-400 font-mono">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <Button 
                className="w-full h-11 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-lg shrink-0"
                disabled={cart.length === 0 || isSubmitting}
                onClick={handleCheckout}
              >
                {isSubmitting ? "Processing..." : "Complete Checkout"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
