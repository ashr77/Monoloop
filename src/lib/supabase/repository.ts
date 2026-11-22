// ============================================================================
// MONOLOOP - Data Access Repository (Supabase with Robust In-Memory Fallback)
// TSUNAGU Hackathon 2026
// Provides seamless persistence across live Supabase or local sandbox.
// ============================================================================

import { getSupabaseServerClient } from './server';
import { MaterialListing, Organization } from '@/lib/types';
import { SEED_LISTINGS, SEED_ORGANIZATIONS } from '@/data/seed';

// Local in-memory store for fallback/dev/testing
// We use a global variable to persist across hot reloads in Next.js development
declare global {
  // eslint-disable-next-line no-var
  var __monoloop_listings: MaterialListing[] | undefined;
  // eslint-disable-next-line no-var
  var __monoloop_organizations: Organization[] | undefined;
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
  // --- ORGANIZATIONS ---
  async getOrganizations(): Promise<Organization[]> {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.from('organizations').select('*').order('name');
      if (!error && data) {
        return data as Organization[];
      }
      console.warn('[Repository] Supabase getOrganizations failed, falling back to local seed:', error?.message);
    }
    return getLocalOrganizations();
  },

  async getOrganizationById(id: string): Promise<Organization | null> {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.from('organizations').select('*').eq('id', id).single();
      if (!error && data) {
        return data as Organization;
      }
    }
    const local = getLocalOrganizations().find((o) => o.id === id);
    return local || null;
  },

  // --- LISTINGS ---
  async getListings(filters: ListingFilterOptions = {}): Promise<MaterialListing[]> {
    const supabase = getSupabaseServerClient();
    if (supabase) {
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
        query = query.or(`description.ilike.%${filters.search}%,material_specification.ilike.%${filters.search}%,city.ilike.%${filters.search}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) {
        return data.map((item) => ({
          ...item,
          available_quantity: item.total_quantity - item.reserved_quantity,
        })) as MaterialListing[];
      }
      console.warn('[Repository] Supabase getListings query failed, falling back to local store:', error?.message);
    }

    // Local fallback
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

    // Attach organization details
    return results
      .map((l) => ({
        ...l,
        available_quantity: l.total_quantity - l.reserved_quantity,
        organization: orgs.find((o) => o.id === l.organization_id),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getListingById(id: string): Promise<MaterialListing | null> {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('listings')
        .select('*, organization:organizations(*)')
        .eq('id', id)
        .single();
      if (!error && data) {
        return {
          ...data,
          available_quantity: data.total_quantity - data.reserved_quantity,
        } as MaterialListing;
      }
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
    payload: Omit<MaterialListing, 'id' | 'reserved_quantity' | 'available_quantity' | 'created_at' | 'updated_at'>
  ): Promise<MaterialListing> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // Enforce business rules
    const newListing: MaterialListing = {
      ...payload,
      id,
      reserved_quantity: 0, // Always initialized to 0
      available_quantity: payload.total_quantity,
      status: payload.status || 'ACTIVE',
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('listings')
        .insert({
          id: newListing.id,
          organization_id: newListing.organization_id,
          material_family: newListing.material_family,
          material_specification: newListing.material_specification,
          length_mm: newListing.length_mm,
          width_mm: newListing.width_mm,
          thickness_mm: newListing.thickness_mm,
          total_quantity: newListing.total_quantity,
          reserved_quantity: 0,
          quantity_unit: newListing.quantity_unit,
          condition: newListing.condition,
          unit_price_bdt: newListing.unit_price_bdt,
          description: newListing.description,
          image_url: newListing.image_url,
          city: newListing.city,
          status: newListing.status,
          created_at: newListing.created_at,
          updated_at: newListing.updated_at,
        })
        .select('*, organization:organizations(*)')
        .single();

      if (!error && data) {
        // Also keep local sync for tests
        getLocalListings().unshift({
          ...data,
          available_quantity: data.total_quantity - data.reserved_quantity,
        });
        return {
          ...data,
          available_quantity: data.total_quantity - data.reserved_quantity,
        } as MaterialListing;
      }
      console.warn('[Repository] Supabase createListing failed, saving locally:', error?.message);
    }

    getLocalListings().unshift(newListing);
    const orgs = getLocalOrganizations();
    return {
      ...newListing,
      organization: orgs.find((o) => o.id === newListing.organization_id),
    };
  },

  async updateListing(
    id: string,
    updates: Partial<Omit<MaterialListing, 'id' | 'reserved_quantity' | 'available_quantity' | 'created_at' | 'updated_at' | 'organization_id'>>
  ): Promise<MaterialListing | null> {
    const existing = await this.getListingById(id);
    if (!existing) return null;

    // Validate that total_quantity is not reduced below reserved_quantity
    if (updates.total_quantity !== undefined && updates.total_quantity < existing.reserved_quantity) {
      throw new Error(
        `Cannot reduce total quantity (${updates.total_quantity}) below currently reserved quantity (${existing.reserved_quantity}).`
      );
    }

    const now = new Date().toISOString();
    const supabase = getSupabaseServerClient();

    if (supabase) {
      // Build safe update object (explicitly exclude reserved_quantity)
      const safeUpdates: Record<string, unknown> = {
        updated_at: now,
      };

      if (updates.material_family !== undefined) safeUpdates.material_family = updates.material_family;
      if (updates.material_specification !== undefined) safeUpdates.material_specification = updates.material_specification;
      if (updates.length_mm !== undefined) safeUpdates.length_mm = updates.length_mm;
      if (updates.width_mm !== undefined) safeUpdates.width_mm = updates.width_mm;
      if (updates.thickness_mm !== undefined) safeUpdates.thickness_mm = updates.thickness_mm;
      if (updates.total_quantity !== undefined) safeUpdates.total_quantity = updates.total_quantity;
      if (updates.condition !== undefined) safeUpdates.condition = updates.condition;
      if (updates.unit_price_bdt !== undefined) safeUpdates.unit_price_bdt = updates.unit_price_bdt;
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

      if (!error && data) {
        const updatedLocal = {
          ...data,
          available_quantity: data.total_quantity - data.reserved_quantity,
        };
        const idx = getLocalListings().findIndex((l) => l.id === id);
        if (idx !== -1) getLocalListings()[idx] = updatedLocal;
        return updatedLocal as MaterialListing;
      }
      console.warn('[Repository] Supabase updateListing failed, updating locally:', error?.message);
    }

    // Local update
    const idx = getLocalListings().findIndex((l) => l.id === id);
    if (idx === -1) return null;

    const current = getLocalListings()[idx];
    const newTotal = updates.total_quantity !== undefined ? updates.total_quantity : current.total_quantity;

    const updated: MaterialListing = {
      ...current,
      ...updates,
      id: current.id,
      organization_id: current.organization_id,
      reserved_quantity: current.reserved_quantity, // PROTECTED
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
