import type { AchievementContext } from "../achievements/achievement.js";
import type { ActionIdempotencyRef, PlannedAction } from "../domain/action.js";
import type { Logger } from "../utils/logger.js";
import { ExecutionError, errorMessage } from "../utils/errors.js";
import { GitHubHttpError } from "../github/http/http-errors.js";

export interface RepositoryTarget {
  owner: string;
  repo: string;
  defaultBranch: string;
  created: boolean;
}

export interface ActionRunInput {
  context: AchievementContext;
  action: PlannedAction;
  logger: Logger;
  dryRun: boolean;
  mergeMethod: "merge" | "squash" | "rebase";
  branchPrefix: string;
  mergePollIntervalMs?: number;
  mergeMaxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ActionOutcome {
  status: "done" | "skipped" | "failed" | "would-run";
  message: string;
  ref?: ActionIdempotencyRef;
  result?: Record<string, unknown>;
}

export function markerFor(key: string): string {
  return `gh-forge:${key}`;
}

export function markerHtml(marker: string): string {
  return `<!-- ${marker} -->`;
}

function primaryAchievement(action: PlannedAction): string {
  return action.achievementIds[0] ?? "action";
}

export function branchNameFor(action: PlannedAction, branchPrefix: string): string {
  return `${branchPrefix}/${primaryAchievement(action)}/${action.key}`;
}

export async function ensureRepository(input: ActionRunInput): Promise<RepositoryTarget> {
  const { context } = input;
  const { owner, name, visibility, discussions } = context.sandbox;
  const existing = await context.github.repositories.get(owner, name);
  if (existing !== null) {
    return { owner, repo: name, defaultBranch: existing.default_branch, created: false };
  }
  if (owner.toLowerCase() !== context.mainAccount.username.toLowerCase()) {
    throw new ExecutionError(
      `Repository ${owner}/${name} does not exist and GAF only creates repositories inside the main account's namespace (${context.mainAccount.username}).`,
      ["Create the repository yourself, or point `repositories.sandbox.owner` at your main account."],
    );
  }
  const created = await context.github.repositories.create({
    name,
    description: "Sandbox repository used by GitHub Achievement Forge (gh-forge).",
    private: visibility === "private",
    hasDiscussions: discussions,
    autoInit: true,
  });
  return { owner, repo: created.name, defaultBranch: created.default_branch, created: true };
}

export async function runAction(input: ActionRunInput): Promise<ActionOutcome> {
  if (input.dryRun) {
    return { status: "would-run", message: `[dry-run] ${input.action.description}` };
  }
  switch (input.action.kind) {
    case "close-issue-fast":
      return runCloseIssueFast(input);
    case "merged-pull-request":
    case "co-authored-merged-pull-request":
      return runMergedPullRequest(input);
    case "accepted-discussion-answer":
      return runAcceptedDiscussionAnswer(input);
    case "repository-star":
      return runRepositoryStar(input);
  }
}

async function runCloseIssueFast(input: ActionRunInput): Promise<ActionOutcome> {
  const { context, action } = input;
  const marker = markerFor(action.key);
  const repository = await ensureRepository(input);
  const { owner, repo } = repository;

  const existing = await context.github.issues.findByMarker(owner, repo, marker).catch(() => null);
  if (existing !== null) {
    return {
      status: "skipped",
      message: `Issue #${existing.number} for ${action.key} already exists.`,
      ref: { type: "issue", marker, repository: `${owner}/${repo}`, number: existing.number },
    };
  }

  const startedAt = Date.now();
  const issue = await context.github.issues.create({
    owner,
    repo,
    title: `gh-forge: ${action.achievementIds.join(", ")} ${action.key}`,
    body: [
      "Automated issue created by GitHub Achievement Forge (gh-forge).",
      "",
      `Action: ${action.description}`,
      markerHtml(marker),
    ].join("\n"),
  });
  const closed = await context.github.issues.close(owner, repo, issue.number);
  const elapsedMs = Date.now() - startedAt;
  const withinMinutes = Number(action.params["withinMinutes"] ?? 5);

  if (elapsedMs > withinMinutes * 60 * 1000) {
    return {
      status: "failed",
      message: `Issue #${issue.number} took ${Math.round(elapsedMs / 1000)}s to close, which exceeds the ${withinMinutes} minute window.`,
      ref: { type: "issue", marker, repository: `${owner}/${repo}`, number: issue.number },
    };
  }

  return {
    status: "done",
    message: `Opened and closed issue #${issue.number} in ${Math.round(elapsedMs / 1000)}s.`,
    ref: { type: "issue", marker, repository: `${owner}/${repo}`, number: issue.number },
    result: { issueNumber: issue.number, issueUrl: closed.html_url, elapsedMs },
  };
}

function buildCommitMessage(input: ActionRunInput, coAuthored: boolean, marker: string): string {
  const lines = [`gh-forge: ${input.action.description} [${input.action.key}]`];
  if (coAuthored) {
    const helper = input.context.accounts.filter((account) => account.role === "helper")[0];
    if (helper === undefined) {
      throw new ExecutionError("Pair Extraordinaire needs a helper account to co-author the commit.");
    }
    const capabilities = input.context.accountCapabilities.get(helper.id);
    const email = capabilities?.commitEmail ?? helper.commitEmail;
    if (email === undefined || email === "") {
      throw new ExecutionError(
        `No verified commit email is known for helper "${helper.id}", so GitHub would not credit it as co-author.`,
        [`Run \`gh-forge accounts set-email ${helper.id} <email>\` with an email verified on that account.`],
      );
    }
    lines.push("", `Co-authored-by: ${helper.username} <${email}>`);
  }
  lines.push("", markerHtml(marker));
  return lines.join("\n");
}

const DEFAULT_MERGE_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MERGE_MAX_ATTEMPTS = 15;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotMergeableError(error: unknown): boolean {
  return (
    error instanceof GitHubHttpError &&
    (error.status === 405 || error.status === 409) &&
    /not mergeable/i.test(error.message)
  );
}

interface MergeTarget {
  owner: string;
  repo: string;
  branch: string;
  marker: string;
  pullNumber: number;
  coAuthored: boolean;
}

/**
 * GitHub computes a pull request's mergeability lazily, so a PR that was just
 * created (or whose base branch just moved) can report `mergeable: null` and
 * reject the merge with `405: Pull Request is not mergeable`. Poll the PR until
 * GitHub reports it as mergeable and retry transient merge failures, instead of
 * failing the action on the first attempt.
 */
async function mergePullRequest(input: ActionRunInput, target: MergeTarget): Promise<ActionOutcome> {
  const { context, action } = input;
  const interval = input.mergePollIntervalMs ?? DEFAULT_MERGE_POLL_INTERVAL_MS;
  const maxAttempts = Math.max(1, input.mergeMaxAttempts ?? DEFAULT_MERGE_MAX_ATTEMPTS);
  const sleep = input.sleep ?? defaultSleep;
  const ref: ActionIdempotencyRef = {
    type: "pull-request",
    marker: target.marker,
    repository: `${target.owner}/${target.repo}`,
    branch: target.branch,
    number: target.pullNumber,
  };
  let lastError = "Pull Request is not mergeable";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await context.github.pullRequests.get(target.owner, target.repo, target.pullNumber);
    if (current === null) {
      return {
        status: "failed",
        message: `Pull request #${target.pullNumber} disappeared before it could be merged.`,
        ref,
      };
    }
    if (current.merged) {
      return {
        status: "skipped",
        message: `Pull request #${target.pullNumber} for ${action.key} is already merged.`,
        ref,
      };
    }
    if (current.mergeable === false) {
      return {
        status: "failed",
        message:
          `Pull request #${target.pullNumber} has conflicts and cannot be merged ` +
          `(mergeable_state: ${current.mergeable_state ?? "unknown"}).`,
        ref,
      };
    }
    if (current.mergeable === true) {
      try {
        const merge = await context.github.pullRequests.merge({
          owner: target.owner,
          repo: target.repo,
          pullNumber: target.pullNumber,
          mergeMethod: input.mergeMethod,
        });
        if (merge.merged) {
          return {
            status: "done",
            message: `Merged pull request #${target.pullNumber}${target.coAuthored ? " with a co-authored commit" : " without review"}.`,
            ref,
            result: {
              pullNumber: target.pullNumber,
              pullUrl: current.html_url,
              mergeSha: merge.sha,
              coAuthored: target.coAuthored,
            },
          };
        }
        lastError = merge.message;
      } catch (error) {
        if (!isNotMergeableError(error)) throw error;
        lastError = errorMessage(error);
      }
    }
    if (attempt < maxAttempts) {
      input.logger.warn(
        `pull request #${target.pullNumber} is not mergeable yet; retrying in ${interval}ms ` +
          `(attempt ${attempt}/${maxAttempts})`,
      );
      await sleep(interval);
    }
  }

