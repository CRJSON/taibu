export type AgentTodo = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' };
export function validateTodos(value: unknown): AgentTodo[] {
    if (!Array.isArray(value) || value.length > 50) throw new Error('任务清单最多 50 项');
    const ids = new Set<string>(); let active = 0;
    return value.map(item => {
        const todo = item as AgentTodo;
        if (!todo || typeof todo.id !== 'string' || !todo.id.trim() || todo.id.length > 80 || ids.has(todo.id) || typeof todo.title !== 'string' || !todo.title.trim() || todo.title.length > 200 || !['pending', 'in_progress', 'completed'].includes(todo.status)) throw new Error('任务条目无效');
        ids.add(todo.id); if (todo.status === 'in_progress' && ++active > 1) throw new Error('最多一个步骤执行中');
        return { id: todo.id, title: todo.title, status: todo.status };
    });
}
