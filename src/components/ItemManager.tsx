import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toaster';
import type { Item } from '@/lib/types';
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  Plus,
  Inbox,
  ClipboardPaste,
} from 'lucide-react';

interface Props {
  projectId: string;
  items: Item[];
  onItemsChange: (items: Item[]) => void;
}

export default function ItemManager({ projectId, items, onItemsChange }: Props) {
  const toast = useToast();
  const [pasteText, setPasteText] = useState('');
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFromPaste = async () => {
    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast('Enter at least one item to add.', 'error');
      return;
    }

    setAdding(true);
    const startPos = items.length;
    const rows = lines.map((content, i) => ({
      project_id: projectId,
      content,
      position: startPos + i,
    }));

    const { data, error } = await supabase.from('items').insert(rows).select('*');
    if (error) {
      toast('Failed to add items: ' + error.message, 'error');
      setAdding(false);
      return;
    }

    const newItems = (data as Item[]) ?? [];
    onItemsChange([...items, ...newItems].sort((a, b) => a.position - b.position));
    setPasteText('');
    toast(`Added ${newItems.length} item${newItems.length === 1 ? '' : 's'}`, 'success');
    setAdding(false);
  };

  const handleCsvUpload = async (file: File) => {
    if (file.size > 2_000_000) {
      toast('CSV file is too large (max 2MB).', 'error');
      return;
    }

    setAdding(true);
    const text = await file.text();

    // Simple CSV parse: split lines, then split each line by comma (respecting basic quotes)
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const contents: string[] = [];

    for (const line of lines) {
      // Handle quoted fields with commas
      const parsed = parseCsvLine(line);
      // Use the first non-empty cell, or join all cells if there's only one column
      if (parsed.length === 1) {
        contents.push(parsed[0].trim());
      } else {
        // If there's a header row with "content" or "text", skip it
        const joined = parsed.join(', ').trim();
        contents.push(joined);
      }
    }

    // Skip header if first line looks like a header
    const firstLower = contents[0]?.toLowerCase().trim();
    if (firstLower === 'content' || firstLower === 'text' || firstLower === 'item' || firstLower === 'output') {
      contents.shift();
    }

    const nonEmpty = contents.filter((c) => c.length > 0);
    if (nonEmpty.length === 0) {
      toast('No valid items found in CSV.', 'error');
      setAdding(false);
      return;
    }

    const startPos = items.length;
    const rows = nonEmpty.map((content, i) => ({
      project_id: projectId,
      content,
      position: startPos + i,
    }));

    const { data, error } = await supabase.from('items').insert(rows).select('*');
    if (error) {
      toast('Failed to import items: ' + error.message, 'error');
      setAdding(false);
      return;
    }

    const newItems = (data as Item[]) ?? [];
    onItemsChange([...items, ...newItems].sort((a, b) => a.position - b.position));
    toast(`Imported ${newItems.length} item${newItems.length === 1 ? '' : 's'} from CSV`, 'success');
    setAdding(false);

    if (fileRef.current) fileRef.current.value = '';
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) {
      toast('Failed to delete item: ' + error.message, 'error');
      return;
    }
    onItemsChange(items.filter((i) => i.id !== id));
    toast('Item deleted', 'success');
  };

  const clearAll = async () => {
    if (items.length === 0) return;
    setAdding(true);
    const { error } = await supabase.from('items').delete().eq('project_id', projectId);
    if (error) {
      toast('Failed to clear items: ' + error.message, 'error');
      setAdding(false);
      return;
    }
    onItemsChange([]);
    toast('All items cleared', 'success');
    setAdding(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Items to Evaluate</h2>
        <p className="text-sm text-slate-400">
          Paste one item per line, or upload a CSV where each row is one item.
        </p>
      </div>

      {/* Add items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Paste */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardPaste className="w-4 h-4 text-sky-400" />
            <h3 className="font-medium text-white text-sm">Paste Items</h3>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Item one...\nItem two...\nItem three...'}
            rows={6}
            className="input resize-none font-mono text-xs"
          />
          <button
            onClick={addFromPaste}
            disabled={adding || !pasteText.trim()}
            className="btn-primary mt-3 w-full"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Items
          </button>
        </div>

        {/* CSV Upload */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="w-4 h-4 text-emerald-400" />
            <h3 className="font-medium text-white text-sm">Upload CSV</h3>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-sky-500 hover:bg-sky-500/5 transition-colors"
          >
            <FileText className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-300">Click to select a CSV file</p>
            <p className="text-xs text-slate-500 mt-1">Each row becomes one item</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCsvUpload(file);
            }}
          />
        </div>
      </div>

      {/* Items list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-white text-sm">
            {items.length} Item{items.length === 1 ? '' : 's'}
          </h3>
          {items.length > 0 && (
            <button onClick={clearAll} disabled={adding} className="btn-ghost text-rose-400 hover:text-rose-300 text-sm">
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="card p-10 text-center">
            <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No items added yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto">
              {items.map((item, i) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors group">
                  <span className="text-xs text-slate-500 font-mono mt-0.5 w-7 shrink-0 text-right">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-200 flex-1 whitespace-pre-wrap break-words">
                    {item.content}
                  </p>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 rounded transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
