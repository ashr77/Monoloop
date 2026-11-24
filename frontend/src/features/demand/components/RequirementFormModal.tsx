'use client';

import { useEffect, useState } from 'react';
import { X, Save, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MaterialRequirement, Organization } from '@/lib/types';
import { DEMO_ORGANIZATIONS, MATERIAL_FAMILIES, MATERIAL_SPECIFICATIONS } from '@/lib/constants';
import { DEMO_BUYER_ORGANIZATIONS } from '@/features/demand/data/demoBuyers';
import { isDemandSpecificationValid } from '@/features/demand/validation';
import { useExtractRequirement, useSaveRequirement } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { RequirementExtractionResult } from '@/lib/ai/schemas';
import { useIdentity } from '@/lib/auth/AuthProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (requirement: MaterialRequirement) => void;
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
  const identity = useIdentity();
  const saveRequirement = useSaveRequirement();
  const extractRequirement = useExtractRequirement();
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
  const [lengthMin, setLengthMin] = useState(initialData?.length_min_mm?.toString() || initialData?.length_mm?.toString() || '');
  const [lengthMax, setLengthMax] = useState(initialData?.length_max_mm?.toString() || initialData?.length_mm?.toString() || '');
  const [widthMin, setWidthMin] = useState(initialData?.width_min_mm?.toString() || initialData?.width_mm?.toString() || '');
  const [widthMax, setWidthMax] = useState(initialData?.width_max_mm?.toString() || initialData?.width_mm?.toString() || '');
  const [thicknessMin, setThicknessMin] = useState(initialData?.thickness_min_mm?.toString() || initialData?.thickness_mm?.toString() || '');
  const [thicknessMax, setThicknessMax] = useState(initialData?.thickness_max_mm?.toString() || initialData?.thickness_mm?.toString() || '');
  const [quantity, setQuantity] = useState(initialData?.required_quantity.toString() || '');
  const [budget, setBudget] = useState(initialData?.maximum_budget_bdt?.toString() || '');
  const [condition, setCondition] = useState<'ANY' | 'UNUSED' | 'LEFTOVER' | 'OFFCUT'>(initialData?.condition_requirement || 'ANY');
  const [allowSplit, setAllowSplit] = useState(initialData?.allow_split_suppliers ?? true);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiResult, setAiResult] = useState<RequirementExtractionResult | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [aiMessageType, setAiMessageType] = useState<'error' | 'success'>('success');
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
    setLengthMin(initialData?.length_min_mm?.toString() || initialData?.length_mm?.toString() || '');
    setLengthMax(initialData?.length_max_mm?.toString() || initialData?.length_mm?.toString() || '');
    setWidthMin(initialData?.width_min_mm?.toString() || initialData?.width_mm?.toString() || '');
    setWidthMax(initialData?.width_max_mm?.toString() || initialData?.width_mm?.toString() || '');
    setThicknessMin(initialData?.thickness_min_mm?.toString() || initialData?.thickness_mm?.toString() || '');
    setThicknessMax(initialData?.thickness_max_mm?.toString() || initialData?.thickness_mm?.toString() || '');
    setQuantity(initialData?.required_quantity.toString() || '');
    setBudget(initialData?.maximum_budget_bdt?.toString() || '');
    setCondition(initialData?.condition_requirement || 'ANY');
    setAllowSplit(initialData?.allow_split_suppliers ?? true);
    setStatus(initialData?.status || 'OPEN');
    setAiPrompt('');
    setAiResult(null);
    setAiMessage('');
    setErrors({});
    setGeneralError('');
  }, [isOpen, initialData, selectedOrgId]);

  if (!isOpen) return null;

  const onFamilyChange = (value: (typeof MATERIAL_FAMILIES)[number]) => {
    setFamily(value);
    setSpecification(MATERIAL_SPECIFICATIONS[value][0]);
  };

  const handleAiExtract = async (useMock = false) => {
    if (aiPrompt.trim().length < 5) {
      setAiMessageType('error');
      setAiMessage('Please enter a description of at least 5 characters.');
      return;
    }
    setIsExtracting(true);
    setAiMessage('');
    setAiResult(null);
    try {
      const result = await extractRequirement.mutateAsync({ prompt: aiPrompt, mock: useMock });
      setAiResult(result);
      setAiMessageType('success');
      setAiMessage(`Extracted ${result.missing_fields.length} missing or unstated fields. Review and apply the draft.`);
    } catch (error) {
      setAiMessageType('error');
      setAiMessage(errorMessage(error, 'AI extraction could not be completed. You can fill out the form manually.'));
    } finally {
      setIsExtracting(false);
    }
  };

  const applyAiResult = () => {
    if (!aiResult) return;
    if (aiResult.material_family) {
      setFamily(aiResult.material_family);
      if (aiResult.material_specification) setSpecification(aiResult.material_specification);
    }
    if (aiResult.length_min_mm !== null) setLengthMin(String(aiResult.length_min_mm));
    if (aiResult.length_max_mm !== null) setLengthMax(String(aiResult.length_max_mm));
    if (aiResult.width_min_mm !== null) setWidthMin(String(aiResult.width_min_mm));
    if (aiResult.width_max_mm !== null) setWidthMax(String(aiResult.width_max_mm));
    if (aiResult.thickness_min_mm !== null) setThicknessMin(String(aiResult.thickness_min_mm));
    if (aiResult.thickness_max_mm !== null) setThicknessMax(String(aiResult.thickness_max_mm));
    if (aiResult.required_quantity !== null) setQuantity(String(aiResult.required_quantity));
    if (aiResult.maximum_budget_bdt !== null) setBudget(String(aiResult.maximum_budget_bdt));
    setCondition(aiResult.condition_requirement);
    setAllowSplit(aiResult.allow_split_suppliers);
  };

  const loadSample = () => {
    setAiPrompt(
      'I need around 100 pieces of SS304 stainless steel sheets. Length should be between 1500 and 2000 mm, width between 800 and 1000 mm, and thickness can be 2 to 3 mm. The material should be in good condition.'
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setGeneralError('');

    const nextErrors: Record<string, string> = {};
    const qty = Number(quantity);
    const maxBudget = budget === '' ? null : Number(budget);
    const parseOptional = (value: string) => value.trim() === '' ? null : Number(value);
    const lengthMinValue = parseOptional(lengthMin);
    const lengthMaxValue = parseOptional(lengthMax);
    const widthMinValue = parseOptional(widthMin);
    const widthMaxValue = parseOptional(widthMax);
    const thicknessMinValue = parseOptional(thicknessMin);
    const thicknessMaxValue = parseOptional(thicknessMax);
    if (!organizationId) nextErrors.organization_id = 'Buyer organization is required';
    if (!specification) nextErrors.material_specification = 'Material specification is required';
    if (!isDemandSpecificationValid(family, specification)) {
      nextErrors.material_specification = 'Select a specification supported for this material family';
    }
    const validateDimension = (label: string, min: number | null, max: number | null, key: string) => {
      if (min !== null && (!Number.isFinite(min) || min <= 0)) nextErrors[key] = `${label} minimum must be greater than 0 mm`;
      if (max !== null && (!Number.isFinite(max) || max <= 0)) nextErrors[key] = `${label} maximum must be greater than 0 mm`;
      if (min !== null && max === null) nextErrors[key] = `${label} maximum is required with a minimum`;
      if (min !== null && max !== null && min > max) nextErrors[key] = `${label} minimum cannot exceed maximum`;
    };
    validateDimension('Length', lengthMinValue, lengthMaxValue, 'length_mm');
    validateDimension('Width', widthMinValue, widthMaxValue, 'width_mm');
    validateDimension('Thickness', thicknessMinValue, thicknessMaxValue, 'thickness_mm');
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
      const normalizeDimension = (min: number | null, max: number | null) =>
        min !== null && max !== null && min === max
          ? { exact: min, rangeMin: null, rangeMax: null }
          : { exact: null, rangeMin: min, rangeMax: max };
      const lengthDimension = normalizeDimension(lengthMinValue, lengthMaxValue);
      const widthDimension = normalizeDimension(widthMinValue, widthMaxValue);
      const thicknessDimension = normalizeDimension(thicknessMinValue, thicknessMaxValue);
      const payload = {
        organization_id: organizationId,
        material_family: family,
        material_specification: specification,
        length_mm: lengthDimension.exact,
        width_mm: widthDimension.exact,
        thickness_mm: thicknessDimension.exact,
        length_min_mm: lengthDimension.rangeMin,
        length_max_mm: lengthDimension.rangeMax,
        width_min_mm: widthDimension.rangeMin,
        width_max_mm: widthDimension.rangeMax,
        thickness_min_mm: thicknessDimension.rangeMin,
        thickness_max_mm: thicknessDimension.rangeMax,
        required_quantity: qty,
        quantity_unit: 'PIECE',
        maximum_budget_bdt: maxBudget,
        allow_split_suppliers: allowSplit,
        condition_requirement: condition,
        ...(initialData ? { status } : {}),
      };
      const saved = await saveRequirement.mutateAsync({ id: initialData?.id, body: payload, organizationId });
      onSuccess(saved);
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
          {!initialData && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-700" />
                <h3 className="font-bold text-slate-900">AI Smart Material Requirement Assistant</h3>
              </div>
              <p className="text-xs text-slate-600">
                Describe the materials your business needs in plain language. Our AI extracts material specifications,
                acceptable dimensions, and required quantities into an editable form for your review.
              </p>
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                rows={4}
                placeholder="Describe family, grade, dimensions, quantity, condition, budget..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={loadSample} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Stainless Steel Sample</button>
                <button type="button" onClick={() => setAiPrompt('I need 50 pieces of PLYWOOD_COMMERCIAL marine plywood panels, 2440 by 1220 mm, thickness between 12 and 18 mm, in unused condition.')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Plywood Sample</button>
                <button type="button" onClick={() => void handleAiExtract()} disabled={isExtracting} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  <Sparkles className="h-4 w-4" />
                  {isExtracting ? 'Extracting...' : 'Extract with AI'}
                </button>
              </div>
              {aiMessage && (
                <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${aiMessageType === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                  {aiMessageType === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  <span>{aiMessage}</span>
                </div>
              )}
              {aiResult && (
                <button type="button" onClick={applyAiResult} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700">
                  Apply Extracted Values to Form
                </button>
              )}
            </section>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm font-medium text-slate-700">
              Buyer organization
              <select value={organizationId} disabled={identity.locked} onChange={(event) => setOrganizationId(event.target.value)} className={`${fieldClass} mt-1`}>
                <option value="">Select buyer</option>
                {buyers.filter((o) => !identity.locked || o.id === identity.organizationId).map((organization) => (
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
            {([
              ['length', 'Length (mm)', lengthMin, lengthMax, setLengthMin, setLengthMax],
              ['width', 'Width (mm)', widthMin, widthMax, setWidthMin, setWidthMax],
              ['thickness', 'Thickness (mm)', thicknessMin, thicknessMax, setThicknessMin, setThicknessMax],
            ] as const).map(([name, label, minValue, maxValue, setMin, setMax]) => (
              <div key={name} className="text-sm font-medium text-slate-700">
                {label}
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-500">Minimum
                    <input type="number" step="any" min="0" value={minValue} onChange={(event) => setMin(event.target.value)} className={`${fieldClass} mt-1`} />
                  </label>
                  <label className="text-xs text-slate-500">Maximum
                    <input type="number" step="any" min="0" value={maxValue} onChange={(event) => setMax(event.target.value)} className={`${fieldClass} mt-1`} />
                  </label>
                </div>
                {errors[`${name}_mm`] && <span className="block mt-1 text-xs text-red-600">{errors[`${name}_mm`]}</span>}
              </div>
            ))}
            <label className="text-sm font-medium text-slate-700">
              Required quantity (pieces)
              <input type="number" step="1" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={`${fieldClass} mt-1`} />
              {errors.required_quantity && <span className="block mt-1 text-xs text-red-600">{errors.required_quantity}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Maximum budget (BDT)
              <input type="number" step="any" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} className={`${fieldClass} mt-1`} />
              {errors.maximum_budget_bdt && <span className="block mt-1 text-xs text-red-600">{errors.maximum_budget_bdt}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Condition requirement
              <select value={condition} onChange={(event) => setCondition(event.target.value as typeof condition)} className={`${fieldClass} mt-1`}>
                <option value="ANY">ANY</option>
                <option value="UNUSED">UNUSED</option>
                <option value="LEFTOVER">LEFTOVER</option>
                <option value="OFFCUT">OFFCUT</option>
              </select>
            </label>
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
