import { useState, useEffect } from "react";
import api from "../../services/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, ShieldAlert, Sparkles, Sliders } from "lucide-react";

export default function Settings() {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("store_profile");

  const [storeConfig, setStoreConfig] = useState({
    storeName: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
    defaultTaxRate: "12",
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get("/settings/");
        setStoreConfig({
          storeName: res.data.store_name || "",
          phone: res.data.phone || "",
          email: res.data.email || "",
          address: res.data.address || "",
          gstin: res.data.gstin || "",
          defaultTaxRate: res.data.default_tax_rate?.toString() || "12",
        });
      } catch (error) {
        console.error("Failed to fetch settings", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStoreConfig({ ...storeConfig, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        store_name: storeConfig.storeName,
        phone: storeConfig.phone || null,
        email: storeConfig.email || null,
        address: storeConfig.address || null,
        gstin: storeConfig.gstin || null,
        default_tax_rate: parseFloat(storeConfig.defaultTaxRate) || 0.0,
      };

      const res = await api.put("/settings/", payload);
      setStoreConfig({
        storeName: res.data.store_name || "",
        phone: res.data.phone || "",
        email: res.data.email || "",
        address: res.data.address || "",
        gstin: res.data.gstin || "",
        defaultTaxRate: res.data.default_tax_rate?.toString() || "12",
      });
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 flex items-center justify-center h-64">
        <Sparkles className="animate-spin mr-2 text-indigo-400" size={24} /> Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 relative z-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your medical store preferences and details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Navigation / Sections */}
        <div className="md:col-span-1 space-y-2">
          <Button 
            variant={activeTab === "store_profile" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium h-11 px-4 rounded-lg transition-all ${
              activeTab === "store_profile" 
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20" 
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
            onClick={() => setActiveTab("store_profile")}
          >
            Store Profile
          </Button>
          <Button 
            variant={activeTab === "tax_billing" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium h-11 px-4 rounded-lg transition-all ${
              activeTab === "tax_billing" 
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20" 
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
            onClick={() => setActiveTab("tax_billing")}
          >
            Tax & Billing
          </Button>
          <Button 
            variant={activeTab === "users_roles" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium h-11 px-4 rounded-lg transition-all ${
              activeTab === "users_roles" 
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20" 
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
            onClick={() => setActiveTab("users_roles")}
          >
            Users & Roles
          </Button>
          <Button 
            variant={activeTab === "system_prefs" ? "secondary" : "ghost"} 
            className={`w-full justify-start font-medium h-11 px-4 rounded-lg transition-all ${
              activeTab === "system_prefs" 
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20" 
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
            onClick={() => setActiveTab("system_prefs")}
          >
            System Preferences
          </Button>
        </div>

        {/* Content */}
        <div className="md:col-span-2 space-y-6">
          {activeTab === "store_profile" && (
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader>
                <CardTitle className="text-white">Store Profile</CardTitle>
                <CardDescription className="text-slate-400">
                  This information is displayed on your printed invoices and dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="storeName" className="text-slate-300">Store Name</Label>
                  <Input id="storeName" name="storeName" value={storeConfig.storeName} onChange={handleChange} className="bg-slate-950 border-slate-800 text-white" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-slate-300">Phone Number</Label>
                    <Input id="phone" name="phone" value={storeConfig.phone} onChange={handleChange} className="bg-slate-950 border-slate-800 text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-300">Email Address</Label>
                    <Input id="email" name="email" value={storeConfig.email} onChange={handleChange} className="bg-slate-950 border-slate-800 text-white" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address" className="text-slate-300">Full Address</Label>
                  <Input id="address" name="address" value={storeConfig.address} onChange={handleChange} className="bg-slate-950 border-slate-800 text-white" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gstin" className="text-slate-300">GSTIN / Registration Number</Label>
                  <Input id="gstin" name="gstin" value={storeConfig.gstin} onChange={handleChange} className="bg-slate-950 border-slate-800 text-white font-mono" />
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "tax_billing" && (
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader>
                <CardTitle className="text-white">Tax & Billing</CardTitle>
                <CardDescription className="text-slate-400">
                  Global parameters used across the checkout and pos workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="defaultTaxRate" className="text-slate-300">Default Tax Rate (%)</Label>
                  <Input id="defaultTaxRate" name="defaultTaxRate" type="number" value={storeConfig.defaultTaxRate} onChange={handleChange} className="bg-slate-950 border-slate-800 text-white" />
                  <p className="text-xs text-slate-500">Used as a fallback when product tax is not specified.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "users_roles" && (
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader className="flex flex-row items-center gap-3">
                <ShieldAlert className="text-indigo-400" size={24} />
                <div>
                  <CardTitle className="text-white">Users & Roles</CardTitle>
                  <CardDescription className="text-slate-400">Manage staff members and security permissions.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-400 border border-dashed border-slate-800 p-6 rounded-lg bg-slate-950/40 text-center">
                  User and staff role controls will be integrated in Phase 4.
                </p>
              </CardContent>
            </Card>
          )}

          {activeTab === "system_prefs" && (
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader className="flex flex-row items-center gap-3">
                <Sliders className="text-indigo-400" size={24} />
                <div>
                  <CardTitle className="text-white">System Preferences</CardTitle>
                  <CardDescription className="text-slate-400">Configure application behavior and advanced options.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-400 border border-dashed border-slate-800 p-6 rounded-lg bg-slate-950/40 text-center">
                  Advanced preferences (backup, db compression) will be integrated in Phase 4.
                </p>
              </CardContent>
            </Card>
          )}

          {activeTab !== "users_roles" && activeTab !== "system_prefs" && (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white h-11 px-6 rounded-lg font-medium shadow-lg shadow-indigo-900/30">
                {isSaving ? "Saving..." : <><Save className="mr-2" size={18} /> Save Changes</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
