import { Box } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { buildWorkspaceFileUrl } from "../commands/fileCommands";

const workspaceImageUrlCache = new Map<string, string>();

/** Returns true for URLs that should not be resolved relative to the workspace path. */
function isAbsoluteUrl(src: string): boolean {
  return /^data:/i.test(src) || /^[a-z][a-z0-9+.-]*:/i.test(src);
}

/** Resolves a relative path against a base directory string. */
export function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir ? baseDir.split("/") : [];
  const segments = relativePath.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      if (parts.length > 0) parts.pop();
    } else if (segment !== "." && segment !== "") {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

type MarkdownImageProps = {
  src?: string;
  alt?: string;
  worktreePath: string;
  fileDir: string;
};

/** Resolves workspace-relative image paths to protocol URLs and renders them. */
export function MarkdownImage({ src, alt, worktreePath, fileDir }: MarkdownImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const resolveImage = useCallback(async () => {
    if (!src) return;

    if (isAbsoluteUrl(src)) {
      setResolvedSrc(src);
      return;
    }

    if (!worktreePath) {
      setResolvedSrc(src);
      return;
    }

    const cleanSrc = src.replace(/[?#].*$/, "");
    const relativePath = resolveRelativePath(fileDir, cleanSrc);
    const cacheKey = `${worktreePath}:${relativePath}`;

    const cached = workspaceImageUrlCache.get(cacheKey);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }

    try {
      const protocolUrl = buildWorkspaceFileUrl({ workspaceWorktreePath: worktreePath, relativePath });
      workspaceImageUrlCache.set(cacheKey, protocolUrl);
      setResolvedSrc(protocolUrl);
    } catch {
      setHasError(true);
    }
  }, [src, worktreePath, fileDir]);

  useEffect(() => {
    setHasError(false);
    setResolvedSrc(null);
    void resolveImage();
  }, [resolveImage]);

  if (hasError) {
    return (
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: "action.hover",
          color: "text.secondary",
          fontSize: "0.85em",
        }}
      >
        {alt || "image"}
      </Box>
    );
  }

  if (!resolvedSrc) {
    return (
      <Box
        component="span"
        sx={{
          display: "inline-block",
          width: 48,
          height: 48,
          borderRadius: 1,
          bgcolor: "action.hover",
        }}
      />
    );
  }

  return <img src={resolvedSrc} alt={alt ?? ""} style={{ maxWidth: "100%", height: "auto", borderRadius: 4 }} />;
}

export { isAbsoluteUrl };
