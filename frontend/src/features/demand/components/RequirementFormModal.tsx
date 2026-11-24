'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Save, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Dialog, ErrorState, Note } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MaterialRequirement, Organization } from '@/lib/types';
import { DEMO_ORGANIZATIONS, MATERIAL_FAMILIES, MATERIAL_SPECIFICATIONS } from '@/lib/constants';
import { DEMO_BUYER_ORGANIZATIONS } from '@/features/demand/data/demoBuyers';
import { isDemandSpecificationValid } from '@/features/demand/validation';
import { useExtractRequirement, useSaveRequirement } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { RequirementExtractionResult } from '@/lib/ai/schemas';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { VoiceInputControl } from '@/features/supply/components/VoiceInputControl';

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
  const uid = useId();
  const formId = `${uid}-form`;
  const formRef = useRef<HTMLFormElement>(null);
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

  // After a failed validation, move focus to the first field that needs attention.
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

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

  // Voice input: append each finished piece of speech to the prompt for review before extraction.
  const appendTranscript = (text: string) => {
    setAiPrompt((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text).slice(0, 2000));
    setAiMessage('');
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

  const fieldId = (name: string) => `${uid}-${name}`;
  const isEditing = Boolean(initialData);
  const steps = isEditing
    ? { assist: '', material: '01', dimensions: '02', quantity: '03' }
    : { assist: '01', material: '02', dimensions: '03', quantity: '04' };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      dismissible={!submitting}
      eyebrow={initialData ? 'Demand · Edit requirement' : 'Demand · New requirement'}
      title={initialData ? 'Edit Requirement' : 'New Material Requirement'}
      description="All dimensions are in millimeters."
      footer={
        <>
          {Object.keys(errors).length > 0 && (
            <p className="mr-auto text-xs font-medium text-brick-700">Check the highlighted fields before saving.</p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={submitting} leading={<Save className="size-4" aria-hidden />}>
            {submitting ? 'Saving...' : initialData ? 'Save Changes' : 'Publish Requirement'}
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} onSubmit={submit} className="space-y-6">
        {/* AI-assisted description (create mode only) */}
        {!initialData && (
          <FormSection id={fieldId('s-assist')} step={steps.assist} title="Describe it">
            <div className="col-span-12 space-y-4 rounded-sm border border-graphite/10 bg-sand-50 p-4 sm:p-5">
              <div className="space-y-1.5">
                <p className="t-eyebrow flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-copper-600" aria-hidden />
                  Assist · AI Smart Material Requirement Assistant
                </p>
                <p className="text-sm leading-relaxed text-slate-700">
                  Describe the materials your business needs in plain language, typed or spoken in English, Bangla or
                  Japanese. Our AI extracts material specifications,
                  acceptable dimensions, and required quantities into an editable form for your review.
                </p>
                <p className="text-xs text-slate-600">
                  Extracted values are suggestions, not verified data. Nothing changes until you apply them, and every
                  field must be checked before you publish.
                </p>
              </div>

              <div>
                <label htmlFor={fieldId('ai-prompt')} className="field-label">
                  Plain-language description
                </label>
                <textarea
                  id={fieldId('ai-prompt')}
                  data-autofocus
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  rows={4}
                  placeholder="Describe family, grade, dimensions, quantity, condition, budget..."
                  className="field mt-1.5 resize-y leading-relaxed"
                />
              </div>

              <VoiceInputControl onTranscript={appendTranscript} disabled={isExtracting} />

              <div className="flex flex-wrap items-center gap-2 border-t rule pt-4">
                <span className="t-label mr-1">Try a sample</span>
                <Button variant="secondary" size="xs" onClick={loadSample}>
                  Stainless Steel Sample
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    setAiPrompt(
                      'I need 50 pieces of PLYWOOD_COMMERCIAL marine plywood panels, 2440 by 1220 mm, thickness between 12 and 18 mm, in unused condition.'
                    )
                  }
                >
                  Plywood Sample
                </Button>
                <Button
                  variant="ink"
                  size="sm"
                  className="ml-auto"
                  busy={isExtracting}
                  onClick={() => void handleAiExtract()}
                  leading={<Sparkles className="size-4" aria-hidden />}
                >
                  {isExtracting ? 'Extracting...' : 'Extract with AI'}
                </Button>
              </div>

              {aiMessage && (
                <div role={aiMessageType === 'error' ? 'alert' : 'status'}>
                  <Note tone={aiMessageType === 'error' ? 'danger' : 'neutral'}>
                    <span className="flex items-start gap-2">
                      {aiMessageType === 'error' ? (
                        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-copper-700" aria-hidden />
                      )}
                      <span>{aiMessage}</span>
                    </span>
                  </Note>
                </div>
              )}
              {aiResult && (
                <Button variant="secondary" size="sm" onClick={applyAiResult}>
                  Apply Extracted Values to Form
                </Button>
              )}
            </div>
          </FormSection>
        )}

        {/* Buyer & material */}
        <FormSection id={fieldId('s-material')} step={steps.material} title="Buyer & material">
          <Field id={fieldId('org')} label="Buyer organization" required error={errors.organization_id} className="col-span-12">
            <select
              {...controlProps(fieldId('org'), errors.organization_id)}
              value={organizationId}
              disabled={identity.locked}
              onChange={(event) => setOrganizationId(event.target.value)}
              className={cn('field', errors.organization_id && 'field-invalid')}
            >
              <option value="">Select buyer</option>
              {buyers
                .filter((o) => !identity.locked || o.id === identity.organizationId)
                .map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field id={fieldId('family')} label="Material family" required className="col-span-12 sm:col-span-6">
            <select
              {...controlProps(fieldId('family'))}
              data-autofocus={isEditing || undefined}
              value={family}
              onChange={(event) => onFamilyChange(event.target.value as typeof family)}
              className="field"
            >
              {MATERIAL_FAMILIES.map((materialFamily) => (
                <option key={materialFamily} value={materialFamily}>
                  {materialFamily === 'STAINLESS_STEEL_SHEET' ? 'Stainless Steel Sheet' : 'Plywood Panel'}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id={fieldId('spec')}
            label="Material specification"
            required
            error={errors.material_specification}
            className="col-span-12 sm:col-span-6"
          >
            <select
              {...controlProps(fieldId('spec'), errors.material_specification)}
              value={specification}
              onChange={(event) => setSpecification(event.target.value)}
              className={cn('field', errors.material_specification && 'field-invalid')}
            >
              {MATERIAL_SPECIFICATIONS[family].map((materialSpecification) => (
                <option key={materialSpecification} value={materialSpecification}>
                  {materialSpecification}
                </option>
              ))}
            </select>
          </Field>

          <Field id={fieldId('condition')} label="Condition requirement" className="col-span-12 sm:col-span-6">
            <select
              {...controlProps(fieldId('condition'))}
              value={condition}
              onChange={(event) => setCondition(event.target.value as typeof condition)}
              className="field"
            >
              <option value="ANY">ANY</option>
              <option value="UNUSED">UNUSED</option>
              <option value="LEFTOVER">LEFTOVER</option>
              <option value="OFFCUT">OFFCUT</option>
            </select>
          </Field>

          {initialData && (
            <Field id={fieldId('status')} label="Status" className="col-span-12 sm:col-span-6">
              <select
                {...controlProps(fieldId('status'))}
                value={status}
                onChange={(event) => setStatus(event.target.value as 'OPEN' | 'FULFILLED' | 'CANCELLED')}
                className="field"
              >
                <option value="OPEN">OPEN</option>
                <option value="FULFILLED">FULFILLED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </Field>
          )}
        </FormSection>

        {/* Dimensions: acceptable ranges */}
        <FormSection
          id={fieldId('s-dimensions')}
          step={steps.dimensions}
          title="Dimensions"
          description="Acceptable range per piece, in millimetres. Enter the same minimum and maximum for an exact size."
        >
          {(
            [
              ['length', 'Length', lengthMin, lengthMax, setLengthMin, setLengthMax],
              ['width', 'Width', widthMin, widthMax, setWidthMin, setWidthMax],
              ['thickness', 'Thickness', thicknessMin, thicknessMax, setThicknessMin, setThicknessMax],
            ] as const
          ).map(([name, label, minValue, maxValue, setMin, setMax]) => {
            const error = errors[`${name}_mm`];
            const errorId = `${fieldId(name)}-error`;
            return (
              <fieldset key={name} className="col-span-12 min-w-0 sm:col-span-4" aria-describedby={error ? errorId : undefined}>
                <legend className="field-label">
                  {label} <span className="sr-only">(mm)</span>
                </legend>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(
                    [
                      ['min', 'Min', minValue, setMin],
                      ['max', 'Max', maxValue, setMax],
                    ] as const
                  ).map(([bound, boundLabel, value, setValue]) => {
                    const id = fieldId(`${name}-${bound}`);
                    return (
                      <div key={bound} className="min-w-0">
                        <label htmlFor={id} className="t-label">
                          <span aria-hidden>{boundLabel}</span>
                          <span className="sr-only">
                            {bound === 'min' ? 'Minimum' : 'Maximum'} {label.toLowerCase()} (mm)
                          </span>
                        </label>
                        <div className="relative mt-1">
                          <input
                            id={id}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                            className={cn('field pr-10 tabular-nums', NO_SPIN, error && 'field-invalid')}
                          />
                          <span
                            className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center font-mono text-xs text-slate-600"
                            aria-hidden
                          >
                            mm
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {error && (
                  <p id={errorId} className="field-error">
                    {error}
                  </p>
                )}
              </fieldset>
            );
          })}
        </FormSection>

        {/* Quantity & budget */}
        <FormSection id={fieldId('s-quantity')} step={steps.quantity} title="Quantity & budget">
          <Field
            id={fieldId('qty')}
            label="Required quantity"
            unit="pcs"
            required
            error={errors.required_quantity}
            className="col-span-12 sm:col-span-6"
          >
            <input
              {...controlProps(fieldId('qty'), errors.required_quantity)}
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={cn('field pr-12 tabular-nums', NO_SPIN, errors.required_quantity && 'field-invalid')}
            />
          </Field>

          <Field
            id={fieldId('budget')}
            label="Maximum budget"
            unit="BDT"
            optional
            error={errors.maximum_budget_bdt}
            className="col-span-12 sm:col-span-6"
          >
            <input
              {...controlProps(fieldId('budget'), errors.maximum_budget_bdt)}
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              className={cn('field pr-12 tabular-nums', NO_SPIN, errors.maximum_budget_bdt && 'field-invalid')}
            />
          </Field>

          <label className="col-span-12 flex cursor-pointer items-start gap-3 border-y rule py-3 text-sm text-graphite">
            <input
              type="checkbox"
              checked={allowSplit}
              onChange={(event) => setAllowSplit(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded-xs border-graphite/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper"
            />
            Allow multiple suppliers to fulfill this requirement
          </label>
        </FormSection>

        {/* Save failure: next to the actions so it is seen after submitting */}
        {generalError && <ErrorState title="Requirement not saved" message={generalError} />}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ layout helpers */

/** Hides the native number spinners so unit suffixes sit cleanly (arrow keys still step). */
const NO_SPIN =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** Accessible wiring for a control rendered inside <Field>. */
function controlProps(id: string, error?: string, hasHint = false) {
  const describedBy = [hasHint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  };
}

function FormSection({
  id,
  step,
  title,
  description,
  children,
}: {
  id: string;
  step: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4 border-t rule pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs tabular-nums text-copper-700" aria-hidden>
          {step}
        </span>
        <div className="min-w-0">
          <h3 id={id} className="text-[15px] font-medium tracking-[-0.01em] text-graphite">
            {title}
          </h3>
          {description && <p className="mt-0.5 text-xs text-slate-600">{description}</p>}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-x-4 gap-y-5">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  required,
  optional,
  unit,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  unit?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="field-label">
        {label}
        {unit && <span className="sr-only"> ({unit})</span>}
        {required && (
          <>
            <span className="ml-0.5 text-copper-700" aria-hidden>
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
        {optional && <span className="ml-1.5 font-normal text-slate-600">Optional</span>}
      </label>
      <div className="relative mt-1.5">
        {children}
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-slate-600" aria-hidden>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
