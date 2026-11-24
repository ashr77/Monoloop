'use client';

// Direct listing order dialog (direct purchase feature). Moved out of SupplierListingTable unchanged
// so the listing chat can open the same dialog; the order itself is api.exchanges.requestListing.

import { useId, useState } from 'react';
import type { MaterialListing } from '@/lib/types';
import { useRequestListingOrder } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { Button, Dialog, FactList, Note, StatusBadge } from '@/components/ui';

interface Props {
  listing: MaterialListing;
  buyerOrganizationId?: string;
  onClose: () => void;
  /** Called after the order request was accepted by the API. */
  onOrdered?: (quantity: number) => void;
}

export function ListingOrderDialog({ listing, buyerOrganizationId, onClose, onOrdered }: Props) {
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const requestListingOrder = useRequestListingOrder();
  const uid = useId();
  const quantityId = `${uid}-quantity`;
  const errorId = `${uid}-error`;

  const placeOrder = async () => {
    if (!buyerOrganizationId) {
      setError('Select a buyer organization first.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Quantity must be a positive whole number.');
      return;
    }
    if (qty > listing.available_quantity) {
      setError(`Only ${listing.available_quantity} pieces are available.`);
      return;
    }
    if (listing.organization_id === buyerOrganizationId) {
      setError('You cannot order your own supply listing.');
      return;
    }
    if (listing.status !== 'ACTIVE' || listing.available_quantity <= 0) {
      setError('This listing is no longer active and available.');
      return;
    }
    setError('');
    try {
      await requestListingOrder.mutateAsync({
        listingId: listing.id,
        quantity: qty,
        buyerOrganizationId,
      });
      setSuccess('Order request submitted. The supplier can now accept or reject it.');
      onOrdered?.(qty);
    } catch (err) {
      setError(errorMessage(err, 'Could not place the order.'));
    }
  };

  const pending = requestListingOrder.isPending;

  return (
    <Dialog
      open
      onClose={() => onClose()}
      size="sm"
      dismissible={!pending}
      eyebrow="Direct order"
      title="Place Supply Order"
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={placeOrder} busy={pending} disabled={Boolean(success)}>
            {pending ? 'Placing...' : 'Place Order'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FactList
          facts={[
            { label: 'Material', value: listing.material_specification },
            { label: 'Supplier', value: listing.organization?.name || 'Supplier' },
            { label: 'Available', value: <span className="t-num">{listing.available_quantity} pcs</span> },
            { label: 'Unit price', value: <span className="t-num">BDT {listing.unit_price_bdt.toLocaleString()}</span> },
          ]}
        />
        <dl className="space-y-0.5 border-t rule pt-4">
          <dt className="t-label">Specifications</dt>
          <dd className="text-sm text-graphite">
            <span className="t-num">
              {listing.length_mm} × {listing.width_mm} × {listing.thickness_mm} mm
            </span>{' '}
            · {listing.condition}
          </dd>
        </dl>

        <div className="border-t rule pt-4">
          <label htmlFor={quantityId} className="field-label">
            Quantity to order
          </label>
          <div className="relative mt-1.5">
            <input
              id={quantityId}
              data-autofocus
              type="number"
              inputMode="numeric"
              min="1"
              max={listing.available_quantity}
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              aria-describedby={`${uid}-hint${error ? ` ${errorId}` : ''}`}
              className="field pr-12 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-slate-600" aria-hidden>
              pcs
            </span>
          </div>
          <p id={`${uid}-hint`} className="field-hint">
            Whole pieces, up to <span className="t-num">{listing.available_quantity}</span> available.
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-4 border-y rule py-3">
          <span className="t-label">Estimated total</span>
          <span className="t-num text-lg font-medium tracking-[-0.02em] text-graphite" aria-live="polite">
            BDT {Number(quantity) > 0 ? (Number(quantity) * listing.unit_price_bdt).toLocaleString() : '0'}
          </span>
        </div>

        {error && (
          <div role="alert" id={errorId}>
            <Note tone="danger">{error}</Note>
          </div>
        )}
        {success && (
          <div role="status" className="space-y-1">
            <StatusBadge tone="success">Order requested</StatusBadge>
            <p className="text-sm text-slate-700">{success}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
