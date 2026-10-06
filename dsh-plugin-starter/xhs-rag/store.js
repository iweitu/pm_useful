/**
 * 笔记的持久化。
 *
 * 为什么不用 `ctx.storageDomain`：
 * 它的记录 schema 由 zod 声明（`defineDomain` + `domainTable(zodSchema)`），
 * 而本 bundle 是零依赖的纯 JS 包，装不了 zod。所以这里用插件自有的 JSON 文件。
 *
 * 这个选择的代价很小：笔记索引是**纯派生缓存**，丢了重跑导入即可，
 * 不需要 DSH 的 schema 保证。反过来，把它放在全局位置而不是会话日志里，
 * 才能让"收藏库"跨会话共享。
 *
 * 原子写：先写临时文件再 rename。直接覆写时进程被中断会留下半个 JSON，
 * 下次启动就什么都读不出来。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const FILE_VERSION = 1;

/**
 * 打开一个笔记存储。
 *
 * @param {string} filePath - JSON 文件路径。目录会自动创建。
 * @returns {Promise<object>} 存储句柄。
 */
export async function openNoteStore(filePath) {
  /** @type {Map<string, object>} */
  let notes = new Map();
  let loadError;

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === FILE_VERSION && Array.isArray(parsed.notes)) {
      for (const note of parsed.notes) {
        if (note && typeof note.noteId === 'string') notes.set(note.noteId, note);
      }
    } else {
      loadError = `文件版本不受支持（期望 version=${FILE_VERSION}），已按空库启动`;
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      // 首次运行，正常情况。
    } else if (error instanceof SyntaxError) {
      loadError = `存储文件不是合法 JSON（${error.message}），已按空库启动；重新导入即可重建`;
    } else {
      loadError = `读取存储文件失败：${error?.message ?? error}`;
    }
  }

  async function persist() {
    const payload = {
      version: FILE_VERSION,
      savedAt: new Date().toISOString(),
      notes: [...notes.values()],
    };
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = join(dirname(filePath), `.${Date.now()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await rename(temporary, filePath);
  }

  return {
    /** 载入时的非致命问题；非空时应让用户看到。 */
    loadError,

    /** @returns {number} 当前笔记数。 */
    size() {
      return notes.size;
    },

    /** @returns {boolean} 该笔记 id 是否已存在。 */
    has(noteId) {
      return notes.has(noteId);
    },

    /** @returns {object | undefined} */
    get(noteId) {
      return notes.get(noteId);
    },

    /** @returns {object[]} 全部笔记（快照）。 */
    all() {
      return [...notes.values()];
    },

    /**
     * 写入或覆盖一条笔记并落盘。
     *
     * @param {object} note - 必须含 `noteId`。
     */
    async put(note) {
      if (!note || typeof note.noteId !== 'string') {
        throw new TypeError('note.noteId 必须是字符串');
      }
      notes.set(note.noteId, note);
      await persist();
    },

    /**
     * 删除一条笔记并落盘。
     *
     * @param {string} noteId - 笔记 id。
     * @returns {boolean} 是否真的删掉了。
     */
    async remove(noteId) {
      const existed = notes.delete(noteId);
      if (existed) await persist();
      return existed;
    },

    /** 清空并落盘。 */
    async clear() {
      notes = new Map();
      await persist();
    },

    /** 存储文件路径，用于诊断输出。 */
    filePath,
  };
}
