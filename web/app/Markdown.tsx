"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// Renders a bot message as GitHub-flavoured Markdown, with syntax-highlighted
// code blocks. Styling for the common elements lives in globals.css (.md).
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const text = String(children ?? "");
            const match = /language-(\w+)/.exec(className || "");
            // A fenced block either declares a language or spans multiple lines.
            const isBlock = Boolean(match) || text.includes("\n");
            if (isBlock) {
              return (
                <SyntaxHighlighter
                  language={match?.[1] ?? "text"}
                  style={oneDark}
                  PreTag="div"
                  customStyle={{
                    margin: "0.5rem 0",
                    borderRadius: 10,
                    fontSize: 13,
                    background: "#0b0e14",
                  }}
                >
                  {text.replace(/\n$/, "")}
                </SyntaxHighlighter>
              );
            }
            return <code className="md-inline">{children}</code>;
          },
          a({ children, ...props }) {
            return (
              <a target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
