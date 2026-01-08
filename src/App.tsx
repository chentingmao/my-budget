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
} from 'recharts';
import { 
  Plus, TrendingUp, Wallet, Settings, 
  Trash2, FileText, CheckCircle, AlertCircle, Moon, Sun, Calculator, 
  PieChart as Download, Landmark, RefreshCw, Upload
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
              className={`py-2 text-xs rounded-lg border ${formData.type === t ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-700 dark:text-gray-300'}`}>
              {t === 'expense' ? '支出' : t === 'income' ? '收入' : t === 'transfer' ? '轉帳' : '調整'}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">日期</label>
          <input type="date" name="date" required value={formData.date} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">項目</label>
          <input type="text" name="name" required value={formData.name} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white" placeholder="例：午餐" />
        </div>

        {(formData.type === 'income' || formData.type === 'expense') && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">類別</label>
            <select name="subCategory" value={formData.subCategory} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
              {SUB_CATEGORIES[formData.type]?.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {(formData.type !== 'income') && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{formData.type === 'transfer' ? '轉出' : '帳戶'}</label>
              <select name="fromAccount" value={formData.fromAccount} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
          )}
          {(formData.type === 'income' || formData.type === 'transfer') && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{formData.type === 'transfer' ? '轉入' : '帳戶'}</label>
              <select name="toAccount" value={formData.toAccount} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">金額</label>
          <input type="number" step="any" name="amount" required value={formData.amount} onChange={handleInputChange} className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white" placeholder="0.00" />
        </div>

        {needRate && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <label className="block text-xs font-bold text-yellow-700 dark:text-yellow-400 mb-1">匯率 (1 {fromAcc?.currency} = ? {toAcc?.currency})</label>
            <input type="number" step="any" name="exchangeRate" required value={formData.exchangeRate} onChange={handleInputChange} className="w-full p-2 border-yellow-200 rounded-lg dark:bg-gray-800 dark:text-white" />
          </div>
        )}

        <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-transform active:scale-95">送出記帳</button>
      </form>
    </div>
  );
};

