import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Shoe, WorkoutLog } from '../types';

interface ShoeModalProps {
  isOpen: boolean;
  shoe: Shoe | null; // null = adding new shoe
  workouts: WorkoutLog[];
  onClose: () => void;
  onSave: (shoe: Shoe) => void;
  onDelete?: (shoeId: string) => void;
}

export const ShoeModal: React.FC<ShoeModalProps> = ({
  isOpen,
  shoe,
  workouts,
  onClose,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [initialKm, setInitialKm] = useState('0');
  const [maxKm, setMaxKm] = useState('650');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (shoe) {
        setName(shoe.name);
        setRole(shoe.role);
        setInitialKm(String(shoe.initialKm));
        setMaxKm(String(shoe.maxKm));
      } else {
        setName('');
        setRole('Daily Trainer');
        setInitialKm('0');
        setMaxKm('650');
      }
      setConfirmDelete(false);
    }
  }, [isOpen, shoe]);

  if (!isOpen) return null;

  const loggedKm = shoe
    ? workouts.reduce((sum, w) => (w.shoeId === shoe.id ? sum + w.distanceKm : sum), 0)
    : 0;
  const parsedInitial = Math.max(0, parseFloat(initialKm) || 0);
  const parsedMax = Math.max(50, parseFloat(maxKm) || 650);
  const previewTotal = Math.round((parsedInitial + loggedKm) * 100) / 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      id: shoe ? shoe.id : `shoe-${Date.now()}`,
      name: trimmed,
      role: role.trim() || 'Running Shoe',
      initialKm: Math.round(parsedInitial * 100) / 100,
      maxKm: Math.round(parsedMax),
      retired: shoe?.retired ?? false,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shoe-modal-title"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-[#111827] border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <h2 id="shoe-modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {shoe ? 'Edit Running Shoe' : 'Add Running Shoe'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="shoe-name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Shoe Model Name
            </label>
            <input
              id="shoe-name"
              type="text"
              required
              placeholder="e.g. ASICS Novablast 5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label
              htmlFor="shoe-role"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Rotation Role
            </label>
            <input
              id="shoe-role"
              type="text"
              placeholder="e.g. Tempo & 5K/10K Race"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="shoe-initial-km"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Starting Offset (km)
              </label>
              <input
                id="shoe-initial-km"
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                value={initialKm}
                onChange={(e) => setInitialKm(e.target.value)}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label
                htmlFor="shoe-max-km"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Target Lifespan (km)
              </label>
              <input
                id="shoe-max-km"
                type="number"
                step="10"
                min="50"
                inputMode="numeric"
                value={maxKm}
                onChange={(e) => setMaxKm(e.target.value)}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm px-3.5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300">
            <span>
              Logged runs: <strong className="font-mono tabular-nums">{loggedKm.toFixed(1)} km</strong>
            </span>
            <span>
              Total: <strong className="font-mono tabular-nums text-slate-900 dark:text-white">{previewTotal.toFixed(1)} km</strong>
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            {shoe && onDelete && (
              !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[46px] px-3.5 rounded-xl border border-rose-300 dark:border-rose-800/70 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(shoe.id);
                    onClose();
                  }}
                  className="min-h-[46px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm whitespace-nowrap shrink-0 transition-colors"
                >
                  Confirm Delete
                </button>
              )
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[46px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm whitespace-nowrap transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="flex-1 min-h-[46px] px-4 rounded-xl bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white font-semibold text-sm whitespace-nowrap transition-colors"
            >
              {shoe ? 'Save Shoe' : 'Add Shoe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
