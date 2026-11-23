import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { SEED_ORGANIZATIONS, SEED_REQUIREMENTS } from '@/data/seed';
import { MaterialRequirement, Organization } from '@/lib/types';
import {
  DEMO_BUYER_ORGANIZATIONS,
  DEMO_BUYER_REQUIREMENTS,
} from '@/features/demand/data/demoBuyers';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare global {
  // eslint-disable-next-line no-var
  var __monoloop_requirements: MaterialRequirement[] | undefined;
  // eslint-disable-next-line no-var
  var __monoloop_force_requirements_mock: boolean | undefined;
}

const DEMO_REQUIREMENTS: MaterialRequirement[] = [
  ...[
    {
      id: 'd2222222-2222-4222-d222-222222222222',
      organization_id: 'b1111111-1111-4111-b111-111111111111',
      material_family: 'STAINLESS_STEEL_SHEET',
      material_specification: 'SS201',
      length_mm: 2000,
      width_mm: 1000,
      thickness_mm: 1.5,
      required_quantity: 25,
      maximum_budget_bdt: 72000,
      allow_split_suppliers: false,
      condition_requirement: 'UNUSED',
      created_at: '2026-02-21T09:30:00.000Z',
    },
    {
      id: 'd3333333-3333-4333-d333-333333333333',
      organization_id: 'b2222222-2222-4222-b222-222222222222',
      material_family: 'PLYWOOD_PANEL',
      material_specification: 'PLYWOOD_STANDARD',
      length_mm: 2440,
      width_mm: 1220,
      thickness_mm: 18,
      required_quantity: 40,
      maximum_budget_bdt: 76000,
      allow_split_suppliers: true,
      condition_requirement: 'ANY',
      created_at: '2026-02-22T09:30:00.000Z',
    },
  ].map((item) => ({
    ...item,
    material_family: item.material_family as MaterialRequirement['material_family'],
    material_specification: item.material_specification as MaterialRequirement['material_specification'],
    quantity_unit: 'PIECE' as const,
    condition_requirement: item.condition_requirement as MaterialRequirement['condition_requirement'],
    status: 'OPEN' as const,
  })),
];

if (!globalThis.__monoloop_requirements) {
  globalThis.__monoloop_requirements = JSON.parse(
    JSON.stringify([
      ...SEED_REQUIREMENTS,
      ...DEMO_REQUIREMENTS,
      ...DEMO_BUYER_REQUIREMENTS,
    ])
  );
}

function getLocalRequirements(): MaterialRequirement[] {
  return globalThis.__monoloop_requirements!;
}

function getLocalOrganizations(): Organization[] {
  return [...SEED_ORGANIZATIONS, ...DEMO_BUYER_ORGANIZATIONS];
}

export interface RequirementFilterOptions {
  organizationId?: string;
  materialFamily?: string;
  status?: string;
}

