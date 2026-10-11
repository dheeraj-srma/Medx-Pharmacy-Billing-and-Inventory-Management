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
import { ShoppingCart, Trash2, Search, Printer, CheckCircle, Calendar, AlertCircle, Warehouse, Lock } from "lucide-react";

import { formatDateDDMMYYYY, checkLooseEligibility } from "@/lib/utils";
import { searchAndRank, HighlightedText } from "@/lib/searchEngine";
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
  gst_percentage?: number;
  hsn_code?: string | null;
}

// Match result handled via centralized searchEngine

export default function POS() {
  const { showAlert } = useModal();
  const { user } = useAuthStore();
  const { 
    branches, 
    fetchBranches, 
    selectedBranchId: globalBranchId, 
    setSelectedBranchId: setGlobalBranchId,
    backdateBillingActive,
    backdateBillingDate,
    setBackdateBillingActive,
    setBackdateBillingDate
  } = useDataStore();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  // Active branch: Admin follows globalBranchId (falling back to user default or 1), Staff is strictly locked to user.branch_id
  const activeBranchId = isAdmin 
    ? (globalBranchId || user?.branch_id || 1)
    : (user?.branch_id || 1);

  // If admin arrives at POS without an active concrete branch selected, initialize it in dataStore
  useEffect(() => {
    if (isAdmin && !globalBranchId) {
      setGlobalBranchId(user?.branch_id || 1);
    }
  }, [isAdmin, globalBranchId, user?.branch_id, setGlobalBranchId]);

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
  const [manualDiscountPercent, setManualDiscountPercent] = useState<string | null>(null);
  const [customSaleDate, setCustomSaleDate] = useState<string>("");
  
  const [printSnapshot, setPrintSnapshot] = useState<any>(null);

  // Track previous branch to clear cart if active branch changes
  const prevBranchRef = useRef(activeBranchId);
  useEffect(() => {
    if (prevBranchRef.current !== activeBranchId) {
      if (cart.length > 0) {
        setCart([]);
        setManualDiscountPercent(null);
      }
      prevBranchRef.current = activeBranchId;
    }
  }, [activeBranchId, cart.length]);

  useEffect(() => {
    // Fetch available batches for the active branch
    api.get("/inventory/active-batches", { params: { branch_id: activeBranchId } })
      .then(res => {
        const normalized = (res.data || []).map((b: any) => ({
          ...b,
          quantity_available: Number(b.quantity_available) || 0,
          mrp: Number(b.mrp) || 0,
          selling_price: Number(b.selling_price) || 0,
          gst_percentage: Number(b.gst_percentage) || 0,
          hsn_code: b.hsn_code || null,
        }));
        setActiveBatches(normalized);
      })
      .catch(console.error);
  }, [activeBranchId]);

  useEffect(() => {
    // Fetch settings for the active branch to print correct branch info on invoice
    api.get("/settings/", { params: { branch_id: activeBranchId } })
      .then(res => {
        setStoreSettings(res.data);
        if (res.data?.allow_backdated_billing) {
          setBackdateBillingActive(true);
          const effectiveDate = backdateBillingDate || new Date().toISOString().split("T")[0];
          setBackdateBillingDate(effectiveDate);
          setCustomSaleDate(effectiveDate);
        } else {
          setBackdateBillingActive(false);
          setCustomSaleDate("");
        }
      })
      .catch(console.error);
  }, [activeBranchId, backdateBillingDate, setBackdateBillingActive, setBackdateBillingDate]);

  useEffect(() => {
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

  // Compute matched and ranked batches: Exact matches -> Best matches -> Words in order
  const filteredBatches = useMemo(() => {
    if (!search.trim()) return [];
    const ranked = searchAndRank(
      activeBatches,
      search,
      (b) => [b.product_name, b.generic_name, b.brand, b.barcode, b.sku, b.batch_number]
    );
    return ranked.slice(0, 30).map((r) => r.item);
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
    if (Number(batch.quantity_available || 0) <= 0) {
      showAlert(
        "Out of Stock",
        `"${batch.product_name}" is currently out of stock (0 quantity available). Please add stock via Purchases or adjust stock in Inventory before billing.`
      );
      return;
    }

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
        mrp: Number(batch.mrp) || Number(batch.selling_price) || 0,
        unit_price: Number(batch.selling_price) || 0,
        discount: 0,
        total_price: Number(batch.selling_price) || 0,
        max_qty: Number(batch.quantity_available) || 0,
        can_sell_loose: eligibility.canSellLoose,
        unit_label: eligibility.unitLabel,
        tablets_per_pack: eligibility.unitsPerPack,
        is_loose: false,
        packs: 1,
        loose_tablets: 0,
        gst_percentage: Number(batch.gst_percentage) || 0,
        hsn_code: batch.hsn_code || null,
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

  // Authoritative GST-inclusive Cart Calculations:
  const totalMrp = cart.reduce((sum, item) => {
    const itemMrp = Number(item.mrp) || Number(item.unit_price) || 0;
    return sum + (itemMrp * item.quantity);
  }, 0);

  const totalSellingPrice = cart.reduce((sum, item) => sum + item.total_price, 0);
  const effectiveBase = Math.max(totalMrp, totalSellingPrice);
  const mrpDiff = Math.max(0, effectiveBase - totalSellingPrice);
  const autoMrpDiscountPercent = effectiveBase > 0 
    ? Number(((mrpDiff / effectiveBase) * 100).toFixed(2)) 
    : 0;

  // If cashier typed a discount %, use that; otherwise auto-set to MRP-to-SP difference discount
  const effectiveDiscountPercent = manualDiscountPercent !== null
    ? Math.max(0, Math.min(100, parseFloat(manualDiscountPercent) || 0))
    : autoMrpDiscountPercent;

  const orderDiscountAmount = manualDiscountPercent !== null
    ? Number((effectiveBase * (effectiveDiscountPercent / 100)).toFixed(2))
    : mrpDiff;

  const netPayableRaw = Math.max(0, effectiveBase - orderDiscountAmount);
  const grandTotal = Math.round(netPayableRaw);
  const roundOff = Number((grandTotal - netPayableRaw).toFixed(2));

  // Extract GST included in Selling Price / Net Consideration (never added on top):
  const cartTaxDetails = useMemo(() => {
    let totalTaxable = 0;
    let totalGst = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    const rateMap: Record<string, { rate: number; taxable: number; gst: number; cgst: number; sgst: number }> = {};

    cart.forEach(item => {
      const lineGross = item.total_price;
      const extraCashierDiscount = Math.max(0, orderDiscountAmount - mrpDiff);
      const lineDisc = totalSellingPrice > 0 && extraCashierDiscount > 0
        ? (extraCashierDiscount * (lineGross / totalSellingPrice))
        : 0;
      const effectiveLine = Math.max(0, lineGross - lineDisc);
      const gstRate = Number(item.gst_percentage) || 0;

      let lineTaxable = effectiveLine;
      let lineTax = 0;
      if (gstRate > 0) {
        lineTaxable = Number((effectiveLine / (1 + gstRate / 100)).toFixed(2));
        lineTax = Number((effectiveLine - lineTaxable).toFixed(2));
      }
      const lineCgst = Number((lineTax / 2).toFixed(2));
      const lineSgst = Number((lineTax - lineCgst).toFixed(2));

      totalTaxable += lineTaxable;
      totalGst += lineTax;
      totalCgst += lineCgst;
      totalSgst += lineSgst;

      const key = `${gstRate}%`;
      if (!rateMap[key]) {
        rateMap[key] = { rate: gstRate, taxable: 0, gst: 0, cgst: 0, sgst: 0 };
      }
      rateMap[key].taxable += lineTaxable;
      rateMap[key].gst += lineTax;
      rateMap[key].cgst += lineCgst;
      rateMap[key].sgst += lineSgst;
    });

    return {
      totalTaxable: Number(totalTaxable.toFixed(2)),
      totalGst: Number(totalGst.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      rateMap
    };
  }, [cart, totalSellingPrice, orderDiscountAmount, mrpDiff]);

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

      let formattedSaleDate: string | undefined = undefined;
      const effectiveBackdate = backdateBillingDate || customSaleDate;
      if ((storeSettings?.allow_backdated_billing || backdateBillingActive) && effectiveBackdate) {
        const now = new Date();
        const [y, m, d] = effectiveBackdate.split("-").map(Number);
        const saleDt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
        formattedSaleDate = saleDt.toISOString();
      }

      const payload: any = {
        customer_id: finalCustomerId,
        total_amount: effectiveBase,
        tax_amount: cartTaxDetails.totalGst,
        discount_amount: orderDiscountAmount,
        discount_percent: effectiveDiscountPercent,
        round_off: roundOff,
        grand_total: grandTotal,
        payment_method: paymentMethod,
        branch_id: activeBranchId,
        ...(formattedSaleDate ? { sale_date: formattedSaleDate } : {}),
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
          const mrpVal = Number(it.mrp ?? matchedCartItem?.mrp ?? it.unit_price);
          const sellingPrice = Number(it.unit_price);
          const qty = Number(it.quantity);
          const gstPct = Number(it.gst_percentage ?? matchedCartItem?.gst_percentage ?? 0);
          const taxable = Number(it.taxable_amount ?? (gstPct > 0 ? it.total_price / (1 + gstPct / 100) : it.total_price));
          const gstAmt = Number(it.gst_amount ?? (it.total_price - taxable));
          const mrpDisc = Math.max(0, (mrpVal * qty) - it.total_price);

          return {
            product_name: it.product_name || matchedCartItem?.product_name || "Medicine",
            batch_number: it.batch_number || matchedCartItem?.batch_number || "-",
            hsn_code: it.hsn_code || matchedCartItem?.hsn_code || "-",
            quantity: it.quantity,
            mrp: mrpVal,
            unit_price: sellingPrice,
            discount: mrpDisc,
            gst_percentage: gstPct,
            taxable_amount: taxable,
            gst_amount: gstAmt,
            total_price: Number(it.total_price),
            is_loose: matchedCartItem?.is_loose,
            packs: matchedCartItem?.packs,
            loose_tablets: matchedCartItem?.loose_tablets,
            tablets_per_pack: matchedCartItem?.tablets_per_pack
          };
        }) : cart.map((c: any) => {
          const mrpVal = Number(c.mrp || c.unit_price);
          const gstPct = Number(c.gst_percentage || 0);
          const taxable = gstPct > 0 ? c.total_price / (1 + gstPct / 100) : c.total_price;
          return {
            ...c,
            mrp: mrpVal,
            hsn_code: c.hsn_code || "-",
            gst_percentage: gstPct,
            taxable_amount: taxable,
            gst_amount: c.total_price - taxable,
            discount: Math.max(0, (mrpVal * c.quantity) - c.total_price)
          };
        }),
        totalMrp: Number(res.data.total_mrp ?? totalMrp),
        totalMrpDiscount: Number(res.data.total_mrp_discount ?? mrpDiff),
        subtotal: Number(res.data.total_amount ?? effectiveBase),
        discountPercent: effectiveDiscountPercent,
        discountAmount: Number(res.data.discount_amount ?? orderDiscountAmount),
        taxableAmount: Number(res.data.taxable_amount ?? cartTaxDetails.totalTaxable),
        taxAmount: Number(res.data.tax_amount ?? cartTaxDetails.totalGst),
        taxBreakdown: res.data.tax_breakdown || cartTaxDetails.rateMap,
        roundOff: Number(res.data.round_off ?? roundOff),
        grandTotal: Number(res.data.grand_total ?? grandTotal),
        customerName: custName,
        customerPhone: custPhone,
        invoiceNumber: res.data.invoice_number,
        paymentMethod: res.data.payment_method || paymentMethod || "Cash",
        date: formatDateDDMMYYYY(res.data.sale_date || res.data.created_at || (formattedSaleDate ?? Date.now()), true)
      });

      setCompletedSale(res.data);
      setCart([]);
      setManualDiscountPercent(null);
      setWalkInName("");
      setWalkInPhone("");
      setMatchedCustomerId(null);
      if (storeSettings?.allow_backdated_billing) {
        setCustomSaleDate(new Date().toISOString().split("T")[0]);
      } else {
        setCustomSaleDate("");
      }
      
      // Refresh batches to reflect new quantities
      api.get("/inventory/active-batches", { params: { branch_id: activeBranchId } })
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
    doc.text(storeSettings?.store_name || "MedX Pharmacy", textXOffset, 31);
    
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
    doc.rect(14, 48, 182, 27, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("INVOICE DETAILS", 18, 54);
    doc.text("CUSTOMER DETAILS", 115, 54);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Invoice No:", 18, 60);
    doc.text("Date:", 18, 66);
    doc.text("Payment Method:", 18, 72);
    
    doc.text("Name:", 115, 60);
    doc.text("Phone:", 115, 66);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 30, 41);
    doc.text(printSnapshot.invoiceNumber, 45, 60);
    doc.text(printSnapshot.date, 45, 66);
    doc.text(printSnapshot.paymentMethod || "Cash", 45, 72);
    
    doc.text(printSnapshot.customerName, 130, 60);
    doc.text(printSnapshot.customerPhone, 130, 66);
    
    const tableData = printSnapshot.cart.map((item: any, index: number) => {
      const qtyStr = item.is_loose 
        ? `${item.packs || 0}p + ${item.loose_tablets || 0}t`
        : (typeof item.quantity === "number" && !Number.isInteger(item.quantity)
            ? item.quantity.toFixed(2)
            : `${item.quantity}`);
      const rateStr = `Rs. ${item.is_loose
        ? (item.unit_price / (item.tablets_per_pack || 1)).toFixed(2)
        : item.unit_price.toFixed(2)}`;
      const mrpStr = `Rs. ${Number(item.mrp || item.unit_price).toFixed(2)}`;
      const discStr = Number(item.discount || 0) > 0 ? `Rs. ${Number(item.discount).toFixed(2)}` : "-";
      const taxableStr = `Rs. ${Number(item.taxable_amount || 0).toFixed(2)}`;
      const gstStr = `${item.gst_percentage || 0}%`;
      const amountStr = `Rs. ${Number(item.total_price).toFixed(2)}`;

      return [
        index + 1,
        item.product_name,
        item.hsn_code || "-",
        item.batch_number || "-",
        qtyStr,
        mrpStr,
        rateStr,
        discStr,
        taxableStr,
        gstStr,
        amountStr
      ];
    });

    autoTable(doc, {
      startY: 79,
      head: [["#", "Product", "HSN", "Batch", "Qty", "MRP", "Rate (Incl.)", "Disc.", "Taxable", "GST", "Amount"]],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [67, 56, 202], 
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'left',
        fontSize: 7.5
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 7 },
        1: { cellWidth: 38 },
        2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 14 },
        5: { halign: 'right', cellWidth: 16 },
        6: { halign: 'right', cellWidth: 18 },
        7: { halign: 'right', cellWidth: 14 },
        8: { halign: 'right', cellWidth: 16 },
        9: { halign: 'center', cellWidth: 11 },
        10: { halign: 'right', cellWidth: 16 },
      },
      styles: {
        fontSize: 7,
        cellPadding: 2.5,
        textColor: [28, 30, 41]
      },
      alternateRowStyles: {
        fillColor: [251, 251, 254]
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    const boxWidth = 84;
    const boxX = 112;
    
    // Left summary notice: GST rate breakdown
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(67, 56, 202);
    doc.text("GST TAX SUMMARY (INCLUSIVE IN MRP & SP)", 14, finalY + 5);
    
    const breakdownEntries = Object.entries(printSnapshot.taxBreakdown || {});
    let leftY = finalY + 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    
    breakdownEntries.forEach(([rateLabel, data]: [string, any]) => {
      const taxable = Number(data.taxable_amount ?? data.taxable ?? 0).toFixed(2);
      const cgst = Number(data.cgst_amount ?? data.cgst ?? 0).toFixed(2);
      const sgst = Number(data.sgst_amount ?? data.sgst ?? 0).toFixed(2);
      const totalTax = Number(data.gst_amount ?? data.gst ?? 0).toFixed(2);
      doc.text(`GST ${rateLabel}: Taxable Rs. ${taxable} | CGST Rs. ${cgst} + SGST Rs. ${sgst} = Rs. ${totalTax}`, 14, leftY);
      leftY += 5;
    });

    // Right Summary Box
    const hasMrpSavings = Number(printSnapshot.totalMrp) > Number(printSnapshot.subtotal);
    const hasOrderDisc = Number(printSnapshot.discountAmount || 0) > 0;
    const boxHeight = 36 + (hasMrpSavings ? 10 : 0) + (hasOrderDisc ? 5 : 0);

    doc.setFillColor(247, 248, 252);
    doc.setDrawColor(230, 231, 238);
    doc.rect(boxX, finalY, boxWidth, boxHeight, "FD");
    
    let curY = finalY + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);

    if (hasMrpSavings) {
      doc.text("Total MRP:", boxX + 4, curY);
      doc.text(`Rs. ${Number(printSnapshot.totalMrp).toFixed(2)}`, boxX + boxWidth - 4, curY, { align: "right" });
      curY += 5;

      doc.text("Total Savings (MRP Disc):", boxX + 4, curY);
      doc.setTextColor(16, 185, 129);
      doc.text(`-Rs. ${Number(printSnapshot.totalMrpDiscount).toFixed(2)}`, boxX + boxWidth - 4, curY, { align: "right" });
      curY += 5;
      doc.setTextColor(100, 116, 139);
    }

    doc.text("Subtotal (Incl. GST):", boxX + 4, curY);
    doc.text(`Rs. ${Number(printSnapshot.subtotal ?? 0).toFixed(2)}`, boxX + boxWidth - 4, curY, { align: "right" });
    curY += 5;

    if (hasOrderDisc) {
      doc.text(`Order Discount (${printSnapshot.discountPercent}%):`, boxX + 4, curY);
      doc.setTextColor(244, 63, 94);
      doc.text(`-Rs. ${Number(printSnapshot.discountAmount).toFixed(2)}`, boxX + boxWidth - 4, curY, { align: "right" });
      curY += 5;
      doc.setTextColor(100, 116, 139);
    }

    doc.text("Taxable Value:", boxX + 4, curY);
    doc.text(`Rs. ${Number(printSnapshot.taxableAmount ?? 0).toFixed(2)}`, boxX + boxWidth - 4, curY, { align: "right" });
    curY += 5;

    doc.text("Total GST (Included):", boxX + 4, curY);
    doc.text(`Rs. ${Number(printSnapshot.taxAmount ?? 0).toFixed(2)}`, boxX + boxWidth - 4, curY, { align: "right" });
    curY += 5;

    const roundOffVal = Number(printSnapshot.roundOff ?? 0);
    doc.text("Round Off:", boxX + 4, curY);
    doc.text(`${roundOffVal >= 0 ? "+Rs. " : "-Rs. "}${Math.abs(roundOffVal).toFixed(2)}`, boxX + boxWidth - 4, curY, { align: "right" });
    curY += 6;

    doc.setDrawColor(230, 231, 238);
    doc.line(boxX + 4, curY - 2, boxX + boxWidth - 4, curY - 2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(67, 56, 202);
    doc.text("Grand Total (Payable):", boxX + 4, curY + 2.5);
    doc.text(`Rs. ${Number(printSnapshot.grandTotal ?? 0).toFixed(2)}`, boxX + boxWidth - 4, curY + 2.5, { align: "right" });

    const termsY = Math.max(leftY + 6, finalY + boxHeight + 6);
    doc.setDrawColor(230, 231, 238);
    doc.line(14, termsY, 196, termsY);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("TERMS & CONDITIONS:", 14, termsY + 4);
    
    doc.setFont("helvetica", "normal");
    doc.text("1. Medicines once sold cannot be returned without a valid prescription/bill.", 14, termsY + 8);
    doc.text("2. Please store medicines under recommended conditions.", 14, termsY + 12);
    
    const storeDisplayName = storeSettings?.store_name || "MedX Pharmacy";
    doc.setFont("helvetica", "bold");
    doc.setTextColor(67, 56, 202);
    doc.setFontSize(9.5);
    doc.text(`Thank you for choosing ${storeDisplayName}!`, 14, termsY + 19);

    // Bottom Footer Strip
    doc.setFillColor(67, 56, 202);
    doc.rect(14, termsY + 23, 182, 1, "F");
    
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
      <div className="col-span-8 flex flex-col space-y-3">
        {/* Active Branch Dispensing Status Banner */}
        <div className="flex items-center justify-between px-1 py-1 rounded-lg bg-slate-900/60 border border-slate-800/80 px-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Dispensing From:</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center gap-1.5">
              <Warehouse size={12} className="text-indigo-400" />
              {branches.find((b: any) => b.id === activeBranchId)?.name || `Branch ${activeBranchId}`}
            </span>
            {isAdmin ? (
              <span className="text-[11px] text-slate-500 font-medium">
                (Admin Multi-Branch Active)
              </span>
            ) : (
              <span className="text-[11px] text-amber-400/80 font-medium flex items-center gap-1">
                <Lock size={10} /> Locked to your assigned branch
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-emerald-400 font-bold">{activeBatches.length}</span>
              <span>batches in stock</span>
            </div>
          </div>
        </div>
        
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
                            <span className="font-semibold text-slate-100 text-sm">
                              <HighlightedText text={batch.product_name} query={search} />
                            </span>
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
                            {new Date(batch.expiry_date).getFullYear() >= 9999 ? (
                              <span className="text-slate-500 text-xs italic">Exp: Not Set</span>
                            ) : (
                              <span className={`flex items-center gap-1 ${isExpiringSoon ? "text-amber-400 font-medium" : "text-slate-400"}`}>
                                <Calendar size={12} /> Exp: {formatDateDDMMYYYY(batch.expiry_date)}
                              </span>
                            )}
                            {batch.pack_size && (
                              <span className="text-slate-400">• {batch.pack_size}</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end gap-1">
                          <div className="flex items-baseline gap-1.5 justify-end">
                            {Number(batch.mrp || 0) > Number(batch.selling_price || 0) && (
                              <span className="text-xs line-through text-slate-500 font-mono">
                                ₹{Number(batch.mrp).toFixed(2)}
                              </span>
                            )}
                            <span className="font-bold text-emerald-400 text-base font-mono">
                              ₹{Number(batch.selling_price || 0).toFixed(2)}
                            </span>
                          </div>
                          {Number(batch.mrp || 0) > Number(batch.selling_price || 0) && (
                            <span className="text-[10px] text-emerald-400 font-medium font-mono">
                              {(((Number(batch.mrp) - Number(batch.selling_price)) / Number(batch.mrp)) * 100).toFixed(0)}% off
                            </span>
                          )}
                          <Badge 
                            variant="outline" 
                            className={Number(batch.quantity_available || 0) <= 0
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20 text-[11px]"
                              : Number(batch.quantity_available || 0) <= 10 
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[11px]" 
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px]"
                            }
                          >
                            {Number(batch.quantity_available || 0) <= 0
                              ? "Out of Stock (0)"
                              : `${Number(batch.quantity_available || 0)} in stock`}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-6 text-center text-slate-400 space-y-1">
                  <AlertCircle className="mx-auto text-slate-500 mb-1" size={24} />
                  <p className="font-medium text-slate-300">No matching medicine found</p>
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
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="font-mono text-slate-400">Batch: {item.batch_number}</span>
                          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/20 font-mono font-semibold">
                            {item.gst_percentage || 0}% GST
                          </span>
                          {item.mrp > item.unit_price && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-mono">
                              MRP ₹{item.mrp.toFixed(2)}
                            </span>
                          )}
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
                          <div className="flex flex-col text-xs">
                            <span className="text-slate-200">₹{item.unit_price.toFixed(2)}</span>
                            {item.mrp > item.unit_price ? (
                              <span className="text-[10px] text-slate-400 line-through">MRP: ₹{item.mrp.toFixed(2)}</span>
                            ) : (
                              <span className="text-[10px] text-slate-500">MRP: ₹{item.mrp.toFixed(2)}</span>
                            )}
                          </div>
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
              {/* Billing Branch Info Label */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Warehouse size={14} className="text-indigo-400" />
                  <span className="text-xs text-slate-400 font-medium">Billing Branch:</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-md">
                    {branches.find((b: any) => b.id === activeBranchId)?.name || `Branch ${activeBranchId}`}
                  </span>
                  {!isAdmin && (
                    <span title="Locked to your assigned branch" className="text-amber-400/80 flex items-center">
                      <Lock size={11} />
                    </span>
                  )}
                </div>
              </div>

              {/* Backdate Billing Custom Date Picker (Visible when feature is ON) */}
              {(storeSettings?.allow_backdated_billing || backdateBillingActive) && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="custom-sale-date" className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <Calendar size={13} className="text-amber-400" />
                      Invoice Billing Date
                    </Label>
                    <span className="text-[10px] text-amber-400/90 font-medium bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                      Backdate Active
                    </span>
                  </div>
                  <Input 
                    id="custom-sale-date"
                    type="date"
                    max={new Date().toISOString().split("T")[0]}
                    value={backdateBillingDate || customSaleDate || new Date().toISOString().split("T")[0]}
                    onChange={(e) => {
                      setCustomSaleDate(e.target.value);
                      setBackdateBillingDate(e.target.value);
                    }}
                    className="h-8.5 text-xs bg-slate-950 border-amber-500/40 text-amber-200 focus:ring-1 focus:ring-amber-500"
                  />
                  <p className="text-[10px] text-amber-300/70">
                    Bill & stock ledger will be recorded on {backdateBillingDate || customSaleDate || "selected date"}.
                  </p>
                </div>
              )}

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
                <div className="flex justify-between text-slate-300">
                  <span>{totalMrp > totalSellingPrice ? "Subtotal (MRP)" : "Subtotal"} ({cart.length} items)</span>
                  <span className="font-mono font-semibold text-slate-100">₹{effectiveBase.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center text-slate-400">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Order Discount (</span>
                    <input 
                      type="number" 
                      step="any"
                      min="0" 
                      max="100" 
                      value={
                        manualDiscountPercent !== null 
                          ? manualDiscountPercent 
                          : (autoMrpDiscountPercent > 0 ? autoMrpDiscountPercent : "")
                      } 
                      placeholder={autoMrpDiscountPercent > 0 ? String(autoMrpDiscountPercent) : "0"}
                      onChange={(e) => setManualDiscountPercent(e.target.value)}
                      className="w-14 h-6 text-center bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs px-1 font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <span>%)</span>
                    {manualDiscountPercent !== null && autoMrpDiscountPercent > 0 && (
                      <button
                        type="button"
                        onClick={() => setManualDiscountPercent(null)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/60 transition-colors cursor-pointer"
                        title="Reset to MRP difference discount"
                      >
                        Auto
                      </button>
                    )}
                  </div>
                  <span className="font-mono text-rose-400 font-medium">-₹{orderDiscountAmount.toFixed(2)}</span>
                </div>

                {/* GST Tax Transparency Card */}
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Taxable Base Value:</span>
                    <span className="font-mono font-medium text-slate-300">₹{cartTaxDetails.totalTaxable.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 text-indigo-300">
                      <span>GST (Included):</span>
                      <span className="text-[10px] text-indigo-400/80">CGST+SGST</span>
                    </span>
                    <span className="font-mono font-semibold text-indigo-400">₹{cartTaxDetails.totalGst.toFixed(2)}</span>
                  </div>

                  {/* Multi-rate breakdown pills if items present */}
                  {Object.keys(cartTaxDetails.rateMap).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/80">
                      {Object.entries(cartTaxDetails.rateMap).map(([rateKey, data]) => (
                        <span key={rateKey} className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {rateKey}: ₹{data.gst.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Round Off */}
                <div className="flex justify-between items-center text-slate-400">
                  <span>Round Off</span>
                  <span className={`font-mono font-medium ${roundOff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {roundOff >= 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}
                  </span>
                </div>

                <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-slate-700">
                  <span className="text-base font-bold text-slate-200">Total Pay (Incl. GST)</span>
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
