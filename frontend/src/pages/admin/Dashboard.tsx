import { useEffect, useState, useCallback } from "react";
import { useDataStore } from "../../store/dataStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IndianRupee, FileText, AlertTriangle, Clock, Activity, X, Landmark, Receipt, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../services/api";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

type KPIKey = 'revenue' | 'invoices' | 'low_stock' | 'expiry';

export default function Dashboard() {
  const { dashboard, fetchDashboard } = useDataStore();
  const { data: { stats, salesChart, recentSales }, loading } = dashboard;

  // Modal / Detail breakdown state
  const [selectedKPI, setSelectedKPI] = useState<KPIKey | null>(null);
  const [kpiDetails, setKpiDetails] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (selectedKPI) {
      document.body.classList.add("dashboard-modal-open");
    } else {
      document.body.classList.remove("dashboard-modal-open");
    }
    return () => {
      document.body.classList.remove("dashboard-modal-open");
    };
  }, [selectedKPI]);

  const loadKPIDetails = useCallback(async (kpi: KPIKey) => {
    setSelectedKPI(kpi);
    setDetailsLoading(true);
    setKpiDetails([]);
    try {
      if (kpi === 'revenue' || kpi === 'invoices') {
        const todayISO = new Date().toISOString().split('T')[0];
        const res = await api.get('/sales/', { params: { start_date: todayISO, end_date: todayISO } });
        setKpiDetails(res.data);
      } else if (kpi === 'low_stock' || kpi === 'expiry') {
        const res = await api.get('/reports/inventory-valuation');
        if (kpi === 'low_stock') {
          setKpiDetails(res.data.low_stock_items ?? []);
        } else {
          setKpiDetails(res.data.expiring_soon_items ?? []);
        }
      }
    } catch (err) {
      console.error("Failed to load KPI details:", err);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  if (loading || !stats) {
    return (
      <div className="p-8 text-center text-slate-400 flex items-center justify-center h-64">
        <Activity className="animate-ecg-pulse mr-2 text-indigo-400" size={24} /> Loading Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-8 relative z-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Welcome back. Here is your store's overview today.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card 
          onClick={() => loadKPIDetails('revenue')}
          className="border-l-4 border-l-indigo-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 cursor-pointer hover:scale-[1.02] hover:bg-slate-900/80 transition-all duration-200"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Today's Revenue</CardTitle>
            <div className="p-2 bg-indigo-500/20 rounded-md text-indigo-400"><IndianRupee size={16} /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₹{stats.revenue_today.toFixed(2)}</div>
            <p className="text-xs text-slate-500 mt-1">Monthly: ₹{stats.revenue_month.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card 
          onClick={() => loadKPIDetails('invoices')}
          className="border-l-4 border-l-emerald-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 cursor-pointer hover:scale-[1.02] hover:bg-slate-900/80 transition-all duration-200"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Invoices Today</CardTitle>
            <div className="p-2 bg-emerald-500/20 rounded-md text-emerald-400"><FileText size={16} /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.invoices_today}</div>
            <p className="text-xs text-emerald-500 font-medium mt-1">Active billing</p>
          </CardContent>
        </Card>

        <Card 
          onClick={() => loadKPIDetails('low_stock')}
          className="border-l-4 border-l-amber-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 cursor-pointer hover:scale-[1.02] hover:bg-slate-900/80 transition-all duration-200"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Low Stock Items</CardTitle>
            <div className="p-2 bg-amber-500/20 rounded-md text-amber-400"><AlertTriangle size={16} /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.low_stock_alerts}</div>
            <p className="text-xs text-amber-500 font-medium mt-1">Requires reorder</p>
          </CardContent>
        </Card>

        <Card 
          onClick={() => loadKPIDetails('expiry')}
          className="border-l-4 border-l-rose-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10 cursor-pointer hover:scale-[1.02] hover:bg-slate-900/80 transition-all duration-200"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Expiring Soon</CardTitle>
            <div className="p-2 bg-rose-500/20 rounded-md text-rose-400"><Clock size={16} /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.expiring_soon_alerts}</div>
            <p className="text-xs text-rose-500 font-medium mt-1">Within 30 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        {/* Chart */}
        <Card className="lg:col-span-4 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="text-white">Sales Trend (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(val) => `₹${val}`} />
                <Tooltip 
                  formatter={(value: any) => [`₹${parseFloat(value).toFixed(2)}`, 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#fff', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }}
                  itemStyle={{ color: '#818cf8' }}
                />
                <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Sales Table */}
        <Card className="lg:col-span-3 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader>
            <CardTitle className="text-white">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <div className="text-center py-10 text-slate-500">No recent sales.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-slate-800/50">
                      <TableHead className="text-slate-400">Invoice</TableHead>
                      <TableHead className="text-slate-400">Time</TableHead>
                      <TableHead className="text-right text-slate-400">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentSales.map(sale => (
                      <TableRow key={sale.id} className="border-slate-800 hover:bg-slate-800/50">
                        <TableCell className="font-mono text-xs text-slate-300">{sale.invoice_number}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(sale.sale_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-400">₹{sale.grand_total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPI Details Modal */}
      {selectedKPI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
          <Card className="w-full max-w-2xl max-h-[85vh] bg-slate-900 border-slate-800 shadow-2xl overflow-hidden flex flex-col">
            
            {/* Header */}
            <CardHeader className="border-b border-slate-800 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl flex items-center gap-2">
                  {selectedKPI === 'revenue' && <Landmark className="text-indigo-400" size={22} />}
                  {selectedKPI === 'invoices' && <Receipt className="text-emerald-400" size={22} />}
                  {selectedKPI === 'low_stock' && <AlertTriangle className="text-amber-400" size={22} />}
                  {selectedKPI === 'expiry' && <Clock className="text-rose-400" size={22} />}
                  {selectedKPI === 'revenue' && "Today's Sales Revenue Details"}
                  {selectedKPI === 'invoices' && "Today's Invoices List"}
                  {selectedKPI === 'low_stock' && "Low Stock Batches Breakdown"}
                  {selectedKPI === 'expiry' && "Items Expiring Soon (30 Days)"}
                </CardTitle>
                <CardDescription className="text-slate-400 mt-1">
                  {selectedKPI === 'revenue' && "Breakdown of all retail sales processed today."}
                  {selectedKPI === 'invoices' && "List of active billing invoices generated today."}
                  {selectedKPI === 'low_stock' && "Active inventory batches with less than 10 packs in stock."}
                  {selectedKPI === 'expiry' && "Stock batches with expiry date within the next 30 days."}
                </CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setSelectedKPI(null)}
                className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 w-8 rounded-lg"
              >
                <X size={18} />
              </Button>
            </CardHeader>

            {/* Content Body */}
            <CardContent className="p-6 overflow-y-auto space-y-4 flex-1">
              {detailsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
                  <Activity className="animate-ecg-pulse text-indigo-400" size={32} />
                  <p className="text-sm font-medium">Fetching detailed breakdown data...</p>
                </div>
              ) : kpiDetails.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  No records found matching this breakdown today.
                </div>
              ) : (
                <div className="bg-slate-950 rounded-xl border border-slate-800/80 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-900 sticky top-0 shadow-sm">
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        {(selectedKPI === 'revenue' || selectedKPI === 'invoices') ? (
                          <>
                            <TableHead className="text-slate-400">Invoice No</TableHead>
                            <TableHead className="text-slate-400">Time</TableHead>
                            <TableHead className="text-slate-400">Payment</TableHead>
                            <TableHead className="text-right text-slate-400">Amount</TableHead>
                          </>
                        ) : selectedKPI === 'low_stock' ? (
                          <>
                            <TableHead className="text-slate-400">Product Name</TableHead>
                            <TableHead className="text-slate-400">Batch No</TableHead>
                            <TableHead className="text-right text-slate-400">Stock Left</TableHead>
                          </>
                        ) : (
                          <>
                            <TableHead className="text-slate-400">Product Name</TableHead>
                            <TableHead className="text-slate-400">Batch No</TableHead>
                            <TableHead className="text-slate-400">Expiry Date</TableHead>
                            <TableHead className="text-right text-slate-400">Stock</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kpiDetails.map((item, idx) => (
                        <TableRow key={item.id ?? idx} className="border-slate-800 hover:bg-slate-900/40">
                          {(selectedKPI === 'revenue' || selectedKPI === 'invoices') ? (
                            <>
                              <TableCell className="font-mono text-xs text-slate-300 font-semibold">{item.invoice_number}</TableCell>
                              <TableCell className="text-xs text-slate-400 flex items-center gap-1.5 mt-2.5 border-t-0">
                                <Clock size={12} />
                                {new Date(item.sale_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </TableCell>
                              <TableCell className="text-xs text-slate-400">
                                <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-medium text-[10px]">
                                  {item.payment_method}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono text-emerald-400 font-bold">₹{item.grand_total.toFixed(2)}</TableCell>
                            </>
                          ) : selectedKPI === 'low_stock' ? (
                            <>
                              <TableCell className="font-medium text-slate-200 text-sm">{item.product_name ?? `Product #${item.product_id}`}</TableCell>
                              <TableCell className="font-mono text-xs text-slate-400">{item.batch_number}</TableCell>
                              <TableCell className="text-right font-bold text-amber-400 font-mono">{item.quantity_available} packs</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-medium text-slate-200 text-sm">{item.product_name ?? `Product #${item.product_id}`}</TableCell>
                              <TableCell className="font-mono text-xs text-slate-400">{item.batch_number}</TableCell>
                              <TableCell className="text-xs text-rose-400 font-medium">
                                <span className="flex items-center gap-1">
                                  <Calendar size={12} />
                                  {new Date(item.expiry_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-slate-300 font-mono">{item.quantity_available} packs</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end">
              <Button 
                variant="outline" 
                onClick={() => setSelectedKPI(null)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
