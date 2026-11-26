import { useState } from 'react';
import { formatSize } from '../utils/formatSize';

interface ConfirmDialogWarning {
  message: string;
  entries: Array<{ key: string; label: string; detail: string }>;
  /**
   * When set, the confirm button stays disabled until this statement is ticked. Losing work
   * must take a deliberate second act, not the same click that removes clean folders.
   */
  acknowledgement?: string;
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  items: Array<{ label: string; count: number }>;
  confirmLabel: string;
  selectedSize: number;
  /** The size is a floor, e.g. a cache pruned by its own tool frees an amount known only after. */
  sizeIsEstimate?: boolean;
  /** Named, not counted: consent to lose work should be given for specific things. */
  warning?: ConfirmDialogWarning | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  // The body is mounted afresh on every open, so an acknowledgement ticked for one selection
  // never carries over to the next.
  return props.isOpen ? <ConfirmDialogBody {...props} /> : null;
}

function ConfirmDialogBody({
  title,
  description,
  items,
  confirmLabel,
  selectedSize,
  sizeIsEstimate = false,
  warning = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAcknowledgement = Boolean(warning?.acknowledgement) && (warning?.entries.length ?? 0) > 0;
  const canConfirm = !needsAcknowledgement || acknowledged;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close confirmation dialog"
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {title}
            </h3>
            <p className="text-sm text-gray-500">
              {description}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          {items.map((item) => (
            <div key={item.label} className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">{item.label}:</span>
              <span className="font-medium text-gray-900">{item.count}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-1">
            <span className="text-gray-600">Space to free:</span>
            <span className="font-medium text-green-600">
              {sizeIsEstimate ? 'at least ' : ''}{formatSize(selectedSize)}
            </span>
          </div>
        </div>

        {warning && warning.entries.length > 0 && (
          <div role="alert" className="border border-red-200 bg-red-50 rounded-lg p-4 mb-6">
            <p className="text-sm font-semibold text-red-800 mb-2">{warning.message}</p>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {warning.entries.map((entry) => (
                <li key={entry.key} className="text-xs">
                  <span className="font-medium text-red-900">{entry.label}</span>
                  <span className="block text-red-700 truncate" title={entry.detail}>{entry.detail}</span>
                </li>
              ))}
            </ul>
            {needsAcknowledgement && (
              <label className="mt-3 flex items-start gap-2 text-sm text-red-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span>{warning.acknowledgement}</span>
              </label>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            title={canConfirm ? undefined : 'Tick the confirmation above first'}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
