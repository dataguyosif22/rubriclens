import { useMemo } from 'react';
import type { Project, RubricCriterion, Item, Reviewer, Score } from '@/lib/types';
import { useToast } from '@/components/Toaster';
import { supabase } from '@/lib/supabase';
import {
  BarChart3,
  Download,
  TrendingUp,
  Users,
  Award,
  ClipboardList,
  Inbox,
  Settings2,
} from 'lucide-react';

interface Props {
  project: Project;
  criteria: RubricCriterion[];
  items: Item[];
  reviewers: Reviewer[];
  scores: Score[];
}

export default function ProjectDashboard({
  project,
  criteria,
  items,
  reviewers,
  scores,
}: Props) {
  const toast = useToast();

  // Average score per criterion (weighted)
  const criterionStats = useMemo(() => {
    return criteria.map((c) => {
      const cScores = scores.filter((s) => s.criterion_id === c.id);
      const avg =
        cScores.length > 0
          ? cScores.reduce((sum, s) => sum + s.score, 0) / cScores.length
          : 0;
      const weightedAvg = avg * c.weight;
      return {
        criterion: c,
        count: cScores.length,
        avg,
        weightedAvg,
        maxPossible: c.max_score * c.weight,
      };
    });
  }, [criteria, scores]);

  // Overall weighted average
  const overallScore = useMemo(() => {
    const totalWeight = criterionStats.reduce((sum, cs) => sum + cs.criterion.weight, 0);
    const totalWeighted = criterionStats.reduce((sum, cs) => sum + cs.weightedAvg, 0);
    if (totalWeight === 0) return 0;
    return totalWeighted / totalWeight;
  }, [criterionStats]);

  // Score distribution across all scores
  const distribution = useMemo(() => {
    const dist: Record<number, number> = {};
    for (const s of scores) {
      dist[s.score] = (dist[s.score] ?? 0) + 1;
    }
    return dist;
  }, [scores]);

  const maxScoreValue = useMemo(() => {
    return criteria.length > 0 ? Math.max(...criteria.map((c) => c.max_score)) : 5;
  }, [criteria]);

  // Inter-rater agreement: for items scored by more than one reviewer,
  // compute the average standard deviation of scores per criterion per item.
  const agreement = useMemo(() => {
    if (reviewers.length < 2) return null;

    // Group scores by (item_id, criterion_id)
    const groups: Record<string, number[]> = {};
    for (const s of scores) {
      const key = `${s.item_id}:${s.criterion_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s.score);
    }

    const multiReviewerGroups = Object.values(groups).filter((arr) => arr.length > 1);
    if (multiReviewerGroups.length === 0) return null;

    const avgStdDev =
      multiReviewerGroups.reduce((sum, arr) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
        return sum + Math.sqrt(variance);
      }, 0) / multiReviewerGroups.length;

    // Convert to agreement percentage: 0 std = 100% agreement
    const agreementPct = Math.max(0, Math.round((1 - avgStdDev / maxScoreValue) * 100));
    return { avgStdDev: avgStdDev.toFixed(2), agreementPct, groupCount: multiReviewerGroups.length };
  }, [scores, reviewers, maxScoreValue]);

  const exportCsv = async () => {
    if (scores.length === 0) {
      toast('No scores to export yet.', 'info');
      return;
    }

    // Fetch all data fresh for export
    const [itemsRes, criteriaRes, reviewersRes, scoresRes] = await Promise.all([
      supabase.from('items').select('id, content, position').eq('project_id', project.id).order('position'),
      supabase
        .from('rubric_criteria')
        .select('id, name, weight, max_score, position')
        .eq('rubric.project_id', project.id)
        .order('position'),
      supabase.from('reviewers').select('id, user_id').eq('project_id', project.id),
      supabase.from('scores').select('id, item_id, criterion_id, reviewer_id, score, comment').eq('item.project_id', project.id),
    ]);

    const allItems = (itemsRes.data as Item[]) ?? [];
    const allCriteria = (criteriaRes as unknown as RubricCriterion[]) ?? [];
    const allReviewers = (reviewersRes.data as Reviewer[]) ?? [];
    const allScores = (scoresRes.data as Score[]) ?? [];

    // Build CSV
    const header = [
      'Item #',
      'Item Content',
      'Criterion',
      'Criterion Weight',
      'Max Score',
      'Reviewer',
      'Score',
      'Comment',
    ];

    const rows: string[] = [header.map(csvEscape).join(',')];

    for (const item of allItems) {
      for (const c of allCriteria) {
        const itemScores = allScores.filter(
          (s) => s.item_id === item.id && s.criterion_id === c.id
        );
        if (itemScores.length === 0) {
          rows.push(
            [
              String(item.position + 1),
              item.content,
              c.name,
              String(c.weight),
              String(c.max_score),
              '',
              '',
              '',
            ]
              .map(csvEscape)
              .join(',')
          );
        } else {
          for (const s of itemScores) {
            const reviewer = allReviewers.find((r) => r.id === s.reviewer_id);
            rows.push(
              [
                String(item.position + 1),
                item.content,
                c.name,
                String(c.weight),
                String(c.max_score),
                reviewer?.user_id ?? s.reviewer_id,
                String(s.score),
                s.comment ?? '',
              ]
                .map(csvEscape)
              .join(',')
            );
          }
        }
      }
    }

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}_scores.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('CSV exported', 'success');
  };

  if (criteria.length === 0) {
    return (
      <div className="card p-10 text-center">
        <Settings2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium mb-1">No rubric criteria yet</p>
        <p className="text-sm text-slate-400">Define criteria in the Rubric tab to see dashboard analytics.</p>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="card p-10 text-center">
        <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium mb-1">No scores yet</p>
        <p className="text-sm text-slate-400">Score some items in the Scoring tab to see analytics here.</p>
      </div>
    );
  }

  const maxDistCount = Math.max(...Object.values(distribution), 1);

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Award}
          label="Overall Score"
          value={overallScore.toFixed(2)}
          sub={`out of ${maxScoreValue.toFixed(1)}`}
          color="sky"
        />
        <StatCard
          icon={ClipboardList}
          label="Items Scored"
          value={String(items.length)}
          sub={`${scores.length} total scores`}
          color="emerald"
        />
        <StatCard
          icon={Users}
          label="Reviewers"
          value={String(reviewers.length)}
          sub={reviewers.length === 1 ? 'just you' : 'multiple reviewers'}
          color="violet"
        />
        <StatCard
          icon={TrendingUp}
          label="Agreement"
          value={agreement ? `${agreement.agreementPct}%` : '—'}
          sub={agreement ? `σ = ${agreement.avgStdDev}` : 'single reviewer'}
          color="amber"
        />
      </div>

      {/* Average per criterion */}
      <div className="card p-5">
        <h3 className="font-medium text-white text-sm mb-4">Average Score per Criterion</h3>
        <div className="space-y-4">
          {criterionStats.map((cs) => {
            const pct = cs.maxPossible > 0 ? (cs.weightedAvg / cs.maxPossible) * 100 : 0;
            return (
              <div key={cs.criterion.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-200">{cs.criterion.name}</span>
                    <span className="text-xs text-slate-500">×{cs.criterion.weight}</span>
                  </div>
                  <span className="text-sm text-slate-400 font-medium">
                    {cs.avg.toFixed(2)} <span className="text-slate-600">/ {cs.criterion.max_score}</span>
                    <span className="text-slate-600 ml-2">({cs.count} scores)</span>
                  </span>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score distribution + agreement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribution chart */}
        <div className="card p-5">
          <h3 className="font-medium text-white text-sm mb-4">Score Distribution</h3>
          <div className="flex items-end justify-between gap-2 h-48 pt-4">
            {Array.from({ length: maxScoreValue }, (_, i) => i + 1).map((val) => {
              const count = distribution[val] ?? 0;
              const heightPct = (count / maxDistCount) * 100;
              return (
                <div key={val} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">{count}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full bg-gradient-to-t from-sky-600 to-sky-400 rounded-t-md transition-all duration-500 hover:from-sky-500 hover:to-sky-300"
                      style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{val}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 text-center mt-3">Score value (1 = lowest, {maxScoreValue} = highest)</p>
        </div>

        {/* Agreement / reviewer info */}
        <div className="card p-5">
          <h3 className="font-medium text-white text-sm mb-4">Inter-Rater Agreement</h3>
          {agreement ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(30,41,59)" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="rgb(56,189,248)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(agreement.agreementPct / 100) * 264} 264`}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-white">{agreement.agreementPct}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-300">
                    Based on {agreement.groupCount} item-criterion pair{agreement.groupCount === 1 ? '' : 's'} scored by multiple reviewers.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Average standard deviation: {agreement.avgStdDev}
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-3">
                100% means all reviewers gave identical scores. Lower percentages indicate more disagreement.
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm text-slate-400">
                {reviewers.length < 2
                  ? 'Only one reviewer so far. Add more reviewers to measure agreement.'
                  : 'No items have been scored by multiple reviewers yet.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <button onClick={exportCsv} className="btn-secondary">
          <Download className="w-4 h-4" />
          Export Scores as CSV
        </button>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof Award;
  label: string;
  value: string;
  sub: string;
  color: 'sky' | 'emerald' | 'violet' | 'amber';
}) {
  const colorMap = {
    sky: 'text-sky-400 bg-sky-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-white leading-tight">{value}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2">{sub}</p>
    </div>
  );
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
