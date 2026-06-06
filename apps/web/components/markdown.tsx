"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clsx } from "clsx";
import type { Components } from "react-markdown";

/**
 * Compact Markdown renderer for AI coach replies. Styled inline (rather than via
 * @tailwindcss/typography) to keep the chat bubbles tight and dependency-light.
 */
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="marker:text-gray-400">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="mb-1 mt-2 font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-2 font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 font-semibold first:mt-0">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-gray-300 pl-3 text-gray-500">{children}</blockquote>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{children}</pre>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "");
    return isBlock ? (
      <code className={clsx("font-mono", className)}>{children}</code>
    ) : (
      <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
