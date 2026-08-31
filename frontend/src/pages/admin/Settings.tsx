import { useModal } from "@/providers/ModalProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import api from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Save, ShieldAlert, Sparkles, Sliders, UserPlus, Key, Edit2, 
  Trash2, Database, RefreshCw, Download, CheckCircle2, UserX, Maximize2, X
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Settings() {
  const { showAlert, showConfirm } = useModal();
  const { user } = useAuthStore();
  const [selectedSettingsBranchId, setSelectedSettingsBranchId] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("store_profile");

  useEffect(() => {
    if (user?.branch_id) {
      setSelectedSettingsBranchId(user.branch_id);
    }
  }, [user]);

  const [storeConfig, setStoreConfig] = useState({
    storeName: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
    defaultTaxRate: "12",
    printGstin: true,
  });

  // Users & Roles state
  const [users, setUsers] = useState<any[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showExpandedUsersTable, setShowExpandedUsersTable] = useState(false);
  const [showEditUser, setShowEditUser] = useState<any | null>(null);
  const [newUser, setNewUser] = useState<any>({
    email: "",
    full_name: "",
    password: "",
    role: "STAFF",
    branch_id: 1
  });
  const [editUserForm, setEditUserForm] = useState({
    full_name: "",
    role: "STAFF",
    is_active: true,
    branch_id: 1 as number | null
  });
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<any | null>(null);

  // System Preferences / Backups state
  const [backups, setBackups] = useState<any[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<any | null>(null);

  const fetchSettings = async (branchId?: number) => {
    try {
      const bid = branchId ?? selectedSettingsBranchId;
      const res = await api.get("/settings/", { params: { branch_id: bid } });
      setStoreConfig({
        storeName: res.data.store_name || "",
        phone: res.data.phone || "",
        email: res.data.email || "",
        address: res.data.address || "",
        gstin: res.data.gstin || "",
        defaultTaxRate: res.data.default_tax_rate?.toString() || "12",
        printGstin: res.data.print_gstin ?? true,
      });
    } catch (error) {
      console.error("Failed to fetch settings", error);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data);
    } catch (error) {
      console.error("Failed to fetch users list", error);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await api.get("/settings/backups");
      setBackups(res.data);
    } catch (error) {
      console.error("Failed to fetch backups list", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchSettings(selectedSettingsBranchId),
        fetchUsers(),
        fetchBackups()
      ]);
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      fetchSettings(selectedSettingsBranchId);
    }
  }, [selectedSettingsBranchId]);

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
        print_gstin: storeConfig.printGstin,
      };

      const res = await api.put(`/settings/?branch_id=${selectedSettingsBranchId}`, payload);
      setStoreConfig({
        storeName: res.data.store_name || "",
        phone: res.data.phone || "",
        email: res.data.email || "",
        address: res.data.address || "",
        gstin: res.data.gstin || "",
        defaultTaxRate: res.data.default_tax_rate?.toString() || "12",
        printGstin: res.data.print_gstin ?? true,
      });
      showAlert("Success", "Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings", error);
      showAlert("Error", "Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // User Actions
  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      showAlert("Warning", "Please fill all required fields");
      return;
    }
    try {
      const payload = { ...newUser };
      if (payload.role !== "STAFF") {
        delete payload.branch_id;
      }
      await api.post("/auth/register", payload);
      showAlert("Success", "Staff registered successfully!");
      setShowAddUser(false);
      setNewUser({ email: "", full_name: "", password: "", role: "STAFF", branch_id: 1 });
      fetchUsers();
    } catch (error: any) {
      console.error("Failed to register staff", error);
      showAlert("Error", error.response?.data?.detail || "Registration failed");
    }
  };

  const handleOpenEditUser = (user: any) => {
    setShowEditUser(user);
    setEditUserForm({
      full_name: user.full_name || "",
      role: user.role,
      is_active: user.is_active,
      branch_id: user.branch_id || 1
    });
  };

  const handleSaveEditUser = async () => {
    if (!showEditUser) return;
    try {
      const payload = { ...editUserForm };
      if (payload.role !== "STAFF") {
        payload.branch_id = null;
      }
      await api.put(`/auth/users/${showEditUser.id}`, payload);
      showAlert("Success", "User updated successfully!");
      setShowEditUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error("Failed to update user", error);
      showAlert("Error", error.response?.data?.detail || "Failed to update user");
    }
  };

  const handleResetPassword = async () => {
    if (!showResetPasswordModal || !resetPassword) {
      showAlert("Warning", "Please enter a new password");
      return;
    }
    try {
      await api.put(`/auth/users/${showResetPasswordModal.id}/password`, {
        password: resetPassword
      });
      showAlert("Success", "Password updated successfully!");
      setShowResetPasswordModal(null);
      setResetPassword("");
    } catch (error: any) {
      console.error("Failed to reset password", error);
      showAlert("Error", error.response?.data?.detail || "Reset password failed");
    }
  };

  const handleDeactivateUser = async (userId: number) => {
    if (!await showConfirm("Deactivate Staff", "Are you sure you want to deactivate this staff member?")) return;
    try {
      await api.delete(`/auth/users/${userId}`);
      showAlert("Success", "Staff member deactivated successfully!");
      fetchUsers();
    } catch (error) {
      console.error("Failed to deactivate staff", error);
      showAlert("Error", "Deactivation failed");
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!await showConfirm("Delete Staff", "Are you sure you want to permanently delete this staff member? This action cannot be undone.")) return;
    try {
      await api.delete(`/auth/users/${userId}/hard`);
      showAlert("Success", "Staff member permanently deleted successfully!");
      fetchUsers();
    } catch (error: any) {
      console.error("Failed to delete staff", error);
      showAlert("Error", error.response?.data?.detail || "Deletion failed. Users with transaction history cannot be deleted; please deactivate them instead.");
    }
  };

  // Backup & Optimization Actions
  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await api.post("/settings/backup");
      showAlert("Success", `Backup created successfully: ${res.data.filename}`);
      fetchBackups();
    } catch (error) {
      console.error("Failed to create database backup", error);
      showAlert("Error", "Backup creation failed.");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const response = await api.get(`/settings/backups/${filename}/download`, {
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Failed to download backup", error);
      showAlert("Error", "Download failed.");
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!await showConfirm("Delete Backup", `Are you sure you want to delete backup file: ${filename}?`)) return;
    try {
      await api.delete(`/settings/backups/${filename}`);
      showAlert("Success", "Backup deleted successfully.");
      fetchBackups();
    } catch (error) {
      console.error("Failed to delete backup", error);
      showAlert("Error", "Delete failed.");
    }
  };

  const handleOptimizeDb = async () => {
    setIsOptimizing(true);
    setOptimizeResult(null);
    try {
      const res = await api.post("/settings/optimize");
      setOptimizeResult(res.data);
      showAlert("Success", "SQLite database optimized (vacuumed) successfully!");
    } catch (error) {
      console.error("Failed to optimize database", error);
      showAlert("Error", "Optimization failed.");
    } finally {
      setIsOptimizing(false);
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
        <h1 className="text-3xl font-bold tracking-tight text-white font-sans">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your medical store preferences, staff controls and system back-ups.</p>
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
          {(user?.role === "admin" || user?.role === "superadmin") && (activeTab === "store_profile" || activeTab === "tax_billing") && (
            <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl backdrop-blur-sm shadow-xl shadow-black/10">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Active Branch Profile</h3>
                <p className="text-xs text-slate-400">Select which branch profile to view and modify.</p>
              </div>
              <select
                value={selectedSettingsBranchId}
                onChange={(e) => setSelectedSettingsBranchId(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-48 transition-all hover:border-slate-700 cursor-pointer"
              >
                <option value={1}>Branch 1 (Chandan Vihar)</option>
                <option value={2}>Branch 2 (Shivpuri)</option>
              </select>
            </div>
          )}

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
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="defaultTaxRate" className="text-slate-300">Default Tax Rate (%)</Label>
                  <Input id="defaultTaxRate" name="defaultTaxRate" type="number" value={storeConfig.defaultTaxRate} onChange={handleChange} className="bg-slate-950 border-slate-800 text-white" />
                  <p className="text-xs text-slate-500">Used as a fallback when product tax is not specified.</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-950/20 rounded-lg border border-slate-800 max-w-xl">
                  <div className="space-y-0.5">
                    <Label className="text-slate-200">Print GSTIN on Bill</Label>
                    <p className="text-xs text-slate-500">Toggle whether to show branch GSTIN numbers on printed bills.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={storeConfig.printGstin} 
                      onChange={(e) => setStoreConfig({ ...storeConfig, printGstin: e.target.checked })}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "users_roles" && (
            <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
              <CardHeader className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <ShieldAlert className="text-indigo-400" size={20} />
                    Users & Roles
                  </CardTitle>
                  <CardDescription className="text-slate-400 font-sans">Manage staff members and security permissions.</CardDescription>
                </div>
                <Button onClick={() => setShowAddUser(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2">
                  <UserPlus size={16} /> Register Staff
                </Button>
              </CardHeader>
              <CardContent className="pt-6 relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setShowExpandedUsersTable(true)} 
                      className="absolute top-2 right-4 text-slate-400 hover:text-white"
                    >
                      <Maximize2 size={20} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Expand Table</TooltipContent>
                </Tooltip>
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/20 mt-4">
                  <Table>
                    <TableHeader className="bg-slate-900/60">
                      <TableRow className="border-slate-800">
                        <TableHead className="text-slate-400 font-medium">Name</TableHead>
                        <TableHead className="text-slate-400 font-medium">Email</TableHead>
                        <TableHead className="text-slate-400 font-medium">Role</TableHead>
                        <TableHead className="text-slate-400 font-medium">Status</TableHead>
                        <TableHead className="text-right text-slate-400 font-medium">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500 py-8">No registered staff found.</TableCell>
                        </TableRow>
                      ) : (
                        users.map((user) => (
                          <TableRow key={user.id} className="border-slate-800/60 hover:bg-slate-900/20">
                            <TableCell className="text-white font-medium">{user.full_name || "N/A"}</TableCell>
                            <TableCell className="text-slate-300 font-mono text-sm">{user.email}</TableCell>
                            <TableCell>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                user.role === "ADMIN" 
                                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25" 
                                  : "bg-slate-500/10 text-slate-400 border border-slate-500/25"
                              }`}>
                                {user.role}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                user.is_active ? "text-emerald-400" : "text-rose-400"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? "bg-emerald-400" : "bg-rose-400"}`} />
                                {user.is_active ? "Active" : "Inactive"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditUser(user)} className="text-slate-300 hover:text-white hover:bg-slate-800 h-8 w-8">
                                      <Edit2 size={15} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit Staff Profile</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setShowResetPasswordModal(user)} className="text-slate-300 hover:text-white hover:bg-slate-800 h-8 w-8">
                                      <Key size={15} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reset Password</TooltipContent>
                                </Tooltip>
                                {user.is_active && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleDeactivateUser(user.id)} className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 h-8 w-8">
                                        <Trash2 size={15} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Deactivate Account</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-400 hover:bg-red-950/20 h-8 w-8">
                                      <UserX size={15} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete Account Permanently</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "system_prefs" && (
            <div className="space-y-6">
              {/* Backups Panel */}
              <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
                <CardHeader className="flex justify-between items-center border-b border-slate-800 pb-4">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2 font-sans">
                      <Database className="text-indigo-400" size={20} />
                      Database Backups
                    </CardTitle>
                    <CardDescription className="text-slate-400">Save and download backup copies of your SQLite database store.</CardDescription>
                  </div>
                  <Button onClick={handleCreateBackup} disabled={isBackingUp} className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2">
                    <RefreshCw className={isBackingUp ? "animate-spin" : ""} size={16} /> 
                    {isBackingUp ? "Creating..." : "Create Backup"}
                  </Button>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/20">
                    <Table>
                      <TableHeader className="bg-slate-900/60">
                        <TableRow className="border-slate-800">
                          <TableHead className="text-slate-400 font-medium">Backup Filename</TableHead>
                          <TableHead className="text-slate-400 font-medium">File Size</TableHead>
                          <TableHead className="text-slate-400 font-medium">Created Time (UTC)</TableHead>
                          <TableHead className="text-right text-slate-400 font-medium">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backups.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-500 py-8">No backup logs found.</TableCell>
                          </TableRow>
                        ) : (
                          backups.map((b) => (
                            <TableRow key={b.filename} className="border-slate-800/60 hover:bg-slate-900/20">
                              <TableCell className="text-white font-mono text-sm">{b.filename}</TableCell>
                              <TableCell className="text-slate-300 text-sm">{(b.size_bytes / 1024).toFixed(1)} KB</TableCell>
                              <TableCell className="text-slate-300 text-sm">{new Date(b.created_at).toLocaleString()}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleDownloadBackup(b.filename)} className="text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 h-8 w-8">
                                        <Download size={16} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Download Backup</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleDeleteBackup(b.filename)} className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 h-8 w-8">
                                        <Trash2 size={16} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete Backup File</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Database Optimization Card */}
              <Card className="bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2 font-sans">
                    <Sliders className="text-indigo-400" size={20} />
                    Database Maintenance
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Optimize and clean SQLite storage blocks. Running this clears unused space and speeds up indexes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-950/50 border border-slate-800/60 p-4 rounded-lg">
                    <div>
                      <div className="text-sm font-semibold text-slate-300">SQLite Vacuum Compression</div>
                      <div className="text-xs text-slate-500 mt-1">Locks database for less than 1 second to reclaim index blocks.</div>
                    </div>
                    <Button onClick={handleOptimizeDb} disabled={isOptimizing} className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2">
                      <RefreshCw className={isOptimizing ? "animate-spin" : ""} size={16} />
                      {isOptimizing ? "Optimizing..." : "Optimize DB"}
                    </Button>
                  </div>

                  {optimizeResult && (
                    <div className="bg-slate-950/80 border border-emerald-500/20 p-4 rounded-lg flex items-start gap-3 animate-fade-in">
                      <CheckCircle2 className="text-emerald-400 mt-0.5 flex-shrink-0" size={18} />
                      <div>
                        <div className="text-sm font-bold text-white">Database Optimized Successfully!</div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-400 mt-2">
                          <div>Size Before: <span className="text-slate-200 font-mono">{(optimizeResult.size_before / 1024).toFixed(1)} KB</span></div>
                          <div>Size After: <span className="text-slate-200 font-mono">{(optimizeResult.size_after / 1024).toFixed(1)} KB</span></div>
                          <div className="col-span-2 text-emerald-400 font-semibold mt-1">Reclaimed Storage: {(optimizeResult.space_saved / 1024).toFixed(1)} KB</div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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

      {/* Overlay Modal: Register Staff */}
      {showAddUser && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <CardHeader className="border-b border-slate-800 pb-4">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <UserPlus size={20} className="text-indigo-400" />
                Register Staff Member
              </CardTitle>
              <CardDescription className="text-slate-400">
                Create a new active profile. Staff members can login and log sales.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="regName" className="text-slate-300">Full Name</Label>
                <Input 
                  id="regName" 
                  placeholder="John Doe" 
                  value={newUser.full_name} 
                  onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                  className="bg-slate-950 border-slate-800 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="regEmail" className="text-slate-300">Email / Username</Label>
                <Input 
                  id="regEmail" 
                  type="email"
                  placeholder="john@medex.com" 
                  value={newUser.email} 
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="bg-slate-950 border-slate-800 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="regPassword" className="text-slate-300">Default Password</Label>
                <Input 
                  id="regPassword" 
                  type="password"
                  placeholder="Minimum 6 characters" 
                  value={newUser.password} 
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="bg-slate-950 border-slate-800 text-white font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="regRole" className="text-slate-300">Security Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({...newUser, role: v})}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="STAFF">STAFF (Cashier & Sales logs)</SelectItem>
                    <SelectItem value="ADMIN">ADMIN (Full Manager Privileges)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newUser.role === "STAFF" && (
                <div className="space-y-2">
                  <Label htmlFor="regBranch" className="text-slate-300">Default Branch</Label>
                  <Select 
                    value={newUser.branch_id?.toString() || "1"} 
                    onValueChange={(v) => setNewUser({...newUser, branch_id: parseInt(v)})}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                      <SelectValue placeholder="Select Branch" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="1">Branch 1 (Chandan Vihar)</SelectItem>
                      <SelectItem value="2">Branch 2 (Shivpuri)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="outline" onClick={() => setShowAddUser(false)} className="bg-slate-950 border-slate-800 text-slate-300">
                  Cancel
                </Button>
                <Button onClick={handleAddUser} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Register User
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body
      )}

      {/* Overlay Modal: Edit Staff Member */}
      {showEditUser && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <CardHeader className="border-b border-slate-800 pb-4">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Edit2 size={20} className="text-indigo-400" />
                Edit Staff Member
              </CardTitle>
              <CardDescription className="text-slate-400">
                Editing: <span className="text-white font-mono text-xs">{showEditUser.email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="editName" className="text-slate-300">Full Name</Label>
                <Input 
                  id="editName" 
                  value={editUserForm.full_name} 
                  onChange={(e) => setEditUserForm({...editUserForm, full_name: e.target.value})}
                  className="bg-slate-950 border-slate-800 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editRole" className="text-slate-300">Security Role</Label>
                <Select value={editUserForm.role} onValueChange={(v) => setEditUserForm({...editUserForm, role: v})}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="STAFF">STAFF</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editStatus" className="text-slate-300">Account Status</Label>
                <Select value={editUserForm.is_active ? "active" : "inactive"} onValueChange={(v) => setEditUserForm({...editUserForm, is_active: v === "active"})}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="active">Active (Permit login)</SelectItem>
                    <SelectItem value="inactive">Inactive (Deactivate login access)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editUserForm.role === "STAFF" && (
                <div className="space-y-2">
                  <Label htmlFor="editBranch" className="text-slate-300">Default Branch</Label>
                  <Select 
                    value={editUserForm.branch_id?.toString() || "1"} 
                    onValueChange={(v) => setEditUserForm({...editUserForm, branch_id: parseInt(v)})}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                      <SelectValue placeholder="Select Branch" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="1">Branch 1 (Chandan Vihar)</SelectItem>
                      <SelectItem value="2">Branch 2 (Shivpuri)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="outline" onClick={() => setShowEditUser(null)} className="bg-slate-950 border-slate-800 text-slate-300">
                  Cancel
                </Button>
                <Button onClick={handleSaveEditUser} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body
      )}

      {/* Overlay Modal: Reset Password */}
      {showResetPasswordModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
            <CardHeader className="border-b border-slate-800 pb-4">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Key size={20} className="text-indigo-400" />
                Reset Password
              </CardTitle>
              <CardDescription className="text-slate-400">
                User: <span className="text-white font-mono text-xs">{showResetPasswordModal.email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="resetPasswordInput" className="text-slate-300">New Password</Label>
                <Input 
                  id="resetPasswordInput" 
                  type="password"
                  placeholder="Enter new password" 
                  value={resetPassword} 
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="outline" onClick={() => setShowResetPasswordModal(null)} className="bg-slate-950 border-slate-800 text-slate-300">
                  Cancel
                </Button>
                <Button onClick={handleResetPassword} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  Reset Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body
      )}

      {/* Overlay Modal: Expanded Users Table */}
      {showExpandedUsersTable && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-md p-6 sm:p-12 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">
              Users and roles
            </h2>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowExpandedUsersTable(false)} 
              className="text-slate-300 hover:text-white hover:bg-slate-800 h-10 w-10 rounded-full bg-slate-900/50 border border-slate-800"
            >
              <X size={20} />
            </Button>
          </div>
          
          <div className="flex-1 overflow-auto border border-slate-800 rounded-xl bg-slate-900/90 shadow-2xl">
            <Table>
              <TableHeader className="bg-slate-950/80 sticky top-0 z-10 backdrop-blur-md shadow-sm">
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400 font-medium py-4">Name</TableHead>
                  <TableHead className="text-slate-400 font-medium py-4">Email</TableHead>
                  <TableHead className="text-slate-400 font-medium py-4">Role</TableHead>
                  <TableHead className="text-slate-400 font-medium py-4">Status</TableHead>
                  <TableHead className="text-slate-400 font-medium py-4">Branch</TableHead>
                  <TableHead className="text-right text-slate-400 font-medium py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 py-12">No registered staff found.</TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} className="border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                      <TableCell className="text-white font-medium py-4">{user.full_name || "N/A"}</TableCell>
                      <TableCell className="text-slate-300 font-mono text-sm py-4">{user.email}</TableCell>
                      <TableCell className="py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          user.role === "ADMIN" 
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25" 
                            : "bg-slate-500/10 text-slate-400 border border-slate-500/25"
                        }`}>
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          user.is_active ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          <span className={`h-2 w-2 rounded-full ${user.is_active ? "bg-emerald-400" : "bg-rose-400"} shadow-sm`} />
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm py-4">
                        {user.branch_id ? `Branch ${user.branch_id}` : "Global"}
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <div className="flex justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleOpenEditUser(user)} className="text-slate-300 hover:text-white hover:bg-slate-800 bg-slate-900/50 h-9 w-9">
                                <Edit2 size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit Staff Profile</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setShowResetPasswordModal(user)} className="text-slate-300 hover:text-white hover:bg-slate-800 bg-slate-900/50 h-9 w-9">
                                <Key size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reset Password</TooltipContent>
                          </Tooltip>
                          {user.is_active && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleDeactivateUser(user.id)} className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 bg-slate-900/50 h-9 w-9">
                                  <Trash2 size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Deactivate Account</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-400 hover:bg-red-950/20 bg-slate-900/50 h-9 w-9">
                                <UserX size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete Account Permanently</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
