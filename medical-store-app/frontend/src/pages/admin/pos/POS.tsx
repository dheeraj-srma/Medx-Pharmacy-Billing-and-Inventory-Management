import { useState, useEffect } from "react";
import api from "../../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Plus, Trash2, Search, Printer, CheckCircle } from "lucide-react";

export default function POS() {
  const [activeBatches, setActiveBatches] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  
  // Sale states
  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);

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

  const removeFromCart = (batch_id: int) => {
    setCart(cart.filter(item => item.batch_id !== batch_id));
  };

  const updateQuantity = (batch_id: int, newQty: number) => {
    setCart(cart.map(item => {
      if (item.batch_id === batch_id) {
        const validQty = Math.max(1, Math.min(newQty, item.max_qty));
        return { ...item, quantity: validQty, total_price: validQty * item.unit_price };
      }
      return item;
    }));
  };

  const grandTotal = cart.reduce((sum, item) => sum + item.total_price, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    
    try {
      const payload = {
        customer_id: customerId === "walk-in" ? null : parseInt(customerId),
        total_amount: grandTotal,
        grand_total: grandTotal,
        payment_method: paymentMethod,
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
      setCompletedSale(res.data);
      setCart([]);
      
      // Refresh batches to reflect new quantities
      api.get("/inventory/active-batches").then(r => setActiveBatches(r.data));
      
    } catch (error: any) {
      console.error("Checkout failed", error);
      alert(error.response?.data?.detail || "Checkout failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (completedSale) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <Card className="text-center p-8 border-green-200 bg-green-50">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={64} />
          <h2 className="text-3xl font-bold text-green-700 mb-2">Sale Completed!</h2>
          <p className="text-slate-600 mb-6">Invoice Number: <strong>{completedSale.invoice_number}</strong></p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2" size={18} /> Print Bill
            </Button>
            <Button onClick={() => setCompletedSale(null)} className="bg-blue-600">
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
              className="pl-10 py-6 text-lg w-full bg-white shadow-sm"
            />
          </div>
          
          {search && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
              {filteredBatches.length > 0 ? (
                <ul className="divide-y max-h-64 overflow-y-auto">
                  {filteredBatches.map(batch => (
                    <li 
                      key={batch.id} 
                      className="p-3 hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                      onClick={() => addToCart(batch)}
                    >
                      <div>
                        <p className="font-semibold">{batch.product_name}</p>
                        <p className="text-xs text-slate-500">Batch: {batch.batch_number} | Exp: {batch.expiry_date} | Stock: {batch.quantity_available}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">₹{batch.selling_price}</p>
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
        <Card className="flex-1 overflow-hidden flex flex-col">
          <CardHeader className="bg-slate-50 py-3 border-b">
            <CardTitle className="text-lg flex items-center">
              <ShoppingCart className="mr-2 text-blue-600" size={20} /> Current Bill
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader className="bg-white sticky top-0 z-0 shadow-sm">
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
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
                    <TableRow key={item.batch_id}>
                      <TableCell>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-slate-500">Batch: {item.batch_number}</div>
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          min="1" 
                          max={item.max_qty}
                          value={item.quantity} 
                          onChange={(e) => updateQuantity(item.batch_id, parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center p-1"
                        />
                      </TableCell>
                      <TableCell>₹{item.unit_price}</TableCell>
                      <TableCell className="font-bold">₹{item.total_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-red-500 h-8 w-8" onClick={() => removeFromCart(item.batch_id)}>
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

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal ({cart.length} items)</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span>₹0.00</span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-dashed">
                <span className="text-xl font-bold">Total Pay</span>
                <span className="text-3xl font-bold text-blue-600">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <Button 
              className="w-full h-14 text-lg bg-green-600 hover:bg-green-700"
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
