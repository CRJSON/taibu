"use client";
import {
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Globe,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { AgentMessageData } from "@/lib/agent/types";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { ThinkingBlock } from "./ThinkingBlock";

const statusLabels = {
  queued: "任务已排队",
  running: "正在执行",
  awaiting_input: "等待补充信息",
  cancelling: "正在停止",
  completed: "任务完成",
  cancelled: "任务已停止",
  failed: "任务未完成",
};
export function AgentMessage({ data }: { data: AgentMessageData }) {
  return (
    <div
      className="space-y-3"
      data-agent-run-id={data.runId}
      data-agent-status={data.status}
    >
      <div
        className="flex items-center gap-2 text-xs text-foreground-secondary"
        role="status"
      >
        {data.status === "running" || data.status === "queued" ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        ) : data.status === "completed" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <CircleAlert className="h-3.5 w-3.5" />
        )}
        <span>{statusLabels[data.status]}</span>
      </div>
      {data.parts.map((part) => {
        if (part.type === "text")
          return (
            <MarkdownContent
              key={part.id}
              content={part.text}
              className="text-base text-foreground leading-relaxed"
            />
          );
        if (part.type === "reasoning")
          return (
            <ThinkingBlock
              key={part.id}
              content={part.text}
              isStreaming={data.status === "running"}
            />
          );
        if (part.type === "question")
          return (
            <div
              key={part.id}
              className="border-l-2 border-accent pl-4 py-2 text-sm"
            >
              <MarkdownContent content={part.question} />
            </div>
          );
        if (part.type === "source")
          return /^https?:\/\//iu.test(part.url) ? (
            <a
              key={part.id}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-sm text-accent hover:underline break-words"
            >
              <Globe className="h-4 w-4 shrink-0 mt-0.5" />
              {part.title || part.url}
            </a>
          ) : null;
        if (part.type === "artifact")
          return (
            <Link
              key={part.id}
              href={
                part.recordId
                  ? `/records?id=${encodeURIComponent(part.recordId)}`
                  : part.chartType === "bazi"
                    ? `/bazi/result?chart=${encodeURIComponent(part.chartId ?? "")}`
                    : `/ziwei/result?chart=${encodeURIComponent(part.chartId ?? "")}`
              }
              className="inline-flex items-center gap-2 border border-border rounded-lg px-3 py-2 text-sm hover:bg-background-secondary"
            >
              <FileText className="h-4 w-4" />
              {part.title}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          );
        return (
          <details
            key={part.id}
            className="border-l border-border pl-3 py-1.5 text-sm"
          >
            <summary className="flex cursor-pointer items-center gap-2 text-foreground-secondary marker:hidden">
              {part.status === "running" ? (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : part.status === "failed" ? (
                <CircleAlert className="h-4 w-4 text-amber-600" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
              <span className="min-w-0 flex-1">{part.title}</span>
              <span className="text-xs">
                {part.status === "running"
                  ? "执行中"
                  : part.status === "failed"
                    ? "失败"
                    : "完成"}
              </span>
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background-secondary px-3 py-2 text-xs">
              {JSON.stringify({ 参数: part.input, 结果: part.output }, null, 2)}
            </pre>
          </details>
        );
      })}
      {data.error && (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="alert">
          {data.error}
        </p>
      )}
    </div>
  );
}
