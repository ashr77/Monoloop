// ============================================================================
// MONOLOOP - Data Access Repository (Supabase with Explicit Error Handling)
// TSUNAGU Hackathon 2026
// Provides real PostgreSQL persistence when configured, with explicit errors
// (NO silent fallback) and isolated demo mode when unconfigured.
// ============================================================================

import { getSupabaseServerClient, isSupabaseConfigured } from './server';
import { MaterialListing, Organization } from '@/lib/types';
import { SEED_LISTINGS, SEED_ORGANIZATIONS } from '@/data/seed';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Local in-memory store for fallback/dev/testing
declare global {
  // eslint-disable-next-line no-var
  var __monoloop_listings: MaterialListing[] | undefined;
  // eslint-disable-next-line no-var
  var __monoloop_organizations: Organization[] | undefined;
  // eslint-disable-next-line no-var
  var __monoloop_force_mock: boolean | undefined;
}

if (!globalThis.__monoloop_listings) {
  globalThis.__monoloop_listings = JSON.parse(JSON.stringify(SEED_LISTINGS));
}

if (!globalThis.__monoloop_organizations) {
  globalThis.__monoloop_organizations = JSON.parse(JSON.stringify(SEED_ORGANIZATIONS));
}

function getLocalListings(): MaterialListing[] {
  return globalThis.__monoloop_listings!;
}

function getLocalOrganizations(): Organization[] {
  return globalThis.__monoloop_organizations!;
}

export interface ListingFilterOptions {
  organizationId?: string;
  materialFamily?: string;
  search?: string;
  status?: string;
}