export const requirementRepository = {
  setMockMode(enabled: boolean) {
    globalThis.__monoloop_force_requirements_mock = enabled;
  },

  isMockMode(): boolean {
    if (globalThis.__monoloop_force_requirements_mock) return true;
    return !isSupabaseConfigured();
  },

  async getRequirements(filters: RequirementFilterOptions = {}): Promise<MaterialRequirement[]> {
    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) throw new Error('Database client could not be initialized.');

      let query = supabase.from('requirements').select('*, organization:organizations(*)');
      if (filters.organizationId) query = query.eq('organization_id', filters.organizationId);
      if (filters.materialFamily) query = query.eq('material_family', filters.materialFamily);
      if (filters.status) query = query.eq('status', filters.status);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        throw new Error(`Database error while retrieving requirements: ${error.message}`);
      }
      return (data || []) as MaterialRequirement[];
    }

    let requirements = [...getLocalRequirements()];
    if (filters.organizationId) {
      requirements = requirements.filter((item) => item.organization_id === filters.organizationId);
    }
    if (filters.materialFamily) {
      requirements = requirements.filter((item) => item.material_family === filters.materialFamily);
    }
    if (filters.status) {
      requirements = requirements.filter((item) => item.status === filters.status);
    }

    const organizations = getLocalOrganizations();
    return requirements
      .map((item) => ({
        ...item,
        organization: organizations.find((organization) => organization.id === item.organization_id),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getOrganizations(): Promise<Organization[]> {
    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) throw new Error('Database client could not be initialized.');

      const { data, error } = await supabase.from('organizations').select('*').order('name');
      if (error) {
        throw new Error(`Database error while retrieving organizations: ${error.message}`);
      }
      return (data || []) as Organization[];
    }

    return getLocalOrganizations();
  },

  async getOrganizationById(id: string): Promise<Organization | null> {
    if (!this.isMockMode()) {
      if (!UUID_REGEX.test(id)) return null;
      const supabase = getSupabaseServerClient();
      if (!supabase) throw new Error('Database client could not be initialized.');

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        throw new Error(`Database error while retrieving organization: ${error.message}`);
      }
      return data as Organization | null;
    }

    return getLocalOrganizations().find((organization) => organization.id === id) || null;
  },

  async getExchangeStatistics(
    requirementIds: string[]
  ): Promise<{ pendingMatchRequirementIds: string[]; fulfilledQuantities: Record<string, number> }> {
    if (requirementIds.length === 0) {
      return { pendingMatchRequirementIds: [], fulfilledQuantities: {} };
    }
    if (this.isMockMode()) {
      return { pendingMatchRequirementIds: [], fulfilledQuantities: {} };
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error('Database client could not be initialized.');

    const [pendingResult, fulfilledResult] = await Promise.all([
      supabase
        .from('exchanges')
        .select('requirement_id')
        .eq('status', 'PROPOSED')
        .in('requirement_id', requirementIds),
      supabase
        .from('exchange_items')
        .select('quantity, exchange:exchanges!inner(requirement_id, status)')
        .eq('status', 'COMPLETED')
        .in('exchange.requirement_id', requirementIds),
    ]);

    if (pendingResult.error) {
      throw new Error(`Database error while retrieving pending exchanges: ${pendingResult.error.message}`);
    }
    if (fulfilledResult.error) {
      throw new Error(`Database error while retrieving fulfilled exchange quantities: ${fulfilledResult.error.message}`);
    }

    const requirementIdSet = new Set(requirementIds);
    const pendingMatchRequirementIds = Array.from(
      new Set(
        (pendingResult.data || [])
          .map((exchange) => exchange.requirement_id)
          .filter((id): id is string => Boolean(id) && requirementIdSet.has(id as string))
      )
    );
    const fulfilledQuantities: Record<string, number> = {};
    for (const item of fulfilledResult.data || []) {
      for (const exchange of item.exchange) {
        const requirementId = exchange.requirement_id;
        if (
          requirementId &&
          requirementIdSet.has(requirementId) &&
          (exchange.status === 'IN_PROGRESS' || exchange.status === 'COMPLETED')
        ) {
          fulfilledQuantities[requirementId] =
            (fulfilledQuantities[requirementId] || 0) + Number(item.quantity);
        }
      }
    }

    return { pendingMatchRequirementIds, fulfilledQuantities };
  },

  async getRequirementById(id: string): Promise<MaterialRequirement | null> {
    if (!this.isMockMode()) {
      if (!UUID_REGEX.test(id)) return null;
      const supabase = getSupabaseServerClient();
      if (!supabase) throw new Error('Database client could not be initialized.');

      const { data, error } = await supabase
        .from('requirements')
        .select('*, organization:organizations(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        throw new Error(`Database error while retrieving requirement: ${error.message}`);
      }
      return data as MaterialRequirement | null;
    }

    const requirement = getLocalRequirements().find((item) => item.id === id);
    if (!requirement) return null;
    return {
      ...requirement,
      organization: getLocalOrganizations().find(
        (organization) => organization.id === requirement.organization_id
      ),
    };
  },

  async createRequirement(
    payload: Omit<MaterialRequirement, 'id' | 'created_at'>
  ): Promise<MaterialRequirement> {
    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) throw new Error('Database client could not be initialized.');

      const { data, error } = await supabase
        .from('requirements')
        .insert({
          organization_id: payload.organization_id,
          material_family: payload.material_family,
          material_specification: payload.material_specification,
          length_mm: payload.length_mm,
          width_mm: payload.width_mm,
          thickness_mm: payload.thickness_mm,
          required_quantity: payload.required_quantity,
          quantity_unit: payload.quantity_unit,
          maximum_budget_bdt: payload.maximum_budget_bdt,
          allow_split_suppliers: payload.allow_split_suppliers,
          condition_requirement: payload.condition_requirement,
          status: payload.status,
        })
        .select('*, organization:organizations(*)')
        .single();
      if (error) throw new Error(`Database error while saving requirement: ${error.message}`);
      return data as MaterialRequirement;
    }

    const requirement: MaterialRequirement = {
      ...payload,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      organization: getLocalOrganizations().find(
        (organization) => organization.id === payload.organization_id
      ),
    };
    getLocalRequirements().unshift(requirement);
    return requirement;
  },

  async updateRequirement(
    id: string,
    updates: Partial<
      Omit<MaterialRequirement, 'id' | 'organization_id' | 'created_at' | 'organization'>
    >
  ): Promise<MaterialRequirement | null> {
    if (!this.isMockMode()) {
      const supabase = getSupabaseServerClient();
      if (!supabase) throw new Error('Database client could not be initialized.');

      const safeUpdates: Record<string, unknown> = {};
      const allowedFields = [
        'material_family',
        'material_specification',
        'length_mm',
        'width_mm',
        'thickness_mm',
        'required_quantity',
        'quantity_unit',
        'maximum_budget_bdt',
        'allow_split_suppliers',
        'condition_requirement',
        'status',
      ] as const;
      for (const field of allowedFields) {
        if (updates[field] !== undefined) safeUpdates[field] = updates[field];
      }

      const { data, error } = await supabase
        .from('requirements')
        .update(safeUpdates)
        .eq('id', id)
        .select('*, organization:organizations(*)')
        .single();
      if (error) throw new Error(`Database error while updating requirement: ${error.message}`);
      return data as MaterialRequirement;
    }

    const index = getLocalRequirements().findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updated: MaterialRequirement = {
      ...getLocalRequirements()[index],
      ...updates,
      organization: getLocalOrganizations().find(
        (organization) =>
          organization.id === getLocalRequirements()[index].organization_id
      ),
    };
    getLocalRequirements()[index] = updated;
    return updated;
  },

  _resetStore() {
    globalThis.__monoloop_requirements = JSON.parse(JSON.stringify([
      ...SEED_REQUIREMENTS,
      ...DEMO_REQUIREMENTS,
      ...DEMO_BUYER_REQUIREMENTS,
    ]));
  },
};
