/**
 * 定时任务调度器（支持多用户、持久化）
 */

import { Cron } from 'croner';
import { logger } from '../utils/logger';
import { runAgent } from '../agent/claude';
import { sendTextMessage } from '../feishu';
import { getDatabase } from '../storage/db';
import type { ScheduledTask, TaskResult } from './types';

class Scheduler {
  private jobs: Map<string, Cron> = new Map();
  private tasks: Map<string, ScheduledTask> = new Map(); // 内存缓存

  /**
   * 从数据库加载所有任务
   */
  loadFromDatabase(): void {
    const db = getDatabase();
    const rows = db.query(`
      SELECT * FROM scheduled_tasks WHERE enabled = 1
    `).all() as any[];

    for (const row of rows) {
      const task: ScheduledTask = {
        id: row.id,
        name: row.name,
        cron: row.cron,
        prompt: row.prompt,
        chatId: row.chat_id,
        enabled: row.enabled === 1,
        workDir: row.work_dir || undefined,
        lastRunAt: row.last_run_at || undefined,
        createdAt: row.created_at,
      };

      this.tasks.set(task.id, task);
      this.scheduleTask(task);
    }

    logger.info('Loaded scheduled tasks from database', { count: rows.length });
  }

  /**
   * 注册定时任务（保存到数据库）
   */
  register(task: ScheduledTask): void {
    // 先取消旧任务
    if (this.jobs.has(task.id)) {
      this.jobs.get(task.id)?.stop();
      this.jobs.delete(task.id);
    }

    // 保存到数据库
    const db = getDatabase();
    db.run(`
      INSERT OR REPLACE INTO scheduled_tasks
      (id, name, cron, prompt, chat_id, enabled, work_dir, last_run_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      task.id,
      task.name,
      task.cron,
      task.prompt,
      task.chatId,
      task.enabled ? 1 : 0,
      task.workDir || null,
      task.lastRunAt || null,
      task.createdAt,
    ]);

    // 更新内存缓存
    this.tasks.set(task.id, task);

    // 调度任务
    if (task.enabled) {
      this.scheduleTask(task);
    }

    logger.info('Task registered', {
      taskId: task.id,
      name: task.name,
      cron: task.cron,
      chatId: task.chatId,
      enabled: task.enabled,
    });
  }

  /**
   * 取消注册任务
   */
  unregister(taskId: string): boolean {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      this.jobs.delete(taskId);
    }

    const db = getDatabase();
    const result = db.run(`DELETE FROM scheduled_tasks WHERE id = ?`, [taskId]);
    this.tasks.delete(taskId);

    logger.info('Task unregistered', { taskId });
    return result.changes > 0;
  }

  /**
   * 调度任务
   */
  private scheduleTask(task: ScheduledTask): void {
    const job = new Cron(task.cron, {
      timezone: 'Asia/Shanghai',
    }, async () => {
      await this.executeTask(task.id);
    });

    this.jobs.set(task.id, job);

    const nextRun = job.nextRun();
    logger.info('Task scheduled', {
      taskId: task.id,
      nextRun: nextRun?.toISOString(),
    });
  }

  /**
   * 执行任务
   */
  async executeTask(taskId: string): Promise<TaskResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return {
        taskId,
        success: false,
        error: 'Task not found',
        executedAt: Date.now(),
      };
    }

    logger.info('Executing scheduled task', { taskId, name: task.name });

    try {
      const result = await runAgent(task.prompt, {
        cwd: task.workDir,
        maxTurns: 5,
      });

      if (result.success && result.response) {
        const message = `📅 **定时任务: ${task.name}**\n\n${result.response}`;
        await sendTextMessage(task.chatId, message);

        // 更新上次执行时间
        task.lastRunAt = Date.now();
        const db = getDatabase();
        db.run(`UPDATE scheduled_tasks SET last_run_at = ? WHERE id = ?`, [task.lastRunAt, taskId]);

        logger.info('Scheduled task completed', { taskId, name: task.name });

        return {
          taskId,
          success: true,
          response: result.response,
          executedAt: Date.now(),
        };
      } else {
        const errorMsg = result.error || '任务执行失败';
        await sendTextMessage(task.chatId, `⚠️ 定时任务 "${task.name}" 执行失败: ${errorMsg}`);

        return {
          taskId,
          success: false,
          error: errorMsg,
          executedAt: Date.now(),
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Scheduled task error', { taskId, error: errorMsg });

      try {
        await sendTextMessage(task.chatId, `⚠️ 定时任务 "${task.name}" 执行出错: ${errorMsg}`);
      } catch {
        logger.error('Failed to send error notification', { taskId });
      }

      return {
        taskId,
        success: false,
        error: errorMsg,
        executedAt: Date.now(),
      };
    }
  }

  /**
   * 启用任务
   */
  enable(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (!task.enabled) {
      task.enabled = true;
      const db = getDatabase();
      db.run(`UPDATE scheduled_tasks SET enabled = 1 WHERE id = ?`, [taskId]);
      this.scheduleTask(task);
    }
    return true;
  }

  /**
   * 禁用任务
   */
  disable(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.enabled = false;
    const db = getDatabase();
    db.run(`UPDATE scheduled_tasks SET enabled = 0 WHERE id = ?`, [taskId]);

    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      this.jobs.delete(taskId);
    }
    return true;
  }

  /**
   * 获取指定会话的任务列表
   */
  listTasksByChatId(chatId: string): ScheduledTask[] {
    return Array.from(this.tasks.values()).filter(t => t.chatId === chatId);
  }

  /**
   * 获取所有任务
   */
  listTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 手动触发任务
   */
  async triggerNow(taskId: string): Promise<TaskResult> {
    return this.executeTask(taskId);
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    Array.from(this.jobs.values()).forEach(job => job.stop());
    this.jobs.clear();
    logger.info('All scheduled tasks stopped');
  }
}

export const scheduler = new Scheduler();
