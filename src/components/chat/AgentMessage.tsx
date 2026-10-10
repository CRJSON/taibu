"use client";
import { ArrowUpRight, Globe } from "lucide-react";
import type { AgentMessageData } from "@/lib/agent/types";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { AgentStatus } from './agent/AgentStatus';
import { AgentArtifactCard } from './agent/AgentArtifactCard';
import { AgentActivityGroup, AgentActivityIndicator } from './agent/AgentActivityGroup';
import { AgentTodoProgress } from './agent/AgentTodoProgress';
import { AgentEvidenceChip } from './agent/AgentEvidenceChip';
import { formatAgentToolDuration, getAgentResponseTiming, groupAgentParts } from './agent/presentation';
export function AgentMessage({ data }: { data: AgentMessageData }) {
  const groups = groupAgentParts(data.parts);
  const responseTiming = getAgentResponseTiming(data.runtime?.responses);
  const active = ['queued', 'running', 'awaiting_input', 'cancelling'].includes(data.status);
  return (
    <div
      className="agent-message"
      data-agent-run-id={data.runId}
      data-agent-status={data.status}
    >
      <div className="agent-message-heading"><span className="agent-avatar" aria-hidden="true">卜</span><span className="agent-name">太卜</span><AgentStatus status={data.status} />{responseTiming && <span className="agent-response-time" title="本任务当前会话中已结束的模型响应用时，不包含工具执行和等待你回答的时间">模型响应 {formatAgentToolDuration(responseTiming.durationMs)} · {responseTiming.count} 次</span>}</div>
      {data.parts.map(part => part.type === 'todo' && <AgentTodoProgress key={part.id} items={part.items} />)}
      {data.compactions?.map(record => <details key={record.id} className="agent-compaction"><summary>{record.status === 'completed' ? '已压缩上下文' : '上下文压缩失败'}</summary><p>压缩至：{record.through ?? '由 Pi 确定'} · 保留起点：{record.retainedFrom ?? '最近内容'}</p><MarkdownContent content={record.summary ?? record.reason ?? ''} /></details>)}
      {groups.map((group, index) => {
        if (group.type === 'activity') return <AgentActivityGroup key={group.id} parts={group.parts} data={data} active={active && !groups.slice(index + 1).some(next => next.type === 'activity')} />;
        const part = group.part;
        if (part.type === "text")
          return (
            <MarkdownContent
              key={part.id}
              content={part.text}
              className="chat-prose"
              streaming={active && index === groups.length - 1}
            />
          );
        if (part.type === "source")
          return /^https?:\/\//iu.test(part.url) ? (
            <a
              key={part.id}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              className="agent-source-link"
            >
              <Globe className="h-4 w-4 shrink-0 mt-0.5" />
              {part.title || part.url}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
          ) : null;
        if (part.type === "artifact")
          return (
            <AgentArtifactCard key={part.id} artifact={part} />
          );
        return null;
      })}
      <AgentEvidenceChip parts={data.parts} />
      <AgentActivityIndicator data={data} />
      {data.error && (
        <p className="agent-error" role="alert">
          {data.error}
        </p>
      )}
    </div>
  );
}