  return {
    status: "failed",
    message: `Merging pull request #${target.pullNumber} failed after ${maxAttempts} attempts: ${lastError}`,
    ref,
  };
}

async function runMergedPullRequest(input: ActionRunInput): Promise<ActionOutcome> {
  const { context, action } = input;
  const marker = markerFor(action.key);
  const repository = await ensureRepository(input);
  const { owner, repo, defaultBranch } = repository;
  const branch = branchNameFor(action, input.branchPrefix);
  const head = `${owner}:${branch}`;

  const existing = await context.github.pullRequests.findByHead(owner, repo, head).catch(() => null);
  if (existing !== null && existing.merged) {
    return {
      status: "skipped",
      message: `Pull request #${existing.number} for ${action.key} is already merged.`,
      ref: {
        type: "pull-request",
        marker,
        repository: `${owner}/${repo}`,
        branch,
        number: existing.number,
      },
    };
  }

  const coAuthored = action.kind === "co-authored-merged-pull-request";
  const commitMessage = buildCommitMessage(input, coAuthored, marker);

  if (existing === null) {
    const branchSha = await context.github.repositories.getBranchSha(owner, repo, branch);
    if (branchSha === null) {
      const baseSha = await context.github.repositories.getBranchSha(owner, repo, defaultBranch);
      if (baseSha === null) {
        throw new ExecutionError(`Could not resolve the base branch ${defaultBranch} of ${owner}/${repo}`);
      }
      await context.github.repositories.createBranch(owner, repo, branch, baseSha);
    }
    await context.github.repositories.putFile({
      owner,
      repo,
      path: `${input.branchPrefix}/${primaryAchievement(action)}/${action.key}.md`,
      message: commitMessage,
      content: [
        `# ${action.description}`,
        "",
        "This file was created automatically by GitHub Achievement Forge (gh-forge).",
        "",
        `- key: \`${action.key}\``,
        `- achievements: ${action.achievementIds.join(", ")}`,
        markerHtml(marker),
        "",
      ].join("\n"),
      branch,
    });
    await context.github.pullRequests.create({
      owner,
      repo,
      title: `gh-forge: ${action.description} [${action.key}]`,
      body: [
        "Automated pull request created by GitHub Achievement Forge (gh-forge).",
        "",
        `Achievements: ${action.achievementIds.join(", ")}`,
        markerHtml(marker),
      ].join("\n"),
      head: branch,
      base: defaultBranch,
    });
  }

  const pull = existing ?? (await context.github.pullRequests.findByHead(owner, repo, head));
  if (pull === null) {
    return { status: "failed", message: `Pull request for ${action.key} could not be created.` };
  }
  if (pull.merged) {
    return {
      status: "skipped",
      message: `Pull request #${pull.number} for ${action.key} is already merged.`,
      ref: { type: "pull-request", marker, repository: `${owner}/${repo}`, branch, number: pull.number },
    };
  }

  return mergePullRequest(input, {
    owner,
    repo,
    branch,
    marker,
    pullNumber: pull.number,
    coAuthored,
  });
}

