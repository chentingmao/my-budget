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
  Timestamp 
} from 'firebase/firestore';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, 
  AreaChart, Area, 
  CartesianGrid, XAxis, YAxis 
} from 'recharts';
import { 
  Plus, ArrowRightLeft, TrendingUp, Wallet, Settings, 
  Trash2, Upload, FileText, Smartphone, DollarSign,
  CheckCircle, AlertCircle, Moon, Sun,
  PieChart as PieChartIcon 
} from 'lucide-react';

// =================================================================
// 🌟 請在此處貼上您的 Firebase 配置 🌟
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCD6rgFZiFn0bJuO4PZTzKN_gMYzZ7NAvo",
  authDomain: "my-budget-57113.firebaseapp.com",
  projectId: "my-budget-57113",
  storageBucket: "my-budget-57113.firebasestorage.app",
  messagingSenderId: "1096958831156",
  appId: "1:1096958831156:web:c5d0acdc1aa94458d37861",
  measurementId: "G-XW29K3KDSS"
};

const FIRESTORE_COLLECTION_ROOT = 'my-personal-expense-tracker'; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =================================================================
// 🌟 TypeScript 介面定義 🌟
// =================================================================

interface Account {
  id: string;
  name: string;
  currency: 'TWD' | 'AUD';
}

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  name: string;
  amount: number; 
  date: string; // YYYY-MM-DD
  timestamp: Timestamp;
  createdAt: string;
  dateObj: Date;

  subCategory?: string;
  fromAccount?: string;
  toAccount?: string;
  exchangeRate?: string | number;
}

interface FormDataState {
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  name: string;
  subCategory: string;
  amount: string | number;
  fromAccount: string;
  toAccount: string;
  exchangeRate: string | number;
  date: string;
}

interface BalanceMap {
  [accountId: string]: number;
}

interface NotificationState {
  message: string;
  type: 'success' | 'error';
}

// --- Constants & Data Structures ---

const ACCOUNTS: Account[] = [
  { id: 'cash', name: '現金', currency: 'TWD' },
  { id: 'post', name: '郵局', currency: 'TWD' },
  { id: 'taishin', name: '台新銀行', currency: 'TWD' },
  { id: 'kgi', name: '凱基證券', currency: 'TWD' },
  { id: 'line', name: 'Line Bank', currency: 'TWD' },
  { id: 'easy', name: '悠遊付', currency: 'TWD' },
  { id: 'bot', name: '台灣銀行', currency: 'TWD' },
  { id: 'mitrade', name: 'Mitrade', currency: 'AUD' },
  { id: 'aud_cash', name: '澳幣現金', currency: 'AUD' },
  { id: 'test', name: '測試', currency: 'TWD'}
];

const CATEGORIES = {
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
} as const;

