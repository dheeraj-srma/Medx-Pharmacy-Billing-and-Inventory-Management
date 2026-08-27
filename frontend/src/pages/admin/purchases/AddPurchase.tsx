import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, Link } from "react-router-dom";
import api from "../../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";

const purchaseItemSchema = z.object({
  product_id: z.coerce.number().min(1, "Product is required"),
  batch_number: z.string().min(1, "Batch number is required"),
  manufacturing_date: z.string().optional(),
  expiry_date: z.string().min(1, "Expiry date is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  purchase_price: z.coerce.number().min(0, "Purchase price must be positive"),
  mrp: z.coerce.number().min(0, "MRP must be positive"),
  selling_price: z.coerce.number().min(0, "Selling price must be positive"),
});

const purchaseSchema = z.object({
  supplier_id: z.coerce.number().min(1, "Supplier is required"),
  invoice_number: z.string().optional(),
  purchase_date: z.string().min(1, "Purchase date is required"),
  notes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, "Add at least one item"),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export default function AddPurchase() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    api.get("/suppliers/").then(res => setSuppliers(res.data)).catch(console.error);
    api.get("/products/").then(res => setProducts(res.data)).catch(console.error);
  }, []);

  const { register, control, handleSubmit, formState: { errors }, setValue, watch } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      purchase_date: new Date().toISOString().split('T')[0],
      items: [{
        quantity: 1,
        purchase_price: 0,
        mrp: 0,
        selling_price: 0,
      }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const items = watch("items");

  const calculateTotals = () => {
    let total = 0;
    items.forEach(item => {
      total += (item.quantity || 0) * (item.purchase_price || 0);
    });
    return total;
  };

  const grandTotal = calculateTotals();

  const onSubmit = async (data: PurchaseFormValues) => {
    try {
      setIsSubmitting(true);
      
      const payload = {
        ...data,
        total_amount: grandTotal,
        grand_total: grandTotal,
      };

      await api.post("/purchases/", payload);
      navigate("/admin/purchases");
    } catch (error) {
      console.error("Failed to add purchase", error);
      alert("Failed to record purchase. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Link to="/admin/purchases" className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-white">Inward Stock (Purchase Entry)</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="text-white">Purchase Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-6 text-slate-200">
            <div className="space-y-2">
              <Label htmlFor="supplier_id">Supplier *</Label>
              <Select onValueChange={(val) => setValue("supplier_id", parseInt(val))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name} {s.company_name ? `(${s.company_name})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.supplier_id && <p className="text-sm text-red-500">{errors.supplier_id.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input id="invoice_number" {...register("invoice_number")} placeholder="INV-12345" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase_date">Purchase Date *</Label>
              <Input id="purchase_date" type="date" {...register("purchase_date")} />
              {errors.purchase_date && <p className="text-sm text-red-500">{errors.purchase_date.message}</p>}
            </div>

            <div className="col-span-3 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" {...register("notes")} rows={2} placeholder="Optional notes..." className="bg-slate-950/50 border-slate-800" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800/60 pb-4">
            <CardTitle className="text-white">Purchase Items</CardTitle>
            <Button type="button" variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => append({
              product_id: 0, batch_number: "", expiry_date: "", quantity: 1, purchase_price: 0, mrp: 0, selling_price: 0
            })}>
              <Plus size={16} className="mr-1" /> Add Product
            </Button>
          </CardHeader>
          <CardContent className="space-y-6 pt-6 text-slate-200">
            {fields.map((field, index) => (
              <div key={field.id} className="p-5 border border-slate-800 rounded-xl bg-slate-950/40 space-y-4 relative">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-2 right-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                >
                  <Trash2 size={18} />
                </Button>

                <div className="grid grid-cols-4 gap-4 pr-10">
                  <div className="col-span-2 space-y-2">
                    <Label>Product *</Label>
                    <Select onValueChange={(val) => setValue(`items.${index}.product_id`, parseInt(val))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.items?.[index]?.product_id && <p className="text-sm text-red-500">{errors.items[index]?.product_id?.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Batch Number *</Label>
                    <Input {...register(`items.${index}.batch_number`)} placeholder="Batch #" className="bg-slate-950/50 border-slate-800" />
                    {errors.items?.[index]?.batch_number && <p className="text-sm text-red-500">{errors.items[index]?.batch_number?.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Expiry Date *</Label>
                    <Input type="date" {...register(`items.${index}.expiry_date`)} className="bg-slate-950/50 border-slate-800" />
                    {errors.items?.[index]?.expiry_date && <p className="text-sm text-red-500">{errors.items[index]?.expiry_date?.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input type="number" {...register(`items.${index}.quantity`)} className="bg-slate-950/50 border-slate-800" />
                    {errors.items?.[index]?.quantity && <p className="text-sm text-red-500">{errors.items[index]?.quantity?.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Purchase Price (₹) *</Label>
                    <Input type="number" step="0.01" {...register(`items.${index}.purchase_price`)} className="bg-slate-950/50 border-slate-800" />
                  </div>

                  <div className="space-y-2">
                    <Label>MRP (₹) *</Label>
                    <Input type="number" step="0.01" {...register(`items.${index}.mrp`)} className="bg-slate-950/50 border-slate-800" />
                  </div>

                  <div className="space-y-2">
                    <Label>Selling Price (₹) *</Label>
                    <Input type="number" step="0.01" {...register(`items.${index}.selling_price`)} className="bg-slate-950/50 border-slate-800" />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <div className="text-right">
                <p className="text-sm text-slate-400 mb-1">Grand Total</p>
                <p className="text-3xl font-bold text-emerald-400 font-mono">₹{grandTotal.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/purchases")} className="border-slate-800 hover:bg-slate-900 text-slate-300">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {isSubmitting ? "Processing..." : <><Save className="mr-2" size={18} /> Complete Purchase & Update Stock</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
