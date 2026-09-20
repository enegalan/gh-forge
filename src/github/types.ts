/**
 * The GitHub user.
 */
export interface GitHubUser {
  login: string;
  id: number;
  type: string;
  name?: string | null;
  email?: string | null;
  html_url?: string;
}

/**
 * The GitHub email.
 */
export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * The GitHub repository.
 */
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
  permissions: {
    admin: boolean;
    maintain?: boolean;
    push: boolean;
    triage?: boolean;
    pull: boolean;
  };
}

/**
 * The GitHub issue.
 */
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

/**
 * The GitHub pull request.
 */
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
  mergeable?: boolean | null;
  mergeable_state?: string;
}

/**
 * The GitHub branch protection.
 */
export interface GitHubBranchProtection {
  requiresApprovingReviews: boolean;
  requiredApprovingReviewCount: number;
}

/**
 * The GitHub ref.
 */
export interface GitHubRef {
  ref: string;
  object: { sha: string; type: string };
}

/**
 * The GitHub content response.
 */
export interface GitHubContentResponse {
  content?: string;
  sha: string;
  html_url?: string;
  commit?: { sha: string };
}

/**
 * The GitHub discussion comment.
 */
export interface GitHubDiscussionComment {
  id: string;
  body: string;
  url: string;
  isAnswer: boolean;
  author: string | null;
}

/**
 * The GitHub discussion.
 */
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
