import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench, ShieldAlert, TriangleAlert, CircleDot } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useModal } from "@/providers/ModalProvider";

interface DataIssue {
  id: number;
  entity_type: string;
  entity_id: number;
  field_name: string;
  issue_type: string;
  severity: "MISSING" | "WARNING" | "ERROR" | "NORMALIZED" | "VALID";
  message: string;
  original_value: string | null;
  placeholder_value: string | null;
  branch_id: number | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  is_resolved: boolean;
}

interface Summary {
  unresolved_total: number;
  missing: number;
  warnings: number;
  errors: number;
  resolved_total: number;
}

/** Map entity_type to a human-readable label and a fix route */
const ENTITY_META: Record<string, { label: string; fixRoute: (id: number) => string }> = {
  product: { label: "Product", fixRoute: (id) => `/admin/products/edit/${id}` },
  inventory_batch: { label: "Inventory Batch", fixRoute: (id) => `/admin/inventory?highlight_batch=${id}` },
  customer: { label: "Customer", fixRoute: (id) => `/admin/customers?highlight=${id}` },
  supplier: { label: "Supplier", fixRoute: (id) => `/admin/suppliers?highlight=${id}` },
};

const SEVERITY_CONFIG = {
  MISSING: { label: "Missing", color: "text-amber-400", badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: TriangleAlert },
  WARNING: { label: "Warning", color: "text-yellow-400", badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30", icon: AlertTriangle },
  ERROR: { label: "Error", color: "text-rose-400", badge: "bg-rose-500/15 text-rose-300 border-rose-500/30", icon: ShieldAlert },
  NORMALIZED: { label: "Normalized", color: "text-sky-400", badge: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: CheckCircle2 },
  VALID: { label: "Valid", color: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
};

function SeverityBadge({ severity }: { severity: DataIssue["severity"] }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.WARNING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

export default function DataIssues() {
  const { showAlert, showConfirm } = useModal();
  const navigate = useNavigate();

  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterEntityType, setFilterEntityType] = useState<string>("all");
  const [filterResolved, setFilterResolved] = useState<string>("unresolved");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 200 };
      if (filterSeverity !== "all") params.severity = filterSeverity;
      if (filterEntityType !== "all") params.entity_type = filterEntityType;
      if (filterResolved === "resolved") params.resolved = true;
      else if (filterResolved === "unresolved") params.resolved = false;

      const [issuesRes, summaryRes] = await Promise.all([
        api.get("/data-integrity/issues", { params }),
        api.get("/data-integrity/summary"),
      ]);
      setIssues(issuesRes.data.issues ?? []);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error("Failed to fetch data issues", err);
    } finally {
      setLoading(false);
    }
  }, [filterSeverity, filterEntityType, filterResolved]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResolve = async (issue: DataIssue) => {
    const confirmed = await showConfirm(
      "Mark as Resolved",
      `Mark this ${issue.field_name.replace(/_/g, " ")} issue as resolved? This should only be done after the actual value has been corrected.`,
    );
    if (!confirmed) return;
    try {
      await api.post(`/data-integrity/issues/${issue.id}/resolve`);
      await fetchData();
    } catch (err: any) {
      showAlert("Error", err.response?.data?.detail || "Failed to resolve issue.");
    }
  };

  const handleFix = (issue: DataIssue) => {
    const meta = ENTITY_META[issue.entity_type];
    if (!meta) {
      showAlert("Navigation Error", `No fix route configured for entity type: ${issue.entity_type}`);
      return;
    }
    navigate(meta.fixRoute(issue.entity_id));
  };

  // Client-side search filter
  const filteredIssues = issues.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.entity_type.toLowerCase().includes(q) ||
      i.field_name.toLowerCase().includes(q) ||
      i.message.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Data Issues</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Review and resolve data quality problems across your inventory and business records.
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={fetchData} className="text-slate-400 hover:text-white h-9 w-9">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Unresolved", value: summary.unresolved_total, color: "text-slate-200", bg: "border-slate-700", icon: CircleDot },
            { label: "Missing Fields", value: summary.missing, color: "text-amber-300", bg: "border-amber-500/30 bg-amber-500/5", icon: TriangleAlert },
            { label: "Warnings", value: summary.warnings, color: "text-yellow-300", bg: "border-yellow-500/30 bg-yellow-500/5", icon: AlertTriangle },
            { label: "Errors", value: summary.errors, color: "text-rose-300", bg: "border-rose-500/30 bg-rose-500/5", icon: ShieldAlert },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <Card key={label} className={`bg-slate-900/50 border ${bg}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                  </div>
                  <Icon size={20} className={color} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search by entity, field, or message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 h-9 max-w-xs text-sm"
            />
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-36 h-9 bg-slate-950 border-slate-700 text-slate-200 text-sm">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="MISSING">Missing</SelectItem>
                <SelectItem value="WARNING">Warning</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEntityType} onValueChange={setFilterEntityType}>
              <SelectTrigger className="w-40 h-9 bg-slate-950 border-slate-700 text-slate-200 text-sm">
                <SelectValue placeholder="Entity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="product">Products</SelectItem>
                <SelectItem value="inventory_batch">Inventory</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="supplier">Suppliers</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterResolved} onValueChange={setFilterResolved}>
              <SelectTrigger className="w-36 h-9 bg-slate-950 border-slate-700 text-slate-200 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unresolved">Unresolved</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Issues Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base font-semibold flex items-center gap-2">
            Issues
            <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              {filteredIssues.length} shown
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <RefreshCw size={20} className="animate-spin mr-2" />
              Loading issues...
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <p className="text-sm font-medium text-slate-400">No issues found</p>
              <p className="text-xs text-slate-500">Your data looks clean for the selected filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 text-xs font-semibold">Entity</TableHead>
                  <TableHead className="text-slate-400 text-xs font-semibold">Field</TableHead>
                  <TableHead className="text-slate-400 text-xs font-semibold">Issue</TableHead>
                  <TableHead className="text-slate-400 text-xs font-semibold">Severity</TableHead>
                  <TableHead className="text-slate-400 text-xs font-semibold">Created</TableHead>
                  <TableHead className="text-slate-400 text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-slate-400 text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIssues.map((issue) => {
                  const meta = ENTITY_META[issue.entity_type];
                  return (
                    <TableRow key={issue.id} className="border-slate-800/50 hover:bg-slate-800/20">
                      <TableCell className="py-2.5">
                        <div className="text-xs font-semibold text-slate-200">
                          {meta?.label ?? issue.entity_type}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">#{issue.entity_id}</div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-xs text-slate-300 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                          {issue.field_name}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 max-w-xs">
                        <p className="text-xs text-slate-400 line-clamp-2">{issue.message}</p>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <SeverityBadge severity={issue.severity} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-[11px] text-slate-500">
                          {new Date(issue.created_at).toLocaleDateString("en-IN")}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {issue.is_resolved ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                            <CheckCircle2 size={10} /> Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-700/50 text-slate-400 border-slate-600">
                            <CircleDot size={10} /> Open
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {meta && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleFix(issue)}
                                  className="h-7 w-7 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                                >
                                  <Wrench size={13} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Fix — go to {meta.label}</TooltipContent>
                            </Tooltip>
                          )}
                          {!issue.is_resolved && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleResolve(issue)}
                                  className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                                >
                                  <CheckCircle2 size={13} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark as resolved</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
