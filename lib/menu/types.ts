export type MenuItem = {
  originalName?: string;
  originalDescription?: string | null;
  id: string;
  name: string;
  description: string | null;
  price_vnd: number;
  tags: string[];
  image_url: string | null;
  is_sold_out: boolean;
};

export type MenuSection = {
  originalTitle?: string;
  originalNote?: string | null;
  id: string;
  slug: string;
  title: string;
  note: string | null;
  items: MenuItem[];
};

/** Raw rows as stored (with per-locale overrides) — used by the manager UI. */
export type MenuItemRow = {
  id: string;
  section_id: string;
  name: string;
  name_i18n: Record<string, string>;
  name_i18n_sources?: Record<string, string | null>;
  description: string | null;
  description_i18n: Record<string, string>;
  description_i18n_sources?: Record<string, string | null>;
  price_vnd: number;
  tags: string[];
  image_url: string | null;
  is_available: boolean;
  is_sold_out: boolean;
  sort: number;
};

export type MenuSectionRow = {
  id: string;
  slug: string;
  title: string;
  title_i18n: Record<string, string>;
  title_i18n_sources?: Record<string, string | null>;
  note: string | null;
  note_i18n: Record<string, string>;
  note_i18n_sources?: Record<string, string | null>;
  sort: number;
  is_visible: boolean;
  items: MenuItemRow[];
};
