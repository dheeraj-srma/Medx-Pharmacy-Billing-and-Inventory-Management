import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Upload } from "lucide-react";
import { Link } from "react-router-dom";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  generic_name: z.string().optional(),
  brand: z.string().optional(),
  category_id: z.string().optional(),
  description: z.string().optional(),
  mrp: z.coerce.number().min(0, "MRP must be positive"),
  selling_price: z.coerce.number().min(0, "Selling price must be positive"),
  pack_size: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  hsn_code: z.string().optional(),
  gst_percentage: z.coerce.number().min(0, "GST must be non-negative").default(0),
  initial_stock: z.coerce.number().optional(),
  manufacturing_date: z.string().optional(),
  expiry_date: z.string().optional(),
  reorder_level: z.coerce.number().default(10),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function AddProduct() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<any[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      reorder_level: 10,
      gst_percentage: 0,
    }
  });

  const initialStock = watch("initial_stock");

  useEffect(() => {
    api.get("/products/categories").then(res => setCategories(res.data)).catch(console.error);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: ProductFormValues) => {
    try {
      setIsSubmitting(true);
      
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          formData.append(key, value.toString());
        }
      });

      if (imageFile) {
        formData.append("image", imageFile);
      }
      
      // Auto-generate batch for initial stock if not provided
      if (data.initial_stock && data.initial_stock > 0 && data.expiry_date) {
        formData.append("batch_number", `BATCH-${new Date().getTime()}`);
      }

      await api.post("/products/", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      navigate("/admin/products");
    } catch (error) {
      console.error("Failed to add product", error);
      alert("Failed to add product. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin/products" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Add New Product</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
            <Card>
              <CardHeader>
                <CardTitle>Basic Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input id="name" {...register("name")} placeholder="e.g. Paracetamol 500mg" />
                  {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="generic_name">Generic Name</Label>
                    <Input id="generic_name" {...register("generic_name")} placeholder="e.g. Acetaminophen" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand">Brand</Label>
                    <Input id="brand" {...register("brand")} placeholder="e.g. Crocin" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category_id">Category</Label>
                  <Select onValueChange={(val) => setValue("category_id", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" {...register("description")} rows={4} placeholder="Product description..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mrp">MRP (₹) *</Label>
                  <Input id="mrp" type="number" step="0.01" {...register("mrp")} placeholder="0.00" />
                  {errors.mrp && <p className="text-sm text-red-500">{errors.mrp.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selling_price">Selling Price (₹) *</Label>
                  <Input id="selling_price" type="number" step="0.01" {...register("selling_price")} placeholder="0.00" />
                  {errors.selling_price && <p className="text-sm text-red-500">{errors.selling_price.message}</p>}
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="pack_size">Pack Size</Label>
                  <Input id="pack_size" {...register("pack_size")} placeholder="e.g. 10 Tablets / Strip" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input id="barcode" {...register("barcode")} placeholder="Scan or enter barcode" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" {...register("sku")} placeholder="Stock Keeping Unit" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hsn_code">HSN Code</Label>
                  <Input id="hsn_code" {...register("hsn_code")} placeholder="HSN code" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gst_percentage">GST (%)</Label>
                  <Input id="gst_percentage" type="number" step="0.1" {...register("gst_percentage")} placeholder="12" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Initial Inventory (Optional)</CardTitle>
                <CardDescription>Add initial stock for this product to make it immediately available.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="initial_stock">Opening Quantity</Label>
                  <Input id="initial_stock" type="number" {...register("initial_stock")} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manufacturing_date">Manufacturing Date</Label>
                  <Input id="manufacturing_date" type="date" {...register("manufacturing_date")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiry_date">Expiry Date {initialStock && initialStock > 0 ? "*" : ""}</Label>
                  <Input id="expiry_date" type="date" {...register("expiry_date")} required={initialStock !== undefined && initialStock > 0} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reorder_level">Reorder Level (Alert when stock falls below)</Label>
                  <Input id="reorder_level" type="number" {...register("reorder_level")} />
                </div>
              </CardContent>
            </Card>

          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Product Image</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="aspect-square bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center overflow-hidden relative">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <Upload size={32} className="mb-2" />
                        <span className="text-sm font-medium">Upload Image</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  {imageFile && (
                    <Button type="button" variant="outline" className="w-full" onClick={() => { setImageFile(null); setImagePreview(null); }}>
                      Remove Image
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-4 border-t pt-6">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/products")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
            {isSubmitting ? "Saving..." : <><Save className="mr-2" size={18} /> Save Product</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
