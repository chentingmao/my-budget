import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  doc,
  setDoc, 
  Timestamp 
} from 'firebase/firestore';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line 
} from 'recharts';
import { 
  Plus, Settings, 
  AlertTriangle, Trash2, FileText, CheckCircle, AlertCircle, Moon, Sun, 
  Landmark, RefreshCw, Upload, Download, // 直接使用真正的 Download 圖標
  Target, Edit3, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Calculator, TrendingUp, Wallet, PieChart as LucidePieChart // 將圖標版 PieChart 改名為 LucidePieChart
} from 'lucide-react';

// =================================================================
// 🌟 Firebase 配置 (請確保環境變數已設定)
// =================================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const FIRESTORE_COLLECTION_ROOT = 'my-personal-expense-tracker'; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =================================================================
// 🌟 TypeScript & Constants
// =================================================================

interface Account {
  id: string;
  name: string;
  currency: string; 
}

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  name: string;
  amount: number; 
  date: string; 
  timestamp: Timestamp;
  subCategory?: string;
  fromAccount?: string;
  toAccount?: string;
  exchangeRate?: string | number;
}

const CATEGORIES = { INCOME: 'income', EXPENSE: 'expense', TRANSFER: 'transfer', ADJUSTMENT: 'adjustment' } as const;

const SUB_CATEGORIES: { [key: string]: string[] } = {
  income: ['薪水', '獎金', '市值變動', '利息', '投資收益', '其他'],
  expense: ['外食', '食材', '生活用品', '交通', '電信', '娛樂', '訂閱服務', '醫療', '人情', '市值變動', '其他'],
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c'];

// --- Helper Functions ---

const formatCurrency = (amount: number, currency: string = 'TWD'): string => {
  return new Intl.NumberFormat('zh-TW', { 
    style: 'currency', 
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
};

// 強化版 CSV 解析器：支援引號與逗號
const robustCSVParser = (text: string) => {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const matches = lines[i].matchAll(/(?:^|,)(?:"([^Internal]*)"|([^,]*))/g);
    const row = Array.from(matches).map(m => m[1] || m[2] || "");
    const obj: any = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);
    result.push(obj);
  }
  return result;
};

const escapeCSV = (val: any) => {
  let str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// =================================================================
// 🌟 Views
// =================================================================

// --- Input View ---
const InputView = ({ formData, handleInputChange, handleTypeChange, handleSubmit, accounts }: any) => {
  const fromAcc = accounts.find((a: any) => a.id === formData.fromAccount);
  const toAcc = accounts.find((a: any) => a.id === formData.toAccount);
  const needRate = formData.type === 'transfer' && fromAcc?.currency !== toAcc?.currency;

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 dark:text-white"><Plus size={20}/> 新增記帳</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-4 gap-1">
          {Object.values(CATEGORIES).map(t => (
            <button key={t} type="button" onClick={() => handleTypeChange(t)}
              className={`py-2 text-xm rounded-lg border ${formData.type === t ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-700 dark:text-gray-300'}`}>
              {t === 'expense' ? '支出' : t === 'income' ? '收入' : t === 'transfer' ? '轉帳' : '調整'}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xm font-medium text-gray-500 mb-1">日期</label>
          <input type="date" name="date" required value={formData.date} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>

        <div>
          <label className="block text-xm font-medium text-gray-500 mb-1">項目 (選填)</label>
          <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white" placeholder="例：午餐" />
        </div>

        {(formData.type === 'income' || formData.type === 'expense') && (
          <div>
            <label className="block text-xm font-medium text-gray-500 mb-1">類別</label>
            <select name="subCategory" value={formData.subCategory} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
              {SUB_CATEGORIES[formData.type]?.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {(formData.type !== 'income') && (
            <div>
              <label className="block text-xm font-medium text-gray-500 mb-1">{formData.type === 'transfer' ? '轉出' : '帳戶'}</label>
              <select name="fromAccount" value={formData.fromAccount} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
          )}
          {(formData.type === 'income' || formData.type === 'transfer') && (
            <div>
              <label className="block text-xm font-medium text-gray-500 mb-1">{formData.type === 'transfer' ? '轉入' : '帳戶'}</label>
              <select name="toAccount" value={formData.toAccount} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xm font-medium text-gray-500 mb-1">金額</label>
          <input type="number" step="any" name="amount" required value={formData.amount} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white" placeholder="0.00" />
        </div>

        {needRate && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <label className="block text-xm font-bold text-yellow-700 dark:text-yellow-400 mb-1">匯率 (1 {fromAcc?.currency} = ? {toAcc?.currency})</label>
            <input type="number" step="any" name="exchangeRate" required value={formData.exchangeRate} onChange={handleInputChange} className="w-full p-2 border-yellow-200 rounded-lg dark:bg-gray-800 dark:text-white" />
          </div>
        )}

        <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-transform active:scale-95">送出記帳</button>
      </form>
    </div>
  );
};

// --- 完整且修正過的 Dashboard View ---
const DashboardView = ({ transactions = [], accountBalances = {}, totalAssetTWD = 0, exchangeRates = {}, accounts = [] }: any) => {
  const [range, setRange] = useState(30);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // 1. 匯率轉換邏輯
  const toTWD = (amount: number, accountId: string) => {
    if (!accounts || accounts.length === 0) return amount;
    const acc = accounts.find((a: any) => a.id === accountId);
    if (!acc) return amount;
    const rate = acc.currency === 'TWD' ? 1 : (exchangeRates[acc.currency] || 1);
    return amount * (Number(rate) || 1);
  };

  // 2. 切換月份邏輯
  const handlePrevMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const handlePrevYear = () => setCurrentMonth(prev => new Date(prev.getFullYear() - 1, prev.getMonth(), 1));
  const handleNextYear = () => setCurrentMonth(prev => new Date(prev.getFullYear() + 1, prev.getMonth(), 1));
  const handleGoToday = () => setCurrentMonth(new Date());

  // 3. 數據過濾與計算
  const filteredTxs = useMemo(() => {
    const cutOff = new Date();
    cutOff.setDate(cutOff.getDate() - range);
    return (transactions || []).filter((t: any) => new Date(t.date) >= cutOff);
  }, [transactions, range]);

  const sortedAccounts = useMemo(() => {
    return accounts.map((acc: any) => {
      const balance = accountBalances[acc.id] || 0;
      const rate = acc.currency === 'TWD' ? 1 : (exchangeRates[acc.currency] || 1);
      const balanceTWD = balance * rate;
      return { ...acc, balance, balanceTWD };
    }).sort((a: any, b: any) => b.balanceTWD - a.balanceTWD);
  }, [accounts, accountBalances, exchangeRates]);

  const barData = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTxs.forEach((t: any) => {
      const val = toTWD(t.amount, t.type === 'income' ? t.toAccount : t.fromAccount);
      if (t.type === 'income') income += val;
      else if (t.type === 'expense') expense += val;
    });
    return [
      { name: '收入', value: Math.round(income), fill: '#10B981' },
      { name: '支出', value: Math.round(expense), fill: '#EF4444' }
    ];
  }, [filteredTxs, accounts, exchangeRates]);

  const pieData = useMemo(() => {
    const map: any = {};
    filteredTxs.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      const cat = t.subCategory || '其他';
      map[cat] = (map[cat] || 0) + toTWD(t.amount, t.fromAccount);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value as number) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTxs, accounts, exchangeRates]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
      const dailySum = (transactions || [])
        .filter((t: any) => t.date === dateStr && t.type === 'expense')
        .reduce((sum: number, t: any) => sum + toTWD(t.amount, t.fromAccount), 0);
      days.push({ day: d, amount: dailySum });
    }
    return days;
  }, [transactions, currentMonth, accounts, exchangeRates]);

  const trendData = useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = range; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      let snapshotBalance = totalAssetTWD;
      (transactions || []).forEach((tx: any) => {
        if (tx.date > dateStr) {
          const val = toTWD(tx.amount, (tx.type === 'income' || tx.type === 'transfer') ? tx.toAccount : tx.fromAccount);
          if (tx.type === 'income') snapshotBalance -= val;
          if (tx.type === 'expense') snapshotBalance += val;
          if (tx.type === 'adjustment') snapshotBalance -= val;
        }
      });
      data.push({ date: dateStr.slice(5), balance: Math.round(snapshotBalance) });
    }
    return data;
  }, [transactions, range, totalAssetTWD, accounts, exchangeRates]);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      {/* 區塊 1: 時間區間 */}
      <section className="flex justify-between items-end px-2">
        <div>
          <h2 className="text-2xl font-black dark:text-white text-gray-800 tracking-tight">數據分析</h2>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Financial Insights</p>
        </div>
        <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-2xl">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setRange(d)} 
              className={`px-4 py-1.5 rounded-xl text-xs transition-all ${range === d ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 font-black' : 'text-gray-500 hover:text-gray-700'}`}>
              {d}天
            </button>
          ))}
        </div>
      </section>

      {/* 區塊 2: 日曆 */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700/50">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
          <h3 className="font-black flex items-center gap-2 dark:text-white text-sm uppercase tracking-widest text-gray-500">
            <Calculator size={18} className="text-blue-500"/> 每日支出日曆
          </h3>
          <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-800">
            <button onClick={handlePrevYear} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-xl transition-all text-gray-400 hover:text-blue-500"><ChevronsLeft size={16}/></button>
            <button onClick={handlePrevMonth} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-xl transition-all text-gray-400 hover:text-blue-500"><ChevronLeft size={16}/></button>
            <div className="px-4 py-1 flex flex-col items-center min-w-[100px]">
              <span className="text-[10px] font-black text-blue-500 uppercase">{currentMonth.getFullYear()}</span>
              <span className="text-sm font-black dark:text-white">{currentMonth.getMonth() + 1}月</span>
            </div>
            <button onClick={handleNextMonth} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-xl transition-all text-gray-400 hover:text-blue-500"><ChevronRight size={16}/></button>
            <button onClick={handleNextYear} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-xl transition-all text-gray-400 hover:text-blue-500"><ChevronsRight size={16}/></button>
            <button onClick={handleGoToday} className="ml-2 px-3 py-1.5 text-[10px] font-black bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-200 dark:shadow-none hover:bg-blue-600 transition-all active:scale-95">今天</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          {['日', '一', '二', '三', '四', '五', '六'].map(w => <div key={w} className="text-center text-[10px] font-black text-gray-300 uppercase tracking-tighter">{w}</div>)}
          {calendarDays.map((d, i) => (
            <div key={i} className={`h-12 sm:h-20 border rounded-2xl p-1 flex flex-col justify-between transition-all ${!d ? 'bg-gray-50/30 border-transparent dark:bg-gray-900/10' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-blue-200'}`}>
              {d && (
                <>
                  <span className="text-[10px] font-black text-gray-300 ml-1">{d.day}</span>
                  {d.amount > 0 && (
                    <span className="text-[11px] sm:text-[12px] font-black text-white bg-red-50 dark:bg-red-500/10 rounded-lg py-1 text-center truncate px-0.5">
                      {Math.round(d.amount).toLocaleString()}
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 兩欄佈局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="md:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700/50">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-black flex items-center gap-2 dark:text-white text-xs uppercase tracking-widest text-gray-400">
              <Landmark size={18} className="text-blue-500"/> 目前帳戶餘額概覽
            </h3>
            <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-700 px-3 py-1 rounded-full">
              共 {accounts.length} 個帳戶
            </span>
          </div>
          
          {/* 內部再用一個 Grid 來排卡片，電腦版顯示 4 欄 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {sortedAccounts.map((acc: any) => {
              const isNegative = acc.balance < 0;
              const percentage = totalAssetTWD > 0 ? (acc.balanceTWD / totalAssetTWD * 100).toFixed(1) : 0;

              return (
                <div key={acc.id} className="p-5 bg-gray-50/50 dark:bg-gray-900/40 rounded-3xl border border-transparent hover:border-blue-200 dark:hover:border-blue-900 transition-all group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] font-black px-2 py-0.5 bg-white dark:bg-gray-800 rounded-lg text-gray-400 shadow-sm border border-gray-100 dark:border-gray-700">
                      {acc.currency}
                    </span>
                    <span className="text-[9px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      {percentage}%
                    </span>
                  </div>
                  
                  <div className="relative z-10">
                    <p className="text-xs font-bold text-gray-400 truncate mb-1">{acc.name}</p>
                    <p className={`text-xl font-black tracking-tight ${isNegative ? 'text-red-500' : 'dark:text-white text-gray-800'}`}>
                      {acc.balance.toLocaleString()}
                    </p>
                    {acc.currency !== 'TWD' && (
                      <p className="text-[10px] font-bold text-gray-400 mt-1">
                        ≈ {formatCurrency(acc.balanceTWD)}
                      </p>
                    )}
                  </div>
                  {/* 小裝飾背景 */}
                  <div className="absolute -right-2 -bottom-2 opacity-[0.03] dark:opacity-[0.05] group-hover:scale-110 transition-transform">
                    <Landmark size={64} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        {/* 區塊 3: 柱狀圖 */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700/50">
          <h3 className="font-black mb-8 flex items-center gap-2 dark:text-white text-xs uppercase tracking-widest text-gray-500"><TrendingUp size={18} className="text-green-500"/> 收支對比</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12, fontWeight: 'bold'}} />
                <Tooltip cursor={{fill: '#f3f4f6', opacity: 0.4}} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 區塊 4: 圓餅圖 */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700/50">
          <h3 className="font-black mb-8 flex items-center gap-2 dark:text-white text-xs uppercase tracking-widest text-gray-500"><LucidePieChart size={18} className="text-purple-500"/> 支出分佈</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} paddingAngle={5}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 區塊 5: 走勢圖 */}
        <section className="md:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
            <h3 className="font-black flex items-center gap-2 dark:text-white text-xs uppercase tracking-widest text-gray-500"><Wallet size={18} className="text-blue-600"/> 總資產趨勢 (TWD)</h3>
            <div className="px-5 py-2.5 bg-blue-600 rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none">
              <span className="text-white font-black text-xl">{formatCurrency(totalAssetTWD)}</span>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 'bold'}} minTickGap={30} />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="balance" stroke="#2563eb" strokeWidth={5} dot={false} activeDot={{ r: 8, fill: '#2563eb', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};

// --- History View ---
const HistoryView = ({ transactions, handleDelete, accounts }: any) => {
  const [filterType, setFilterType] = useState('all');
  const [filterAcc, setFilterAcc] = useState('all');

  const filteredData = useMemo(() => {
  return (transactions || [])
    .filter((tx: any) => {
      const typeMatch = filterType === 'all' || tx.type === filterType;
      const accMatch = filterAcc === 'all' || tx.fromAccount === filterAcc || tx.toAccount === filterAcc;
      return typeMatch && accMatch;
    })
    .sort((a: any, b: any) => {
      // 1. 首先比較日期 (YYYY-MM-DD)，新的日期在前
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;

      // 2. 如果日期相同，比較真正的建立時間 (Timestamp)，後記的帳在前
      // Firebase Timestamp 物件有 toMillis() 方法可以轉換為毫秒進行比較
      const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
      const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
      return timeB - timeA;
    });
  }, [transactions, filterType, filterAcc]); // 移除 historySort 依賴，直接鎖定最優排序

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-bold dark:text-white">歷史明細</h2>
          <span className="text-[10px] text-gray-400">共 {filteredData.length} 筆</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="text-[10px] p-2 rounded dark:bg-gray-800 dark:text-white border dark:border-gray-700">
            <option value="all">所有類型</option>
            <option value="expense">支出</option><option value="income">收入</option><option value="transfer">轉帳</option>
          </select>
          <select value={filterAcc} onChange={e=>setFilterAcc(e.target.value)} className="text-[10px] p-2 rounded dark:bg-gray-800 dark:text-white border dark:border-gray-700">
            <option value="all">所有帳戶</option>
            {accounts.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <div className="h-auto">
        {filteredData.map((tx: any) => (
          <div key={tx.id} className="p-4 border-b dark:border-gray-700 flex justify-between items-center group">
            <div className="flex gap-3 items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xm font-bold ${tx.type==='income'?'bg-green-500':tx.type==='expense'?'bg-red-400':'bg-blue-400'}`}>
                {tx.type[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium dark:text-white">{tx.name}</div>
                <div className="text-[10px] text-gray-400">{tx.date} · {tx.subCategory || (accounts.find((a:any)=>a.id===tx.fromAccount)?.name + ' → ' + accounts.find((a:any)=>a.id===tx.toAccount)?.name)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-bold ${tx.type==='income'?'text-green-500':'dark:text-white'}`}>
                {tx.type==='income' || tx.type==='adjustment' ? '+' : '-'}{tx.amount.toLocaleString()}
              </div>
              <button onClick={()=>handleDelete(tx.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Budget View ---
const BudgetView = ({ transactions, budgets, onSaveBudget, accounts, exchangeRates }: any) => {
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  // 取得當月起始字串 (YYYY-MM)
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // 計算每個類別本月的支出總額 (換算 TWD)
  const spentPerCategory = useMemo(() => {
    const stats: any = {};
    transactions
      .filter((t: any) => t.type === 'expense' && t.date.startsWith(currentMonthStr))
      .forEach((t: any) => {
        const acc = accounts.find((a: any) => a.id === t.fromAccount);
        const rate = acc?.currency === 'TWD' ? 1 : (exchangeRates[acc?.currency] || 1);
        const amountTWD = t.amount * rate;
        stats[t.subCategory] = (stats[t.subCategory] || 0) + amountTWD;
      });
    return stats;
  }, [transactions, accounts, exchangeRates, currentMonthStr]);

  // 計算總體數據
  const totalBudget = Object.values(budgets).reduce((a: any, b: any) => a + (Number(b) || 0), 0) as number;
  const totalSpentOnBudgeted = Object.keys(budgets).reduce((acc, cat) => acc + (spentPerCategory[cat] || 0), 0);
  const totalRemaining = totalBudget - totalSpentOnBudgeted;

  return (
    <div className="max-w-md mx-auto space-y-6 pb-20">
      {/* 區塊 1: 總預算概覽 */}
      <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-200 dark:shadow-none relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mb-1">本月剩餘總預算</p>
          <h2 className="text-4xl font-black mb-2">NT$ {Math.max(0, totalRemaining).toLocaleString()}</h2>
          <div className="flex items-center gap-2 text-blue-200 text-xs">
            <Target size={14}/>
            <span>總額度: {formatCurrency(totalBudget)}</span>
          </div>
        </div>
        {/* 背景裝飾 */}
        <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      {/* 區塊 2: 各類別預算進度 */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 px-2 uppercase tracking-widest">類別細項</h3>
        {SUB_CATEGORIES.expense.map(cat => {
          const budget = budgets[cat] || 0;
          const spent = spentPerCategory[cat] || 0;
          const remaining = Math.max(0, budget - spent);
          const isOver = spent >= budget && budget > 0;
          const percent = budget > 0 ? (remaining / budget) * 100 : 0;
          const isLow = percent < 20;

          return (
                   <div 
              key={cat} 
              className={`relative bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border-2 transition-all duration-300 ${
                isOver 
                  ? 'border-red-500 shadow-lg shadow-red-100 dark:shadow-none bg-red-50/30 dark:bg-red-900/10' 
                  : 'border-gray-100 dark:border-gray-700/50'
              }`}
            >
              {/* 醒目的「用罄/超支」標籤 */}
              {isOver && (
                <div className="absolute -top-3 -right-2 bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg flex items-center gap-1 animate-bounce">
                  <AlertTriangle size={12} strokeWidth={3}/>
                  {spent > budget ? '預算超支' : '預算用罄'}
                </div>
              )}

              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`font-black ${isOver ? 'text-red-600 dark:text-red-400' : 'dark:text-white'}`}>
                      {cat}
                    </h4>
                  </div>
                  <p className={`text-[10px] font-bold ${isOver ? 'text-red-400' : 'text-gray-400'}`}>
                    {isOver 
                      ? `超支 NT$ ${Math.round(spent - budget).toLocaleString()}` 
                      : `剩餘 NT$ ${Math.round(remaining).toLocaleString()}`
                    }
                  </p>
                </div>
                <button 
                  onClick={() => { setEditingCat(cat); setEditVal(budget.toString()); }}
                  className={`p-2 rounded-xl transition-colors ${isOver ? 'bg-red-100 text-red-500 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <Edit3 size={16}/>
                </button>
              </div>

              {/* 預算條 */}
              <div className="h-4 w-full bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden p-0.5 border border-gray-100 dark:border-gray-700">
              <div className={`h-full transition-all duration-1000 ease-out rounded-full ${isOver ? 'bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : isLow ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${budget > 0 ? (isOver ? 100 : percent) : 0}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between mt-3 px-1">
              <span className={`text-[9px] font-black uppercase tracking-tighter ${isOver ? 'text-red-400' : 'text-gray-400'}`}>
                已用 {Math.round(spent).toLocaleString()} / 總額 {Math.round(budget).toLocaleString()}
              </span>
              <span className={`text-[9px] font-black ${isOver ? 'text-red-600' : isLow ? 'text-amber-500' : 'text-green-500'}`}>
                {budget > 0 
                  ? (isOver ? '⚠️ 100% FULL' : `${Math.round(percent)}% LEFT`) 
                  : '未設定預算'
                }
              </span>
            </div>

              {/* 設定預算的小彈窗/輸入框 */}
              {editingCat === cat && (
                <div className="mt-4 pt-4 border-t dark:border-gray-700 flex gap-2">
                  <input 
                    type="number" 
                    value={editVal} 
                    onChange={e => setEditVal(e.target.value)}
                    className="flex-1 bg-gray-50 dark:bg-gray-900 border-0 rounded-lg p-2 text-sm dark:text-white"
                    placeholder="輸入預算金額"
                    autoFocus
                  />
                  <button 
                    onClick={() => { onSaveBudget(cat, parseFloat(editVal) || 0); setEditingCat(null); }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold"
                  >
                    儲存
                  </button>
                  <button onClick={() => setEditingCat(null)} className="text-xs text-gray-400 px-2">取消</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Settings View (修正圖標與排版) ---
const SettingsView = ({ tempSyncKey, setTempSyncKey, handleUpdateSyncKey, exchangeRates, handleAutoUpdateRates, handleImportCSV, handleExportCSV, accounts, handleAddAccount, handleDeleteAccount, currencies, handleAddCurrency }: any) => {
  const [newAcc, setNewAcc] = useState({ name: '', curr: 'TWD' });
  const [newCurr, setNewCurr] = useState('');

  const downloadTemplate = () => {
    const headers = 'type,name,amount,date,subCategory,fromAccount,toAccount,exchangeRate';
    const blob = new Blob(["\uFEFF" + headers], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = "範本.csv"; link.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start pb-20">
      {/* 帳戶管理 */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 space-y-4">
        <h3 className="font-bold text-sm flex items-center gap-2 dark:text-white"><Landmark size={18} className="text-blue-500"/> 帳戶管理</h3>
        <div className="flex gap-2">
          <input value={newAcc.name} onChange={e=>setNewAcc({...newAcc, name:e.target.value})} placeholder="帳戶名" className="flex-1 p-2 text-sm border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          <select value={newAcc.curr} onChange={e=>setNewAcc({...newAcc, curr:e.target.value})} className="p-2 text-sm border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white">
            {currencies.map((c:string)=><option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={()=>{handleAddAccount(newAcc.name, newAcc.curr); setNewAcc({name:'', curr:'TWD'})}} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold">新增</button>
        </div>
        <div className="space-y-2">
          {accounts.map((a:any)=>(
            <div key={a.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl text-sm dark:text-gray-300">
              <span>{a.name} <span className="text-[10px] bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded ml-2">{a.currency}</span></span>
              <button onClick={()=>handleDeleteAccount(a.id)} className="text-red-400 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 size={16}/></button>
            </div>
          ))}
        </div>
      </div>

      {/* 貨幣與匯率 */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm dark:text-white">貨幣與匯率</h3>
          <button onClick={handleAutoUpdateRates} className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors"><RefreshCw size={12}/> 更新匯率</button>
        </div>
        <div className="flex gap-2">
          <input value={newCurr} onChange={e=>setNewCurr(e.target.value.toUpperCase())} placeholder="貨幣代碼 (如 JPY)" className="flex-1 p-2 text-sm border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          <button onClick={()=>{handleAddCurrency(newCurr); setNewCurr('')}} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold">新增貨幣</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {currencies.map((c:string)=>(
            <span key={c} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-[11px] font-mono dark:text-gray-300">
              {c}: {c==='TWD' ? '1.0' : (exchangeRates[c] || '待更新')}
            </span>
          ))}
        </div>
      </div>

      {/* 匯入匯出 - 注意這裡修正了 Download 組件 */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 space-y-4">
        <h3 className="font-bold text-sm dark:text-white">資料備份與還原</h3>
        <button onClick={handleExportCSV} className="w-full flex items-center justify-center gap-2 border-2 border-blue-500 text-blue-600 dark:text-blue-400 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
          <Download size={16}/> 匯出 CSV 備份 (Excel 相容)
        </button>
        <div className="relative border-2 border-dashed border-gray-200 dark:border-gray-700 p-6 text-center rounded-2xl hover:border-blue-400 transition-colors group">
          <input type="file" accept=".csv" onChange={handleImportCSV} className="absolute inset-0 opacity-0 cursor-pointer" />
          <Upload size={24} className="mx-auto text-gray-400 mb-2 group-hover:text-blue-500 transition-colors"/>
          <p className="text-xs text-gray-500 font-medium">點擊或拖放 CSV 檔案進行匯入</p>
        </div>
        <button onClick={downloadTemplate} className="text-xs text-blue-500 hover:underline mx-auto block">下載標準匯入範本</button>
      </div>

      {/* 同步金鑰 */}
      <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl space-y-3 border border-blue-100 dark:border-blue-800/50">
        <div>
          <label className="text-xs font-black text-blue-700 dark:text-blue-300 uppercase tracking-wider">同步金鑰 (Sync Key)</label>
          <p className="text-[10px] text-blue-600/60 dark:text-blue-400/60 mb-2">在不同裝置輸入此 Key 即可同步帳本</p>
        </div>
        <div className="flex gap-2">
          <input value={tempSyncKey} onChange={e=>setTempSyncKey(e.target.value)} className="flex-1 p-2 text-sm font-mono border-0 bg-white dark:bg-gray-800 rounded-xl shadow-inner dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
          <button onClick={handleUpdateSyncKey} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-200 dark:shadow-none">更新</button>
        </div>
      </div>
    </div>
  );
};

// =================================================================
// 🌟 Main App
// =================================================================

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState('input');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<string[]>(['TWD', 'AUD', 'USD']);
  const [exchangeRates, setExchangeRates] = useState<{[key:string]:number}>({});
  const [syncKey, setSyncKey] = useState('');
  const [tempSyncKey, setTempSyncKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<any>(null);
  const [historySort, setHistorySort] = useState<'timestamp' | 'date'>('timestamp');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [budgets, setBudgets] = useState<{[key:string]: number}>({});

  const [formData, setFormData] = useState({
    type: 'expense', name: '', subCategory: '外食', amount: '', fromAccount: 'cash', toAccount: 'post', exchangeRate: '', date: new Date().toISOString().split('T')[0]
  });

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type }); setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Firebase Auth
  useEffect(() => {
    signInAnonymously(auth);
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const key = localStorage.getItem('expense_sync_key') || u.uid.slice(0, 8);
        setSyncKey(key); setTempSyncKey(key); localStorage.setItem('expense_sync_key', key);
      }
    });
  }, []);

  // Data Subscriptions
  useEffect(() => {
    if (!user || !syncKey) return;
    setLoading(true);
    // 監聽交易
    const q = query(collection(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`), orderBy('timestamp', 'desc'));
    const unsubTx = onSnapshot(q, (sn) => {
      setTransactions(sn.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      setLoading(false);
    });
    // 監聽設定 (匯率, 貨幣)
    const unsubSet = onSnapshot(doc(db, FIRESTORE_COLLECTION_ROOT, `settings_${syncKey}`), (d) => {
      if (d.exists()) {
        const data = d.data();
        if (data.currencies) setCurrencies(data.currencies);
        if (data.exchangeRates) setExchangeRates(data.exchangeRates);
        if (data.budgets) setBudgets(data.budgets);
      }
    });
    // 監聽帳戶
    const unsubAcc = onSnapshot(query(collection(db, FIRESTORE_COLLECTION_ROOT, 'settings', `accounts_${syncKey}`)), (sn) => {
      if (sn.empty) setAccounts([{id:'cash', name:'現金', currency:'TWD'}]);
      else setAccounts(sn.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
    return () => { unsubTx(); unsubSet(); unsubAcc(); };
  }, [user, syncKey]);

  //預算功能
  const handleSaveBudget = async (category: string, amount: number) => {
    const newBudgets = { ...budgets, [category]: amount };
    await setDoc(doc(db, FIRESTORE_COLLECTION_ROOT, `settings_${syncKey}`), { budgets: newBudgets }, { merge: true });
    showNotification(`${category} 預算已更新`);
  };

  // Logic: 總資產計算
  const accountBalances = useMemo(() => {
    const bal: any = {};
    accounts.forEach(a => bal[a.id] = 0);
    [...transactions].sort((a,b)=>a.date.localeCompare(b.date)).forEach(tx => {
      if (tx.type === 'income') bal[tx.toAccount!] += tx.amount;
      if (tx.type === 'expense') bal[tx.fromAccount!] -= tx.amount;
      if (tx.type === 'adjustment') bal[tx.fromAccount!] += tx.amount;
      if (tx.type === 'transfer') {
        bal[tx.fromAccount!] -= tx.amount;
        const fromC = accounts.find(a=>a.id===tx.fromAccount)?.currency;
        const toC = accounts.find(a=>a.id===tx.toAccount)?.currency;
        bal[tx.toAccount!] += (fromC !== toC) ? tx.amount * parseFloat(tx.exchangeRate as string) : tx.amount;
      }
    });
    return bal;
  }, [transactions, accounts]);

  const totalAssetTWD = useMemo(() => {
    return accounts.reduce((acc, a) => {
      const b = accountBalances[a.id] || 0;
      return acc + (a.currency === 'TWD' ? b : b * (exchangeRates[a.currency] || 0));
    }, 0);
  }, [accountBalances, exchangeRates, accounts]);

  // Handlers
  const handleAutoUpdateRates = async () => {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/TWD');
      const data = await res.json();
      if (data.result === 'success') {
        const newRates: any = {};
        currencies.forEach(c => { if (c !== 'TWD') newRates[c] = parseFloat((1 / data.rates[c]).toFixed(4)); });
        await setDoc(doc(db, FIRESTORE_COLLECTION_ROOT, `settings_${syncKey}`), { exchangeRates: newRates, currencies }, { merge: true });
        showNotification("匯率已更新為市場中間價");
      }
    } catch { showNotification("匯率更新失敗", "error"); }
  };

  const handleAddCurrency = async (code: string) => {
    if (code.length !== 3 || currencies.includes(code)) return;
    const newList = [...currencies, code];
    setCurrencies(newList);
    await setDoc(doc(db, FIRESTORE_COLLECTION_ROOT, `settings_${syncKey}`), { currencies: newList }, { merge: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  
    // 自動補全名稱邏輯
    const finalName = formData.name.trim() || 
                      (formData.type === 'transfer' ? '轉帳' : 
                       formData.type === 'adjustment' ? '餘額調整' : 
                       formData.subCategory);

    const cleanData = { 
      ...formData, 
      name: finalName, // 使用處理後的名稱
      amount: parseFloat(formData.amount), 
      timestamp: serverTimestamp(), 
      createdAt: new Date().toISOString() 
    };

    try {
      await addDoc(collection(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`), cleanData);
      
      // 清空表單，保留日期與類別，方便連續記帳
      setFormData({ ...formData, name: '', amount: '', exchangeRate: '' });
      showNotification("記帳成功");
    } catch (err) {
      showNotification("儲存失敗", "error");
    }
  };

  const handleImportCSV = async (e: any) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rows = robustCSVParser(ev.target?.result as string);
      for (const row of rows) {
        if (!row.type || !row.amount) continue;
        await addDoc(collection(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`), {
          ...row, amount: parseFloat(row.amount), timestamp: serverTimestamp()
        });
      }
      showNotification(`成功匯入 ${rows.length} 筆資料`);
    };
    reader.readAsText(file);
  };

  const handleExportCSV = () => {
    const headers = 'type,name,amount,date,subCategory,fromAccount,toAccount,exchangeRate';
    const rows = transactions.map(t => [t.type, t.name, t.amount, t.date, t.subCategory, t.fromAccount, t.toAccount, t.exchangeRate].map(escapeCSV).join(','));
    const blob = new Blob(["\uFEFF" + headers + "\n" + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = "備份.csv"; link.click();
  };

  const handleUpdateSyncKey = () => { localStorage.setItem('expense_sync_key', tempSyncKey); setSyncKey(tempSyncKey); setTransactions([]); };

  if (loading && transactions.length === 0) return <div className="h-screen flex items-center justify-center dark:bg-gray-900"><RefreshCw className="animate-spin text-blue-500"/></div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24 transition-colors">
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-xl flex items-center gap-2 text-white text-xm font-bold animate-bounce ${notification.type==='success'?'bg-green-500':'bg-red-500'}`}>
          {notification.type==='success'?<CheckCircle size={14}/>:<AlertCircle size={14}/>} {notification.message}
        </div>
      )}

      <header className="bg-blue-600 dark:bg-blue-900 p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-white">
          <h1 className="font-bold flex items-center gap-2"><Wallet size={20}/> 輕便記帳</h1>
          <nav className="hidden md:flex gap-6">
             <button onClick={()=>setView('input')} className="hover:text-blue-200">記帳</button>
             <button onClick={()=>setView('budget')} className="hover:text-blue-200">預算</button> 
             <button onClick={()=>setView('dashboard')} className="hover:text-blue-200">分析</button>
             <button onClick={()=>setView('history')} className="hover:text-blue-200">明細</button>
             <button onClick={()=>setView('settings')} className="hover:text-blue-200">設定</button>
          </nav>
          <button onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="p-2 rounded-full hover:bg-white/10">{theme==='dark' ? <Sun size={20}/> : <Moon size={20}/>}</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {view === 'input' && <InputView formData={formData} handleInputChange={(e:any)=>setFormData({...formData, [e.target.name]:e.target.value})} handleTypeChange={(t:any)=>setFormData({...formData, type:t, subCategory:SUB_CATEGORIES[t]?.[0]||''})} handleSubmit={handleSubmit} accounts={accounts} currencies={currencies} />}
        {view === 'budget' && (<BudgetView transactions={transactions} budgets={budgets} onSaveBudget={handleSaveBudget} accounts={accounts} exchangeRates={exchangeRates}/>)}
        {view === 'dashboard' && <DashboardView transactions={transactions} accountBalances={accountBalances} totalAssetTWD={totalAssetTWD} exchangeRates={exchangeRates} theme={theme} accounts={accounts} />}
        {view === 'history' && <HistoryView transactions={transactions} handleDelete={(id:string)=>deleteDoc(doc(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`, id))} accounts={accounts} historySort={historySort} setHistorySort={setHistorySort} />}
        {view === 'settings' && <SettingsView syncKey={syncKey} tempSyncKey={tempSyncKey} setTempSyncKey={setTempSyncKey} handleUpdateSyncKey={handleUpdateSyncKey} exchangeRates={exchangeRates} handleAutoUpdateRates={handleAutoUpdateRates} handleImportCSV={handleImportCSV} handleExportCSV={handleExportCSV} accounts={accounts} handleAddAccount={(n:string, c:string)=>addDoc(collection(db, FIRESTORE_COLLECTION_ROOT, 'settings', `accounts_${syncKey}`), {name:n, currency:c})} handleDeleteAccount={(id:string)=>deleteDoc(doc(db, FIRESTORE_COLLECTION_ROOT, 'settings', `accounts_${syncKey}`, id))} currencies={currencies} handleAddCurrency={handleAddCurrency} />}
      </main>

      <nav className="md:hidden fixed bottom-0 fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 p-2 flex justify-around shadow-inner">
        {[ {v:'input', i:<Plus/>, l:'記帳'}, {v:'budget', i:<Target/>, l:'預算'}, {v:'dashboard', i:<TrendingUp/>, l:'分析'}, {v:'history', i:<FileText/>, l:'明細'}, {v:'settings', i:<Settings/>, l:'設定'} ].map(n => (
          <button key={n.v} onClick={()=>setView(n.v)} className={`flex flex-col items-center p-2 rounded-xl transition ${view===n.v?'text-blue-600 bg-blue-50 dark:bg-blue-900/40':'text-gray-400'}`}>
            {n.i}<span className="text-[10px] mt-1">{n.l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}