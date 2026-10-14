import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toaster';
import { supabase } from '@/lib/supabase';
import type { Project, ProjectWithCounts } from '@/lib/types';
import ProjectList from '@/components/ProjectList';
import ProjectDetail from '@/components/ProjectDetail';
import { Gauge, LogOut, Plus, Loader2 } from 'lucide-react';

type View = { name: 'list' } | { name: 'detail'; projectId: string };

function parseHash(): View {
  const hash = window.location.hash.slice(1);
  const match = hash.match(/^\/project\/([a-f0-9-]+)/i);
  if (match) return { name: 'detail', projectId: match[1] };
  return { name: 'list' };
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<View>(parseHash());
  const [projects, setProjects] = useState<ProjectWithCounts[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const navigate = useCallback((v: View) => {
    if (v.name === 'list') window.location.hash = '';
    else window.location.hash = `/project/${v.projectId}`;
    setView(v);
  }, []);

  useEffect(() => {
    const onHashChange = () => setView(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, user_id, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      toast('Failed to load projects: ' + error.message, 'error');
      setLoadingProjects(false);
      return;
    }

    const projectList = data as Project[];

    // Fetch counts in parallel
    const withCounts: ProjectWithCounts[] = [];
    for (const p of projectList) {
      const [itemsRes, rubricRes, scoresRes] = await Promise.all([
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('project_id', p.id),
        supabase
          .from('rubric_criteria')
          .select('id', { count: 'exact', head: true })
          .eq('rubric.project_id', p.id),
        supabase
          .from('scores')
          .select('id', { count: 'exact', head: true })
          .eq('item.project_id', p.id),
      ]);
      withCounts.push({
        ...p,
        item_count: itemsRes.count ?? 0,
        criterion_count: rubricRes.count ?? 0,
        scored_count: scoresRes.count ?? 0,
      });
    }

    setProjects(withCounts);
    setLoadingProjects(false);
  }, [toast]);

  useEffect(() => {
    if (view.name === 'list') fetchProjects();
  }, [view, fetchProjects]);

  const handleCreateProject = async (name: string, description: string) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, description: description || null })
      .select('id, name, description, user_id, created_at')
      .single();

    if (error) {
      toast('Failed to create project: ' + error.message, 'error');
      return null;
    }

    const project = data as Project;

    // Create the rubric for this project
    const { error: rubricError } = await supabase.from('rubrics').insert({ project_id: project.id });
    if (rubricError) {
      toast('Failed to initialize rubric: ' + rubricError.message, 'error');
      return null;
    }

    // Add the owner as a reviewer
    const { error: reviewerError } = await supabase
      .from('reviewers')
      .insert({ project_id: project.id, user_id: user!.id });
    if (reviewerError && reviewerError.code !== '23505') {
      toast('Warning: could not add you as reviewer: ' + reviewerError.message, 'error');
    }

    toast('Project created', 'success');
    setShowCreate(false);
    navigate({ name: 'detail', projectId: project.id });
    return project;
  };

  const handleDeleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      toast('Failed to delete project: ' + error.message, 'error');
      return;
    }
    toast('Project deleted', 'success');
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate({ name: 'list' })}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:shadow-sky-500/40 transition-shadow">
              <Gauge className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-white tracking-tight">RubricLens</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="btn-ghost px-2.5 py-2"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {view.name === 'list' ? (
          <ProjectList
            projects={projects}
            loading={loadingProjects}
            showCreate={showCreate}
            onToggleCreate={() => setShowCreate((s) => !s)}
            onCreate={handleCreateProject}
            onOpen={(id) => navigate({ name: 'detail', projectId: id })}
            onDelete={handleDeleteProject}
          />
        ) : (
          <ProjectDetail
            projectId={view.projectId}
            onBack={() => navigate({ name: 'list' })}
          />
        )}
      </main>
    </div>
  );
}
