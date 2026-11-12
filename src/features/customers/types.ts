export type ManagedCustomer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerStatus = "active" | "archived" | "all";

export type CustomerListResult = {
  rows: ManagedCustomer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error: boolean;
};

export type CustomerStats = {
  active: number;
  archived: number;
  total: number;
};
