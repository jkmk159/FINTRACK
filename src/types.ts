export interface Bank {
  id: number;
  name: string;
  balance: number;
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
}

export interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date: string;
  status: 'pending' | 'confirmed';
  bank_id: number | null;
  bank_name?: string;
  category_id?: number | null;
  category_name?: string;
  recurring_id?: string | null;
}
