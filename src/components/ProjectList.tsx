import { useState } from 'react';
import type { ProjectWithCounts } from '@/lib/types';
import { useToast } from '@/components/Toaster';
import Modal from '@/components/Modal';
import {
  Plus,
  FolderOpen,
  Trash2,
  FileText,
  ListChecks,
  ClipboardCheck,
  X,
  Loader2,
  Inbox,
} from 'lucide-react';

interface Props {
  projects: ProjectWithCounts[];
  loading: boolean;
  showCreate: boolean;
  onToggleCreate: () => void;
  onCreate: (name: string, description: string) => Promise<ProjectWithCounts | null>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ProjectList({
  projects,
  loading,
  showCreate,
  onToggleCreate,
  onCreate,
  onOpen,
  onDelete,
}: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    const result = await onCreate(name.trim(), description.trim());
    setCreating(false);
    if (result) {
      setName('');
      setDescription('');
    }
  };

  const handleDelete = (id: string) => {
    onDelete(id);
    setConfirmDelete(null);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
          <p className="text-sm text-slate-400 mt-1">
            Create a project, define a rubric, and score AI outputs.
          </p>
        </div>
        <button onClick={onToggleCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
            <Inbox className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No projects yet</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm">
            Create your first project to start defining a rubric and scoring AI outputs.
          </p>
          <button onClick={onToggleCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="card p-5 group hover:border-slate-700 transition-all cursor-pointer relative"
              onClick={() => onOpen(p.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-sky-500/20 transition-colors">
                  <FolderOpen className="w-4.5 h-4.5 text-slate-400 group-hover:text-sky-400 transition-colors" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(p.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all p-1.5 rounded-md hover:bg-slate-800"
                  title="Delete project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h3 className="font-semibold text-white mb-1 truncate">{p.name}</h3>
              <p className="text-sm text-slate-400 line-clamp-2 mb-4 min-h-[2.5rem]">
                {p.description || 'No description'}
              </p>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" />
                  {p.criterion_count ?? 0} criteria
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  {p.item_count ?? 0} items
                </span>
                <span className="flex items-center gap-1.5">
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  {p.scored_count ?? 0} scores
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create project modal */}
      <Modal open={showCreate} onClose={onToggleCreate} title="Create Project" maxWidth="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Project Name</label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GPT-4o Response Evaluation"
              className="input"
            />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you evaluating?"
              rows={3}
              className="input resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onToggleCreate} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={creating || !name.trim()} className="btn-primary">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete Project"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            This will permanently delete the project, its rubric, all items, and all scores. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="btn-danger"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