const SUB_CATEGORIES: { [key in typeof CATEGORIES[keyof typeof CATEGORIES]]?: string[] } = {
  [CATEGORIES.INCOME]: ['薪水', '撿到', '市值變動', '還款', '利息'],
  [CATEGORIES.EXPENSE]: [
    '外食', '食材', '生活', '交通', '電信', '娛樂', '電子', 
    '學習', '衣物', '訂閱服務', '投資', '借款', '還款', '醫療', '人情交往'
  ],
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

// --- Helper Functions ---

const formatCurrency = (amount: number, currency: 'TWD' | 'AUD' | string = 'TWD'): string => {
  return new Intl.NumberFormat('zh-TW', { 
    style: 'currency', 
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
};

const parseCSV = (text: string): { [key: string]: string }[] => {
  const lines = text.split('\n').filter((l: string) => l.trim());
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map((h: string) => h.trim());
  const result: { [key: string]: string }[] = [];
  
  for(let i = 1; i < lines.length; i++) {
    const currentLine = lines[i].split(',');
    if(currentLine.length === headers.length) {
      const obj: { [key: string]: string } = {};
      for(let j = 0; j < headers.length; j++) {
        obj[headers[j]] = currentLine[j].trim();
      }
      result.push(obj);
    }
  }
  return result;
};

// --- Custom Hooks ---

// Theme Hook
const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return { theme, toggleTheme };
};

// --- Components (Hoisted outside App to prevent re-renders) ---

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);

interface InputViewProps {
  formData: FormDataState;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleTypeChange: (type: 'income' | 'expense' | 'transfer' | 'adjustment') => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

const InputView: React.FC<InputViewProps> = ({ formData, handleInputChange, handleTypeChange, handleSubmit }) => {
  const isTransfer = formData.type === CATEGORIES.TRANSFER;
  const isIncome = formData.type === CATEGORIES.INCOME;
  const isExpense = formData.type === CATEGORIES.EXPENSE;
  const isAdjustment = formData.type === CATEGORIES.ADJUSTMENT;

  const fromAccountCurr = ACCOUNTS.find(a => a.id === formData.fromAccount)?.currency;
  const toAccountCurr = ACCOUNTS.find(a => a.id === formData.toAccount)?.currency;
  const needRate = isTransfer && fromAccountCurr !== toAccountCurr;

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm transition-colors duration-200">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
        <Plus className="w-5 h-5" /> 新增記帳
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[CATEGORIES.EXPENSE, CATEGORIES.INCOME, CATEGORIES.TRANSFER, CATEGORIES.ADJUSTMENT].map(type => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={`p-2 text-sm rounded-lg border transition-colors ${
                formData.type === type 
                ? 'bg-blue-600 text-white border-blue-600' 
                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {type === 'expense' && '支出'}
              {type === 'income' && '收入'}
              {type === 'transfer' && '轉帳'}
              {type === 'adjustment' && '調整'}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">日期</label>
          <input 
            type="date" 
            name="date" 
            required
            value={formData.date}
            onChange={handleInputChange}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">項目名稱</label>
          <input 
            type="text" 
            name="name" 
            placeholder="例：午餐、薪水" 
            required
            value={formData.name}
            onChange={handleInputChange}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        {(isIncome || isExpense) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">子類別</label>
            <select 
              name="subCategory" 
              value={formData.subCategory || SUB_CATEGORIES[formData.type]?.[0] || ''}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {SUB_CATEGORIES[formData.type]?.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {(isExpense || isTransfer || isAdjustment) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {isTransfer ? '轉出帳戶' : '帳戶'}
              </label>
              <select 
                name="fromAccount" 
                value={formData.fromAccount}
                onChange={handleInputChange}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {ACCOUNTS.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                ))}
              </select>
            </div>
          )}

          {(isIncome || isTransfer) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {isTransfer ? '轉入帳戶' : '存入帳戶'}
              </label>
              <select 
                name="toAccount" 
                value={formData.toAccount}
                onChange={handleInputChange}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {ACCOUNTS.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            金額 ({isTransfer || isAdjustment || isExpense ? ACCOUNTS.find(a => a.id === formData.fromAccount)?.currency : ACCOUNTS.find(a => a.id === formData.toAccount)?.currency})
          </label>
          <input 
            type="number" 
            name="amount" 
            step="0.01"
            placeholder={isAdjustment ? "正數增加，負數減少" : "請輸入金額"}
            required
            value={formData.amount}
            onChange={handleInputChange}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          {isAdjustment && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">調整可輸入負數表示減少</p>}
        </div>

        {needRate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              匯率 ({fromAccountCurr} {'->'} {toAccountCurr})
            </label>
            <input 
              type="number" 
              name="exchangeRate" 
              step="0.0001"
              placeholder="例：21.5"
              required
              value={formData.exchangeRate}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-yellow-50 dark:bg-yellow-900/20 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">請輸入 1 {fromAccountCurr} 可換多少 {toAccountCurr}</p>
          </div>
        )}

        <button 
          type="submit"
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-md active:scale-95"
        >
          送出記帳
        </button>
      </form>
    </div>
  );
};

interface DashboardViewProps {
  transactions: Transaction[];
  accountBalances: BalanceMap;
  totalAssetTWD: number;
  currentAudRate: number;
  theme: 'light' | 'dark';
}

const DashboardView: React.FC<DashboardViewProps> = ({ transactions, accountBalances, totalAssetTWD, currentAudRate, theme }) => {
  const [range, setRange] = useState(30); // days
  const [statType, setStatType] = useState<'expense' | 'income'>('expense'); 

  // --- Chart Data Preparation ---
  
  // 1. Asset Trend (Daily)
  const trendData = useMemo(() => {
    const dailyData: { date: string, amount: number }[] = [];
    const now = new Date();
    for (let i = range; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const tempBal: BalanceMap = {};
      ACCOUNTS.forEach(a => tempBal[a.id] = 0);
      
      const txsUntilDate = transactions.filter((t: Transaction) => t.date <= dateStr);
      
      txsUntilDate.forEach((tx: Transaction) => {
         const amt = tx.amount; 
         
         if(tx.type === CATEGORIES.INCOME && tx.toAccount) tempBal[tx.toAccount] = (tempBal[tx.toAccount] || 0) + amt;
         if(tx.type === CATEGORIES.EXPENSE && tx.fromAccount) tempBal[tx.fromAccount] = (tempBal[tx.fromAccount] || 0) - amt;
         if(tx.type === CATEGORIES.ADJUSTMENT && tx.fromAccount) tempBal[tx.fromAccount] = (tempBal[tx.fromAccount] || 0) + amt;
         if(tx.type === CATEGORIES.TRANSFER) {
           if(tx.fromAccount) tempBal[tx.fromAccount] = (tempBal[tx.fromAccount] || 0) - amt;
           let destAmt = amt;
           
           const fromCurr = ACCOUNTS.find(a => a.id === tx.fromAccount)?.currency;
           const toCurr = ACCOUNTS.find(a => a.id === tx.toAccount)?.currency;

           if (fromCurr !== toCurr && tx.exchangeRate) {
             destAmt = amt * parseFloat(tx.exchangeRate as string);
           }
           
           if(tx.toAccount) tempBal[tx.toAccount] = (tempBal[tx.toAccount] || 0) + destAmt;
         }
      });

      let totalTWD = 0;
      ACCOUNTS.forEach(a => {
         const bal = tempBal[a.id] || 0;
         if(a.currency === 'AUD') totalTWD += bal * currentAudRate;
         else totalTWD += bal;
      });

      dailyData.push({
        date: dateStr.slice(5), // MM-DD
        amount: Math.round(totalTWD)
      });
    }
    return dailyData;
  }, [transactions, range, currentAudRate]);

  // 2. Income vs Expense (Summary)
  const summaryData = useMemo(() => {
    const cutOffDate = new Date();
    cutOffDate.setDate(cutOffDate.getDate() - range);
    const cutOffStr = cutOffDate.toISOString().split('T')[0];

    let income = 0;
    let expense = 0;

    transactions.filter((t: Transaction) => t.date >= cutOffStr).forEach((t: Transaction) => {
      if(t.type === CATEGORIES.INCOME) {
         const curr = ACCOUNTS.find(a => a.id === t.toAccount)?.currency;
         let val = t.amount; 
         if(curr === 'AUD') val *= currentAudRate;
         income += val;
      }
      if(t.type === CATEGORIES.EXPENSE) {
         const curr = ACCOUNTS.find(a => a.id === t.fromAccount)?.currency;
         let val = t.amount; 
         if(curr === 'AUD') val *= currentAudRate;
         expense += val;
      }
    });

    return [
      { name: '收入', value: Math.round(income) },
      { name: '支出', value: Math.round(expense) },
      { name: '淨額', value: Math.round(income - expense) }
    ];
  }, [transactions, range, currentAudRate]);

  // 3. Expense/Income Category Stats
  const categoryStats = useMemo(() => {
    const cutOffDate = new Date();
    cutOffDate.setDate(cutOffDate.getDate() - range);
    const cutOffStr = cutOffDate.toISOString().split('T')[0];
    
    const map: { [key: string]: number } = {};
    
    transactions.filter((t: Transaction) => t.date >= cutOffStr && t.type === statType).forEach((t: Transaction) => {
       const cat = t.subCategory || '其他';
       let val = t.amount;
       let accId = t.type === CATEGORIES.INCOME ? t.toAccount : t.fromAccount;
       const curr = ACCOUNTS.find(a => a.id === accId)?.currency;
       if(curr === 'AUD') val *= currentAudRate;
       
       map[cat] = (map[cat] || 0) + val;
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value as number) }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, range, statType, currentAudRate]);

  // 4. Account Valuation Sorting
  const sortedAccounts = useMemo(() => {
    return ACCOUNTS.map(acc => {
      const bal = accountBalances[acc.id] || 0;
      const balTWD = acc.currency === 'AUD' ? bal * currentAudRate : bal;
      return { ...acc, bal, balTWD };
    })
    .sort((a, b) => b.balTWD - a.balTWD);
  }, [accountBalances, currentAudRate]);

  const tooltipFormatter = (value: number | string | Array<number | string>) => {
    if (typeof value === 'number') {
      return formatCurrency(value);
    }
    return String(value);
  };

  const axisColor = theme === 'dark' ? '#9CA3AF' : '#666';
  const gridColor = theme === 'dark' ? '#374151' : '#ccc';


  return (
    <div className="space-y-6 pb-20">
      
      {/* Controls */}
      <div className="flex flex-wrap gap-2 justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm transition-colors duration-200">
        <div className="flex gap-2 text-sm overflow-x-auto">
          {[7, 14, 30, 90, 180, 365].map(d => (
            <button 
              key={d} 
              onClick={() => setRange(d)}
              className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                range === d 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {d === 365 ? '一年' : d === 180 ? '半年' : d === 90 ? '三個月' : `${d}天`}
            </button>
          ))}
        </div>
        <div className="text-right text-sm text-gray-500 dark:text-gray-400">
           目前總資產: 
           <span className={`text-lg font-bold ml-1 ${totalAssetTWD < 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
             {formatCurrency(totalAssetTWD)}
           </span>
        </div>
      </div>

      {/* Asset Trend Chart */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm h-72 transition-colors duration-200">
        <h3 className="text-gray-700 dark:text-gray-200 font-bold mb-4 flex items-center gap-2"><TrendingUp size={18}/> 資產走勢 (TWD)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="date" tick={{fontSize: 12, fill: axisColor}} stroke={axisColor} />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip 
              formatter={tooltipFormatter} 
              contentStyle={{ 
                backgroundColor: theme === 'dark' ? '#1F2937' : '#fff', 
                borderColor: theme === 'dark' ? '#374151' : '#ccc',
                color: theme === 'dark' ? '#F3F4F6' : '#333'
              }} 
            />
            <Area type="monotone" dataKey="amount" stroke="#8884d8" fillOpacity={1} fill="url(#colorAmt)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Income/Expense Summary */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm transition-colors duration-200">
         <h3 className="text-gray-700 dark:text-gray-200 font-bold mb-4 flex items-center gap-2"><ArrowRightLeft size={18}/> 收支概況 (TWD)</h3>
         <div className="grid grid-cols-3 gap-4 text-center">
            {summaryData.map(item => (
               <div key={item.name} className={`p-4 rounded-lg border shadow-sm transition-colors ${
                  item.name === '收入' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                  item.name === '支出' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                  item.value >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700'
               }`}>
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{item.name}</div>
                  <div className={`text-xl font-bold mt-1 ${
                     item.name === '收入' ? 'text-green-600 dark:text-green-400' :
                     item.name === '支出' ? 'text-red-600 dark:text-red-400' :
                     item.value >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                     {formatCurrency(item.value, 'TWD')}
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* Detailed Account List */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm transition-colors duration-200">
         <h3 className="text-gray-700 dark:text-gray-200 font-bold mb-4 flex items-center gap-2"><Wallet size={18}/> 帳戶資產列表</h3>
         <div className="space-y-3">
           {sortedAccounts.map((acc) => {
             const percentage = totalAssetTWD > 0 ? (acc.balTWD / totalAssetTWD * 100).toFixed(1) : 0;
             return (
               <div key={acc.id} className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
                  <div>
                    <div className="font-medium text-gray-800 dark:text-gray-100">{acc.name}</div>
                    <div className={`text-xs ${acc.bal < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      餘額: {acc.bal.toLocaleString()} {acc.currency} 
                      {acc.currency === 'AUD' && ` (約 ${Math.round(acc.balTWD).toLocaleString()} TWD)`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${acc.balTWD < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>
                      {formatCurrency(acc.balTWD)}
                    </div>
                    <div className="text-xs text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full inline-block dark:text-blue-300">{percentage}%</div>
                  </div>
               </div>
             );
           })}
         </div>
      </div>

      {/* Category Stats */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm transition-colors duration-200">
         <div className="flex justify-between items-center mb-4">
            <h3 className="text-gray-700 dark:text-gray-200 font-bold flex items-center gap-2"><PieChartIcon size={18}/> 分類統計</h3>
            <div className="flex gap-2">
               <button onClick={() => setStatType('expense')} className={`text-xs px-2 py-1 rounded transition-colors ${statType==='expense' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-300'}`}>支出</button>
               <button onClick={() => setStatType('income')} className={`text-xs px-2 py-1 rounded transition-colors ${statType==='income' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-300'}`}>收入</button>
            </div>
         </div>
         
         <div className="h-64 flex flex-col md:flex-row items-center">
            <div className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke={theme === 'dark' ? '#1f2937' : '#fff'} // Pie chart border
                  >
                    {categoryStats.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={tooltipFormatter} 
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#1F2937' : '#fff', 
                      borderColor: theme === 'dark' ? '#374151' : '#ccc',
                      color: theme === 'dark' ? '#F3F4F6' : '#333'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-1/2 space-y-2 mt-4 md:mt-0 max-h-48 overflow-y-auto">
               {categoryStats.map((entry, index) => (
                 <div key={index} className="flex justify-between text-sm px-2 text-gray-700 dark:text-gray-300">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}}></span>
                      {entry.name}
                    </span>
                    <span>{formatCurrency(entry.value)}</span>
                 </div>
               ))}
               {categoryStats.length === 0 && <p className="text-center text-gray-400">無資料</p>}
            </div>
         </div>
      </div>

    </div>
  );
};

interface HistoryViewProps {
  transactions: Transaction[];
  handleDelete: (id: string) => Promise<void>;
}

const HistoryView: React.FC<HistoryViewProps> = ({ transactions, handleDelete }) => {
  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden min-h-[50vh] transition-colors duration-200">
       <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
         <h2 className="font-bold text-gray-700 dark:text-gray-200">歷史紀錄</h2>
         <span className="text-xs text-gray-500 dark:text-gray-400">共 {transactions.length} 筆</span>
       </div>
       <div className="overflow-y-auto max-h-[70vh]">
         {transactions.length === 0 ? (
           <div className="p-8 text-center text-gray-400">目前沒有紀錄</div>
         ) : (
           transactions.map((tx: Transaction) => (
             <div key={tx.id} className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex justify-between items-center group transition-colors">
               <div>
                 <div className="flex items-center gap-2">
                   <span className={`text-xs px-2 py-0.5 rounded text-white ${
                     tx.type === CATEGORIES.INCOME ? 'bg-green-500' : 
                     tx.type === CATEGORIES.EXPENSE ? 'bg-red-400' : 
                     tx.type === CATEGORIES.TRANSFER ? 'bg-blue-400' : 'bg-gray-400'
                   }`}>
                     {tx.type === CATEGORIES.INCOME ? '收' : tx.type === CATEGORIES.EXPENSE ? '支' : tx.type === CATEGORIES.TRANSFER ? '轉' : '調'}
                   </span>
                   <span className="font-medium text-gray-800 dark:text-gray-100">{tx.name}</span>
                 </div>
                 <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                   {tx.date} · {tx.subCategory} 
                   {tx.type === CATEGORIES.TRANSFER && ` · ${ACCOUNTS.find(a=>a.id===tx.fromAccount)?.name} -> ${ACCOUNTS.find(a=>a.id===tx.toAccount)?.name}`}
                 </div>
               </div>
               <div className="text-right">
                 <div className={`font-bold ${tx.type === CATEGORIES.INCOME ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'}`}>
                   {tx.type === CATEGORIES.EXPENSE || tx.type === CATEGORIES.TRANSFER ? '-' : '+'} 
                   {tx.amount.toLocaleString()}
                   <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                      {tx.type === CATEGORIES.INCOME 
                        ? ACCOUNTS.find(a => a.id === tx.toAccount)?.currency 
                        : ACCOUNTS.find(a => a.id === tx.fromAccount)?.currency}
                   </span>
                 </div>
                 <button 
                    onClick={() => handleDelete(tx.id)}
                    className="text-red-300 hover:text-red-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                   <Trash2 size={16} />
                 </button>
               </div>
             </div>
           ))
         )}
       </div>
    </div>
  );
};

interface SettingsViewProps {
  syncKey: string;
  tempSyncKey: string;
  setTempSyncKey: React.Dispatch<React.SetStateAction<string>>;
  handleUpdateSyncKey: () => void;
  currentAudRate: number;
  setCurrentAudRate: React.Dispatch<React.SetStateAction<number>>;
  handleImportCSV: (event: React.ChangeEvent<HTMLInputElement>) => void;
  user: User | null;
}

const SettingsView: React.FC<SettingsViewProps> = ({ syncKey, tempSyncKey, setTempSyncKey, handleUpdateSyncKey, currentAudRate, setCurrentAudRate, handleImportCSV, user }) => {
  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm space-y-6 transition-colors duration-200">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
        <Settings className="w-5 h-5" /> 設定
      </h2>

      {/* Sync Key Section */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
         <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2"><Smartphone size={16}/> 跨裝置同步</h3>
         <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
           將此金鑰複製到其他裝置，即可共用同一個帳本。
         </p>
         <div className="flex gap-2">
           <input 
             type="text" 
             value={tempSyncKey}
             onChange={(e) => setTempSyncKey(e.target.value)}
             className="flex-1 p-2 border border-blue-200 dark:border-blue-700 rounded text-sm font-mono bg-white dark:bg-gray-900 text-gray-800 dark:text-white"
           />
           <button 
             onClick={handleUpdateSyncKey}
             className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
           >
             更新
           </button>
         </div>
         <p className="text-xs text-blue-400 dark:text-blue-500 mt-2">當前生效金鑰: {syncKey}</p>
      </div>

      {/* Currency Setting */}
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-800">
         <h3 className="font-bold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-2"><DollarSign size={16}/> 匯率設定 (AUD/TWD)</h3>
         <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">用於計算總資產的台幣估值。</p>
         <div className="flex items-center gap-2">
           <span className="text-sm font-bold text-gray-600 dark:text-gray-300">1 AUD = </span>
           <input 
             type="number" 
             step="0.1"
             value={currentAudRate}
             onChange={(e) => setCurrentAudRate(parseFloat(e.target.value))}
             className="w-24 p-2 border border-yellow-200 dark:border-yellow-700 rounded text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-white"
           />
           <span className="text-sm font-bold text-gray-600 dark:text-gray-300">TWD</span>
         </div>
      </div>

      {/* CSV Import */}
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
         <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2"><Upload size={16}/> 匯入 CSV</h3>
         <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
           請上傳 CSV 檔案。格式需包含: type, name, amount, date, subCategory, fromAccount, toAccount。
         </p>
         <input 
           type="file" 
           accept=".csv"
           onChange={handleImportCSV}
           className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900 dark:file:text-blue-300 hover:file:bg-blue-100"
         />
      </div>
      
      <div className="text-xs text-gray-400 text-center pt-8">
         User ID: {user?.uid?.slice(0,8)}...
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState('input'); // input, dashboard, history, settings
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { theme, toggleTheme } = useTheme();
  
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const [formData, setFormData] = useState<FormDataState>({
    type: CATEGORIES.EXPENSE,
    name: '',
    subCategory: SUB_CATEGORIES[CATEGORIES.EXPENSE]?.[0] || '',
    amount: '',
    fromAccount: 'cash',
    toAccount: 'taishin',
    exchangeRate: '', 
    date: new Date().toISOString().split('T')[0]
  });

  const [syncKey, setSyncKey] = useState('');
  const [tempSyncKey, setTempSyncKey] = useState('');
  const [currentAudRate, setCurrentAudRate] = useState(21.5); 

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  // --- Auth & Data Loading ---
  
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Firebase Anonymous Sign-in Failed:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const storedKey = localStorage.getItem('expense_sync_key');
        if (storedKey) {
          setSyncKey(storedKey);
          setTempSyncKey(storedKey);
        } else {
          const newKey = currentUser.uid.substring(0, 8);
          localStorage.setItem('expense_sync_key', newKey);
          setSyncKey(newKey);
          setTempSyncKey(newKey);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to Transactions based on Sync Key
  useEffect(() => {
    if (!user || !syncKey) return;

    setLoading(true);
    
    const q = query(
      collection(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Transaction[] = snapshot.docs.map(doc => {
        const txData = doc.data();
        return {
          id: doc.id,
          ...txData,
          amount: typeof txData.amount === 'number' ? txData.amount : parseFloat(String(txData.amount || '0')),
          dateObj: txData.timestamp?.toDate() || new Date(txData.date)
        } as Transaction;
      });
      setTransactions(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching transactions:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, syncKey]);

  // --- Core Logic: Balance Calculation ---

  const accountBalances = useMemo(() => {
    const balances: BalanceMap = {};
    ACCOUNTS.forEach(acc => balances[acc.id] = 0);

    const sortedTx = [...transactions].sort((a: Transaction, b: Transaction) => 
      (a.dateObj.getTime() || 0) - (b.dateObj.getTime() || 0)
    );

    sortedTx.forEach((tx: Transaction) => {
      const amt = tx.amount;
      if (isNaN(amt)) return;

      if (tx.type === CATEGORIES.INCOME) {
        if (tx.toAccount) balances[tx.toAccount] = (balances[tx.toAccount] || 0) + amt;
      } 
      else if (tx.type === CATEGORIES.EXPENSE) {
        if (tx.fromAccount) balances[tx.fromAccount] = (balances[tx.fromAccount] || 0) - amt;
      } 
      else if (tx.type === CATEGORIES.ADJUSTMENT) {
        if (tx.fromAccount) balances[tx.fromAccount] = (balances[tx.fromAccount] || 0) + amt;
      } 
      else if (tx.type === CATEGORIES.TRANSFER) {
        if (tx.fromAccount) balances[tx.fromAccount] = (balances[tx.fromAccount] || 0) - amt;
        
        let destAmount = amt;
        
        const fromCurr = ACCOUNTS.find(a => a.id === tx.fromAccount)?.currency;
        const toCurr = ACCOUNTS.find(a => a.id === tx.toAccount)?.currency;
        const rate = tx.exchangeRate ? parseFloat(tx.exchangeRate as string) : undefined;

        if (fromCurr !== toCurr && rate) {
          destAmount = amt * rate;
        }

        if (tx.toAccount) balances[tx.toAccount] = (balances[tx.toAccount] || 0) + destAmount;
      }
    });

    return balances;
  }, [transactions]);

  const totalAssetTWD = useMemo(() => {
    let total = 0;
    ACCOUNTS.forEach(acc => {
      const bal = accountBalances[acc.id] || 0;
      if (acc.currency === 'AUD') {
        total += bal * currentAudRate;
      } else {
        total += bal;
      }
    });
    return total;
  }, [accountBalances, currentAudRate]);

  // --- Actions ---

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTypeChange = (type: 'income' | 'expense' | 'transfer' | 'adjustment') => {
    setFormData(prev => ({
      ...prev,
      type,
      subCategory: SUB_CATEGORIES[type]?.[0] || '',
      amount: '',
      exchangeRate: ''
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    let amount = parseFloat(formData.amount as string);
    if (isNaN(amount)) return;

    if ((formData.type === CATEGORIES.INCOME || formData.type === CATEGORIES.EXPENSE) && amount < 0) {
      showNotification("收入與支出金額必須為正數", "error");
      return;
    }
    
    if (formData.type === CATEGORIES.TRANSFER) {
      const fromCurr = ACCOUNTS.find(a => a.id === formData.fromAccount)?.currency;
      const toCurr = ACCOUNTS.find(a => a.id === formData.toAccount)?.currency;
      if (fromCurr !== toCurr && !formData.exchangeRate) {
        showNotification("不同幣種轉帳請輸入匯率", "error");
        return;
      }
    }

    try {
      const docData: { [key: string]: any } = {
        ...formData,
        amount: amount,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      };

      if (formData.type === CATEGORIES.ADJUSTMENT) {
        delete docData.toAccount;
        delete docData.subCategory;
        delete docData.exchangeRate;
      }
      if (formData.type === CATEGORIES.TRANSFER) {
        delete docData.subCategory;
      }
      if (formData.type === CATEGORIES.EXPENSE) {
        delete docData.toAccount;
        delete docData.exchangeRate;
      }
      if (formData.type === CATEGORIES.INCOME) {
        delete docData.fromAccount;
        delete docData.exchangeRate;
      }

      await addDoc(collection(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`), docData);

      setFormData(prev => ({
        ...prev,
        name: '',
        amount: '',
        exchangeRate: ''
      }));
      showNotification("記帳成功！", "success");
    } catch (error) {
      console.error("Error adding document: ", error);
      showNotification("儲存失敗，請稍後再試", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if(!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    try {
      await deleteDoc(doc(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`, id));
      showNotification("刪除成功", "success");
    } catch (e) {
      console.error("Delete failed", e);
      showNotification("刪除失敗", "error");
    }
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      const text = e.target?.result as string; 
      const data = parseCSV(text);
      
      let count = 0;
      for (let row of data) {
         try {
           const cleanRow = {
             type: (row.type || 'expense') as 'expense' | 'income' | 'transfer' | 'adjustment',
             name: row.name || '匯入項目',
             amount: parseFloat(row.amount || '0'),
             date: row.date || new Date().toISOString().split('T')[0],
             subCategory: row.subCategory || '',
             fromAccount: row.fromAccount || 'cash',
             toAccount: row.toAccount || 'taishin',
             timestamp: serverTimestamp(),
             exchangeRate: row.exchangeRate || ''
           };
           await addDoc(collection(db, FIRESTORE_COLLECTION_ROOT, 'data', `ledger_${syncKey}`), cleanRow);
           count++;
         } catch(err) {
           console.error("Row import failed", row);
         }
      }
      showNotification(`成功匯入 ${count} 筆資料`, "success");
    };
    reader.readAsText(file);
  };

  const handleUpdateSyncKey = () => {
    if(tempSyncKey && tempSyncKey.length > 3) {
      localStorage.setItem('expense_sync_key', tempSyncKey);
      setSyncKey(tempSyncKey);
      setTransactions([]);
      showNotification("同步金鑰已更新，正在載入...", "success");
    } else {
      showNotification("金鑰太短", "error");
    }
  };

  // --- Render ---

  if (loading && transactions.length === 0 && !syncKey) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 font-sans pb-24 text-gray-800 dark:text-gray-100 relative transition-colors duration-200">
      
      {notification && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 transition-all duration-300 animate-bounce ${
          notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="font-medium text-sm">{notification.message}</span>
        </div>
      )}

      <header className="bg-blue-600 dark:bg-blue-900 text-white p-4 sticky top-0 z-10 shadow-lg transition-colors duration-200">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6"/> 我的輕便記帳
          </h1>
          <div className="flex items-center gap-3">
            <div className="text-xs bg-blue-700 dark:bg-blue-800 px-2 py-1 rounded">
              {syncKey ? '已同步' : '離線'}
            </div>
            <button 
              onClick={toggleTheme}
              className="p-1.5 rounded-full hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
              aria-label="Toggle Dark Mode"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {view === 'input' && <InputView 
          formData={formData} 
          handleInputChange={handleInputChange} 
          handleTypeChange={handleTypeChange}
          handleSubmit={handleSubmit}
        />}
        {view === 'dashboard' && <DashboardView 
          transactions={transactions} 
          accountBalances={accountBalances} 
          totalAssetTWD={totalAssetTWD} 
          currentAudRate={currentAudRate} 
          theme={theme}
        />}
        {view === 'history' && <HistoryView 
          transactions={transactions} 
          handleDelete={handleDelete}
        />}
        {view === 'settings' && <SettingsView 
          syncKey={syncKey} 
          tempSyncKey={tempSyncKey} 
          setTempSyncKey={setTempSyncKey} 
          handleUpdateSyncKey={handleUpdateSyncKey} 
          currentAudRate={currentAudRate} 
          setCurrentAudRate={setCurrentAudRate} 
          handleImportCSV={handleImportCSV} 
          user={user}
        />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-pb transition-colors duration-200">
        <div className="max-w-2xl mx-auto flex justify-around p-2">
          <button 
            onClick={() => setView('input')}
            className={`flex flex-col items-center p-2 rounded-lg transition ${view === 'input' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 dark:text-gray-500'}`}
          >
            <Plus size={24} />
            <span className="text-xs mt-1">記帳</span>
          </button>
          <button 
            onClick={() => setView('dashboard')}
            className={`flex flex-col items-center p-2 rounded-lg transition ${view === 'dashboard' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 dark:text-gray-500'}`}
          >
            <TrendingUp size={24} />
            <span className="text-xs mt-1">分析</span>
          </button>
          <button 
            onClick={() => setView('history')}
            className={`flex flex-col items-center p-2 rounded-lg transition ${view === 'history' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 dark:text-gray-500'}`}
          >
            <FileText size={24} />
            <span className="text-xs mt-1">明細</span>
          </button>
          <button 
            onClick={() => setView('settings')}
            className={`flex flex-col items-center p-2 rounded-lg transition ${view === 'settings' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 dark:text-gray-500'}`}
          >
            <Settings size={24} />
            <span className="text-xs mt-1">設定</span>
          </button>
        </div>
      </nav>

    </div>
  );
}