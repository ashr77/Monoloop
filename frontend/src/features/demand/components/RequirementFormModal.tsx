'use client';

import { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';
import { MaterialRequirement, Organization } from '@/lib/types';
import { DEMO_ORGANIZATIONS, MATERIAL_FAMILIES, MATERIAL_SPECIFICATIONS } from '@/lib/constants';
import { DEMO_BUYER_ORGANIZATIONS } from '@/features/demand/data/demoBuyers';
import { isDemandSpecificationValid } from '@/features/demand/validation';
import { useSaveRequirement } from '@/hooks';
import { errorMessage } from '@/lib/api/client';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData: MaterialRequirement | null;
  organizations: Organization[];
  selectedOrgId?: string;
}

export function RequirementFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  organizations,
  selectedOrgId,
}: Props) {
  const saveRequirement = useSaveRequirement();
  const buyers = organizations.filter(
    (organization) =>
      organization.organization_type === 'BUYER' ||
      organization.organization_type === 'HYBRID'
  );
  const [organizationId, setOrganizationId] = useState(
    initialData?.organization_id ||
      selectedOrgId ||
      DEMO_ORGANIZATIONS.find((org) => org.organization_type === 'BUYER')?.id ||
      DEMO_BUYER_ORGANIZATIONS[0].id
  );
  const [family, setFamily] = useState<(typeof MATERIAL_FAMILIES)[number]>(
    initialData?.material_family || 'STAINLESS_STEEL_SHEET'
  );
  const [specification, setSpecification] = useState<string>(
    initialData?.material_specification || MATERIAL_SPECIFICATIONS.STAINLESS_STEEL_SHEET[0]
  );
  const [length, setLength] = useState(initialData?.length_mm.toString() || '');
  const [width, setWidth] = useState(initialData?.width_mm.toString() || '');
  const [thickness, setThickness] = useState(initialData?.thickness_mm.toString() || '');
  const [quantity, setQuantity] = useState(initialData?.required_quantity.toString() || '');
  const [budget, setBudget] = useState(initialData?.maximum_budget_bdt?.toString() || '');
  const [allowSplit, setAllowSplit] = useState(initialData?.allow_split_suppliers ?? true);
  const [status, setStatus] = useState<'OPEN' | 'FULFILLED' | 'CANCELLED'>(
    initialData?.status || 'OPEN'
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setOrganizationId(
      initialData?.organization_id ||
        selectedOrgId ||
        DEMO_ORGANIZATIONS.find((org) => org.organization_type === 'BUYER')?.id ||
        DEMO_BUYER_ORGANIZATIONS[0].id
    );
    setFamily(initialData?.material_family || 'STAINLESS_STEEL_SHEET');
    setSpecification(
      initialData?.material_specification ||
        MATERIAL_SPECIFICATIONS.STAINLESS_STEEL_SHEET[0]
    );
    setLength(initialData?.length_mm.toString() || '');
    setWidth(initialData?.width_mm.toString() || '');
    setThickness(initialData?.thickness_mm.toString() || '');
    setQuantity(initialData?.required_quantity.toString() || '');
    setBudget(initialData?.maximum_budget_bdt?.toString() || '');
    setAllowSplit(initialData?.allow_split_suppliers ?? true);
    setStatus(initialData?.status || 'OPEN');
    setErrors({});
    setGeneralError('');
  }, [isOpen, initialData, selectedOrgId]);

  if (!isOpen) return null;

  const onFamilyChange = (value: (typeof MATERIAL_FAMILIES)[number]) => {
    setFamily(value);
    setSpecification(MATERIAL_SPECIFICATIONS[value][0]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setGeneralError('');

    const nextErrors: Record<string, string> = {};
    const len = Number(length);
    const wid = Number(width);
    const thk = Number(thickness);
    const qty = Number(quantity);
    const maxBudget = budget === '' ? null : Number(budget);
    if (!organizationId) nextErrors.organization_id = 'Buyer organization is required';
    if (!specification) nextErrors.material_specification = 'Material specification is required';
    if (!isDemandSpecificationValid(family, specification)) {
      nextErrors.material_specification = 'Select a specification supported for this material family';
    }
    if (!Number.isFinite(len) || len <= 0) nextErrors.length_mm = 'Length must be greater than 0 mm';
    if (!Number.isFinite(wid) || wid <= 0) nextErrors.width_mm = 'Width must be greater than 0 mm';
    if (!Number.isFinite(thk) || thk <= 0) nextErrors.thickness_mm = 'Thickness must be greater than 0 mm';
    if (!Number.isInteger(qty) || qty <= 0) nextErrors.required_quantity = 'Quantity must be a positive whole number';
    if (maxBudget !== null && (!Number.isFinite(maxBudget) || maxBudget < 0)) {
      nextErrors.maximum_budget_bdt = 'Maximum budget cannot be negative';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        organization_id: organizationId,
        material_family: family,
        material_specification: specification,
        length_mm: len,
        width_mm: wid,
        thickness_mm: thk,
        required_quantity: qty,
        quantity_unit: 'PIECE',
        maximum_budget_bdt: maxBudget,
        allow_split_suppliers: allowSplit,
        ...(initialData ? { status } : {}),
      };
      await saveRequirement.mutateAsync({ id: initialData?.id, body: payload, organizationId });
      onSuccess();
      onClose();
    } catch (error) {
      setGeneralError(errorMessage(error, 'Failed to save requirement.'));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {initialData ? 'Edit Requirement' : 'New Material Requirement'}
            </h2>
            <p className="text-xs text-slate-500">All dimensions are in millimeters.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-5">
          {generalError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{generalError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm font-medium text-slate-700">
              Buyer organization
              <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">Select buyer</option>
                {buyers.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
              {errors.organization_id && <span className="block mt-1 text-xs text-red-600">{errors.organization_id}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Material family
              <select value={family} onChange={(event) => onFamilyChange(event.target.value as typeof family)} className={`${fieldClass} mt-1`}>
                {MATERIAL_FAMILIES.map((materialFamily) => (
                  <option key={materialFamily} value={materialFamily}>
                    {materialFamily === 'STAINLESS_STEEL_SHEET' ? 'Stainless Steel Sheet' : 'Plywood Panel'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Material specification
              <select value={specification} onChange={(event) => setSpecification(event.target.value)} className={`${fieldClass} mt-1`}>
                {MATERIAL_SPECIFICATIONS[family].map((materialSpecification) => (
                  <option key={materialSpecification} value={materialSpecification}>
                    {materialSpecification}
                  </option>
                ))}
              </select>
              {errors.material_specification && <span className="block mt-1 text-xs text-red-600">{errors.material_specification}</span>}
            </label>
            {initialData && (
              <label className="text-sm font-medium text-slate-700">
                Status
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as 'OPEN' | 'FULFILLED' | 'CANCELLED')
                  }
                  className={`${fieldClass} mt-1`}
                >
                  <option value="OPEN">OPEN</option>
                  <option value="FULFILLED">FULFILLED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </label>
            )}
            {[
              ['length', 'Length (mm)', length, setLength],
              ['width', 'Width (mm)', width, setWidth],
              ['thickness', 'Thickness (mm)', thickness, setThickness],
              ['quantity', 'Required quantity (pieces)', quantity, setQuantity],
              ['budget', 'Maximum budget (BDT)', budget, setBudget],
            ].map(([name, label, value, setter]) => (
              <label key={name as string} className="text-sm font-medium text-slate-700">
                {label as string}
                <input
                  type="number"
                  step={name === 'quantity' ? '1' : 'any'}
                  min={name === 'budget' ? '0' : '0'}
                  value={value as string}
                  onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                  className={`${fieldClass} mt-1`}
                />
                {errors[`${name === 'length' ? 'length_mm' : name === 'width' ? 'width_mm' : name === 'thickness' ? 'thickness_mm' : name === 'quantity' ? 'required_quantity' : 'maximum_budget_bdt'}`] && (
                  <span className="block mt-1 text-xs text-red-600">
                    {errors[`${name === 'length' ? 'length_mm' : name === 'width' ? 'width_mm' : name === 'thickness' ? 'thickness_mm' : name === 'quantity' ? 'required_quantity' : 'maximum_budget_bdt'}`]}
                  </span>
                )}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={allowSplit} onChange={(event) => setAllowSplit(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            Allow multiple suppliers to fulfill this requirement
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg border border-slate-300 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
              <Save className="w-4 h-4" />
              {submitting ? 'Saving...' : initialData ? 'Save Changes' : 'Publish Requirement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
