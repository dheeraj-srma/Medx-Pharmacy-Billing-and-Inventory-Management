import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

export default function Settings() {
  const [isSaving, setIsSaving] = useState(false);

  // In a real app, these would be fetched from the backend or context
  const [storeConfig, setStoreConfig] = useState({
    storeName: "Med Ex Pharmacy",
    phone: "+91 9876543210",
    email: "contact@medex.com",
    address: "123 Health Ave, Mumbai, India",
    gstin: "22AAAAA0000A1Z5",
    defaultTaxRate: "12",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStoreConfig({ ...storeConfig, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    setIsSaving(true);
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      alert("Settings saved successfully!");
    }, 1000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your medical store preferences and details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Navigation / Sections (static for now) */}
        <div className="md:col-span-1 space-y-1">
          <Button variant="secondary" className="w-full justify-start font-medium">Store Profile</Button>
          <Button variant="ghost" className="w-full justify-start text-slate-500">Tax & Billing</Button>
          <Button variant="ghost" className="w-full justify-start text-slate-500">Users & Roles</Button>
          <Button variant="ghost" className="w-full justify-start text-slate-500">System Preferences</Button>
        </div>

        {/* Content */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Store Profile</CardTitle>
              <CardDescription>
                This information is displayed on your printed invoices and dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storeName">Store Name</Label>
                <Input id="storeName" name="storeName" value={storeConfig.storeName} onChange={handleChange} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" name="phone" value={storeConfig.phone} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" name="email" value={storeConfig.email} onChange={handleChange} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Full Address</Label>
                <Input id="address" name="address" value={storeConfig.address} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gstin">GSTIN / Registration Number</Label>
                <Input id="gstin" name="gstin" value={storeConfig.gstin} onChange={handleChange} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tax & Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="defaultTaxRate">Default Tax Rate (%)</Label>
                <Input id="defaultTaxRate" name="defaultTaxRate" type="number" value={storeConfig.defaultTaxRate} onChange={handleChange} />
                <p className="text-xs text-slate-500">Used as a fallback when product tax is not specified.</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? "Saving..." : <><Save className="mr-2" size={18} /> Save Changes</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
