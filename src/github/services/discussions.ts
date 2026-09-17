import type { HttpClient } from "../http/http-client.js";
import type { GitHubDiscussion, GitHubDiscussionComment } from "../types.js";

export interface RepositoryDiscussionInfo {
  repositoryId: string;
  hasDiscussionsEnabled: boolean;
  categories: Array<{ id: string; name: string; slug: string }>;
}

export interface CreatedDiscussion {
  id: string;
  number: number;
  url: string;
  title: string;
}

const DISCUSSION_FIELDS = `
  id
  number
  title
  url
  isAnswered
  author { login }
  answer { id author { login } }
`;

const REPOSITORY_INFO_QUERY = `
query RepositoryDiscussionInfo($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    hasDiscussionsEnabled
    discussionCategories(first: 25) {
      nodes { id name slug }
    }
  }
}`;

const LIST_DISCUSSIONS_QUERY = `
query ListDiscussions($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    discussions(first: $first, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { ${DISCUSSION_FIELDS} }
    }
  }
}`;

const DISCUSSION_BY_ID_QUERY = `
query DiscussionById($id: ID!) {
  node(id: $id) {
    ... on Discussion {
      ${DISCUSSION_FIELDS}
      comments(first: 50) {
        nodes { id body url isAnswer author { login } }
      }
    }
  }
}`;

const CREATE_DISCUSSION_MUTATION = `
mutation CreateDiscussion($input: CreateDiscussionInput!) {
  createDiscussion(input: $input) {
    discussion { id number url title }
  }
}`;

const ADD_COMMENT_MUTATION = `
mutation AddDiscussionComment($input: AddDiscussionCommentInput!) {
  addDiscussionComment(input: $input) {
    comment { id url body }
  }
}`;

const MARK_ANSWER_MUTATION = `
mutation MarkAnswer($input: MarkDiscussionCommentAsAnswerInput!) {
  markDiscussionCommentAsAnswer(input: $input) {
    comment { id isAnswer }
  }
}`;

/**
 * Discussions are only available through GraphQL (there is no REST endpoint to
 * create them), which is why this service talks GraphQL directly.
 */
export class DiscussionService {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async getRepositoryInfo(owner: string, repo: string): Promise<RepositoryDiscussionInfo> {
    const data = await this.http.graphql<{
      repository: {
        id: string;
        hasDiscussionsEnabled: boolean;
        discussionCategories: { nodes: Array<{ id: string; name: string; slug: string }> };
      } | null;
    }>(REPOSITORY_INFO_QUERY, { owner, name: repo });

    if (data.repository === null) {
      return { repositoryId: "", hasDiscussionsEnabled: false, categories: [] };
    }
    return {
      repositoryId: data.repository.id,
      hasDiscussionsEnabled: data.repository.hasDiscussionsEnabled,
      categories: data.repository.discussionCategories.nodes,
    };
  }

  async listDiscussions(owner: string, repo: string, first = 50): Promise<GitHubDiscussion[]> {
    const data = await this.http.graphql<{
      repository: { discussions: { nodes: RawDiscussion[] } } | null;
    }>(LIST_DISCUSSIONS_QUERY, { owner, name: repo, first });
    if (data.repository === null) return [];
    return data.repository.discussions.nodes.map(toDiscussion);
  }

  async getDiscussion(discussionId: string): Promise<GitHubDiscussion | null> {
    const data = await this.http.graphql<{
      node: (RawDiscussion & { comments?: { nodes: RawComment[] } }) | null;
    }>(DISCUSSION_BY_ID_QUERY, { id: discussionId });
    if (data.node === null) return null;
    const comments = data.node.comments?.nodes ?? [];
    return {
      ...toDiscussion(data.node),
      comments: comments.map(
        (comment): GitHubDiscussionComment => ({
          id: comment.id,
          body: comment.body,
          url: comment.url,
          isAnswer: comment.isAnswer,
          author: comment.author?.login ?? null,
        }),
      ),
    };
  }

  async createDiscussion(input: {
    repositoryId: string;
    categoryId: string;
    title: string;
    body: string;
  }): Promise<CreatedDiscussion> {
    const data = await this.http.graphql<{
      createDiscussion: { discussion: CreatedDiscussion };
    }>(CREATE_DISCUSSION_MUTATION, { input });
    return data.createDiscussion.discussion;
  }

  async addComment(input: { discussionId: string; body: string }): Promise<GitHubDiscussionComment> {
    const data = await this.http.graphql<{
      addDiscussionComment: { comment: { id: string; url: string; body: string } };
    }>(ADD_COMMENT_MUTATION, { input });
    return {
      id: data.addDiscussionComment.comment.id,
      body: data.addDiscussionComment.comment.body,
      url: data.addDiscussionComment.comment.url,
      isAnswer: false,
      author: null,
    };
  }

  async markAsAnswer(commentId: string): Promise<void> {
    await this.http.graphql(MARK_ANSWER_MUTATION, { input: { id: commentId } });
  }
}

interface RawComment {
  id: string;
  body: string;
  url: string;
  isAnswer: boolean;
  author: { login: string } | null;
}

interface RawDiscussion {
  id: string;
  number: number;
  title: string;
  url: string;
  isAnswered: boolean;
  author: { login: string } | null;
  answer: { id: string; author: { login: string } | null } | null;
}

function toDiscussion(raw: RawDiscussion): GitHubDiscussion {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    isAnswered: raw.isAnswered,
    answerId: raw.answer?.id ?? null,
    answerAuthor: raw.answer?.author?.login ?? null,
    author: raw.author?.login ?? null,
    comments: [],
  };
}