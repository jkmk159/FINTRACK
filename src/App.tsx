import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Calendar as CalendarIcon, 
  Wallet, 
  Plus, 
  Trash2, 
  Edit2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  X,
  CheckCircle2,
  Clock,
  Tags,
  Repeat
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Bank, Transaction, Category } from './types';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import { LogOut } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'banks' | 'calendar' | 'categories'>('dashboard');
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [bankToDelete, setBankToDelete] = useState<number | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<number | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchBanks();
      fetchTransactions();
      fetchCategories();
    }
  }, [session]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Fetch categories error:', error);
    }
  };

  const fetchBanks = async () => {
    try {
      console.log('Fetching banks...');
      const { data, error } = await supabase
        .from('banks')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      setBanks(data || []);
    } catch (error) {
      console.error('Fetch banks error:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      console.log('Fetching transactions...');
      const { data, error } = await supabase
        .from('transactions')
        .select('*, banks(name), categories(name)')
        .order('date', { ascending: false })
        .order('id', { ascending: false });
      
      if (error) throw error;

      // Map the joined data to match the previous structure
      const formattedData = data?.map(t => ({
        ...t,
        bank_name: t.banks?.name,
        category_name: t.categories?.name
      })) || [];

      setTransactions(formattedData);
    } catch (error) {
      console.error('Fetch transactions error:', error);
    }
  };

  const handleConfirmTransaction = async (id: number) => {
    try {
      const transaction = transactions.find(t => t.id === id);
      if (!transaction || transaction.status === 'confirmed') return;

      // Update transaction status
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ status: 'confirmed' })
        .eq('id', id);
      
      if (updateError) throw updateError;

      // Update bank balance
      if (transaction.bank_id) {
        const bank = banks.find(b => b.id === transaction.bank_id);
        if (bank) {
          const adjustment = transaction.type === 'income' ? transaction.amount : -transaction.amount;
          const { error: bankError } = await supabase
            .from('banks')
            .update({ balance: bank.balance + adjustment })
            .eq('id', bank.id);
          
          if (bankError) throw bankError;
        }
      }

      fetchTransactions();
      fetchBanks();
    } catch (error) {
      console.error('Confirm error:', error);
    }
  };

  const handleDeleteTransaction = async (id: number | null) => {
    if (id === null) return;
    
    try {
      const transaction = transactions.find(t => t.id === id);
      if (!transaction) return;

      // Revert bank balance if confirmed
      if (transaction.bank_id && transaction.status === 'confirmed') {
        const bank = banks.find(b => b.id === transaction.bank_id);
        if (bank) {
          const adjustment = transaction.type === 'income' ? -transaction.amount : transaction.amount;
          await supabase
            .from('banks')
            .update({ balance: bank.balance + adjustment })
            .eq('id', bank.id);
        }
      }

      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      fetchTransactions();
      fetchBanks();
      setTransactionToDelete(null);
    } catch (error) {
      console.error('Delete error:', error);
      alert('Erro ao excluir transação.');
      setTransactionToDelete(null);
    }
  };

  const handleDeleteBank = async (id: number | null) => {
    if (id === null) return;
    
    try {
      // Check for transactions
      const { count, error: countError } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('bank_id', id);
      
      if (countError) throw countError;

      if (count && count > 0) {
        alert("Não é possível excluir um banco que possui transações vinculadas.");
        setBankToDelete(null);
        return;
      }

      const { error } = await supabase
        .from('banks')
        .delete()
        .eq('id', id);
      
      if (error) throw error;

      fetchBanks();
      setBankToDelete(null);
    } catch (error) {
      console.error('Bank delete error:', error);
      alert('Erro ao excluir banco.');
      setBankToDelete(null);
    }
  };

  const handleDeleteCategory = async (id: number | null) => {
    if (id === null) return;
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
      
      if (error) throw error;

      fetchCategories();
      setCategoryToDelete(null);
    } catch (error) {
      console.error('Delete category error:', error);
    }
  };

  const totalBalance = banks.reduce((acc, bank) => acc + bank.balance, 0);
  
  // Projection: Real Balance + all pending transactions in current month
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  const pendingTransactionsThisMonth = transactions.filter(t => 
    t.status === 'pending' && t.date.startsWith(currentMonthStr)
  );
  
  const projectedBalance = totalBalance + pendingTransactionsThisMonth.reduce((acc, t) => {
    return acc + (t.type === 'income' ? t.amount : -t.amount);
  }, 0);

  const monthlyIncome = transactions
    .filter(t => t.type === 'income' && t.date.startsWith(format(new Date(), 'yyyy-MM')))
    .reduce((acc, t) => acc + t.amount, 0);
  const monthlyExpense = transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(format(new Date(), 'yyyy-MM')))
    .reduce((acc, t) => acc + t.amount, 0);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="text-emerald-600"
        >
          <Wallet size={48} />
        </motion.div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-slate-900 font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:flex-col md:w-64 md:h-screen md:border-t-0 md:border-r md:px-4 md:py-8 md:justify-start md:gap-4">
        <div className="hidden md:flex items-center gap-2 mb-8 px-4">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
            <TrendingUp size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">FinTrack</h1>
        </div>

        <NavItem 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
          icon={<LayoutDashboard size={24} />} 
          label="Início" 
        />
        <NavItem 
          active={activeTab === 'transactions'} 
          onClick={() => setActiveTab('transactions')} 
          icon={<ArrowUpCircle size={24} />} 
          label="Extrato" 
        />
        <NavItem 
          active={activeTab === 'calendar'} 
          onClick={() => setActiveTab('calendar')} 
          icon={<CalendarIcon size={24} />} 
          label="Agenda" 
        />
        <NavItem 
          active={activeTab === 'banks'} 
          onClick={() => setActiveTab('banks')} 
          icon={<Wallet size={24} />} 
          label="Contas" 
        />
        <NavItem 
          active={activeTab === 'categories'} 
          onClick={() => setActiveTab('categories')} 
          icon={<Tags size={24} />} 
          label="Categorias" 
        />

        <button 
          onClick={() => supabase.auth.signOut()}
          className="flex flex-col items-center gap-1 md:hidden text-rose-600"
        >
          <LogOut size={24} />
          <span className="text-[10px] font-bold">Sair</span>
        </button>

        <div className="mt-auto pt-8 border-t border-slate-100 hidden md:block w-full">
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-4 px-6 py-4 text-rose-600 font-black hover:bg-rose-50 rounded-2xl transition-all active:scale-95"
          >
            <LogOut size={24} />
            <span>Sair</span>
          </button>
        </div>

        <button 
          onClick={() => {
            setEditingTransaction(null);
            setIsModalOpen(true);
          }}
          className="md:mt-auto w-12 h-12 md:w-full md:h-auto md:py-3 bg-emerald-600 text-white rounded-full md:rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
        >
          <Plus size={24} />
          <span className="hidden md:inline font-medium">Nova Transação</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="pb-24 pt-6 px-4 md:pl-72 md:pt-12 md:pr-12 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-3xl font-bold tracking-tight">Olá, Matheus</h2>
                <p className="text-slate-500">Aqui está o resumo das suas finanças.</p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatCard 
                  label="Saldo Real" 
                  value={totalBalance} 
                  icon={<Wallet className="text-emerald-600" />} 
                  color="bg-emerald-50"
                />
                <StatCard 
                  label="Projeção Final" 
                  value={projectedBalance} 
                  icon={<TrendingUp className="text-indigo-600" />} 
                  color="bg-indigo-50"
                  sublabel="Final do mês"
                />
                <StatCard 
                  label="Entradas (Mês)" 
                  value={monthlyIncome} 
                  icon={<TrendingUp className="text-blue-600" />} 
                  color="bg-blue-50"
                />
                <StatCard 
                  label="Saídas (Mês)" 
                  value={monthlyExpense} 
                  icon={<TrendingDown className="text-rose-600" />} 
                  color="bg-rose-50"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold">Últimas Transações</h3>
                    <button onClick={() => setActiveTab('transactions')} className="text-sm text-emerald-600 font-medium hover:underline">Ver todas</button>
                  </div>
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map(t => (
                      <TransactionItem 
                        key={t.id} 
                        transaction={t} 
                        onDelete={(id) => setTransactionToDelete(id)} 
                        onConfirm={handleConfirmTransaction}
                        onEdit={(t) => {
                          setEditingTransaction(t);
                          setIsModalOpen(true);
                        }} 
                      />
                    ))}
                    {transactions.length === 0 && <p className="text-center text-slate-400 py-8">Nenhuma transação encontrada.</p>}
                  </div>
                </section>

                <section className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold">Meus Bancos</h3>
                    <button onClick={() => setIsBankModalOpen(true)} className="text-sm text-emerald-600 font-medium hover:underline">Adicionar</button>
                  </div>
                  <div className="space-y-3">
                    {banks.map(bank => (
                      <div key={bank.id} className="group flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 border border-slate-200 shrink-0">
                            <Wallet size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{bank.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Saldo disponível</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                          <p className={cn("font-bold text-sm sm:text-base", bank.balance >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bank.balance)}
                          </p>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex">
                            <button 
                              onClick={() => {
                                setEditingBank(bank);
                                setIsBankModalOpen(true);
                              }}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => setBankToDelete(bank.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {banks.length === 0 && <p className="text-center text-slate-400 py-8">Nenhum banco cadastrado.</p>}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'transactions' && (
            <motion.div 
              key="transactions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Transações</h2>
                  <p className="text-slate-500">Histórico completo de entradas e saídas.</p>
                </div>
              </header>

              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex gap-4 overflow-x-auto">
                  <button 
                    onClick={() => setTransactionFilter('all')}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                      transactionFilter === 'all' ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Todas
                  </button>
                  <button 
                    onClick={() => setTransactionFilter('income')}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                      transactionFilter === 'income' ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Entradas
                  </button>
                  <button 
                    onClick={() => setTransactionFilter('expense')}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                      transactionFilter === 'expense' ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Saídas
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {transactions
                    .filter(t => transactionFilter === 'all' || t.type === transactionFilter)
                    .map(t => (
                    <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <TransactionItem 
                        transaction={t} 
                        onDelete={(id) => setTransactionToDelete(id)} 
                        onConfirm={handleConfirmTransaction}
                        onEdit={(t) => {
                          setEditingTransaction(t);
                          setIsModalOpen(true);
                        }} 
                      />
                    </div>
                  ))}
                  {transactions.filter(t => transactionFilter === 'all' || t.type === transactionFilter).length === 0 && (
                    <p className="text-center text-slate-400 py-12">Nenhuma transação encontrada para este filtro.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'calendar' && (
            <motion.div 
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <CalendarView 
                transactions={transactions} 
                onAddTransaction={(date) => {
                  setEditingTransaction(null);
                  setSelectedCalendarDate(date);
                  setIsModalOpen(true);
                }}
                onEditTransaction={(t) => {
                  setEditingTransaction(t);
                  setSelectedCalendarDate(null);
                  setIsModalOpen(true);
                }}
                onDeleteTransaction={(id) => setTransactionToDelete(id)}
                onConfirmTransaction={handleConfirmTransaction}
              />
            </motion.div>
          )}

          {activeTab === 'banks' && (
            <motion.div 
              key="banks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <header className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Bancos</h2>
                  <p className="text-slate-500">Gerencie suas contas e saldos.</p>
                </div>
                <button 
                  onClick={() => setIsBankModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors"
                >
                  <Plus size={20} />
                  Novo Banco
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {banks.map(bank => (
                  <div key={bank.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 group relative">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <Wallet size={24} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setEditingBank(bank);
                            setIsBankModalOpen(true);
                          }}
                          className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => setBankToDelete(bank.id)}
                          className="p-2 text-slate-300 hover:text-rose-600 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <h4 className="text-lg font-bold">{bank.name}</h4>
                    <p className="text-slate-500 text-sm mb-4">Saldo atual</p>
                    <p className={cn("text-2xl font-black", bank.balance >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bank.balance)}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'categories' && (
            <motion.div 
              key="categories"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <header className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Categorias</h2>
                  <p className="text-slate-500">Organize suas transações por tipo.</p>
                </div>
                <button 
                  onClick={() => {
                    setEditingCategory(null);
                    setIsCategoryModalOpen(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium flex items-center gap-2 hover:bg-emerald-700 transition-colors"
                >
                  <Plus size={20} />
                  Nova Categoria
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.map(category => (
                  <div key={category.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 group relative">
                    <div className="flex justify-between items-start mb-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center",
                        category.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        <Tags size={24} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setEditingCategory(category);
                            setIsCategoryModalOpen(true);
                          }}
                          className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => setCategoryToDelete(category.id)}
                          className="p-2 text-slate-300 hover:text-rose-600 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <h4 className="text-lg font-bold">{category.name}</h4>
                    <p className={cn(
                      "text-xs font-bold uppercase tracking-wider mt-1",
                      category.type === 'income' ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {category.type === 'income' ? 'Entrada' : 'Saída'}
                    </p>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                    <p className="text-slate-400">Nenhuma categoria cadastrada.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setSelectedCalendarDate(null);
        }} 
        onSuccess={() => {
          fetchTransactions();
          fetchBanks();
          setIsModalOpen(false);
          setSelectedCalendarDate(null);
        }}
        banks={banks}
        categories={categories}
        editingTransaction={editingTransaction}
        defaultDate={selectedCalendarDate}
      />

      <BankModal 
        isOpen={isBankModalOpen} 
        onClose={() => {
          setIsBankModalOpen(false);
          setEditingBank(null);
        }} 
        onSuccess={() => {
          fetchBanks();
          setIsBankModalOpen(false);
          setEditingBank(null);
        }}
        editingBank={editingBank}
      />

      <CategoryModal 
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        onSuccess={() => {
          fetchCategories();
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        editingCategory={editingCategory}
      />

      {/* Category Confirmation Modal */}
      <AnimatePresence>
        {categoryToDelete !== null && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Excluir Categoria?</h3>
              <p className="text-slate-500 font-medium mb-8">Esta ação removerá a categoria. Transações vinculadas a ela ficarão sem categoria.</p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setCategoryToDelete(null)}
                  className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteCategory(categoryToDelete)}
                  className="py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bank Confirmation Modal */}
      <AnimatePresence>
        {bankToDelete !== null && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Excluir Banco?</h3>
              <p className="text-slate-500 font-medium mb-8">Esta ação removerá o banco. Você não pode excluir bancos que possuem transações vinculadas.</p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setBankToDelete(null)}
                  className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteBank(bankToDelete)}
                  className="py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {transactionToDelete !== null && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Excluir Transação?</h3>
              <p className="text-slate-500 font-medium mb-8">Esta ação não pode ser desfeita e o saldo do banco será ajustado.</p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setTransactionToDelete(null)}
                  className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteTransaction(transactionToDelete)}
                  className="py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 py-2 md:px-4 md:py-3 rounded-xl transition-all flex-1 md:flex-none md:w-full",
        active ? "text-emerald-600 bg-emerald-50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
      )}
    >
      {icon}
      <span className="text-[10px] md:text-sm font-semibold">{label}</span>
    </button>
  );
}

function StatCard({ label, value, icon, color, sublabel }: { label: string, value: number, icon: React.ReactNode, color: string, sublabel?: string }) {
  return (
    <div className="bg-white p-5 sm:p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={cn("w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0", color)}>
        {React.cloneElement(icon as React.ReactElement, { size: 24 })}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg sm:text-2xl font-black tracking-tight text-slate-900 break-all sm:break-normal">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
        </p>
        {sublabel && <p className="text-[10px] text-slate-400 font-bold mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

interface TransactionItemProps {
  transaction: Transaction;
  onDelete: (id: number) => void | Promise<void>;
  onConfirm: (id: number) => void | Promise<void>;
  onEdit: (t: Transaction) => void;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onDelete, onConfirm, onEdit }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 sm:p-4 rounded-2xl hover:bg-slate-50/80 transition-all group border border-transparent hover:border-slate-100">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={cn(
          "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 relative shadow-sm transition-transform group-hover:scale-105",
          transaction.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {transaction.type === 'income' ? <ArrowUpCircle size={28} /> : <ArrowDownCircle size={28} />}
          {transaction.status === 'pending' && (
            <div className="absolute -top-1 -right-1 bg-amber-400 text-white rounded-full p-1 border-2 border-white shadow-md">
              <Clock size={12} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-black text-slate-800 text-base sm:text-lg tracking-tight leading-tight">{transaction.description}</p>
            {transaction.status === 'pending' && (
              <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase tracking-widest whitespace-nowrap border border-amber-200">Pendente</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold text-slate-400">
            <span className="whitespace-nowrap">{format(parseISO(transaction.date), 'dd MMM yyyy', { locale: ptBR })}</span>
            <span className="text-slate-200">•</span>
            <span className="flex items-center gap-1.5 truncate max-w-[100px] sm:max-w-none">
              <Wallet size={12} className="shrink-0 opacity-60" /> 
              <span className="truncate">{transaction.bank_name || 'Sem banco'}</span>
            </span>
            {transaction.category_name && (
              <>
                <span className="text-slate-200">•</span>
                <span className="flex items-center gap-1.5 truncate max-w-[100px] sm:max-w-none">
                  <Tags size={12} className="shrink-0 opacity-60" /> 
                  <span className="truncate">{transaction.category_name}</span>
                </span>
              </>
            )}
            {transaction.recurring_id && (
              <>
                <span className="text-slate-200">•</span>
                <span className="flex items-center gap-1.5 text-indigo-500">
                  <Repeat size={12} className="shrink-0" /> 
                  <span className="hidden sm:inline">Recorrente</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between sm:justify-end gap-4 sm:pl-0 w-full sm:w-auto">
        <div className="text-left sm:text-right flex-1 sm:flex-none">
          <p className={cn(
            "text-lg sm:text-2xl font-black whitespace-nowrap tracking-tighter",
            transaction.type === 'income' ? "text-emerald-600" : "text-rose-600"
          )}>
            {transaction.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.amount)}
          </p>
        </div>
        
        <div className="flex items-center gap-1 bg-slate-100/50 sm:bg-transparent p-1 sm:p-0 rounded-2xl border border-slate-200/50 sm:border-transparent">
          {transaction.status === 'pending' && (
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onConfirm(transaction.id);
              }} 
              className="p-3 text-emerald-600 hover:bg-emerald-100/80 rounded-xl transition-all active:scale-90"
              title="Dar baixa"
            >
              <CheckCircle2 size={22} />
            </button>
          )}
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(transaction);
            }} 
            className="p-3 text-blue-600 hover:bg-blue-100/80 rounded-xl transition-all active:scale-90"
            title="Editar"
          >
            <Edit2 size={22} />
          </button>
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log(`Delete button clicked for transaction: ${transaction.id}`);
              onDelete(transaction.id);
            }} 
            className="p-3 text-rose-600 hover:bg-rose-100/80 rounded-xl transition-all active:scale-90"
            title="Excluir"
          >
            <Trash2 size={22} />
          </button>
        </div>
      </div>
    </div>
  );
};

function CalendarView({ 
  transactions, 
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onConfirmTransaction
}: { 
  transactions: Transaction[],
  onAddTransaction: (date: string) => void,
  onEditTransaction: (t: Transaction) => void,
  onDeleteTransaction: (id: number) => void,
  onConfirmTransaction: (id: number) => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getDayTransactions = (day: Date) => {
    return transactions.filter(t => isSameDay(parseISO(t.date), day));
  };

  const selectedDayTransactions = selectedDate ? getDayTransactions(selectedDate) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Calendário</h2>
            <p className="text-slate-500">Visualize seus ganhos e gastos no tempo.</p>
          </div>
          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
              <ChevronLeft size={20} />
            </button>
            <span className="font-bold min-w-[140px] text-center capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </header>

        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="py-3 text-center text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const dayTransactions = getDayTransactions(day);
              const income = dayTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
              const expense = dayTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
              const isCurrentMonth = format(day, 'MM') === format(currentDate, 'MM');
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <div 
                  key={idx} 
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "min-h-[80px] sm:min-h-[120px] p-1 sm:p-2 border-r border-b border-slate-50 flex flex-col gap-1 transition-all cursor-pointer",
                    !isCurrentMonth && "bg-slate-50/50 opacity-30",
                    isSelected ? "bg-indigo-50/50 ring-2 ring-indigo-500 ring-inset z-10" : "hover:bg-slate-50/30"
                  )}
                >
                  <span className={cn(
                    "text-xs sm:text-sm font-bold w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full transition-colors",
                    isToday ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : 
                    isSelected ? "bg-indigo-600 text-white" : "text-slate-600"
                  )}>
                    {format(day, 'd')}
                  </span>
                  
                  <div className="mt-auto space-y-1">
                    {income > 0 && (
                      <div className="text-[8px] sm:text-[10px] bg-emerald-50 text-emerald-700 px-1 sm:px-1.5 py-0.5 rounded-md font-black flex justify-between items-center">
                        <span className="hidden sm:inline">+</span>
                        <span className="truncate">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(income)}</span>
                      </div>
                    )}
                    {expense > 0 && (
                      <div className="text-[8px] sm:text-[10px] bg-rose-50 text-rose-700 px-1 sm:px-1.5 py-0.5 rounded-md font-black flex justify-between items-center">
                        <span className="hidden sm:inline">-</span>
                        <span className="truncate">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(expense)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {selectedDate ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-800 capitalize">
                    {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <p className="text-slate-500 text-sm font-medium">Transações do dia</p>
                </div>
                <button 
                  onClick={() => onAddTransaction(format(selectedDate, 'yyyy-MM-dd'))}
                  className="p-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                  title="Adicionar transação para este dia"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {selectedDayTransactions.length > 0 ? (
                  selectedDayTransactions.map(t => (
                    <TransactionItem 
                      key={t.id}
                      transaction={t}
                      onDelete={onDeleteTransaction}
                      onEdit={onEditTransaction}
                      onConfirm={onConfirmTransaction}
                    />
                  ))
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-3xl">
                    <Clock className="mx-auto text-slate-200 mb-3" size={40} />
                    <p className="text-slate-400 font-medium">Nenhuma transação<br/>neste dia.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-200">
            <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-300 shadow-sm mb-4">
              <Clock size={40} />
            </div>
            <h3 className="text-lg font-bold text-slate-400">Selecione um dia</h3>
            <p className="text-slate-400 text-sm max-w-[200px]">Clique em uma data no calendário para ver os detalhes.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionModal({ isOpen, onClose, onSuccess, banks, categories, editingTransaction, defaultDate }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSuccess: () => void, 
  banks: Bank[],
  categories: Category[],
  editingTransaction: Transaction | null,
  defaultDate?: string | null
}) {
  const [formData, setFormData] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    bank_id: '',
    category_id: '',
    status: 'confirmed' as 'pending' | 'confirmed',
    isRecurring: false,
    recurringMonths: '12'
  });

  useEffect(() => {
    if (editingTransaction) {
      setFormData({
        type: editingTransaction.type,
        amount: editingTransaction.amount.toString(),
        description: editingTransaction.description,
        date: editingTransaction.date,
        bank_id: editingTransaction.bank_id?.toString() || '',
        category_id: editingTransaction.category_id?.toString() || '',
        status: editingTransaction.status,
        isRecurring: false,
        recurringMonths: '12'
      });
    } else {
      setFormData({
        type: 'expense',
        amount: '',
        description: '',
        date: defaultDate || format(new Date(), 'yyyy-MM-dd'),
        bank_id: banks[0]?.id.toString() || '',
        category_id: '',
        status: 'confirmed',
        isRecurring: false,
        recurringMonths: '12'
      });
    }
  }, [editingTransaction, banks, isOpen, defaultDate]);

  // Auto-set status based on date
  useEffect(() => {
    if (!editingTransaction && formData.date) {
      const selectedDate = parseISO(formData.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (selectedDate > today) {
        setFormData(prev => ({ ...prev, status: 'pending' }));
      } else {
        setFormData(prev => ({ ...prev, status: 'confirmed' }));
      }
    }
  }, [formData.date, editingTransaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const amount = parseFloat(formData.amount);
      const bankId = parseInt(formData.bank_id);
      const categoryId = formData.category_id ? parseInt(formData.category_id) : null;

      if (editingTransaction) {
        // Revert old balance if it was confirmed
        if (editingTransaction.bank_id && editingTransaction.status === 'confirmed') {
          const oldBank = banks.find(b => b.id === editingTransaction.bank_id);
          if (oldBank) {
            const oldAdjustment = editingTransaction.type === 'income' ? -editingTransaction.amount : editingTransaction.amount;
            await supabase
              .from('banks')
              .update({ balance: oldBank.balance + oldAdjustment })
              .eq('id', oldBank.id);
          }
        }

        // Update transaction
        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            type: formData.type,
            amount,
            description: formData.description,
            date: formData.date,
            bank_id: bankId,
            status: formData.status,
            category_id: categoryId
          })
          .eq('id', editingTransaction.id);
        
        if (updateError) throw updateError;

        // Apply new balance if new status is confirmed
        if (bankId && formData.status === 'confirmed') {
          // Fetch bank again to get updated balance after revert
          const { data: updatedBank } = await supabase.from('banks').select('balance').eq('id', bankId).single();
          if (updatedBank) {
            const newAdjustment = formData.type === 'income' ? amount : -amount;
            await supabase
              .from('banks')
              .update({ balance: updatedBank.balance + newAdjustment })
              .eq('id', bankId);
          }
        }
      } else {
        // Create new transaction(s)
        const recurring_id = formData.isRecurring ? `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null;
        const count = formData.isRecurring ? parseInt(formData.recurringMonths) : 1;
        const startDate = new Date(formData.date);

        for (let i = 0; i < count; i++) {
          const currentDate = new Date(startDate);
          currentDate.setMonth(startDate.getMonth() + i);
          const dateStr = currentDate.toISOString().split('T')[0];
          const currentStatus = i === 0 ? formData.status : 'pending';

          const { error: insertError } = await supabase
            .from('transactions')
            .insert({
              type: formData.type,
              amount,
              description: formData.description,
              date: dateStr,
              bank_id: bankId,
              status: currentStatus,
              category_id: categoryId,
              recurring_id
            });
          
          if (insertError) throw insertError;

          // Update bank balance only if confirmed
          if (bankId && currentStatus === 'confirmed') {
            const { data: bank } = await supabase.from('banks').select('balance').eq('id', bankId).single();
            if (bank) {
              const adjustment = formData.type === 'income' ? amount : -amount;
              await supabase
                .from('banks')
                .update({ balance: bank.balance + adjustment })
                .eq('id', bankId);
            }
          }
        }
      }

      onSuccess();
    } catch (error) {
      console.error('Transaction submit error:', error);
      alert('Erro ao salvar transação.');
    }
  };

  if (!isOpen) return null;

  const filteredCategories = categories.filter(c => c.type === formData.type);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <h3 className="text-xl font-bold">{editingTransaction ? 'Editar Transação' : 'Nova Transação'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, type: 'expense' })}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                formData.type === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
              )}
            >
              Despesa
            </button>
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, type: 'income' })}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                formData.type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
              )}
            >
              Entrada
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor</label>
              <input 
                required
                type="number" 
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-lg font-bold"
                placeholder="R$ 0,00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data</label>
              <input 
                required
                type="date" 
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Descrição</label>
            <input 
              required
              type="text" 
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="Ex: Aluguel, Supermercado..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Banco</label>
              <select 
                required
                value={formData.bank_id}
                onChange={e => setFormData({ ...formData, bank_id: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all appearance-none"
              >
                <option value="">Selecionar Banco</option>
                {banks.map(bank => (
                  <option key={bank.id} value={bank.id}>{bank.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Categoria</label>
              <select 
                value={formData.category_id}
                onChange={e => {
                  const catId = e.target.value;
                  const category = categories.find(c => c.id.toString() === catId);
                  setFormData(prev => ({ 
                    ...prev, 
                    category_id: catId,
                    description: prev.description === '' && category ? category.name : prev.description
                  }));
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all appearance-none"
              >
                <option value="">Sem Categoria</option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</label>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setFormData({ ...formData, status: 'confirmed' })}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                  formData.status === 'confirmed' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-400"
                )}
              >
                Confirmado
              </button>
              <button 
                type="button"
                onClick={() => setFormData({ ...formData, status: 'pending' })}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                  formData.status === 'pending' ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-slate-200 text-slate-400"
                )}
              >
                Pendente
              </button>
            </div>
          </div>

          {!editingTransaction && (
            <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={formData.isRecurring}
                  onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })}
                  className="w-5 h-5 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex items-center gap-2">
                  <Repeat size={16} className={formData.isRecurring ? "text-emerald-600" : "text-slate-400"} />
                  <span className="text-sm font-bold text-slate-700">Tornar Recorrente</span>
                </div>
              </label>

              {formData.isRecurring && (
                <div className="pl-8 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Duração (meses)</p>
                  <div className="flex gap-2">
                    {['3', '6', '12', '24'].map(m => (
                      <button 
                        key={m}
                        type="button"
                        onClick={() => setFormData({ ...formData, recurringMonths: m })}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          formData.recurringMonths === m ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                    <input 
                      type="number"
                      value={formData.recurringMonths}
                      onChange={e => setFormData({ ...formData, recurringMonths: e.target.value })}
                      className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="Outro"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98]"
          >
            {editingTransaction ? 'Salvar Alterações' : 'Criar Transação'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function BankModal({ isOpen, onClose, onSuccess, editingBank }: { isOpen: boolean, onClose: () => void, onSuccess: () => void, editingBank: Bank | null }) {
  const [formData, setFormData] = useState({ name: '', balance: '' });

  useEffect(() => {
    if (editingBank) {
      setFormData({
        name: editingBank.name,
        balance: editingBank.balance.toString()
      });
    } else {
      setFormData({ name: '', balance: '' });
    }
  }, [editingBank, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const balance = parseFloat(formData.balance || '0');
      
      if (editingBank) {
        const { error } = await supabase
          .from('banks')
          .update({ name: formData.name, balance })
          .eq('id', editingBank.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('banks')
          .insert({ name: formData.name, balance });
        if (error) throw error;
      }
      
      onSuccess();
      setFormData({ name: '', balance: '' });
    } catch (error) {
      console.error('Bank submit error:', error);
      alert('Erro ao salvar banco.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold">{editingBank ? 'Editar Banco' : 'Novo Banco'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome do Banco</label>
            <input 
              required
              type="text" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="Ex: Nubank, Itaú..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Inicial (Opcional)</label>
            <input 
              type="number" 
              step="0.01"
              value={formData.balance}
              onChange={e => setFormData({ ...formData, balance: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="R$ 0,00"
            />
          </div>
          <button 
            type="submit"
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors mt-4"
          >
            {editingBank ? 'Salvar Alterações' : 'Criar Banco'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function CategoryModal({ isOpen, onClose, onSuccess, editingCategory }: { isOpen: boolean, onClose: () => void, onSuccess: () => void, editingCategory: Category | null }) {
  const [formData, setFormData] = useState({ name: '', type: 'expense' as 'income' | 'expense' });

  useEffect(() => {
    if (editingCategory) {
      setFormData({
        name: editingCategory.name,
        type: editingCategory.type
      });
    } else {
      setFormData({ name: '', type: 'expense' });
    }
  }, [editingCategory, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update(formData)
          .eq('id', editingCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categories')
          .insert(formData);
        if (error) throw error;
      }
      
      onSuccess();
    } catch (error) {
      console.error('Category submit error:', error);
      alert('Erro ao salvar categoria.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold">{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, type: 'expense' })}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold transition-all",
                formData.type === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
              )}
            >
              Despesa
            </button>
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, type: 'income' })}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold transition-all",
                formData.type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
              )}
            >
              Entrada
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nome da Categoria</label>
            <input 
              required
              type="text" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              placeholder="Ex: Alimentação, Lazer, Salário..."
            />
          </div>
          <button 
            type="submit"
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors mt-4"
          >
            {editingCategory ? 'Salvar Alterações' : 'Criar Categoria'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
