import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Use the project's pinned compiler so the test also runs on its Node 22.12
// minimum, without relying on Node's later built-in TypeScript support.
const source = fs.readFileSync(new URL('../apps/desktop/src/demo/intent.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { understandRequest, getTaskKind, getProvidedText } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

function expectIntent(prompt, kind, needsScreen, confidence) {
  const actual = understandRequest(prompt);
  assert.equal(actual.kind, kind, `${prompt}: task kind`);
  assert.equal(actual.needsScreen, needsScreen, `${prompt}: screen requirement`);
  if (confidence) assert.equal(actual.confidence, confidence, `${prompt}: confidence`);
  assert.ok(actual.summary.length > 0);
  assert.match(actual.reason, /^本地意图判断[:：]/);
  assert.equal(getTaskKind(prompt), actual.kind);
}

test('all ten existing demo entry points keep their task kind', () => {
  const examples = [
    ['帮我翻译一下当前页面', 'translate'], ['我遇到了报错,帮我看看', 'repair'],
    ['并行调研三个周末出行方案', 'research'], ['持续跟进这次项目发布', 'followup'],
    ['演示云电脑和本机接管', 'computer'], ['演示 Slack 和 Teams 跨渠道对话', 'channels'],
    ['在 Space 中用 @dot 起草文档', 'space'], ['打开语音通话演示', 'voice'],
    ['读取一份本地文件', 'files'], ['帮我理清接下来的一步', 'general'],
  ];
  for (const [prompt, kind] of examples) assert.equal(getTaskKind(prompt), kind, prompt);
});

test('explicit and colloquial visual requests require a selected screen source', () => {
  const examples = [
    ['翻译当前页面里的英文文档', 'translate'], ['这个英文什么意思', 'translate'],
    ['这个页面帮我看一下', 'screen'], ['看看当前屏幕', 'screen'],
    ['这个页面看不懂', 'screen'], ['屏幕上这是啥', 'screen'],
    ['截个图', 'screen'], ['请帮我截图', 'screen'], ['take a screenshot', 'screen'],
    ['看看终端日志报错', 'repair'], ['我遇到了报错,截图分析', 'repair'],
    ['我遇到了报错', 'repair'], ['我这报错了', 'repair'], ['出错了', 'repair'],
    ['红字报错', 'repair'], ['程序闪退了', 'repair'], ['请翻译当前页面的“设置”', 'translate'],
  ];
  for (const [prompt, kind] of examples) expectIntent(prompt, kind, true, 'high');
});

test('capture prohibitions override visual context and reported errors', () => {
  for (const prompt of [
    '不要截图,帮我翻译当前页面', '别看屏幕,我这报错了', '不需要截图,程序闪退了',
    '不用截屏,看看终端日志报错', '不要看我的屏幕,这个英文什么意思',
    '不要自动截图,截个图', 'do not take a screenshot,看看当前屏幕',
    '不希望你截图,帮我看当前页面', '不想让你截图,我遇到了报错',
    '不要做截图,翻译当前页面', '禁止屏幕截图,翻译当前页面',
    '不要截取屏幕,这个页面帮我看一下', '先别截取桌面,我这报错了',
    '不想让你获取屏幕,这个英文什么意思', '不要做屏幕截图,帮我看看当前页面',
    '别截取我的桌面,程序闪退了', '不希望你进行屏幕截图,红字报错',
  ]) {
    const intent = understandRequest(prompt);
    assert.equal(intent.needsScreen, false, prompt);
    assert.match(intent.reason, /明确要求不截图/);
  }
});

test('provided text, quoted commands and code do not authorize capture', () => {
  const examples = [
    ['翻译这句话:Hello', 'translate'], ['翻译这句话:Error: screenshot failed', 'translate'],
    ['翻译“error”这个单词', 'translate'], ['解释“看看当前屏幕”这句话', 'general'],
    ['这个英文“Hello”什么意思', 'translate'], ['这个英文什么意思:Hello', 'translate'],
    ['写一篇包含“报错”和“闪退”的小说', 'space'], ['读取 error.log', 'files'],
    ['报错内容:TypeError: Cannot read properties of undefined', 'repair'],
    ['翻译这段文字:请截图分析当前屏幕', 'translate'],
    ['解释以下文本:\n```\n我这报错了,截图分析\n```', 'general'],
  ];
  for (const [prompt, kind] of examples) expectIntent(prompt, kind, false);
});

test('ambiguous requests and questions offer a screen option without requesting capture', () => {
  for (const [prompt, kind] of [
    ['为什么打不开', 'repair'], ['怎么回事', 'general'], ['帮我看看', 'general'],
    ['看不懂', 'screen'], ['这是啥', 'screen'], ['当前页面', 'screen'],
    ['如何截图', 'screen'], ['你会截图吗', 'screen'], ['报错是什么意思', 'repair'],
    ['', 'general'],
  ]) expectIntent(prompt, kind, false, 'low');
});

test('task actions take priority over incidental file, document and voice nouns', () => {
  const examples = [
    ['帮我翻译英文语音', 'translate'], ['翻译这份英文文档', 'translate'],
    ['看看终端日志报错', 'repair'], ['帮我起草一份英文文档', 'space'],
    ['比较三个语音通话方案', 'research'], ['调研云电脑方案', 'research'],
    ['翻译 Slack 消息', 'translate'], ['读取 bug.txt', 'files'],
  ];
  for (const [prompt, kind] of examples) assert.equal(getTaskKind(prompt), kind, prompt);
});

test('provided text can initialize the local canvas without changing case or line breaks', () => {
  const examples = [
    ['翻译这句话:Hello World', 'Hello World'],
    ['翻译这段文字：\nHello World\nSecond LINE\n', 'Hello World\nSecond LINE'],
    ['报错内容：TypeError: Cannot read\n  at Main.ts:12', 'TypeError: Cannot read\n  at Main.ts:12'],
    ['这个英文什么意思：Hello', 'Hello'],
    ['翻译“Error”这个单词', 'Error'],
    ['这个英文“Hello World”什么意思', 'Hello World'],
    ['翻译 "Hello" 和 "World"', 'Hello\nWorld'],
    ['我这报错了，提示「ENOENT」', 'ENOENT'],
    ['翻译这句话：不要截图', '不要截图'],
  ];
  for (const [prompt, expected] of examples) assert.equal(getProvidedText(prompt), expected, prompt);
  for (const prompt of ['看看当前屏幕', '我遇到了报错', '翻译当前页面', '帮我看看', '写一篇包含“报错”的小说', '']) {
    assert.equal(getProvidedText(prompt), '', prompt);
  }
});
