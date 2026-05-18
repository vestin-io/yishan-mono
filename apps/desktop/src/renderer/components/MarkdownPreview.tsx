import { Box, Typography, useTheme } from "@mui/material";
import React, { useMemo } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeMermaidLite from "rehype-mermaid-lite";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { openLink } from "../commands/appCommands";
import { tabStore } from "../store/tabStore";
import { enqueueWorkspaceErrorNotice } from "../store/workspaceLifecycleNoticeStore";
import { MarkdownImage, isAbsoluteUrl, resolveRelativePath } from "./MarkdownImage";
import { MermaidBlock } from "./MermaidBlock";
import { useMarkdownStyles } from "./markdownStyles";

type MarkdownPreviewProps = {
  content: string;
  filePath?: string;
  worktreePath?: string;
};

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "div",
    "span",
    "details",
    "summary",
    "abbr",
    "kbd",
    "mark",
    "sub",
    "sup",
    "br",
    "wbr",
    "figure",
    "figcaption",
    "picture",
    "source",
    "dl",
    "dt",
    "dd",
    "cite",
    "dfn",
    "var",
    "samp",
    "ruby",
    "rt",
    "rp",
    "bdi",
    "bdo",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "style", "title", "role", "aria-*", "data-*"],
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height"],
    td: [...(defaultSchema.attributes?.td ?? []), "colspan", "rowspan"],
    th: [...(defaultSchema.attributes?.th ?? []), "colspan", "rowspan"],
    input: [...(defaultSchema.attributes?.input ?? []), "checked", "disabled"],
  },
};

async function openMarkdownLink(url: string): Promise<void> {
  const result = await openLink({ url });

  if (result.opened) {
    return;
  }

  enqueueWorkspaceErrorNotice({
    title: "Failed to open link",
    message: `Could not open link in external app (${result.reason}).`,
  });
}

/** Recursively extracts plain text from React node trees (strings, elements with children, arrays). */
function extractTextContent(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }
  return "";
}

/** Renders a Markdown string as styled HTML using react-markdown with GFM and syntax highlighting support. */
export function MarkdownPreview({ content, filePath, worktreePath }: MarkdownPreviewProps) {
  const theme = useTheme();
  const styles = useMarkdownStyles(theme);

  const fileDir = useMemo(() => {
    if (!filePath) return "";
    const parts = filePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  }, [filePath]);

  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const rehypePlugins = useMemo(
    () => [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeMermaidLite, rehypeHighlight],
    [],
  );

  const components = useMemo(
    () => ({
      pre: ({ className, children, ...props }: React.ComponentProps<"pre">) => {
        if (typeof className === "string" && className.split(/\s+/).includes("mermaid")) {
          const code = extractTextContent(children).replace(/\n$/, "");
          return <MermaidBlock code={code} />;
        }

        return (
          <pre className={className} {...props}>
            {children}
          </pre>
        );
      },
      img: ({ src, alt }: React.ComponentProps<"img">) => (
        <MarkdownImage src={src} alt={alt} worktreePath={worktreePath ?? ""} fileDir={fileDir} />
      ),
      a: ({ href, children, ...props }: React.ComponentProps<"a">) => {
        const handleClick = (e: React.MouseEvent) => {
          if (!href) return;
          e.preventDefault();

          if (href.startsWith("#")) return;

          if (isAbsoluteUrl(href)) {
            void openMarkdownLink(href);
            return;
          }

          if (worktreePath) {
            const cleanPath = href.replace(/[?#].*$/, "");
            const resolvedPath = resolveRelativePath(fileDir, cleanPath);
            if (resolvedPath) {
              tabStore.getState().openTab({
                kind: "file",
                path: resolvedPath,
              });
            }
          }
        };

        return (
          <a href={href} onClick={handleClick} {...props}>
            {children}
          </a>
        );
      },
    }),
    [worktreePath, fileDir],
  );

  if (!content.trim()) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No content to preview
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        px: 4,
        py: 3,
        ...styles.container,
      }}
    >
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins as never} components={components}>
        {content}
      </Markdown>
    </Box>
  );
}
