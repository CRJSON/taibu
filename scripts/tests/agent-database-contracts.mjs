import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;

/** Runs inside the existing disposable PostgreSQL fixture, never a live DB. */
export async function agentDatabaseContracts(
  t,
  { sql, asActor, asOwner, adminId },
) {
  const owner = randomUUID(),
    other = randomUUID();
  await sql(
    `INSERT INTO auth.users(id) VALUES (${quote(owner)}),(${quote(other)});`,
  );
  await asOwner(
    `UPDATE public.users SET membership='plus',ai_chat_count=50 WHERE id IN (${quote(owner)},${quote(other)});`,
  );
  const admin = (statement) => asActor(adminId, statement);
  const parsed = async (statement) => {
    const value = await admin(statement);
    return value ? JSON.parse(value) : null;
  };
  const createConversation = () =>
    asActor(
      owner,
      `SELECT public.create_conversation_with_messages(${quote(owner)},'Agent fixture','general','chat','{}','[]');`,
    );
  const input = (id) => ({
    model: "fixture",
    reasoning: false,
    webEnabled: true,
    systemPrompt: "fixture",
    title: "Agent fixture",
    userMessage: {
      id: `user:${id}`,
      role: "user",
      content: "请排盘",
      createdAt: new Date().toISOString(),
    },
  });
  const checkpoint = {
    version: 1,
    messages: [],
    parts: [],
    finalArtifacts: [],
  };
  const assistant = (id) => ({
    id: `agent:${id}`,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    agent: { version: 1, runId: id, status: "queued", parts: [] },
  });
  const create = async (conversationId, options = {}) => {
    const id = options.id ?? randomUUID();
    return parsed(
      `SELECT to_jsonb(public.agent_create_run(${quote(id)},${quote(owner)},${quote(conversationId)},${quote(options.request ?? id)},${quote(options.hash ?? "same-hash")},${json(input(id))},${json(options.checkpoint ?? checkpoint)},${json(assistant(id))},${json({ version: 1, data: "encrypted-fixture", iv: "nonce", tag: "tag" })},${options.charge !== false}));`,
    );
  };
  const claim = async (worker = "worker-a") =>
    parsed(`SELECT to_jsonb(public.agent_claim_run(${quote(worker)}));`);
  const lease = (run) =>
    `${quote(run.id)},${quote(run.worker_id)},${run.fence}`;
  const finish = (
    run,
    status,
    message = assistant(run.id),
    cp = checkpoint,
    record = null,
  ) =>
    parsed(
      `SELECT to_jsonb(public.agent_finish_run(${lease(run)},${quote(status)},${json(cp)},${json(message)},${json(record)}));`,
    );
  const get = (id) =>
    parsed(
      `SELECT to_jsonb(r) FROM public.agent_runs r WHERE id=${quote(id)};`,
    );
  const balance = async () =>
    Number(
      await asOwner(
        `SELECT ai_chat_count FROM public.users WHERE id=${quote(owner)};`,
      ),
    );
  const command = (
    run,
    request = randomUUID(),
    mode = "reply",
    content = "1990年1月15日9点，男性",
  ) =>
    asActor(
      owner,
      `SELECT to_jsonb(public.agent_submit_command(${quote(run.id)},${quote(request)},${quote(mode)},${json({ id: randomUUID(), role: "user", content, createdAt: new Date().toISOString() })}));`,
    );
  const saveTool = (run, callId = "chart", chart = null) =>
    parsed(
      `SELECT to_jsonb(public.agent_cache_tool(${lease(run)},${quote(callId)},'bazi','calculation','{"gender":"male"}',${json({ content: [{ type: "text", text: "规范命盘" }], details: { 真实: true }, canonicalText: "规范命盘" })},${json(chart)}));`,
    );

  await t.test("Pi Durable commits checkpoints atomically, deduplicates receipts, and consumes only placed commands", async () => {
    const nativeCheckpoint = { ...checkpoint, version: 2, durable: { engine: "pi-durable/1.0.4", seeded: true } };
    const queued = await create(await createConversation(), { checkpoint: nativeCheckpoint });
    await admin("SELECT public.agent_worker_heartbeat('old-engine');");
    assert.equal(await claim("old-engine"), null, "Core workers cannot claim V2 checkpoints");
    await admin("SELECT public.agent_worker_heartbeat('durable-worker','pi-durable/1.0.4');");
    const run = await claim("durable-worker");
    assert.equal(run.id, queued.id);
    const cmd = JSON.parse(await command(run, randomUUID(), "steer", "继续对比"));
    const admission = [{ type: "submission", value: { id: 2, conversationId: 1, type: "input", status: "queued", requestId: `command:${cmd.sequence}` } }];
    const placed = [{ type: "submission", value: { ...admission[0].value, status: "placed", entry: 3 } }];
    const commit = (sequence, writes, cp = nativeCheckpoint) =>
      parsed(`SELECT public.agent_durable_commit(${lease(run)},${sequence},${json(writes)},${json(cp)});`);
    assert.equal(await commit(1, admission), 1);
    assert.equal(await asOwner(`SELECT consumed FROM public.agent_run_commands WHERE run_id=${quote(run.id)};`), "f");
    const updated = { ...nativeCheckpoint, finalSelectionMade: true };
    assert.equal(await commit(2, placed, updated), 2);
    assert.equal(await asOwner(`SELECT consumed FROM public.agent_run_commands WHERE run_id=${quote(run.id)};`), "t");
    assert.equal(await commit(1, admission), 1, "lost receipt can be retried without overwriting newer metadata");
    assert.equal((await get(run.id)).checkpoint.finalSelectionMade, true);
    await assert.rejects(commit(2, admission), /AGENT_DURABLE_CONFLICT/);
    await assert.rejects(commit(4, []), /AGENT_DURABLE_CONFLICT/);
    const rows = JSON.parse(await admin(`SELECT public.agent_durable_read(${lease(run)},1);`));
    assert.deepEqual(rows, [{ sequence: 2, writes: placed }]);
    await assert.rejects(asActor(owner, `SELECT * FROM public.agent_durable_commits;`), /42501/);
    await assert.rejects(asActor(other, `SELECT public.agent_durable_read(${lease(run)},0);`), /AGENT_ADMIN_REQUIRED/);
    await asOwner(`UPDATE public.agent_runs SET lease_until=now()-interval '1 second' WHERE id=${quote(run.id)};`);
    assert.equal(await claim("old-engine"), null, "mixed-version restart leaves native tasks to Durable workers");
    await admin("SELECT public.agent_worker_heartbeat('durable-replacement','pi-durable/1.0.4');");
    const replacement = await claim("durable-replacement");
    assert.equal(replacement.fence, run.fence + 1);
    await assert.rejects(commit(3, []), /AGENT_LEASE_LOST/);
    await assert.rejects(admin(`SELECT public.agent_durable_read(${lease(run)},0);`), /AGENT_LEASE_LOST/);
    assert.equal(JSON.parse(await admin(`SELECT public.agent_durable_read(${lease(replacement)},0);`)).length, 2);
    await finish(replacement, "failed");
  });

  await t.test("Pi Durable admitted input stays awaiting a human reply instead of spinning queued leases", async () => {
    const before = await balance();
    const cp = { ...checkpoint, version: 2, question: "补充信息？", durable: { engine: "pi-durable/1.0.4", seeded: true } };
    await create(await createConversation(), { checkpoint: cp });
    const run = await claim("durable-worker");
    const first = JSON.parse(await command(run, randomUUID(), "follow_up", "之后比较两份命盘"));
    const submission = (cmd, id, status) => ({ type: "submission", value: { id, conversationId: 1, type: "input", status, requestId: `command:${cmd.sequence}`, ...(status === "placed" ? { entry: id + 100 } : {}) } });
    await admin(`SELECT public.agent_durable_commit(${lease(run)},1,${json([submission(first, 2, "queued")])},${json(cp)});`);
    const waiting = await finish(run, "awaiting_input", assistant(run.id), cp);
    assert.equal(waiting.status, "awaiting_input");
    assert.equal(await claim("durable-worker"), null);
    const second = JSON.parse(await command(run));
    const resumed = await claim("durable-worker");
    assert.equal(resumed.id, run.id);
    assert.equal(resumed.fence, run.fence + 1);
    await admin(`SELECT public.agent_durable_commit(${lease(resumed)},2,${json([submission(first, 2, "placed"), submission(second, 3, "placed")])},${json(cp)});`);
    await finish(resumed, "failed");
    assert.equal(await balance(), before, "one original debit and refund survive every pause");
  });

  await t.test(
    "Agent creation/debit/dedup is atomic; active conversation and browser overwrite are fenced",
    async () => {
      const conversationId = await createConversation(),
        id = randomUUID();
      const before = await balance();
      const [a, b] = await Promise.all([
        create(conversationId, { id, request: id }),
        create(conversationId, { id: randomUUID(), request: id }),
      ]);
      assert.equal(a.id, b.id);
      assert.equal(await balance(), before - 1);
      await assert.rejects(
        create(conversationId, { request: id, hash: "different" }),
        /AGENT_REQUEST_MISMATCH/,
      );
      await assert.rejects(create(conversationId), /AGENT_CONVERSATION_BUSY/);
      assert.equal(
        await asActor(
          other,
          `SELECT count(*) FROM public.agent_runs WHERE id=${quote(a.id)};`,
        ),
        "0",
      );
      assert.equal(
        await asActor(
          owner,
          `SELECT count(*) FROM public.agent_run_credentials;`,
        ),
        "0",
      );
      await assert.rejects(
        asActor(
          owner,
          `UPDATE public.agent_runs SET status='completed' WHERE id=${quote(a.id)};`,
        ),
        /42501/,
      );
      await assert.rejects(
        asActor(owner, `SELECT public.agent_claim_run('intruder');`),
        /AGENT_ADMIN_REQUIRED/,
      );
      await assert.rejects(
        asActor(other, `SELECT public.agent_cancel_run(${quote(a.id)});`),
        /AGENT_RUN_NOT_FOUND/,
      );
      await assert.rejects(
        asActor(
          owner,
          `SELECT public.replace_conversation_messages(${quote(conversationId)},'[]');`,
        ),
        /AGENT_CONVERSATION_BUSY/,
      );
      await assert.rejects(
        asActor(
          owner,
          `UPDATE public.conversation_messages SET content='stale browser' WHERE conversation_id=${quote(conversationId)};`,
        ),
        /AGENT_CONVERSATION_BUSY/,
      );
      const claimed = await claim();
      const ended = await finish(claimed, "failed");
      assert.equal(ended.billing, "refunded");
      assert.equal(await balance(), before);
      await assert.rejects(finish(claimed, "failed"), /AGENT_LEASE_LOST/);
      assert.equal(await balance(), before);
      assert.equal(
        await asOwner(
          `SELECT count(*) FROM public.agent_run_credentials WHERE run_id=${quote(a.id)};`,
        ),
        "0",
      );
    },
  );

  await t.test(
    "Agent leases exclude concurrent workers, reclaim stale work, and reject stale writes",
    async () => {
      const queued = await create(await createConversation());
      const results = await Promise.all([claim("first"), claim("second")]);
      const owners = results.filter(Boolean);
      assert.equal(owners.length, 1);
      const first = owners[0];
      assert.equal(first.id, queued.id);
      const cached = await saveTool(first);
      await asOwner(
        `UPDATE public.agent_runs SET lease_until=now()-interval '1 second' WHERE id=${quote(first.id)};`,
      );
      const second = await claim("replacement");
      assert.equal(second.id, first.id);
      assert.equal(second.fence, first.fence + 1);
      await assert.rejects(
        admin(
          `SELECT public.agent_checkpoint(${lease(first)},${json(checkpoint)},${json(assistant(first.id))},'{}',NULL);`,
        ),
        /AGENT_LEASE_LOST/,
      );
      const replay = await saveTool(second);
      assert.equal(replay.id, cached.id);
      await assert.rejects(
        admin(
          `SELECT public.agent_cache_tool(${lease(second)},'chart','bazi','calculation','{"gender":"female"}','{}',NULL);`,
        ),
        /AGENT_TOOL_CALL_MISMATCH/,
      );
      await asActor(
        owner,
        `SELECT public.agent_cancel_run(${quote(second.id)});`,
      );
      const stopped = await finish(second, "completed");
      assert.equal(stopped.status, "cancelled");
      assert.equal(stopped.billing, "refunded");
    },
  );

  await t.test(
    "Agent input pause/reply and command acknowledgement retain one debit; final save and chart reuse are durable",
    async () => {
      const before = await balance();
      const queued = await create(await createConversation());
      let run = await claim();
      assert.equal(run.id, queued.id);
      const waiting = await finish(run, "awaiting_input", assistant(run.id), {
        ...checkpoint,
        question: "出生信息？",
      });
      assert.equal(waiting.status, "awaiting_input");
      assert.equal(await balance(), before - 1);
      assert.equal(
        await asOwner(
          `SELECT count(*) FROM public.agent_run_credentials WHERE run_id=${quote(run.id)};`,
        ),
        "1",
      );
      const request = randomUUID();
      const a = JSON.parse(await command(run, request)),
        b = JSON.parse(await command(run, request));
      assert.equal(a.sequence, b.sequence);
      assert.equal(a.message.id, b.message.id);
      await assert.rejects(
        command(run, request, "reply", "different"),
        /AGENT_REQUEST_MISMATCH/,
      );
      run = await claim();
      await admin(
        `SELECT public.agent_checkpoint(${lease(run)},${json(checkpoint)},${json(assistant(run.id))},'{}',${a.sequence});`,
      );
      const chart = {
        name: "Agent 八字命盘",
        birth_date: "1990-01-15",
        birth_time: "09:00",
        gender: "male",
        calendar_type: "solar",
        is_leap_month: false,
        longitude: null,
        day_master: "甲",
        day_branch: "子",
      };
      const draft = await saveTool(run, "final-chart", chart);
      const result = await finish(
        run,
        "completed",
        { ...assistant(run.id), content: "可见分析" },
        { ...checkpoint, finalArtifacts: [draft.id] },
        { title: "最终分析", content: "可见分析" },
      );
      assert.ok(result.record_id);
      assert.equal(await balance(), before - 1);
      const durable = JSON.parse(
        await asOwner(
          `SELECT json_build_object('records',(SELECT count(*) FROM public.ming_records WHERE id=${quote(result.record_id)}),'charts',(SELECT count(*) FROM public.bazi_charts WHERE user_id=${quote(owner)}),'credentials',(SELECT count(*) FROM public.agent_run_credentials WHERE run_id=${quote(run.id)}),'message',(SELECT messages FROM public.conversations WHERE id=${quote(run.conversation_id)}),'cursor',(SELECT max(sequence) FROM public.agent_run_events WHERE run_id=${quote(run.id)}));`,
        ),
      );
      assert.equal(durable.records, 1);
      assert.equal(durable.charts, 1);
      assert.equal(durable.credentials, 0);
      assert.equal(Number(result.event_cursor), durable.cursor);
      assert.equal(
        durable.message.find((m) => m.id === result.public_message.id).agent
          .status,
        "completed",
      );
      assert.ok(
        result.public_message.agent.parts.some(
          (p) => p.recordId === result.record_id,
        ),
      );
      await assert.rejects(
        finish(run, "completed", result.public_message, checkpoint, {
          title: "duplicate",
          content: "duplicate",
        }),
        /AGENT_LEASE_LOST/,
      );
      await create(await createConversation());
      run = await claim();
      const next = await saveTool(run, "reuse", chart);
      await finish(
        run,
        "completed",
        { ...assistant(run.id), content: "另一段分析" },
        { ...checkpoint, finalArtifacts: [next.id] },
        { title: "另一段分析", content: "另一段分析" },
      );
      assert.equal(
        await asOwner(
          `SELECT count(*) FROM public.bazi_charts WHERE user_id=${quote(owner)};`,
        ),
        "1",
      );
      assert.equal(await asOwner(`SELECT timezone||'/'||disambiguation FROM public.bazi_charts WHERE user_id=${quote(owner)};`), 'Asia/Shanghai/reject');
      for (const [timezone, disambiguation, expectedCount] of [
        ['America/New_York', 'earlier', 2],
        ['America/New_York', 'later', 3],
        ['UTC', 'later', 4],
        ['America/New_York', 'later', 4],
        ['Asia/Shanghai', 'reject', 4],
      ]) {
        await create(await createConversation());
        const variantRun = await claim();
        const artifact = await saveTool(variantRun, 'time-rule-identity', { ...chart, timezone, disambiguation });
        await finish(variantRun, 'completed', { ...assistant(variantRun.id), content: 'Time rule identity' }, { ...checkpoint, finalArtifacts: [artifact.id] }, { title: 'Time rule identity', content: 'Time rule identity' });
        assert.equal(await asOwner(`SELECT count(*) FROM public.bazi_charts WHERE user_id=${quote(owner)};`), String(expectedCount));
        assert.equal(await asOwner(`SELECT count(*) FROM public.bazi_charts WHERE user_id=${quote(owner)} AND timezone=${quote(timezone)} AND disambiguation=${quote(disambiguation)};`), '1');
      }
    },
  );

  await t.test(
    "Agent accepted late commands are resumed before final save; visible stops keep debit and BYOK is exempt",
    async () => {
      const before = await balance();
      await create(await createConversation());
      let run = await claim();
      const cmd = JSON.parse(
        await command(run, randomUUID(), "steer", "改为比较两份命盘"),
      );
      let ended = await finish(
        run,
        "completed",
        { ...assistant(run.id), content: "第一部分" },
        checkpoint,
        { title: "too early", content: "第一部分" },
      );
      assert.equal(ended.status, "queued");
      assert.equal(ended.record_id, null);
      assert.equal(
        await asOwner(
          `SELECT count(*) FROM public.agent_run_credentials WHERE run_id=${quote(run.id)};`,
        ),
        "1",
      );
      run = await claim();
      await admin(
        `SELECT public.agent_checkpoint(${lease(run)},${json(checkpoint)},${json({ ...assistant(run.id), content: "第一部分" })},'{}',${cmd.sequence});`,
      );
      await asActor(owner, `SELECT public.agent_cancel_run(${quote(run.id)});`);
      ended = await finish(run, "cancelled", {
        ...assistant(run.id),
        content: "第一部分",
      });
      assert.equal(ended.billing, "charged");
      assert.equal(await balance(), before - 1);
      await create(await createConversation(), { charge: false });
      run = await claim();
      ended = await finish(run, "failed");
      assert.equal(ended.billing, "exempt");
      assert.equal(await balance(), before - 1);
    },
  );

  await t.test(
    "Agent final-save event failure rolls back charts, analysis and status; retry commits once",
    async () => {
      await create(await createConversation());
      const run = await claim();
      const draft = await saveTool(run, "atomic", {
        name: "Agent 八字命盘",
        birth_date: "1995-06-20",
        birth_time: "10:30",
        gender: "female",
        calendar_type: "solar",
        is_leap_month: false,
      });
      const cp = { ...checkpoint, finalArtifacts: [draft.id] },
        message = { ...assistant(run.id), content: "atomic analysis" };
      await asOwner(
        `CREATE FUNCTION public.fixture_agent_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id=${quote(run.id)}::uuid AND NEW.type='completed' THEN RAISE EXCEPTION 'fixture event failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_agent_event_failure BEFORE INSERT ON public.agent_run_events FOR EACH ROW EXECUTE FUNCTION public.fixture_agent_event_failure();`,
      );
      try {
        await assert.rejects(
          finish(run, "completed", message, cp, {
            title: "atomic analysis",
            content: "atomic analysis",
          }),
          /fixture event failure/,
        );
      } finally {
        await asOwner(
          "DROP TRIGGER fixture_agent_event_failure ON public.agent_run_events; DROP FUNCTION public.fixture_agent_event_failure();",
        );
      }
      const current = await get(run.id);
      assert.equal(current.status, "running");
      assert.equal(current.record_id, null);
      assert.equal(
        await asOwner(
          `SELECT count(*) FROM public.ming_records WHERE title='atomic analysis';`,
        ),
        "0",
      );
      assert.equal(
        await asOwner(
          `SELECT count(*) FROM public.bazi_charts WHERE user_id=${quote(owner)} AND birth_date='1995-06-20';`,
        ),
        "0",
      );
      const result = await finish(run, "completed", message, cp, {
        title: "atomic analysis",
        content: "atomic analysis",
      });
      assert.ok(result.record_id);
      assert.equal(
        await asOwner(
          `SELECT count(*) FROM public.ming_records WHERE title='atomic analysis';`,
        ),
        "1",
      );
    },
  );

  await t.test(
    "Agent knowledge searches bind leased owner and current membership, then restore admin claims",
    async () => {
      const kb = randomUUID(),
        otherKb = randomUUID();
      await asOwner(
        `INSERT INTO public.knowledge_bases(id,user_id,name) VALUES (${quote(kb)},${quote(owner)},'Agent KB'),(${quote(otherKb)},${quote(other)},'Other KB'); INSERT INTO public.knowledge_entries(kb_id,content,source_type,source_id) VALUES (${quote(kb)},'agent celestial galaxy','record',${quote(randomUUID())}),(${quote(otherKb)},'agent celestial galaxy','record',${quote(randomUUID())});`,
      );
      await create(await createConversation());
      const run = await claim();
      const search = `public.agent_search_knowledge(${lease(run)},'fts','{"p_query":"agent celestial galaxy","p_kb_ids":null,"p_limit":5}')`;
      const result = JSON.parse(
        await admin(
          `SELECT json_build_object('rows',${search},'identity',auth.uid());`,
        ),
      );
      assert.equal(result.identity, adminId);
      assert.ok(result.rows.length);
      assert.deepEqual([...new Set(result.rows.map((r) => r.kb_id))], [kb]);
      assert.deepEqual(
        JSON.parse(
          await admin(
            `SELECT public.agent_search_knowledge(${lease(run)},'fts',${json({ p_query: "agent celestial galaxy", p_kb_ids: [otherKb], p_limit: 5 })});`,
          ),
        ),
        [],
      );
      await asOwner(
        `UPDATE public.users SET membership='free' WHERE id=${quote(owner)};`,
      );
      await assert.rejects(admin(`SELECT ${search};`), /MEMBERSHIP_REQUIRED/);
      await asOwner(
        `UPDATE public.users SET membership='plus' WHERE id=${quote(owner)};`,
      );
      await finish(run, "failed");
    },
  );
}
