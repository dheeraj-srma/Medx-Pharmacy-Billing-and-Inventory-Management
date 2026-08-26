import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, Link } from "react-router-dom";
import api from "../../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  address: z.string().optional(),
  gst_number: z.string().optional(),
  notes: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export default function AddSupplier() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
  });

  const onSubmit = async (data: SupplierFormValues) => {
    try {
      setIsSubmitting(true);
      // Clean up empty email string to avoid validation errors if empty
      const payload = { ...data };
      if (payload.email === "") payload.email = undefined;
      
      await api.post("/suppliers/", payload);
      navigate("/admin/suppliers");
    } catch (error) {
      console.error("Failed to add supplier", error);
      alert("Failed to add supplier. Please check your inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Link to="/admin/suppliers" className="text-slate-500 hover:text-slate-900">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Add New Supplier</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Supplier Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Contact Person / Name *</Label>
                <Input id="name" {...register("name")} placeholder="e.g. John Doe" />
                {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name">Company / Agency Name</Label>
                <Input id="company_name" {...register("company_name")} placeholder="e.g. ABC Pharma Distributors" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" {...register("phone")} placeholder="e.g. 9876543210" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} placeholder="supplier@example.com" />
                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gst_number">GST Number</Label>
              <Input id="gst_number" {...register("gst_number")} placeholder="e.g. 22AAAAA0000A1Z5" className="font-mono" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" {...register("address")} rows={3} placeholder="Full address" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea id="notes" {...register("notes")} rows={2} placeholder="Any specific terms or notes..." />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 border-t pt-6">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/suppliers")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
            {isSubmitting ? "Saving..." : <><Save className="mr-2" size={18} /> Save Supplier</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
