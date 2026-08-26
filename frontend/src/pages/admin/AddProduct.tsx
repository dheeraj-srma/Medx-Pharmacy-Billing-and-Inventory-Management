import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../../services/api";
import { useDataStore } from "../../store/dataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Upload, Loader2, Package } from "lucide-react";

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
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
  is_active: z.boolean().default(true),
});

export default function AddProduct() {
  const { id } = useParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { invalidate } = useDataStore();

  const [categories, setCategories] = useState<any[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(isEditMode);

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<any>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      reorder_level: 10,
      gst_percentage: 0,
      is_active: true,
    }
  });

  const initialStock = watch("initial_stock");
  const selectedCategoryId = watch("category_id");
  const isActive = watch("is_active");

  // Fetch categories on mount
  useEffect(() => {
    api.get("/products/categories")
      .then(res => setCategories(res.data))
      .catch(err => console.error("Failed to load categories", err));
  }, []);

  // In edit mode, load existing product data
  useEffect(() => {
    if (isEditMode && id) {
      setIsLoadingProduct(true);
      api.get(`/products/${id}`)
        .then(res => {
          const p = res.data;
          reset({
            name: p.name || "",
            generic_name: p.generic_name || "",
            brand: p.brand || "",
            category_id: p.category_id ? p.category_id.toString() : "",
            description: p.description || "",
            mrp: p.mrp || 0,
            selling_price: p.selling_price || 0,
            pack_size: p.pack_size || "",
            barcode: p.barcode || "",
            sku: p.sku || "",
            hsn_code: p.hsn_code || "",
            gst_percentage: p.gst_percentage || 0,
            reorder_level: p.reorder_level ?? 10,
            is_active: p.is_active ?? true,
          });

          if (p.image_url) {
            setImagePreview(`http://localhost:8000${p.image_url}`);
          }
        })
        .catch(err => {
          console.error("Failed to load product details", err);
          alert("Failed to load product details.");
          navigate("/admin/products");
        })
        .finally(() => {
          setIsLoadingProduct(false);
        });
    }
  }, [id, isEditMode, reset, navigate]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      setIsSubmitting(true);

      if (isEditMode && id) {
        // --- UPDATE EXISTING PRODUCT ---
        const updatePayload: any = {
          name: data.name,
          generic_name: data.generic_name || null,
          brand: data.brand || null,
          category_id: data.category_id ? parseInt(data.category_id) : null,
          description: data.description || null,
          mrp: data.mrp,
          selling_price: data.selling_price,
          pack_size: data.pack_size || null,
          barcode: data.barcode || null,
          sku: data.sku || null,
          hsn_code: data.hsn_code || null,
          gst_percentage: data.gst_percentage,
          reorder_level: data.reorder_level,
          is_active: data.is_active,
        };

        await api.put(`/products/${id}`, updatePayload);

        // Upload new image if chosen
        if (imageFile) {
          const imgFormData = new FormData();
          imgFormData.append("image", imageFile);
          await api.post(`/products/${id}/image`, imgFormData, {
            headers: { "Content-Type": "multipart/form-data" }
          });
        }

        invalidate('products');
        navigate("/admin/products");
      } else {
        // --- CREATE NEW PRODUCT ---
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            formData.append(key, value.toString());
          }
        });

        if (imageFile) {
          formData.append("image", imageFile);
        }

        if (data.initial_stock && data.initial_stock > 0 && data.expiry_date) {
          formData.append("batch_number", `BATCH-${Date.now()}`);
        }

        await api.post("/products/", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });

        invalidate('products');
        invalidate('batches');
        navigate("/admin/products");
      }
    } catch (error: any) {
      console.error("Failed to save product", error);
      const detail = error.response?.data?.detail;
      alert(detail || `Failed to ${isEditMode ? "update" : "add"} product. Please check your inputs.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingProduct) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 space-y-4">
        <Loader2 className="animate-spin text-indigo-400" size={36} />
        <p className="text-sm font-medium">Loading product details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 relative z-10">
      {/* Top Navigation / Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            to="/admin/products" 
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {isEditMode ? "Edit Product" : "Add New Product"}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditMode ? "Update medicine specs, pricing, and category info." : "Register a new medicine or retail item in catalog."}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
            {/* Basic Details */}
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Package className="text-indigo-400" size={18} /> Basic Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-300">Product Name *</Label>
                  <Input 
                    id="name" 
                    {...register("name")} 
                    placeholder="e.g. Paracetamol 500mg" 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500 focus:ring-indigo-500"
                  />
                  {errors.name && <p className="text-xs text-rose-400">{errors.name.message as string}</p>}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="generic_name" className="text-slate-300">Generic / Salt Name</Label>
                    <Input 
                      id="generic_name" 
                      {...register("generic_name")} 
                      placeholder="e.g. Acetaminophen" 
                      className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand" className="text-slate-300">Brand / Manufacturer</Label>
                    <Input 
                      id="brand" 
                      {...register("brand")} 
                      placeholder="e.g. Cipla / Crocin" 
                      className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category_id" className="text-slate-300">Category</Label>
                  <Select 
                    value={selectedCategoryId || ""} 
                    onValueChange={(val) => setValue("category_id", val)}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-700 text-white">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-slate-300">Description</Label>
                  <Textarea 
                    id="description" 
                    {...register("description")} 
                    rows={3} 
                    placeholder="Product composition, uses, and instructions..." 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Pricing & Barcode */}
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Pricing & Identification</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mrp" className="text-slate-300">MRP (₹) *</Label>
                  <Input 
                    id="mrp" 
                    type="number" 
                    step="0.01" 
                    {...register("mrp")} 
                    placeholder="0.00" 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500 font-mono"
                  />
                  {errors.mrp && <p className="text-xs text-rose-400">{errors.mrp.message as string}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="selling_price" className="text-slate-300">Selling Price (₹) *</Label>
                  <Input 
                    id="selling_price" 
                    type="number" 
                    step="0.01" 
                    {...register("selling_price")} 
                    placeholder="0.00" 
                    className="bg-slate-950 border-slate-700 text-emerald-400 placeholder-slate-500 font-mono font-semibold"
                  />
                  {errors.selling_price && <p className="text-xs text-rose-400">{errors.selling_price.message as string}</p>}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pack_size" className="text-slate-300">Pack Size</Label>
                  <Input 
                    id="pack_size" 
                    {...register("pack_size")} 
                    placeholder="e.g. 10 Tablets / Strip, 100ml Bottle" 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode" className="text-slate-300">Barcode</Label>
                  <Input 
                    id="barcode" 
                    {...register("barcode")} 
                    placeholder="Scan or enter barcode" 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sku" className="text-slate-300">SKU</Label>
                  <Input 
                    id="sku" 
                    {...register("sku")} 
                    placeholder="e.g. MED-PARA-500" 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hsn_code" className="text-slate-300">HSN Code</Label>
                  <Input 
                    id="hsn_code" 
                    {...register("hsn_code")} 
                    placeholder="e.g. 300490" 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gst_percentage" className="text-slate-300">GST Rate (%)</Label>
                  <Input 
                    id="gst_percentage" 
                    type="number" 
                    step="0.1" 
                    {...register("gst_percentage")} 
                    placeholder="12" 
                    className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Initial Inventory (Only on create) */}
            {!isEditMode && (
              <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Initial Inventory (Optional)</CardTitle>
                  <CardDescription className="text-slate-400">
                    Add opening stock batch for this product to make it immediately billable.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="initial_stock" className="text-slate-300">Opening Quantity</Label>
                    <Input 
                      id="initial_stock" 
                      type="number" 
                      {...register("initial_stock")} 
                      placeholder="0" 
                      className="bg-slate-950 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manufacturing_date" className="text-slate-300">Manufacturing Date</Label>
                    <Input 
                      id="manufacturing_date" 
                      type="date" 
                      {...register("manufacturing_date")} 
                      className="bg-slate-950 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiry_date" className="text-slate-300">
                      Expiry Date {initialStock && initialStock > 0 ? "*" : ""}
                    </Label>
                    <Input 
                      id="expiry_date" 
                      type="date" 
                      {...register("expiry_date")} 
                      required={initialStock !== undefined && initialStock > 0} 
                      className="bg-slate-950 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reorder_level" className="text-slate-300">Reorder Alert Level</Label>
                    <Input 
                      id="reorder_level" 
                      type="number" 
                      {...register("reorder_level")} 
                      className="bg-slate-950 border-slate-700 text-white"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Inventory reorder level on Edit */}
            {isEditMode && (
              <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Inventory Threshold</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reorder_level" className="text-slate-300">Reorder Alert Level</Label>
                    <Input 
                      id="reorder_level" 
                      type="number" 
                      {...register("reorder_level")} 
                      className="bg-slate-950 border-slate-700 text-white"
                    />
                    <p className="text-xs text-slate-500">Alerts will trigger when total stock falls below this quantity.</p>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>

          {/* Right Sidebar: Image & Status */}
          <div className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Product Image</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="aspect-square bg-slate-950 rounded-lg border-2 border-dashed border-slate-700 flex flex-col items-center justify-center overflow-hidden relative group hover:border-indigo-500 transition-colors">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-slate-400 p-4 text-center">
                        <Upload size={32} className="mb-2 text-indigo-400" />
                        <span className="text-sm font-medium text-slate-300">Upload Image</span>
                        <span className="text-xs text-slate-500 mt-1">PNG, JPG, WebP up to 5MB</span>
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
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full border-slate-700 text-slate-300 hover:bg-slate-800" 
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                    >
                      Remove New Image
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Status & Visibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-white">Active Product</div>
                    <div className="text-xs text-slate-400">Enable in POS billing & search</div>
                  </div>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={(e) => setValue("is_active", e.target.checked)}
                    className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 border-t border-slate-800 pt-6">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate("/admin/products")}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6"
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 animate-spin" size={18} /> Saving...</>
            ) : (
              <><Save className="mr-2" size={18} /> {isEditMode ? "Update Product" : "Save Product"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
