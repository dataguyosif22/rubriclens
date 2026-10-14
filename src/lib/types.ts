export interface Project {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  created_at: string;
}

export interface Rubric {
  id: string;
  project_id: string;
  created_at: string;
}

export interface RubricCriterion {
  id: string;
  rubric_id: string;
  name: string;
  description: string | null;
  weight: number;
  max_score: number;
  position: number;
}

export interface Item {
  id: string;
  project_id: string;
  content: string;
  position: number;
  created_at: string;
}

export interface Reviewer {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
}

export interface Score {
  id: string;
  item_id: string;
  criterion_id: string;
  reviewer_id: string;
  score: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithCounts extends Project {
  item_count?: number;
  criterion_count?: number;
  scored_count?: number;
}
