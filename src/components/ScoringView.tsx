import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toaster';
import { useAuth } from '@/lib/auth';
import type { Project, RubricCriterion, Item, Reviewer, Score } from '@/lib/types';
import {
  ClipboardCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Inbox,
  Settings2,
  FileText,
} from 'lucide-react';

interface Props {
  project: Project;
  criteria: RubricCriterion[];
  items: Item[];
  reviewers: Reviewer[];
  scores: Score[];
  onScoresChange: (scores: Score[]) => void;
}

export default function ScoringView({
  project,
  criteria,
  items,
  reviewers,
  scores,
  onScoresChange,
}: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});

  const myReviewer = useMemo(
    () => reviewers.find((r) => r.user_id === user?.id) ?? null,
    [reviewers, user]
  );

  const currentItem = items[currentIndex];

  // Build a quick lookup of my scores for the current item
  const myScoresByCriterion = useMemo(() => {
    if (!myReviewer || !currentItem) return {};
    const map: Record<string, Score | undefined> = {};
    for (const c of criteria) {
      map[c.id] = scores.find(
        (s) => s.item_id === currentItem.id && s.criterion_id === c.id && s.reviewer_id === myReviewer.id
      );
    }
    return map;
  }, [myReviewer, currentItem, scores, criteria]);

  // Initialize comments from existing scores
  if (currentItem && myReviewer) {
    for (const c of criteria) {
      const existing = myScoresByCriterion[c.id];
      const key = `${currentItem.id}:${c.id}`;
      if (existing?.comment && comments[key] === undefined) {
        setComments((prev) => ({ ...prev, [key]: existing.comment ?? '' }));
      }
    }
  }

  const saveScore = async (criterionId: string, scoreValue: number) => {
    if (!currentItem || !myReviewer) return;
    setSaving(true);

    const existing = scores.find(
      (s) =>
        s.item_id === currentItem.id &&
        s.criterion_id === criterionId &&
        s.reviewer_id === myReviewer.id
    );

    const comment = comments[`${currentItem.id}:${criterionId}`] ?? '';

    if (existing) {
      const { data, error } = await supabase
        .from('scores')
        .update({ score: scoreValue, comment: comment || null })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) {
        toast('Failed to save score: ' + error.message, 'error');
        setSaving(false);
        return;
      }
      onScoresChange(scores.map((s) => (s.id === existing.id ? (data as Score) : s)));
    } else {
      const { data, error } = await supabase
        .from('scores')
        .insert({
          item_id: currentItem.id,
          criterion_id: criterionId,
          reviewer_id: myReviewer.id,
          score: scoreValue,
          comment: comment || null,
        })
        .select('*')
        .single();
      if (error) {
        toast('Failed to save score: ' + error.message, 'error');
        setSaving(false);
        return;
      }
      onScoresChange([...scores, data as Score]);
    }
    setSaving(false);
  };

  const saveComment = async (criterionId: string) => {
    if (!currentItem || !myReviewer) return;
    const comment = comments[`${currentItem.id}:${criterionId}`] ?? '';

    const existing = scores.find(
      (s) =>
        s.item_id === currentItem.id &&
        s.criterion_id === criterionId &&
        s.reviewer_id === myReviewer.id
    );

    if (existing) {
      const { data, error } = await supabase
        .from('scores')
        .update({ comment: comment || null })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) {
        toast('Failed to save comment: ' + error.message, 'error');
        return;
      }
      onScoresChange(scores.map((s) => (s.id === existing.id ? (data as Score) : s)));
      toast('Comment saved', 'success');
    } else if (comment) {
      // Need a score to exist first; prompt user
      toast('Score the criterion first, then add a comment.', 'info');
    }
  };

  if (criteria.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Settings2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium mb-1">No rubric criteria yet</p>
        <p className="text-sm text-slate-400">Define criteria in the Rubric tab before scoring.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium mb-1">No items to score</p>
        <p className="text-sm text-slate-400">Add items in the Items tab before scoring.</p>
      </div>
    );
  }

  if (!myReviewer) {
    return (
      <div className="card p-10 text-center">
        <ClipboardCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium mb-1">You're not a reviewer on this project</p>
        <p className="text-sm text-slate-400">Only the project owner can score items right now.</p>
      </div>
    );
  }

  const progress = items.length > 0
    ? Math.round((scores.filter((s) => s.reviewer_id === myReviewer.id).length / (items.length * criteria.length)) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Scoring</h2>
          <p className="text-sm text-slate-400">
            Item {currentIndex + 1} of {items.length} · {progress}% complete
          </p>
        </div>
        <div className="w-full sm:w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Item navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="btn-ghost p-2 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-slate-400 min-w-[80px] text-center">
          {currentIndex + 1} / {items.length}
        </span>
        <button
          onClick={() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1))}
          disabled={currentIndex === items.length - 1}
          className="btn-ghost p-2 disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Current item content */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium text-sky-400 uppercase tracking-wide">Item {currentIndex + 1}</span>
          {saving && <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />}
        </div>
        <p className="text-slate-100 whitespace-pre-wrap leading-relaxed">{currentItem.content}</p>
      </div>

      {/* Criteria scoring */}
      <div className="space-y-3">
        {criteria.map((c) => {
          const myScore = myScoresByCriterion[c.id];
          const key = `${currentItem.id}:${c.id}`;
          const commentValue = comments[key] ?? '';

          return (
            <div key={c.id} className="card p-4 animate-fade-in">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-white text-sm">{c.name}</h4>
                    <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                      weight {c.weight}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-xs text-slate-400 mt-1">{c.description}</p>
                  )}
                </div>
                <span className="text-xs text-slate-500 shrink-0">Scale 1–{c.max_score}</span>
              </div>

              {/* Score buttons */}
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: c.max_score }, (_, i) => i + 1).map((val) => {
                  const active = myScore?.score === val;
                  return (
                    <button
                      key={val}
                      onClick={() => saveScore(c.id, val)}
                      className={`w-10 h-10 rounded-lg font-medium text-sm transition-all ${
                        active
                          ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30 scale-105'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>

              {/* Comment */}
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    value={commentValue}
                    onChange={(e) =>
                      setComments((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveComment(c.id);
                      }
                    }}
                    placeholder="Add a comment (optional)…"
                    className="input pl-9 text-sm"
                  />
                </div>
                <button
                  onClick={() => saveComment(c.id)}
                  disabled={!myScore && !commentValue}
                  className="btn-secondary text-sm px-3"
                >
                  Save
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Next/Prev at bottom */}
      <div className="flex justify-between pt-2">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="btn-secondary"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <button
          onClick={() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1))}
          disabled={currentIndex === items.length - 1}
          className="btn-primary"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