// --- Dashboard View (已修正圓餅圖匯率邏輯) ---
const DashboardView = ({ transactions, accountBalances, totalAssetTWD, exchangeRates, accounts }: any) => {
  const [range, setRange] = useState(30);
  const [statType, setStatType] = useState<'expense' | 'income'>('expense');

  // 計算選取範圍內的支出統計資料
  const expenseStats = useMemo(() => {
    const cutOffStr = new Date(Date.now() - range * 86400000).toISOString().split('T')[0];
    
    const amounts = transactions
      .filter((t: any) => t.date >= cutOffStr && t.type === 'expense')
      .map((t: any) => {
        const acc = accounts.find((a: any) => a.id === t.fromAccount);
        const rate = acc?.currency === 'TWD' ? 1 : (exchangeRates[acc?.currency] || 1);
        return t.amount * rate;
      })
      .sort((a: number, b: number) => a - b);

    if (amounts.length === 0) return null;

    const count = amounts.length;
    const sum = amounts.reduce((a: number, b: number) => a + b, 0);
    const mean = sum / count;
    const min = amounts[0];
    const max = amounts[count - 1];

    const getPercentile = (p: number) => {
      const index = (count - 1) * p;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;
      if (lower === upper) return amounts[lower];
      return amounts[lower] * (1 - weight) + amounts[upper] * weight;
    };

    return { 
      count, mean, min, max, 
      median: getPercentile(0.50), 
      q1: getPercentile(0.25), 
      q3: getPercentile(0.75) 
    };
  }, [transactions, range, exchangeRates, accounts]);

  // 分類統計邏輯 (將所有金額轉換為 TWD 後進行統計)
  const categoryStats = useMemo(() => {
    const cutOffStr = new Date(Date.now() - range * 86400000).toISOString().split('T')[0];
    const map: any = {};
    transactions.filter((t: any) => t.date >= cutOffStr && t.type === statType).forEach((t: any) => {
      const cat = t.subCategory || '其他';
      const acc = accounts.find((a: any) => a.id === (statType === 'income' ? t.toAccount : t.fromAccount));
      let val = t.amount * (acc?.currency === 'TWD' ? 1 : (exchangeRates[acc?.currency] || 1));
      map[cat] = (map[cat] || 0) + val;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value as number) })).sort((a, b) => b.value - a.value);
  }, [transactions, range, statType, exchangeRates, accounts]);

  // 帳戶資產排序與 TWD 換算邏輯
  const sortedAccs = useMemo(() => {
    return accounts.map((a: any) => {
      const bal = accountBalances[a.id] || 0;
      // 匯率邏輯：如果是台幣則為 1，否則使用設定中的匯率，若未設定則預設為 1
      const rate = a.currency === 'TWD' ? 1 : (exchangeRates[a.currency] || 1);
      const balTWD = bal * rate;
      return { ...a, bal, balTWD, rate };
    })
    .sort((a: any, b: any) => b.balTWD - a.balTWD); // 圓餅圖與清單皆按 TWD 價值排序
  }, [accounts, accountBalances, exchangeRates]);

  return (
    <div className="space-y-6">
      {/* 範圍選取器 */}
      <div className="lg:col-span-2 flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
        <div className="flex gap-2 overflow-x-auto">
          {[7, 30, 90, 365].map(d => (
            <button key={d} onClick={() => setRange(d)} className={`px-3 py-1 rounded-full text-xs transition-colors ${range === d ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-400'}`}>{d}天</button>
          ))}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400">總資產估值 (TWD)</div>
          <div className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(totalAssetTWD)}</div>
        </div>
      </div>
       {/* 使用 Grid 佈局：在電腦版 (lg:) 變為兩欄 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="lg:col-span-2"> 
          {/* 支出統計分析 */}
          {expenseStats && (
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2 dark:text-white">
                <Calculator size={16} className="text-blue-500"/> 支出統計分析 (近 {range} 天)
              </h3>
              <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">平均單筆</p>
                  <p className="text-sm font-bold dark:text-white">{formatCurrency(expenseStats.mean)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">中位數</p>
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(expenseStats.median)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">單筆最高</p>
                  <p className="text-sm font-bold text-red-500">{formatCurrency(expenseStats.max)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">總計筆數</p>
                  <p className="text-sm font-bold dark:text-white">{expenseStats.count} 筆</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 帳戶資產分佈 (統一使用 TWD 換算後的數值進行顯示與排列) */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm h-full">
        <h3 className="text-sm font-bold mb-2 dark:text-white"><Wallet size={16}/> 帳戶資產分佈</h3>
        <p className="text-[10px] text-gray-400 mb-4">所有外幣皆以設定匯率換算為 TWD 進行比較</p>
        
        <div className="flex flex-col xl:flex-row items-center gap-6">
          {/* 圓餅圖：數值使用 balTWD */}
          <div className="w-full md:w-1/2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={sortedAccs.filter((a:any) => a.balTWD > 0)} 
                  dataKey="balTWD" 
                  nameKey="name" 
                  innerRadius={60} 
                  outerRadius={80} 
                  paddingAngle={5}
                >
                  {sortedAccs.filter((a:any) => a.balTWD > 0).map((_:any, i:number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(v: any) => formatCurrency(v, 'TWD')} 
                  contentStyle={{ borderRadius: '10px', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 右側帳戶清單：顯示原幣值與 TWD 估值 */}
          <div className="w-full md:w-1/2">
            {sortedAccs.map((a: any, i: number) => {
              const percentage = totalAssetTWD > 0 ? (a.balTWD / totalAssetTWD * 100).toFixed(1) : 0;
              return (
                <div key={a.id} className="flex justify-between items-center border-b dark:border-gray-700 pb-2 last:border-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}}></span>
                      <span className="text-sm font-medium dark:text-gray-200">{a.name}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 pl-4">
                      {a.bal.toLocaleString()} {a.currency} 
                      {a.currency !== 'TWD' && ` (1:${a.rate})`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold dark:text-white">
                      {Math.round(a.balTWD).toLocaleString()} <span className="text-[9px] font-normal opacity-50 text-gray-400">TWD</span>
                    </div>
                    <div className="text-[9px] text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded inline-block">
                      {percentage}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 分類統計 (台幣換算後的支出/收入分佈) */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm h-full">
        <div className="flex justify-between mb-4">
          <h3 className="text-sm font-bold dark:text-white">分類統計 ({statType==='expense'?'支出':'收入'})</h3>
          <div className="flex gap-1">
            <button onClick={()=>setStatType('expense')} className={`px-2 py-0.5 rounded text-[15px] transition-colors ${statType==='expense'?'bg-red-500 text-white':'bg-gray-100 dark:bg-gray-700 dark:text-gray-400'}`}>支出</button>
            <button onClick={()=>setStatType('income')} className={`px-2 py-0.5 rounded text-[15px] transition-colors ${statType==='income'?'bg-green-500 text-white':'bg-gray-100 dark:bg-gray-700 dark:text-gray-400'}`}>收入</button>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="w-full md:w-1/2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryStats} dataKey="value" nameKey="name" innerRadius={60} outerRadius={80}>
                  {categoryStats.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]} stroke="transparent" />)}
                </Pie>
                <Tooltip formatter={(v:any)=>formatCurrency(v)}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full md:w-1/2 space-y-2 h-auto">
            {categoryStats.map((s:any, i:number) => (
              <div key={i} className="flex justify-between text-xl py-1 border-b dark:border-gray-700 last:border-0">
                <span className="flex items-center gap-2 dark:text-gray-300">
                  <span className="w-2 h-2 rounded-full" style={{backgroundColor:COLORS[i%COLORS.length]}}></span>
                  {s.name}
                </span>
                <span className="dark:text-white font-medium">{formatCurrency(s.value)}</span>
              </div>
            ))}
            {categoryStats.length === 0 && <p className="text-center text-xs text-gray-400 py-4">此區間無資料</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- History View ---
const HistoryView = ({ transactions, handleDelete, accounts, historySort }: any) => {
  const [filterType, setFilterType] = useState('all');
  const [filterAcc, setFilterAcc] = useState('all');

  const filteredData = useMemo(() => {
    return transactions.filter((tx: any) => {
      const typeMatch = filterType === 'all' || tx.type === filterType;
      const accMatch = filterAcc === 'all' || tx.fromAccount === filterAcc || tx.toAccount === filterAcc;
      return typeMatch && accMatch;
    }).sort((a: any, b: any) => {
      if (historySort === 'date') {
        const d = b.date.localeCompare(a.date);
        return d !== 0 ? d : b.timestamp?.toMillis() - a.timestamp?.toMillis();
      }
      return b.timestamp?.toMillis() - a.timestamp?.toMillis();
    });
  }, [transactions, filterType, filterAcc, historySort]);

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
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${tx.type==='income'?'bg-green-500':tx.type==='expense'?'bg-red-400':'bg-blue-400'}`}>
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

// --- Settings View ---
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* 帳戶管理 */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm space-y-3 h-full">
        <h3 className="font-bold text-sm flex items-center gap-2 dark:text-white"><Landmark size={16}/> 帳戶管理</h3>
        <div className="flex gap-2">
          <input value={newAcc.name} onChange={e=>setNewAcc({...newAcc, name:e.target.value})} placeholder="帳戶名" className="flex-1 p-2 text-xs border rounded dark:bg-gray-700 dark:text-white" />
          <select value={newAcc.curr} onChange={e=>setNewAcc({...newAcc, curr:e.target.value})} className="p-2 text-xs border rounded dark:bg-gray-700 dark:text-white">
            {currencies.map((c:string)=><option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={()=>{handleAddAccount(newAcc.name, newAcc.curr); setNewAcc({name:'', curr:'TWD'})}} className="bg-blue-600 text-white px-3 py-2 rounded text-xs">新增</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {accounts.map((a:any)=><div key={a.id} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-[10px] dark:text-gray-300">{a.name} ({a.currency}) <button onClick={()=>handleDeleteAccount(a.id)} className="text-red-400"><Trash2 size={12}/></button></div>)}
        </div>
      </div>

      {/* 貨幣與匯率 */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm space-y-4 h-full">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm dark:text-white">貨幣與匯率</h3>
          <button onClick={handleAutoUpdateRates} className="text-[10px] bg-yellow-500 text-white px-2 py-1 rounded flex items-center gap-1"><RefreshCw size={10}/> 更新匯率</button>
        </div>
        <div className="flex gap-2">
          <input value={newCurr} onChange={e=>setNewCurr(e.target.value.toUpperCase())} placeholder="貨幣代碼 (如 JPY)" className="flex-1 p-2 text-xs border rounded dark:bg-gray-700 dark:text-white" />
          <button onClick={()=>{handleAddCurrency(newCurr); setNewCurr('')}} className="bg-purple-600 text-white px-3 py-2 rounded text-xs">新增貨幣</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {currencies.map((c:string)=><span key={c} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-[10px] dark:text-gray-300">{c}: {c==='TWD'?'1.0':exchangeRates[c]||'待更新'}</span>)}
        </div>
      </div>

      {/* 匯入匯出 - 強化介面 */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm space-y-4">
        <h3 className="font-bold text-sm dark:text-white">資料備份與還原</h3>
        <button onClick={handleExportCSV} className="w-full flex items-center justify-center gap-2 border-2 border-blue-500 text-blue-600 py-2 rounded-lg text-xs font-bold"><Download size={14}/> 匯出 CSV 備份 (支援 Excel)</button>
        <div className="relative border-2 border-dashed dark:border-gray-700 p-4 text-center rounded-lg">
          <input type="file" accept=".csv" onChange={handleImportCSV} className="absolute inset-0 opacity-0 cursor-pointer" />
          <Upload size={24} className="mx-auto text-gray-400 mb-1"/>
          <p className="text-[10px] text-gray-500">點擊或拖放 CSV 進行匯入</p>
        </div>
        <button onClick={downloadTemplate} className="text-[10px] text-blue-500 underline mx-auto block">下載標準匯入範本</button>
      </div>

      {/*同步金鑰*/}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl space-y-2 border border-blue-100">
        <label className="text-[10px] font-bold text-blue-700 dark:text-blue-300">同步金鑰</label>
        <div className="flex gap-2">
          <input value={tempSyncKey} onChange={e=>setTempSyncKey(e.target.value)} className="flex-1 p-2 text-xs font-mono border rounded dark:bg-gray-800 dark:text-white" />
          <button onClick={handleUpdateSyncKey} className="bg-blue-600 text-white px-3 py-2 rounded text-xs">更新</button>
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
      }
    });
    // 監聽帳戶
    const unsubAcc = onSnapshot(query(collection(db, FIRESTORE_COLLECTION_ROOT, 'settings', `accounts_${syncKey}`)), (sn) => {
      if (sn.empty) setAccounts([{id:'cash', name:'現金', currency:'TWD'}]);
      else setAccounts(sn.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
    return () => { unsubTx(); unsubSet(); unsubAcc(); };
  }, [user, syncKey]);

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
    const cleanData = { ...formData, amount: parseFloat(formData.amount), timestamp: serverTimestamp(), createdAt: new Date().toISOString() };
    await addDoc(collection(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`), cleanData);
    setFormData({ ...formData, name: '', amount: '', exchangeRate: '' });
    showNotification("記帳成功");
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
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-xl flex items-center gap-2 text-white text-xs font-bold animate-bounce ${notification.type==='success'?'bg-green-500':'bg-red-500'}`}>
          {notification.type==='success'?<CheckCircle size={14}/>:<AlertCircle size={14}/>} {notification.message}
        </div>
      )}

      <header className="bg-blue-600 dark:bg-blue-900 p-4 sticky top-0 z-40 shadow-md">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-white">
          <h1 className="font-bold flex items-center gap-2"><Wallet size={20}/> 輕便記帳</h1>
          <nav className="hidden md:flex gap-6">
             <button onClick={()=>setView('input')} className="hover:text-blue-200">記帳</button>
             <button onClick={()=>setView('dashboard')} className="hover:text-blue-200">分析</button>
             <button onClick={()=>setView('history')} className="hover:text-blue-200">明細</button>
             <button onClick={()=>setView('settings')} className="hover:text-blue-200">設定</button>
          </nav>
          <button onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="p-2 rounded-full hover:bg-white/10">{theme==='dark' ? <Sun size={20}/> : <Moon size={20}/>}</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8">
        {view === 'input' && <InputView formData={formData} handleInputChange={(e:any)=>setFormData({...formData, [e.target.name]:e.target.value})} handleTypeChange={(t:any)=>setFormData({...formData, type:t, subCategory:SUB_CATEGORIES[t]?.[0]||''})} handleSubmit={handleSubmit} accounts={accounts} currencies={currencies} />}
        {view === 'dashboard' && <DashboardView transactions={transactions} accountBalances={accountBalances} totalAssetTWD={totalAssetTWD} exchangeRates={exchangeRates} theme={theme} accounts={accounts} />}
        {view === 'history' && <HistoryView transactions={transactions} handleDelete={(id:string)=>deleteDoc(doc(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`, id))} accounts={accounts} historySort={historySort} setHistorySort={setHistorySort} />}
        {view === 'settings' && <SettingsView syncKey={syncKey} tempSyncKey={tempSyncKey} setTempSyncKey={setTempSyncKey} handleUpdateSyncKey={handleUpdateSyncKey} exchangeRates={exchangeRates} handleAutoUpdateRates={handleAutoUpdateRates} handleImportCSV={handleImportCSV} handleExportCSV={handleExportCSV} accounts={accounts} handleAddAccount={(n:string, c:string)=>addDoc(collection(db, FIRESTORE_COLLECTION_ROOT, 'settings', `accounts_${syncKey}`), {name:n, currency:c})} handleDeleteAccount={(id:string)=>deleteDoc(doc(db, FIRESTORE_COLLECTION_ROOT, 'settings', `accounts_${syncKey}`, id))} currencies={currencies} handleAddCurrency={handleAddCurrency} />}
      </main>

      <nav className="md:hidden fixed bottom-0 fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 p-2 flex justify-around shadow-inner">
        {[ {v:'input', i:<Plus/>, l:'記帳'}, {v:'dashboard', i:<TrendingUp/>, l:'分析'}, {v:'history', i:<FileText/>, l:'明細'}, {v:'settings', i:<Settings/>, l:'設定'} ].map(n => (
          <button key={n.v} onClick={()=>setView(n.v)} className={`flex flex-col items-center p-2 rounded-xl transition ${view===n.v?'text-blue-600 bg-blue-50 dark:bg-blue-900/40':'text-gray-400'}`}>
            {n.i}<span className="text-[10px] mt-1">{n.l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}