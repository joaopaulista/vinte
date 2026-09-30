export type ReconciliationStatus = 'pending' | 'approved' | 'rejected';

export interface Category {
  id: string;
  user_id: string | null;
  parent_category_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string;
}

/** Categoria pai já com as subcategorias aninhadas. */
export interface CategoryTree extends Category {
  children: Category[];
}

export interface BankConnection {
  id: string;
  user_id: string;
  pluggy_item_id: string;
  institution_name: string | null;
  status: string;
  last_synced_at: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  bank_connection_id: string;
  pluggy_account_id: string | null;
  name: string | null;
  type: string | null;
  balance: number | null;
  currency: string;
  updated_at: string;
  created_at: string;
}

export interface AccountWithConnection extends Account {
  bank_connection: Pick<BankConnection, 'id' | 'institution_name' | 'status'> | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  pluggy_transaction_id: string | null;
  description: string | null;
  amount: number;
  transaction_date: string;
  type: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  reconciliation_status: ReconciliationStatus;
  reconciled_at: string | null;
  notes: string | null;
  /** A categoria veio de uma regra, não de uma escolha do usuário. */
  auto_categorized: boolean;
  created_at: string;
}

/** Transação com os relacionamentos que o app costuma exibir junto. */
export interface TransactionWithRelations extends Transaction {
  account: Pick<Account, 'id' | 'name'> | null;
  category: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null;
  subcategory: Pick<Category, 'id' | 'name'> | null;
}

/** Retorno da Edge Function `sync-transactions`. */
export interface SyncResult {
  connections: number;
  accountsSynced: number;
  transactionsInserted: number;
}

export interface TransactionFilters {
  status: ReconciliationStatus | 'all';
  categoryId: string | 'all';
  from: string | null;
  to: string | null;
  search: string;
}
