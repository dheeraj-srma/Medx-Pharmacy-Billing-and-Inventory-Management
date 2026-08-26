import { useEffect } from "react";
import { useDataStore } from "../../store/dataStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndianRupee, FileText, AlertTriangle, Clock, Activity } from "lucide-react";
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

export default function Dashboard() {
  const { dashboard, fetchDashboard } = useDataStore();
  const { data: { stats, salesChart, recentSales }, loading } = dashboard;

  useEffect(() => {
    // If data is already loaded and fresh, this is a no-op (returns immediately).
    // If stale, it background-syncs without showing the loading spinner.
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading || !stats) {
    return <div className="p-8 text-center text-slate-500 flex items-center justify-center h-64">
      <Activity className="animate-spin mr-2" size={24} /> Loading Dashboard...
    </div>;
  }

  return (
    <div className="space-y-8 relative z-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Welcome back. Here is your store's overview today.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-indigo-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Today's Revenue</CardTitle>
            <div className="p-2 bg-indigo-500/20 rounded-md text-indigo-400"><IndianRupee size={16} /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₹{stats.revenue_today.toFixed(2)}</div>
            <p className="text-xs text-slate-500 mt-1">Monthly: ₹{stats.revenue_month.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Invoices Today</CardTitle>
            <div className="p-2 bg-emerald-500/20 rounded-md text-emerald-400"><FileText size={16} /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.invoices_today}</div>
            <p className="text-xs text-emerald-500 font-medium mt-1">Active billing</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Low Stock Items</CardTitle>
            <div className="p-2 bg-amber-500/20 rounded-md text-amber-400"><AlertTriangle size={16} /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.low_stock_alerts}</div>
            <p className="text-xs text-amber-500 font-medium mt-1">Requires reorder</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500 bg-slate-900/50 backdrop-blur-sm border-slate-800 shadow-xl shadow-black/10">
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
    </div>
  );
}
