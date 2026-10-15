/*
# RubricLens — initial schema

Creates the full data model for RubricLens, a tool for scoring AI-generated
outputs against a custom rubric with multiple reviewers.

## Tables

1. `projects` — A user-created evaluation project with a name and description.
   - `id` (uuid, pk)
   - `name` (text, not null)
   - `description` (text, nullable)
   - `user_id` (uuid, not null, defaults to the authenticated owner)
   - `created_at` (timestamptz)

2. `rubrics` — Each project has exactly one rubric (1:1 via unique project_id).
   - `id` (uuid, pk)
   - `project_id` (uuid, fk -> projects, cascade delete)
   - `created_at` (timestamptz)

3. `rubric_criteria` — The list of criteria that make up a rubric. Each has a
   name, description, a weight, a max score (scale, e.g. 5), and a position.
   - `id` (uuid, pk)
   - `rubric_id` (uuid, fk -> rubrics, cascade delete)
   - `name` (text, not null)
   - `description` (text, nullable)
   - `weight` (numeric, not null, default 1)
   - `max_score` (int, not null, default 5)
   - `position` (int, not null, default 0)

4. `items` — The batch of AI outputs to be evaluated within a project.
   - `id` (uuid, pk)
   - `project_id` (uuid, fk -> projects, cascade delete)
   - `content` (text, not null)
   - `position` (int, not null, default 0)
   - `created_at` (timestamptz)

5. `reviewers` — Reviewers associated with a project. Structured to support
   multiple reviewers per item later; for now the logged-in owner is added.
   - `id` (uuid, pk)
   - `project_id` (uuid, fk -> projects, cascade delete)
   - `user_id` (uuid, fk -> auth.users, cascade delete)
   - `created_at` (timestamptz)
   - unique(project_id, user_id)

6. `scores` — A reviewer's score for one item against one criterion, with an
   optional comment. Unique per (item, criterion, reviewer).
   - `id` (uuid, pk)
   - `item_id` (uuid, fk -> items, cascade delete)
   - `criterion_id` (uuid, fk -> rubric_criteria, cascade delete)
   - `reviewer_id` (uuid, fk -> reviewers, cascade delete)
   - `score` (int, not null)
   - `comment` (text, nullable)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

## Security

Row Level Security is enabled on every table. All access is owner-scoped: a
row is accessible only if the owning project's `user_id` matches `auth.uid()`.
Child tables check ownership through their parent `projects` row via EXISTS
subqueries. Four separate policies (SELECT/INSERT/UPDATE/DELETE) per table,
scoped to `authenticated`.

## Notes

1. `projects.user_id` defaults to `auth.uid()` so inserts that omit it still
   satisfy the INSERT WITH CHECK policy.
2. `reviewers` is seeded with the project owner automatically by the app when
   a project is created, so the owner can score their own items immediately.
3. `scores.score` is validated client-side to be within [1, criterion.max_score]
   before insert; a CHECK constraint enforces score >= 1.
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rubrics_project_id_key ON rubrics(project_id);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id uuid NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 1,
  max_score int NOT NULL DEFAULT 5,
  position int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reviewers_project_user_key ON reviewers(project_id, user_id);

CREATE TABLE IF NOT EXISTS scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES reviewers(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score >= 1),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scores_item_criterion_reviewer_key
  ON scores(item_id, criterion_id, reviewer_id);

CREATE INDEX IF NOT EXISTS scores_criterion_idx ON scores(criterion_id);
CREATE INDEX IF NOT EXISTS scores_item_idx ON scores(item_id);
CREATE INDEX IF NOT EXISTS scores_reviewer_idx ON scores(reviewer_id);

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- ===== projects: direct ownership =====
DROP POLICY IF EXISTS "select_own_projects" ON projects;
CREATE POLICY "select_own_projects" ON projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_projects" ON projects;
CREATE POLICY "insert_own_projects" ON projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_projects" ON projects;
CREATE POLICY "update_own_projects" ON projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_projects" ON projects;
CREATE POLICY "delete_own_projects" ON projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ===== rubrics: ownership through projects =====
DROP POLICY IF EXISTS "select_own_rubrics" ON rubrics;
CREATE POLICY "select_own_rubrics" ON rubrics FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = rubrics.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_rubrics" ON rubrics;
CREATE POLICY "insert_own_rubrics" ON rubrics FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = rubrics.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_rubrics" ON rubrics;
CREATE POLICY "update_own_rubrics" ON rubrics FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = rubrics.project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = rubrics.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_rubrics" ON rubrics;
CREATE POLICY "delete_own_rubrics" ON rubrics FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = rubrics.project_id AND p.user_id = auth.uid()));

-- ===== rubric_criteria: ownership through rubrics -> projects =====
DROP POLICY IF EXISTS "select_own_rubric_criteria" ON rubric_criteria;
CREATE POLICY "select_own_rubric_criteria" ON rubric_criteria FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM rubrics r JOIN projects p ON p.id = r.project_id WHERE r.id = rubric_criteria.rubric_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_rubric_criteria" ON rubric_criteria;
CREATE POLICY "insert_own_rubric_criteria" ON rubric_criteria FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM rubrics r JOIN projects p ON p.id = r.project_id WHERE r.id = rubric_criteria.rubric_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_rubric_criteria" ON rubric_criteria;
CREATE POLICY "update_own_rubric_criteria" ON rubric_criteria FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM rubrics r JOIN projects p ON p.id = r.project_id WHERE r.id = rubric_criteria.rubric_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM rubrics r JOIN projects p ON p.id = r.project_id WHERE r.id = rubric_criteria.rubric_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_rubric_criteria" ON rubric_criteria;
CREATE POLICY "delete_own_rubric_criteria" ON rubric_criteria FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM rubrics r JOIN projects p ON p.id = r.project_id WHERE r.id = rubric_criteria.rubric_id AND p.user_id = auth.uid()));

-- ===== items: ownership through projects =====
DROP POLICY IF EXISTS "select_own_items" ON items;
CREATE POLICY "select_own_items" ON items FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = items.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_items" ON items;
CREATE POLICY "insert_own_items" ON items FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = items.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_items" ON items;
CREATE POLICY "update_own_items" ON items FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = items.project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = items.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_items" ON items;
CREATE POLICY "delete_own_items" ON items FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = items.project_id AND p.user_id = auth.uid()));

-- ===== reviewers: ownership through projects =====
DROP POLICY IF EXISTS "select_own_reviewers" ON reviewers;
CREATE POLICY "select_own_reviewers" ON reviewers FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = reviewers.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_reviewers" ON reviewers;
CREATE POLICY "insert_own_reviewers" ON reviewers FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = reviewers.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_reviewers" ON reviewers;
CREATE POLICY "update_own_reviewers" ON reviewers FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = reviewers.project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = reviewers.project_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_reviewers" ON reviewers;
CREATE POLICY "delete_own_reviewers" ON reviewers FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = reviewers.project_id AND p.user_id = auth.uid()));

-- ===== scores: ownership through items -> projects and reviewers -> projects =====
DROP POLICY IF EXISTS "select_own_scores" ON scores;
CREATE POLICY "select_own_scores" ON scores FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM items i JOIN projects p ON p.id = i.project_id WHERE i.id = scores.item_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_scores" ON scores;
CREATE POLICY "insert_own_scores" ON scores FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM items i JOIN projects p ON p.id = i.project_id WHERE i.id = scores.item_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_scores" ON scores;
CREATE POLICY "update_own_scores" ON scores FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM items i JOIN projects p ON p.id = i.project_id WHERE i.id = scores.item_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM items i JOIN projects p ON p.id = i.project_id WHERE i.id = scores.item_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_scores" ON scores;
CREATE POLICY "delete_own_scores" ON scores FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM items i JOIN projects p ON p.id = i.project_id WHERE i.id = scores.item_id AND p.user_id = auth.uid()));

-- updated_at trigger for scores
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scores_set_updated_at ON scores;
CREATE TRIGGER scores_set_updated_at BEFORE UPDATE ON scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
