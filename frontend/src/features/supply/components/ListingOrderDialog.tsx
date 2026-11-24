'use client';

// Direct listing order dialog (direct purchase feature). Moved out of SupplierListingTable unchanged
// so the listing chat can open the same dialog; the order itself is api.exchanges.requestListing.

import { useState } from 'react';
import { X } from 'lucide-react';
import type { MaterialListing } from '@/lib/types';
import { useRequestListingOrder } from '@/hooks';
import { errorMessage } from '@/lib/api/client';

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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Place Supply Order</h2>
          <button type="button" onClick={() => onClose()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div><dt className="text-xs text-slate-500">Material</dt><dd className="font-bold text-slate-900">{listing.material_specification}</dd></div>
            <div><dt className="text-xs text-slate-500">Supplier</dt><dd className="font-bold text-slate-900">{listing.organization?.name || 'Supplier'}</dd></div>
            <div><dt className="text-xs text-slate-500">Available</dt><dd className="font-bold text-slate-900">{listing.available_quantity} pcs</dd></div>
            <div><dt className="text-xs text-slate-500">Unit price</dt><dd className="font-bold text-slate-900">BDT {listing.unit_price_bdt.toLocaleString()}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-500">Specifications</dt><dd className="font-medium text-slate-700">{listing.length_mm} × {listing.width_mm} × {listing.thickness_mm} mm · {listing.condition}</dd></div>
          </dl>
          <label className="block text-sm font-medium text-slate-700">
            Quantity to order
            <input
              type="number"
              min="1"
              max={listing.available_quantity}
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-sm">
            <span className="font-medium text-slate-700">Estimated total</span>
            <span className="font-extrabold text-emerald-800">
              BDT {Number(quantity) > 0 ? (Number(quantity) * listing.unit_price_bdt).toLocaleString() : '0'}
            </span>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => onClose()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600">Cancel</button>
            <button type="button" onClick={placeOrder} disabled={requestListingOrder.isPending || Boolean(success)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {requestListingOrder.isPending ? 'Placing...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