function pickDiscussionCategory(
  categories: Array<{ id: string; name: string; slug: string }>,
): { id: string; name: string; slug: string } {
  const preferred = categories.find((category) => /^(general|q&a|questions)$/i.test(category.name));
  const chosen = preferred ?? categories[0];
  if (chosen === undefined) {
    throw new ExecutionError(
      "The repository has no discussion categories, so a discussion cannot be created.",
    );
  }
  return chosen;
}
async function runAcceptedDiscussionAnswer(input: ActionRunInput): Promise<ActionOutcome> {
  const { context, action } = input;
  const marker = markerFor(action.key);
  const repository = await ensureRepository(input);
  const { owner, repo } = repository;
  const helper = context.accounts.filter((account) => account.role === "helper")[0];
  if (helper === undefined) {
    throw new ExecutionError("Galaxy Brain needs a helper account to create and accept the discussion.");
  }
  const helperClient = context.clientFor(helper.id);
  const main = context.mainAccount;

  const info = await context.github.discussions.getRepositoryInfo(owner, repo);
  if (!info.hasDiscussionsEnabled || info.repositoryId === "") {
    throw new ExecutionError(
      `Discussions are not enabled on ${owner}/${repo}.`,
      ["Enable Discussions in the repository settings; GAF never changes repository settings automatically."],
    );
  }
  const category = pickDiscussionCategory(info.categories);

  const discussions = await helperClient.discussions.listDiscussions(owner, repo, 50);
  const existing = discussions.find((discussion) => discussion.title.includes(action.key));
  if (existing !== undefined) {
    const detailed = await helperClient.discussions.getDiscussion(existing.id);
    if (detailed !== null && detailed.isAnswered && detailed.answerAuthor === main.username) {
      return {
        status: "skipped",
        message: `Discussion #${detailed.number} already has an accepted answer from ${main.username}.`,
        ref: { type: "discussion", marker, repository: `${owner}/${repo}`, discussionId: detailed.id },
      };
    }
  }

  let discussionId: string;
  let discussionNumber: number;
  let discussionUrl: string;
  if (existing === undefined) {
    const created = await helperClient.discussions.createDiscussion({
      repositoryId: info.repositoryId,
      categoryId: category.id,
      title: `gh-forge: ${action.achievementIds.join(", ")} ${action.key}`,
      body: [
        `Automated discussion created by ${helper.username} for GitHub Achievement Forge (gh-forge).`,
        "",
        markerHtml(marker),
      ].join("\n"),
    });
    discussionId = created.id;
    discussionNumber = created.number;
    discussionUrl = created.url;
  } else {
    discussionId = existing.id;
    discussionNumber = existing.number;
    discussionUrl = existing.url;
  }

  const comment = await context.github.discussions.addComment({
    discussionId,
    body: [
      `Answer posted by ${main.username} through GitHub Achievement Forge (gh-forge).`,
      "",
      markerHtml(marker),
    ].join("\n"),
  });
  await helperClient.discussions.markAsAnswer(comment.id);

  return {
    status: "done",
    message: `Discussion #${discussionNumber} created by ${helper.username}; answer from ${main.username} accepted.`,
    ref: { type: "discussion", marker, repository: `${owner}/${repo}`, discussionId },
    result: { discussionId, discussionNumber, discussionUrl },
  };
}

async function runRepositoryStar(input: ActionRunInput): Promise<ActionOutcome> {
  const { context, action } = input;
  const marker = markerFor(action.key);
  const repository = await ensureRepository(input);
  const { owner, repo } = repository;
  const helpers = context.accounts.filter((account) => account.role === "helper");
  const unitIndex = Number(action.params["unitIndex"] ?? 0);
  const account = helpers[unitIndex];
  if (account === undefined) {
    return {
      status: "failed",
      message:
        `No helper account available for star unit #${unitIndex + 1}. GAF needs ${unitIndex + 1} accounts ` +
        `that can star ${owner}/${repo}; it never creates accounts and never uses accounts owned by others.`,
    };
  }
  const client = context.clientFor(account.id);
  if (await client.stars.hasStarred(owner, repo)) {
    return {
      status: "skipped",
      message: `${account.username} already stars ${owner}/${repo}.`,
      ref: { type: "star", marker, repository: `${owner}/${repo}`, accountId: account.id },
    };
  }
  await client.stars.star(owner, repo);
  return {
    status: "done",
    message: `${account.username} starred ${owner}/${repo}.`,
    ref: { type: "star", marker, repository: `${owner}/${repo}`, accountId: account.id },
    result: { account: account.username },
  };
}
