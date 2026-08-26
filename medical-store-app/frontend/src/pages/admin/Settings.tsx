import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

export default function Settings() {
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("store_profile");

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
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your medical store preferences and details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Navigation / Sections */}
        <div className="md:col-span-1 space-y-1">
          <Button 
            variant={activeTab === "store_profile" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium ${activeTab === "store_profile" ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            onClick={() => setActiveTab("store_profile")}
          >
            Store Profile
          </Button>
          <Button 
            variant={activeTab === "tax_billing" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium ${activeTab === "tax_billing" ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            onClick={() => setActiveTab("tax_billing")}
          >
            Tax & Billing
          </Button>
          <Button 
            variant={activeTab === "users_roles" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium ${activeTab === "users_roles" ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            onClick={() => setActiveTab("users_roles")}
          >
            Users & Roles
          </Button>
          <Button 
            variant={activeTab === "system_prefs" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium ${activeTab === "system_prefs" ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
            onClick={() => setActiveTab("system_prefs")}
          >
            System Preferences
          </Button>
        </div>

        {/* Content */}
        <div className="md:col-span-2 space-y-6">
          {activeTab === "store_profile" && (
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
          )}

          {activeTab === "tax_billing" && (
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
          )}

          {activeTab === "users_roles" && (
            <Card>
              <CardHeader>
                <CardTitle>Users & Roles</CardTitle>
                <CardDescription>Manage staff members and permissions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-400">User management module will be integrated in a future update.</p>
              </CardContent>
            </Card>
          )}

          {activeTab === "system_prefs" && (
            <Card>
              <CardHeader>
                <CardTitle>System Preferences</CardTitle>
                <CardDescription>Application behavior and advanced settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-400">System preference controls will be integrated in a future update.</p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSaving ? "Saving..." : <><Save className="mr-2" size={18} /> Save Changes</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
