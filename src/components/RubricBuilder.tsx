import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toaster';
import type { Rubric, RubricCriterion } from '@/lib/types';
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  Loader2,
  Settings2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface DraftCriterion {
  id: string; // local id, empty string means unsaved-new
  rubric_id: string;
  name: string;
  description: string;
  weight: string;
  max_score: string;
  position: number;
  _isNew?: boolean;
  _deleted?: boolean;
}

interface Props {
  rubric: Rubric | null;
  criteria: RubricCriterion[];
  onCriteriaChange: (criteria: RubricCriterion[]) => void;
}

function toDraft(c: RubricCriterion): DraftCriterion {
  return {
    id: c.id,
    rubric_id: c.rubric_id,
    name: c.name,
    description: c.description ?? '',
    weight: String(c.weight),
    max_score: String(c.max_score),
    position: c.position,
  };
}

let localIdCounter = 0;
function genLocalId(): string {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

export default function RubricBuilder({ rubric, criteria, onCriteriaChange }: Props) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<DraftCriterion[]>(() => criteria.map(toDraft));
  const [saving, setSaving] = useState(false);

  // Sync drafts when criteria prop changes (e.g. after initial load)
  // Only re-sync if the number of criteria changes significantly
  const [syncedCount, setSyncedCount] = useState(criteria.length);
  if (criteria.length !== syncedCount) {
    setSyncedCount(criteria.length);
    setDrafts(criteria.map(toDraft));
  }

  if (!rubric) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-400">Rubric is initializing. Try refreshing in a moment.</p>
      </div>
    );
  }

  const visibleDrafts = drafts.filter((d) => !d._deleted);

  const addCriterion = () => {
    const newDraft: DraftCriterion = {
      id: genLocalId(),
      rubric_id: rubric.id,
      name: '',
      description: '',
      weight: '1',
      max_score: '5',
      position: visibleDrafts.length,
      _isNew: true,
    };
    setDrafts((prev) => [...prev, newDraft]);
  };

  const updateDraft = (id: string, patch: Partial<DraftCriterion>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (d._isNew) return { ...d, _deleted: true };
        return { ...d, _deleted: true };
      })
    );
  };

  const moveDraft = (index: number, dir: -1 | 1) => {
    const visible = drafts.filter((d) => !d._deleted);
    const target = index + dir;
    if (target < 0 || target >= visible.length) return;
    const a = visible[index];
    const b = visible[target];
    updateDraft(a.id, { position: b.position });
    updateDraft(b.id, { position: a.position });
  };

  const save = async () => {
    setSaving(true);
    const errors: string[] = [];

    const toSave = drafts.filter((d) => !d._deleted);

    for (const d of toSave) {
      if (!d.name.trim()) errors.push('All criteria need a name.');
      const weight = parseFloat(d.weight);
      if (isNaN(weight) || weight <= 0) errors.push('Weights must be positive numbers.');
      const maxScore = parseInt(d.max_score, 10);
      if (isNaN(maxScore) || maxScore < 2) errors.push('Max score must be at least 2.');
    }

    if (errors.length > 0) {
      toast(errors[0], 'error');
      setSaving(false);
      return;
    }

    // Delete removed criteria
    const toDelete = drafts.filter((d) => d._deleted && !d._isNew);
    for (const d of toDelete) {
      await supabase.from('rubric_criteria').delete().eq('id', d.id);
    }

    // Upsert remaining
    for (let i = 0; i < toSave.length; i++) {
      const d = toSave[i];
      const position = i;
      const payload = {
        rubric_id: rubric.id,
        name: d.name.trim(),
        description: d.description.trim() || null,
        weight: parseFloat(d.weight),
        max_score: parseInt(d.max_score, 10),
        position,
      };

      if (d._isNew) {
        const { data, error } = await supabase
          .from('rubric_criteria')
          .insert(payload)
          .select('*')
          .single();
        if (error) {
          toast('Failed to save criterion: ' + error.message, 'error');
          setSaving(false);
          return;
        }
        // Update local draft with real id
        const saved = data as RubricCriterion;
        setDrafts((prev) =>
          prev.map((x) =>
            x.id === d.id
              ? {
                  id: saved.id,
                  rubric_id: saved.rubric_id,
                  name: saved.name,
                  description: saved.description ?? '',
                  weight: String(saved.weight),
                  max_score: String(saved.max_score),
                  position: saved.position,
                  _isNew: false,
                }
              : x
          )
        );
      } else {
        const { data, error } = await supabase
          .from('rubric_criteria')
          .update(payload)
          .eq('id', d.id)
          .select('*')
          .single();
        if (error) {
          toast('Failed to save criterion: ' + error.message, 'error');
          setSaving(false);
          return;
        }
        const updated = data as RubricCriterion;
        setDrafts((prev) =>
          prev.map((x) =>
            x.id === d.id
              ? {
                  id: updated.id,
                  rubric_id: updated.rubric_id,
                  name: updated.name,
                  description: updated.description ?? '',
                  weight: String(updated.weight),
                  max_score: String(updated.max_score),
                  position: updated.position,
                }
              : x
          )
        );
      }
    }

    // Remove deleted from local state
    setDrafts((prev) => prev.filter((d) => !d._deleted));

    // Sync parent
    const savedCriteria: RubricCriterion[] = drafts
      .filter((d) => !d._deleted)
      .map((d, i) => ({
        id: d.id,
        rubric_id: rubric.id,
        name: d.name.trim(),
        description: d.description.trim() || null,
        weight: parseFloat(d.weight),
        max_score: parseInt(d.max_score, 10),
        position: i,
      }));
    onCriteriaChange(savedCriteria);

    toast('Rubric saved', 'success');
    setSaving(false);
  };

  const hasUnsaved = drafts.some((d) => d._isNew || d._deleted) ||
    drafts.some((d, i) => {
      const orig = criteria.find((c) => c.id === d.id);
      if (!orig) return true;
      return (
        orig.name !== d.name ||
        (orig.description ?? '') !== d.description ||
        String(orig.weight) !== d.weight ||
        String(orig.max_score) !== d.max_score ||
        orig.position !== d.position
      );
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Rubric Criteria</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Define the criteria reviewers will score each item against.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={addCriterion} className="btn-secondary">
            <Plus className="w-4 h-4" />
            Add Criterion
          </button>
          <button onClick={save} disabled={saving || !hasUnsaved} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Rubric
          </button>
        </div>
      </div>

      {visibleDrafts.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <Settings2 className="w-6 h-6 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-4">No criteria yet. Add your first criterion to get started.</p>
          <button onClick={addCriterion} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Criterion
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDrafts.map((d, index) => (
            <div key={d.id} className="card p-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-2">
                  <GripVertical className="w-4 h-4 text-slate-600" />
                  <button
                    onClick={() => moveDraft(index, -1)}
                    disabled={index === 0}
                    className="text-slate-500 hover:text-slate-300 disabled:opacity-30 p-0.5"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveDraft(index, 1)}
                    disabled={index === visibleDrafts.length - 1}
                    className="text-slate-500 hover:text-slate-300 disabled:opacity-30 p-0.5"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="label">Name</label>
                    <input
                      value={d.name}
                      onChange={(e) => updateDraft(d.id, { name: e.target.value })}
                      placeholder="e.g. Accuracy"
                      className="input"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Description</label>
                    <textarea
                      value={d.description}
                      onChange={(e) => updateDraft(d.id, { description: e.target.value })}
                      placeholder="What should reviewers look for?"
                      rows={2}
                      className="input resize-none"
                    />
                  </div>
                  <div>
                    <label className="label">Weight</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={d.weight}
                      onChange={(e) => updateDraft(d.id, { weight: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Max Score</label>
                    <input
                      type="number"
                      min="2"
                      max="10"
                      value={d.max_score}
                      onChange={(e) => updateDraft(d.id, { max_score: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <button
                  onClick={() => removeDraft(d.id)}
                  className="btn-ghost text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 mt-7"
                  title="Remove criterion"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
