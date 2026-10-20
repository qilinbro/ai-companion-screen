export type ErrorClue = { label: string; suggestion: string };

// These are literal markers in the recognized text, not a diagnosis or a
// generated repair plan. No command is produced or executed from screen text.
const CLUES: { pattern: RegExp; clue: ErrorClue }[] = [
  { pattern: /TS2307|ERR_MODULE_NOT_FOUND|Cannot find module|Module not found/i, clue: { label: '模块或依赖未找到', suggestion: '识别到了模块缺失标记。可核对项目目录、依赖声明和模块路径；尚未检查真实文件。' } },
  { pattern: /EADDRINUSE|address already in use/i, clue: { label: '端口占用标记', suggestion: '可查看报错中的端口号，以及是否已有同一服务在运行。这里没有停止任何进程。' } },
  { pattern: /ENOENT|no such file or directory/i, clue: { label: '文件或目录不存在', suggestion: '可核对报错里的路径和当前工作目录。这里没有读取、创建或删除文件。' } },
  { pattern: /EACCES|EPERM|access (?:is )?denied|permission denied|拒绝访问/i, clue: { label: '访问被拒绝', suggestion: '可核对文件访问权限、占用状态和操作位置。这个标记不能单独确定原因。' } },
  { pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED/i, clue: { label: '网络或服务连接标记', suggestion: '可核对服务是否运行、地址是否正确以及网络状态；尚未发起网络诊断。' } },
  { pattern: /SyntaxError|Unexpected token|语法错误/i, clue: { label: '语法错误标记', suggestion: '可检查报错指向的文件、行号和附近符号。这里没有分析或修改源码。' } },
];

export function findErrorClues(text: string): ErrorClue[] {
  return CLUES.filter(({ pattern }) => pattern.test(text)).map(({ clue }) => clue);
}
