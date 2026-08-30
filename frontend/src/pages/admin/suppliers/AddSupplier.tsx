import { useModal } from "@/providers/ModalProvider";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../../../services/api";
import { useDataStore } from "../../../store/dataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save, Building2, Loader2 } from "lucide-react";

const supplierSchema = z.object({
  name: z.string().min(1, "Contact person or supplier name is required"),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  address: z.string().optional(),
  gst_number: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean().default(true),
});

export default function AddSupplier() {
  const { showAlert } = useModal();
  const { id } = useParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { invalidate } = useDataStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSupplier, setIsLoadingSupplier] = useState(isEditMode);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<any>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      is_active: true,
    }
  });

  const isActive = watch("is_active");

  useEffect(() => {
    if (isEditMode && id) {
      setIsLoadingSupplier(true);
      api.get(`/suppliers/${id}`)
        .then(res => {
          const s = res.data;
          reset({
            name: s.name || "",
            company_name: s.company_name || "",
            phone: s.phone || "",
            email: s.email || "",
            address: s.address || "",
            gst_number: s.gst_number || "",
            notes: s.notes || "",
            is_active: s.is_active ?? true,
          });
        })
        .catch(err => {
          console.error("Failed to load supplier", err);
          showAlert("Error", "Failed to load supplier details.");
          navigate("/admin/suppliers");
        })
        .finally(() => {
          setIsLoadingSupplier(false);
        });
    }
  }, [id, isEditMode, reset, navigate]);

  const onSubmit = async (data: any) => {
    try {
      setIsSubmitting(true);
      const payload: any = {
        name: data.name,
        company_name: data.company_name || null,
        phone: data.phone || null,
        email: data.email && data.email.trim() ? data.email.trim() : null,
        address: data.address || null,
        gst_number: data.gst_number || null,
        notes: data.notes || null,
        is_active: data.is_active ?? true,
      };
      
      if (isEditMode && id) {
        await api.put(`/suppliers/${id}`, payload);
      } else {
        await api.post("/suppliers/", payload);
      }

      invalidate('suppliers');
      navigate("/admin/suppliers");
    } catch (error: any) {
      console.error("Failed to save supplier", error);
      const detail = error.response?.data?.detail;
      showAlert("Error", detail || `Failed to ${isEditMode ? "update" : "add"} supplier. Please check your inputs.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingSupplier) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 space-y-4">
        <Loader2 className="animate-spin text-indigo-400" size={36} />
        <p className="text-sm font-medium">Loading supplier details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 relative z-10">
      <div className="flex items-center gap-4">
        <Link 
          to="/admin/suppliers" 
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {isEditMode ? "Edit Supplier" : "Add New Supplier"}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEditMode ? "Update vendor contact, GST credentials, and distribution agency details." : "Register a pharmaceutical distributor or vendor partner."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Building2 className="text-indigo-400" size={20} /> Supplier Information
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enter primary contact info, business agency name, and tax identification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300">Contact Person / Name *</Label>
                <Input 
                  id="name" 
                  {...register("name")} 
                  placeholder="e.g. Rajesh Kumar" 
                  className="bg-slate-950 border-slate-700 text-white placeholder-slate-500 focus:ring-indigo-500"
                />
                {errors.name && <p className="text-xs text-rose-400">{errors.name.message as string}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name" className="text-slate-300">Company / Agency Name</Label>
                <Input 
                  id="company_name" 
                  {...register("company_name")} 
                  placeholder="e.g. Apollo Pharma Distributors" 
                  className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-300">Phone Number</Label>
                <Input 
                  id="phone" 
                  {...register("phone")} 
                  placeholder="e.g. +91 9876543210" 
                  className="bg-slate-950 border-slate-700 text-white placeholder-slate-500 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  {...register("email")} 
                  placeholder="orders@apollopharma.com" 
                  className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
                />
                {errors.email && <p className="text-xs text-rose-400">{errors.email.message as string}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gst_number" className="text-slate-300">GSTIN / Tax ID</Label>
              <Input 
                id="gst_number" 
                {...register("gst_number")} 
                placeholder="e.g. 08AAAAA0000A1Z5" 
                className="font-mono bg-slate-950 border-slate-700 text-white placeholder-slate-500 uppercase" 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address" className="text-slate-300">Warehouse / Office Address</Label>
              <Textarea 
                id="address" 
                {...register("address")} 
                rows={3} 
                placeholder="Shop No. 12, Medical Market, Jaipur..." 
                className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-slate-300">Payment Terms & Internal Notes</Label>
              <Textarea 
                id="notes" 
                {...register("notes")} 
                rows={2} 
                placeholder="e.g. Credit period 21 days, delivers on Tuesdays..." 
                className="bg-slate-950 border-slate-700 text-white placeholder-slate-500"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-lg mt-2">
              <div>
                <div className="text-sm font-medium text-white">Active Supplier</div>
                <div className="text-xs text-slate-400">Available for creating inward stock purchases</div>
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

        <div className="flex justify-end gap-4 border-t border-slate-800 pt-6">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate("/admin/suppliers")}
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
              <><Save className="mr-2" size={18} /> {isEditMode ? "Update Supplier" : "Save Supplier"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
