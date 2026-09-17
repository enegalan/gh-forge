/** Minimal, hand written DTOs for the fields GAF actually uses. */

export interface GitHubUser {
  login: string;
  id: number;
  type: string;
  name?: string | null;
  email?: string | null;
  html_url?: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface RepositoryPermissions {
  admin: boolean;
  maintain?: boolean;
  push: boolean;
  triage?: boolean;
  pull: boolean;
}

export interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: { login: string; type?: string };
  private: boolean;
  fork: boolean;
  archived: boolean;
  has_discussions: boolean;
  default_branch: string;
  stargazers_count: number;
  html_url: string;
  permissions?: RepositoryPermissions;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  body: string | null;
  html_url: string;
  created_at: string;
  closed_at: string | null;
  pull_request?: unknown;
  user?: { login: string } | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
  html_url: string;
  body: string | null;
  draft: boolean;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string };
  user?: { login: string } | null;
}

export interface GitHubBranchProtection {
  requiresApprovingReviews: boolean;
  requiredApprovingReviewCount: number;
}

export interface GitHubRef {
  ref: string;
  object: { sha: string; type: string };
}

export interface GitHubContentResponse {
  content?: string;
  sha: string;
  html_url?: string;
  commit?: { sha: string };
}

export interface GitHubDiscussionComment {
  id: string;
  body: string;
  url: string;
  isAnswer: boolean;
  author: string | null;
}

export interface GitHubDiscussion {
  id: string;
  number: number;
  title: string;
  url: string;
  isAnswered: boolean;
  answerId: string | null;
  answerAuthor: string | null;
  author: string | null;
  comments: GitHubDiscussionComment[];
}