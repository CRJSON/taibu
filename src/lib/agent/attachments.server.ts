import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelMessage } from 'ai';
import type { PrivateAttachment } from '@/types';
import { ATTACHMENT_MARKER } from './attachment-input';
export const ATTACHMENT_BUCKET = 'agent-attachments';
export type AttachmentRow = { id:string;user_id:string;object_path:string;name:string;kind:'image'|'text';mime_type:string;size:number;sha256:string;width?:number;height?:number;status:string };
export function attachmentDto(row:AttachmentRow):PrivateAttachment { return { id:row.id,name:row.name,kind:row.kind,mimeType:row.mime_type,size:row.size,sha256:row.sha256,width:row.width,height:row.height }; }
export async function validateAttachmentIds(db:SupabaseClient,userId:string,value:unknown):Promise<AttachmentRow[]> {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length>12 || value.some(id => typeof id!=='string' || !/^[0-9a-f-]{36}$/iu.test(id)) || new Set(value).size!==value.length) throw new Error('资料引用无效');
    if (!value.length) return [];
    const {data,error}=await db.from('agent_attachments').select('*').eq('user_id',userId).eq('status','ready').in('id',value);
    if(error || data?.length!==value.length) throw new Error('资料不存在、已过期或无权访问');
    if(data.filter(row=>row.kind==='image').length>4) throw new Error('每条消息最多 4 张图片');
    return data as AttachmentRow[];
}
export async function attachmentBytes(db:SupabaseClient,row:AttachmentRow):Promise<Uint8Array> {
    const {data,error}=await db.storage.from(ATTACHMENT_BUCKET).download(row.object_path);
    if(error || !data) throw new Error('读取资料失败');
    const bytes=new Uint8Array(await data.arrayBuffer());
    if(bytes.length!==row.size || createHash('sha256').update(bytes).digest('hex')!==row.sha256) throw new Error('资料完整性校验失败');
    return bytes;
}
export async function resolveAttachmentImages(db:SupabaseClient,userId:string,conversationId:string,messages:ModelMessage[]):Promise<ModelMessage[]> {
    const cache=new Map<string,Promise<Uint8Array>>();
    const output: ModelMessage[] = [];
    let totalBytes = 0;
    for (const message of messages) {
        if(message.role!=='user' || typeof message.content!=='string') { output.push(message); continue; }
        const ids=[...message.content.matchAll(ATTACHMENT_MARKER)].map(match=>match[1]);
        if(!ids.length) { output.push(message); continue; }
        const rows=await validateAttachmentIds(db,userId,[...new Set(ids)]);
        const imageRows=rows.filter(row=>row.kind==='image');
        if(!imageRows.length) { output.push(message); continue; }
        const {data,error}=await db.from('agent_attachment_refs').select('attachment_id').eq('conversation_id',conversationId).in('attachment_id',imageRows.map(row=>row.id));
        if(error || data?.length!==imageRows.length) throw new Error('图片未绑定当前会话');
        const images=await Promise.all(imageRows.map(async row=>{
            let bytes=cache.get(row.id);
            if (!bytes) {
                totalBytes += row.size;
                if (totalBytes > 64 * 1024 * 1024) throw new Error('本轮图片资料过多，请压缩对话后重试');
                bytes=attachmentBytes(db,row); cache.set(row.id,bytes);
            }
            return {type:'image' as const,image:await bytes,mediaType:row.mime_type};
        }));
        output.push({role:'user' as const,content:[{type:'text' as const,text:message.content},...images]});
    }
    return output;
}
export async function cleanupAgentAttachments(db:SupabaseClient):Promise<number> {
    const {data,error}=await db.rpc('claim_agent_attachment_cleanup',{p_limit:50});
    if(error) throw new Error('资料清理领取失败');
    let removed=0;
    for(const row of (data??[]) as AttachmentRow[]){
        const result=await db.storage.from(ATTACHMENT_BUCKET).remove([row.object_path]);
        if(result.error) continue;
        const deleted=await db.from('agent_attachments').delete().eq('id',row.id).eq('status','deleting');
        if(!deleted.error) removed++;
    }
    return removed;
}
