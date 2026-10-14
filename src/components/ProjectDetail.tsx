import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toaster';
import type { Project, Rubric, RubricCriterion, Item, Reviewer, Score } from '@/lib/types';
import RubricBuilder from '@/components/RubricBuilder';
import ItemManager from '@/components/ItemManager';
import ScoringView from '@/components/ScoringView';
import ProjectDashboard from '@/components/ProjectDashboard';
import {
  ArrowLeft,
  Settings2,
  FileText,
  ClipboardCheck,
  BarChart3,
  Loader2,
} from 'lucide-react';

type Tab = 'dashboard' | 'rubric' | 'items' | 'scoring';

interface Props {
  projectId: string;
  onBack: () => void;
}

export default function ProjectDetail({ projectId, onBack }: Props) {
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [projectRes, rubricRes, criteriaRes, itemsRes, reviewersRes, scoresRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
      supabase.from('rubrics').select('*').eq('project_id', projectId).maybeSingle(),
      supabase
        .from('rubric_criteria')
        .select('*')
        .eq('rubric.project_id', projectId)
        .order('position', { ascending: true }),
      supabase.from('items').select('*').eq('project_id', projectId).order('position', { ascending: true }),
      supabase.from('reviewers').select('*').eq('project_id', projectId),
      supabase
        .from('scores')
        .select('*')
        .eq('item.project_id', projectId),
    ]);

    if (projectRes.error) toast('Failed to load project: ' + projectRes.error.message, 'error');
    if (rubricRes.error) toast('Failed to load rubric: ' + rubricRes.error.message, 'error');

    setProject((projectRes.data as Project) ?? null);
    setRubric((rubricRes.data as Rubric) ?? null);
    setCriteria((criteriaRes.data as RubricCriterion[]) ?? []);
    setItems((itemsRes.data as Item[]) ?? []);
    setReviewers((reviewersRes.data as Reviewer[]) ?? []);
    setScores((scoresRes.data as Score[]) ?? []);
    setLoading(false);
  }, [projectId, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'rubric', label: 'Rubric', icon: Settings2 },
    { id: 'items', label: 'Items', icon: FileText },
    { id: 'scoring', label: 'Scoring', icon: ClipboardCheck },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-400">Project not found.</p>
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft className="w-4 h-4" /> Back to projects
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb + header */}
      <button onClick={onBack} className="btn-ghost mb-4 -ml-2 text-sm">
        <ArrowLeft className="w-4 h-4" />
        All Projects
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">{project.name}</h1>
        {project.description && (
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">{project.description}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-800 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-sky-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard' && (
        <ProjectDashboard
          project={project}
          criteria={criteria}
          items={items}
          reviewers={reviewers}
          scores={scores}
        />
      )}
      {tab === 'rubric' && (
        <RubricBuilder
          rubric={rubric}
          criteria={criteria}
          onCriteriaChange={(c) => setCriteria(c)}
        />
      )}
      {tab === 'items' && (
        <ItemManager
          projectId={projectId}
          items={items}
          onItemsChange={setItems}
        />
      )}
      {tab === 'scoring' && (
        <ScoringView
          project={project}
          criteria={criteria}
          items={items}
          reviewers={reviewers}
          scores={scores}
          onScoresChange={setScores}
        />
      )}
    </div>
  );
}
