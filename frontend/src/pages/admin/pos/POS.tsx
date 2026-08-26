import { useState, useEffect } from "react";
import api from "../../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Trash2, Search, Printer, CheckCircle } from "lucide-react";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export default function POS() {
  const [activeBatches, setActiveBatches] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  
  // Sale states
  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState<number | null>(null);
  const [branch, setBranch] = useState("C-Scheme");
  
  // We need to keep a snapshot of the cart and walk-in details to print after the cart is cleared
  const [printSnapshot, setPrintSnapshot] = useState<any>(null);

  useEffect(() => {
    // Fetch available batches and customers
    api.get("/inventory/active-batches").then(res => setActiveBatches(res.data)).catch(console.error);
    api.get("/customers/").then(res => setCustomers(res.data)).catch(console.error);
  }, []);

  const filteredBatches = activeBatches.filter(b => 
    b.product_name.toLowerCase().includes(search.toLowerCase()) ||
    b.batch_number.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5); // Limit search results to top 5

  const addToCart = (batch: any) => {
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
        batch_number: batch.batch_number,
        quantity: 1,
        unit_price: batch.selling_price,
        discount: 0,
        total_price: batch.selling_price,
        max_qty: batch.quantity_available
      }]);
    }
    setSearch("");
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
    // Only allow numbers and '+'
    let cleaned = val.replace(/[^\d+]/g, "");
    
    // Auto-prepend +91 if length is exactly 10 digits and doesn't start with +
    if (/^\d{10}$/.test(cleaned)) {
      cleaned = "+91" + cleaned;
    }
    
    setWalkInPhone(cleaned);

    const cleanNumber = cleaned.replace(/[^\d]/g, "");
    if (cleanNumber.length >= 10) {
      const match = customers.find(c => {
        if (!c.phone) return false;
        const cPhoneClean = c.phone.replace(/[^\d]/g, "");
        return cPhoneClean.endsWith(cleanNumber.slice(-10));
      });

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
        // Auto-create customer
        const nameToSave = walkInName.trim() || `Customer (${walkInPhone})`;
        try {
          const custRes = await api.post("/customers/", {
            name: nameToSave,
            phone: walkInPhone
          });
          finalCustomerId = custRes.data.id;
          custName = custRes.data.name;
          custPhone = custRes.data.phone || "N/A";
          // Refresh customers list so they appear in dropdown next time
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
    
    // Draw top layout line accent
    doc.setDrawColor(79, 70, 229); // Indigo border
    doc.setLineWidth(1.5);
    doc.line(14, 15, 196, 15);
    
    // Title header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(30, 41, 59); // Slate-800
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
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(branchAddress, 14, 34);
    doc.text(`Contact: ${branchPhone} | support@medex.com`, 14, 39);
    doc.text(branchGstin, 14, 44);
    
    // Invoice Title Badge
    doc.setFillColor(79, 70, 229);
    doc.rect(130, 22, 66, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("RETAIL BILL / INVOICE", 144, 27.5);
    
    // Info Box Card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.rect(14, 50, 182, 22, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("INVOICE DETAILS", 18, 55);
    doc.text("CUSTOMER DETAILS", 110, 55);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(`Invoice No : ${printSnapshot.invoiceNumber}`, 18, 61);
    doc.text(`Date       : ${printSnapshot.date}`, 18, 66);
    
    doc.text(`Name  : ${printSnapshot.customerName}`, 110, 61);
    doc.text(`Phone : ${printSnapshot.customerPhone}`, 110, 66);
    
    // Table
    const tableColumn = ["Product", "Batch", "Qty", "Unit Price", "Total Price"];
    const tableRows = printSnapshot.cart.map((item: any) => [
      item.product_name,
      item.batch_number || "N/A",
      item.quantity.toString(),
      `Rs ${item.unit_price.toFixed(2)}`,
      `Rs ${item.total_price.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      startY: 78,
      head: [tableColumn],
      body: tableRows,
      theme: 'striped',
      headStyles: { 
        fillColor: [79, 70, 229], 
        textColor: 255, 
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'left'
      },
      bodyStyles: { 
        fontSize: 9,
        textColor: [51, 65, 85]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      styles: {
        cellPadding: 4,
      },
      margin: { left: 14, right: 14 },
    });
    
    // Footer / Totals
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    
    doc.setFillColor(241, 245, 249);
    doc.rect(125, finalY - 6, 71, 15, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text("Total Pay:", 130, finalY + 3.5);
    
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(14);
    doc.text(`Rs ${printSnapshot.grandTotal.toFixed(2)}`, 155, finalY + 3.8);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Terms & Conditions:", 14, finalY + 22);
    doc.text("1. Medicines once sold cannot be returned without a valid prescription/bill.", 14, finalY + 26);
    doc.text("2. Please store medicines under recommended conditions.", 14, finalY + 30);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(10);
    doc.text("Thank you for choosing Med-X Pharmacy!", 14, finalY + 39);
    
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
            <Button variant="outline" onClick={handlePrintPDF} className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850 hover:text-white">
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
        
        {/* Search Bar */}
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <Input 
              type="text" 
              placeholder="Search product to add to bill..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 py-6 text-lg w-full bg-slate-900 border-slate-700 text-white placeholder-slate-400 shadow-sm"
            />
          </div>
          
          {search && (
            <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-md shadow-lg shadow-black/20">
              {filteredBatches.length > 0 ? (
                <ul className="divide-y divide-slate-800 max-h-64 overflow-y-auto">
                  {filteredBatches.map(batch => (
                    <li 
                      key={batch.id} 
                      className="p-3 hover:bg-slate-800 cursor-pointer flex justify-between items-center"
                      onClick={() => addToCart(batch)}
                    >
                      <div>
                        <p className="font-semibold text-slate-200">{batch.product_name}</p>
                        <p className="text-xs text-slate-500">Batch: {batch.batch_number} | Exp: {batch.expiry_date} | Stock: {batch.quantity_available}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-400">₹{batch.selling_price}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center text-slate-500">No available batches found.</div>
              )}
            </div>
          )}
        </div>

        {/* Cart Table */}
        <Card className="flex-1 overflow-hidden flex flex-col bg-slate-900/50 backdrop-blur-sm border-slate-800">
          <CardHeader className="bg-slate-900/80 py-3 border-b border-slate-800">
            <CardTitle className="text-lg flex items-center text-slate-200">
              <ShoppingCart className="mr-2 text-indigo-400" size={20} /> Current Bill
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-900 sticky top-0 z-0 shadow-sm">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="w-24 text-slate-400">Qty</TableHead>
                  <TableHead className="text-slate-400">Price</TableHead>
                  <TableHead className="text-slate-400">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-20 text-slate-400">
                      Cart is empty. Search and add products.
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map(item => (
                    <TableRow key={item.batch_id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell>
                        <div className="font-medium text-slate-200">{item.product_name}</div>
                        <div className="text-xs text-slate-500">Batch: {item.batch_number}</div>
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          min="1" 
                          max={item.max_qty}
                          value={item.quantity} 
                          onChange={(e) => updateQuantity(item.batch_id, parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center p-1 bg-slate-950 border-slate-700 text-white"
                        />
                      </TableCell>
                      <TableCell className="text-slate-300">₹{item.unit_price}</TableCell>
                      <TableCell className="font-bold text-slate-200">₹{item.total_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-8 w-8" onClick={() => removeFromCart(item.batch_id)}>
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
        <Card className="h-full flex flex-col">
          <CardHeader className="bg-slate-800 text-white py-4">
            <CardTitle className="text-lg">Checkout Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-4 space-y-6">
            
            <div className="space-y-4 flex-1">
              <div className="space-y-2">
                <Label>Billing Branch</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="C-Scheme">C-Scheme Branch (Jaipur)</SelectItem>
                    <SelectItem value="Mansarovar">Mansarovar Branch (Jaipur)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.phone || 'N/A'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {customerId === "walk-in" && (
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-700">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Name (Optional)</Label>
                      <Input 
                        placeholder="Customer Name" 
                        value={walkInName}
                        onChange={(e) => setWalkInName(e.target.value)}
                        className="h-8 text-sm bg-slate-900 border-slate-700 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Phone (Optional)</Label>
                      <Input 
                        placeholder="Phone Number" 
                        value={walkInPhone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        className="h-8 text-sm bg-slate-900 border-slate-700 text-white"
                      />
                    </div>
                    {matchedCustomerId && (
                      <div className="col-span-2 text-xs text-indigo-400 font-medium mt-1">
                        ✓ Recognized Saved Customer: {walkInName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-4 space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal ({cart.length} items)</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Discount</span>
                <span>₹0.00</span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-dashed border-slate-600">
                <span className="text-xl font-bold text-slate-200">Total Pay</span>
                <span className="text-3xl font-bold text-emerald-400">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <Button 
              className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white"
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
