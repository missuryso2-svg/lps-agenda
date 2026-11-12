export type ManagedBarber = {
  id: string;
  name: string;
  phone: string | null;
  bio: string | null;
  is_active: boolean;
  display_order: number;
  serviceIds: string[];
};

export type CatalogService = {
  id: string;
  name: string;
  price_cents: number;
  duration_minutes: number;
  is_active: boolean;
};