export const listingRepository = {
  // Mode controls
  setMockMode(enabled: boolean) {
    globalThis.__monoloop_force_mock = enabled;
  },

  isMockMode(): boolean {
    if (globalThis.__monoloop_force_mock) return true;
    return !isSupabaseConfigured();
  },

  // --- ORGANIZATIONS ---
  async getOrganizations(): Promise<Organization[]> {
    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        throw new Error('Database client could not be initialized.');
      }
      const { data, error } = await supabase.from('organizations').select('*').order('name');
      if (error) {
        console.error('[Repository] Failed to fetch organizations from Supabase:', error.message);
        throw new Error(`Database error while fetching organizations: ${error.message}`);
      }
      return (data || []) as Organization[];
    }

    return getLocalOrganizations();
  },

  async getOrganizationById(id: string): Promise<Organization | null> {
    if (!this.isMockMode()) {
      if (!UUID_REGEX.test(id)) return null;
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        throw new Error('Database client could not be initialized.');
      }
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error(`[Repository] Failed to fetch organization ${id}:`, error.message);
        throw new Error(`Database error while fetching organization: ${error.message}`);
      }
      return data as Organization | null;
    }

    const local = getLocalOrganizations().find((o) => o.id === id);
    return local || null;
  },

  // --- LISTINGS ---
  async getListings(filters: ListingFilterOptions = {}): Promise<MaterialListing[]> {
    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        throw new Error('Database client could not be initialized.');
      }

      let query = supabase.from('listings').select('*, organization:organizations(*)');

      if (filters.organizationId) {
        query = query.eq('organization_id', filters.organizationId);
      }
      if (filters.materialFamily) {
        query = query.eq('material_family', filters.materialFamily);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.search) {
        query = query.or(
          `description.ilike.%${filters.search}%,material_specification.ilike.%${filters.search}%,city.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('[Repository] Failed to fetch listings from Supabase:', error.message);
        throw new Error(`Database error while retrieving listings: ${error.message}`);
      }

      return (data || []).map((item) => ({
        ...item,
        available_quantity: item.total_quantity - item.reserved_quantity,
      })) as MaterialListing[];
    }

    // Local fallback for unconfigured / mock mode
    let results = [...getLocalListings()];
    const orgs = getLocalOrganizations();

    if (filters.organizationId) {
      results = results.filter((l) => l.organization_id === filters.organizationId);
    }
    if (filters.materialFamily) {
      results = results.filter((l) => l.material_family === filters.materialFamily);
    }
    if (filters.status) {
      results = results.filter((l) => l.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (l) =>
          l.material_specification.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q))
      );
    }

    return results
      .map((l) => ({
        ...l,
        available_quantity: l.total_quantity - l.reserved_quantity,
        organization: orgs.find((o) => o.id === l.organization_id),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getListingById(id: string): Promise<MaterialListing | null> {
    if (!this.isMockMode()) {
      if (!UUID_REGEX.test(id)) return null;
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        throw new Error('Database client could not be initialized.');
      }

      const { data, error } = await supabase
        .from('listings')
        .select('*, organization:organizations(*)')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error(`[Repository] Failed to fetch listing ${id}:`, error.message);
        throw new Error(`Database error while fetching listing: ${error.message}`);
      }

      if (!data) return null;

      return {
        ...data,
        available_quantity: data.total_quantity - data.reserved_quantity,
      } as MaterialListing;
    }

    const item = getLocalListings().find((l) => l.id === id);
    if (!item) return null;

    const orgs = getLocalOrganizations();
    return {
      ...item,
      available_quantity: item.total_quantity - item.reserved_quantity,
      organization: orgs.find((o) => o.id === item.organization_id),
    };
  },

  async createListing(
    payload: Omit<
      MaterialListing,
      'id' | 'reserved_quantity' | 'available_quantity' | 'created_at' | 'updated_at'
    >
  ): Promise<MaterialListing> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const newListingData = {
      ...payload,
      id,
      reserved_quantity: 0,
      status: payload.status || 'ACTIVE',
      created_at: now,
      updated_at: now,
    };

    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        throw new Error('Database client could not be initialized.');
      }

      const { data, error } = await supabase
        .from('listings')
        .insert({
          id: newListingData.id,
          organization_id: newListingData.organization_id,
          material_family: newListingData.material_family,
          material_specification: newListingData.material_specification,
          length_mm: newListingData.length_mm,
          width_mm: newListingData.width_mm,
          thickness_mm: newListingData.thickness_mm,
          total_quantity: newListingData.total_quantity,
          reserved_quantity: 0,
          quantity_unit: newListingData.quantity_unit,
          condition: newListingData.condition,
          unit_price_bdt: newListingData.unit_price_bdt,
          description: newListingData.description,
          image_url: newListingData.image_url,
          city: newListingData.city,
          status: newListingData.status,
          created_at: newListingData.created_at,
          updated_at: newListingData.updated_at,
        })
        .select('*, organization:organizations(*)')
        .single();

      if (error) {
        console.error('[Repository] Failed to insert listing into Supabase:', error.message);
        throw new Error(`Database error while saving listing: ${error.message}`);
      }

      return {
        ...data,
        available_quantity: data.total_quantity - data.reserved_quantity,
      } as MaterialListing;
    }

    // In-memory mock mode
    const inMemListing: MaterialListing = {
      ...newListingData,
      available_quantity: newListingData.total_quantity,
    };
    getLocalListings().unshift(inMemListing);
    const orgs = getLocalOrganizations();
    return {
      ...inMemListing,
      organization: orgs.find((o) => o.id === inMemListing.organization_id),
    };
  },

  async updateListing(
    id: string,
    updates: Partial<
      Omit<
        MaterialListing,
        | 'id'
        | 'reserved_quantity'
        | 'available_quantity'
        | 'created_at'
        | 'updated_at'
        | 'organization_id'
      >
    >
  ): Promise<MaterialListing | null> {
    const existing = await this.getListingById(id);
    if (!existing) return null;

    // Invariant check: cannot reduce total_quantity below reserved_quantity
    if (
      updates.total_quantity !== undefined &&
      updates.total_quantity < existing.reserved_quantity
    ) {
      throw new Error(
        `Cannot reduce total quantity (${updates.total_quantity}) below currently reserved quantity (${existing.reserved_quantity}).`
      );
    }

    const now = new Date().toISOString();

    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        throw new Error('Database client could not be initialized.');
      }

      const safeUpdates: Record<string, unknown> = {
        updated_at: now,
      };

      if (updates.material_family !== undefined)
        safeUpdates.material_family = updates.material_family;
      if (updates.material_specification !== undefined)
        safeUpdates.material_specification = updates.material_specification;
      if (updates.length_mm !== undefined) safeUpdates.length_mm = updates.length_mm;
      if (updates.width_mm !== undefined) safeUpdates.width_mm = updates.width_mm;
      if (updates.thickness_mm !== undefined) safeUpdates.thickness_mm = updates.thickness_mm;
      if (updates.total_quantity !== undefined)
        safeUpdates.total_quantity = updates.total_quantity;
      if (updates.condition !== undefined) safeUpdates.condition = updates.condition;
      if (updates.unit_price_bdt !== undefined)
        safeUpdates.unit_price_bdt = updates.unit_price_bdt;
      if (updates.description !== undefined) safeUpdates.description = updates.description;
      if (updates.image_url !== undefined) safeUpdates.image_url = updates.image_url;
      if (updates.city !== undefined) safeUpdates.city = updates.city;
      if (updates.status !== undefined) safeUpdates.status = updates.status;

      const { data, error } = await supabase
        .from('listings')
        .update(safeUpdates)
        .eq('id', id)
        .select('*, organization:organizations(*)')
        .single();

      if (error) {
        console.error(`[Repository] Failed to update listing ${id}:`, error.message);
        throw new Error(`Database error while updating listing: ${error.message}`);
      }

      return {
        ...data,
        available_quantity: data.total_quantity - data.reserved_quantity,
      } as MaterialListing;
    }

    // In-memory update
    const idx = getLocalListings().findIndex((l) => l.id === id);
    if (idx === -1) return null;

    const current = getLocalListings()[idx];
    const newTotal =
      updates.total_quantity !== undefined ? updates.total_quantity : current.total_quantity;

    const updated: MaterialListing = {
      ...current,
      ...updates,
      id: current.id,
      organization_id: current.organization_id,
      reserved_quantity: current.reserved_quantity, // Strictly protected
      total_quantity: newTotal,
      available_quantity: newTotal - current.reserved_quantity,
      updated_at: now,
    };

    getLocalListings()[idx] = updated;
    const orgs = getLocalOrganizations();
    return {
      ...updated,
      organization: orgs.find((o) => o.id === updated.organization_id),
    };
  },

  async archiveListing(id: string): Promise<MaterialListing | null> {
    return this.updateListing(id, { status: 'ARCHIVED' });
  },

  // Test helper to reset local in-memory store
  _resetStore() {
    globalThis.__monoloop_listings = JSON.parse(JSON.stringify(SEED_LISTINGS));
    globalThis.__monoloop_organizations = JSON.parse(JSON.stringify(SEED_ORGANIZATIONS));
  },
};
