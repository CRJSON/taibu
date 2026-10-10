import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentTools, createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateBriefingAgent } from '../lib/agent/briefing.server';
import { emptyPiAssistant } from '../lib/agent/pi-stream.server';
import { config } from './helpers/agent-runtime-fixture';

test('briefing uses a restricted native Agent, reads only its owner and calls Core before answering without a debit', async t => {
    const credits=require('../lib/user/credits') as typeof import('../lib/user/credits'), features=require('../lib/app-settings') as typeof import('../lib/app-settings');
    t.mock.method(credits,'getUserCreditInfo',async()=>({membership:'plus',credits:10,expiresAt:null}));
    t.mock.method(features,'readFeatureModuleStateFresh',async()=>({status:'enabled' as const}));
    const reads:string[]=[];
    const db={from(table:string){ assert.ok(['user_settings','bazi_charts'].includes(table)); const q={select:()=>q,eq:(field:string,value:string)=>{if(field==='user_id')reads.push(value);return q;},order:()=>q,limit:()=>q,maybeSingle:async()=>({data:null,error:null})};return q;},rpc(){throw new Error('briefing generator must not debit');}};
    const owner='briefing-owner';
    for (const supportsReasoning of [false, true]) {
    reads.length=0; let round=0;
    const text=await generateBriefingAgent(db as unknown as SupabaseClient,{user_id:owner,local_date:'2026-10-08',timezone:'Asia/Shanghai'},{...config,supportsReasoning},new AbortController().signal,(model,context)=>{
        assert.equal(model.maxTokens,supportsReasoning?8192:2400);
        assert.deepEqual(getCurrentTools(context.messages).map(tool=>tool.name).sort(),['almanac','load_analysis_method','read_saved_chart']);
        const events=createAssistantMessageEventStream(),message=emptyPiAssistant(model);
        message.content=round++===0?[{type:'toolCall',id:'calendar',name:'almanac',arguments:{date:'2026-10-08'}},{type:'toolCall',id:'chart',name:'read_saved_chart',arguments:{}}]:[{type:'text',text:'2026年10月8日早报：你尚未保存命盘，以下是依据黄历的一般建议，请结合实际安排，保持稳妥。'}];
        message.stopReason=message.content.some(part=>part.type==='toolCall')?'toolUse':'stop';
        events.push({type:'done',reason:message.stopReason,message});events.end(message);return events;
    });
    assert.match(text,/尚未保存命盘/);assert.deepEqual(reads,[owner,owner]);assert.equal(round,2);
    }
});

test('briefing skips disabled chart access and produces general advice from actual almanac data', async t => {
    const credits=require('../lib/user/credits') as typeof import('../lib/user/credits'), features=require('../lib/app-settings') as typeof import('../lib/app-settings');
    t.mock.method(credits,'getUserCreditInfo',async()=>({membership:'plus',credits:10,expiresAt:null}));
    t.mock.method(features,'readFeatureModuleStateFresh',async (name: Parameters<typeof features.readFeatureModuleStateFresh>[0])=>({status:name==='bazi'?'disabled':'enabled'} as Awaited<ReturnType<typeof features.readFeatureModuleStateFresh>>));
    const db={from(){throw new Error('disabled charts must not be read');}} as unknown as SupabaseClient;
    let round=0;
    const text=await generateBriefingAgent(db,{user_id:'owner',local_date:'2026-10-08',timezone:'Asia/Shanghai'},config,new AbortController().signal,(model,context)=>{
        const events=createAssistantMessageEventStream(),message=emptyPiAssistant(model);
        if(round++) {
            assert.match(JSON.stringify(context.messages),/命盘功能未启用/);
            message.content=[{type:'text',text:'今日命盘功能未启用，以下仅依黄历提供一般工作生活建议，请根据实际安排适当调整。'}];
        } else message.content=[{type:'toolCall',id:'calendar',name:'almanac',arguments:{}},{type:'toolCall',id:'chart',name:'read_saved_chart',arguments:{}}];
        message.stopReason=message.content.some(part=>part.type==='toolCall')?'toolUse':'stop';events.push({type:'done',reason:message.stopReason,message});events.end(message);return events;
    });
    assert.match(text,/一般工作生活建议/);assert.equal(round,2);
});

test('briefing rejects an ungrounded answer after one reminder instead of looping or delivering invented results', async t => {
    const credits=require('../lib/user/credits') as typeof import('../lib/user/credits'), features=require('../lib/app-settings') as typeof import('../lib/app-settings');
    t.mock.method(credits,'getUserCreditInfo',async()=>({membership:'plus',credits:10,expiresAt:null}));
    t.mock.method(features,'readFeatureModuleStateFresh',async()=>({status:'enabled' as const}));
    let requests=0;
    await assert.rejects(generateBriefingAgent({} as SupabaseClient,{user_id:'owner',local_date:'2026-10-08',timezone:'Asia/Shanghai'},config,new AbortController().signal,model=>{
        requests++;const events=createAssistantMessageEventStream(),message=emptyPiAssistant(model);message.content=[{type:'text',text:'没有调用工具而自行生成的一般结论不应该被当作已完成早报交付给用户。'}];events.push({type:'done',reason:'stop',message});events.end(message);return events;
    }),/缺少实际工具依据/);
    assert.equal(requests,2);
});
