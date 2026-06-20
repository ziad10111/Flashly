type ReleaseMetadata = {
  commit?: string;
  deploymentId?: string;
  environment?: string;
};

const SAFE_VALUE_PATTERN = /^[a-zA-Z0-9._/-]+$/u;

const sanitizeValue = (value: string | undefined, maxLength = 80) => {
  const trimmed = value?.trim();

  if (!trimmed || !SAFE_VALUE_PATTERN.test(trimmed)) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
};

const sanitizeCommit = (value: string | undefined) => {
  const commit = sanitizeValue(value, 64);

  if (!commit) {
    return undefined;
  }

  return commit.slice(0, 12);
};

export const getReleaseMetadata = (): ReleaseMetadata => {
  const release: ReleaseMetadata = {
    commit: sanitizeCommit(
      process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.RAILWAY_GIT_COMMIT ||
        process.env.GIT_COMMIT_SHA ||
        process.env.COMMIT_SHA,
    ),
    deploymentId: sanitizeValue(process.env.RAILWAY_DEPLOYMENT_ID, 64),
    environment: sanitizeValue(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.FLASHLY_ENV || process.env.NODE_ENV, 40),
  };

  return Object.fromEntries(Object.entries(release).filter(([, value]) => Boolean(value))) as ReleaseMetadata;
};

export const formatReleaseForLog = () => {
  const release = getReleaseMetadata();
  const parts = [
    release.commit ? `commit=${release.commit}` : undefined,
    release.deploymentId ? `deployment=${release.deploymentId}` : undefined,
    release.environment ? `environment=${release.environment}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : "release=local";
};
