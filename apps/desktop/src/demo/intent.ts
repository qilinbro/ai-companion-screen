export type TaskKind = 'translate' | 'repair' | 'general' | 'research' | 'followup' | 'computer' | 'channels' | 'space' | 'voice' | 'files' | 'screen';
export type TaskIntent = {
  kind: TaskKind;
  needsScreen: boolean;
  confidence: 'high' | 'low';
  summary: string;
  reason: string;
};

const SUMMARIES: Record<TaskKind, string> = {
  translate: '翻译或解释英文内容', repair: '查看报错与程序异常', general: '整理你的请求',
  research: '比较资料与整理线索', followup: '持续跟进一件事', computer: '体验电脑接管流程',
  channels: '体验跨渠道协作', space: '起草或编辑文档', voice: '体验语音通话界面',
  files: '读取你选择的本地文件', screen: '查看页面或屏幕内容',
};

// Quoted text and code are request data: mentioning a command there is not a
// request to run it. This module only classifies text; it never captures a screen.
function withoutQuotedData(value: string): string {
  return value
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/"[^"\r\n]*"|'[^'\r\n]*'|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|`[^`]*`/g, ' ');
}

/** Extract explicitly supplied text without changing its case or internal lines. */
export function getProvidedText(prompt: string): string {
  const payload = /(?:这句(?:话)?|这段(?:话|文字|文本)?|以下(?:文字|文本|内容)?|下面(?:这句|这段|文字|文本|内容)?|文本|文字|原文|报错(?:内容|信息)?|错误(?:内容|信息)?|日志(?:内容)?|翻译|什么意思|什么含义|translate)\s*[:：]/i.exec(prompt);
  if (payload) return prompt.slice(payload.index + payload[0].length).trim();

  const request = withoutQuotedData(prompt);
  if (!/翻译|译成|译为|译一下|解释|报错|出错|错误|异常|闪退|崩溃|\btranslate\b|(?:英文|英语).{0,12}(?:什么(?:意思|含义)|看不懂|没看懂|怎么读)/i.test(request)) return '';
  const quotes = /"([^"\r\n]*)"|'([^'\r\n]*)'|“([^”]*)”|‘([^’]*)’|「([^」]*)」|『([^』]*)』|`([^`\r\n]*)`/g;
  return Array.from(prompt.matchAll(quotes), (match) => match.slice(1).find((part) => part !== undefined) ?? '').filter((part) => part.trim()).join('\n').trim();
}

function captureForbidden(value: string): boolean {
  return /(?:不要|不用|不必|无需|不需要|别|禁止|不允许|不能|不准|不希望|不想|不是让你)\s*(?:再|自动|直接|给我|去|来|帮我|进行|做|任何|让你|你|本次|现在|先|擅自|偷偷|地|\s)*(?:截(?:图|屏)|(?:屏幕|桌面|窗口|画面)(?:截图|截屏)|截取(?:我的?|当前的?|这个|此)?(?:屏幕|桌面|画面|窗口)|捕获(?:屏幕|桌面|画面)?|(?:查看|看|读取|获取|访问|使用|采集)(?:一下)?(?:我的?|当前的?|这个|此|电脑)?(?:屏幕|桌面|画面|页面|窗口))/.test(value)
    || /\b(?:do not|don't|dont|never|without|avoid|no need to)\s+(?:take\s+(?:a\s+)?screenshots?|capture\s+(?:(?:my|the)\s+)?screen|look at\s+(?:(?:my|the)\s+)?screen)\b/i.test(value);
}

function result(kind: TaskKind, needsScreen: boolean, confidence: TaskIntent['confidence'], reason: string): TaskIntent {
  return { kind, needsScreen, confidence, summary: SUMMARIES[kind], reason: `本地意图判断：${reason}` };
}

export function understandRequest(prompt: string): TaskIntent {
  const original = prompt.normalize('NFKC').trim();
  const unquoted = withoutQuotedData(original).toLowerCase().replace(/\s+/g, ' ').trim();
  // A delimited text/log payload is already supplied by the user. Inspect the
  // request before that payload so its words cannot turn into capture commands.
  const payload = /(?:这句(?:话)?|这段(?:话|文字|文本)?|以下(?:文字|文本|内容)?|下面(?:这句|这段|文字|文本|内容)?|文本|文字|原文|报错(?:内容|信息)?|错误(?:内容|信息)?|日志(?:内容)?|翻译|什么意思|什么含义|translate)\s*[:：]/i.exec(unquoted);
  const request = payload ? unquoted.slice(0, (payload.index ?? 0) + payload[0].length) : unquoted;
  const hasQuotedData = withoutQuotedData(original) !== original;
  const forbidden = captureForbidden(request);
  const hasText = Boolean(payload) || hasQuotedData;

  const translation = /翻译|译成|译为|译一下|\btranslate\b/.test(request)
    || /(?:英文|英语).{0,12}(?:什么(?:意思|含义)|看不懂|没看懂|怎么读)|(?:看不懂|没看懂).{0,12}(?:英文|英语)/.test(request)
    || /\b[a-z][a-z -]{0,40}\b(?:是?什么(?:意思|含义)|怎么(?:翻译|读))/.test(request);
  const repair = /报错|出错|错误|异常|闪退|崩溃|打不开|无法打开|启动不了|红字|卡死|蓝屏|修复|排错|排查|调试|\b(?:error|bug|exception|crash)(?!\.(?:log|txt|md|json|csv)\b)\b/.test(request);
  const visualSource = /(?:当前的?|现在的|这个|此)(?:页面|屏幕|窗口|画面|桌面|界面|网页)|屏幕上|页面上|眼前|正在看的(?:页面|内容)|(?:看看|看一下|分析|查看).{0,8}终端/.test(request);
  const contextualEnglish = /这(?:个|段|句|些).{0,8}(?:英文|英语)/.test(request) && translation;
  const inspect = /看|解释|分析|识别|读懂|弄懂|理解|什么|啥/.test(request);
  const screenshotMention = /截图|截屏|截(?:个|张|一张|一下)图|\bscreenshot\b|\bcapture\b/.test(request);
  const screenshotHowTo = /(?:怎么|如何|怎样).{0,8}(?:截图|截屏)|(?:截图|截屏).{0,8}(?:快捷键|教程|方法)|(?:你会|支持|能不能|可不可以).{0,4}(?:截图|截屏).{0,2}[吗么?？]/.test(request);
  const screenshotRequest = screenshotMention && !screenshotHowTo && (
    /(?:请|帮我|给我|替我|麻烦).{0,10}(?:截|capture)|截(?:个|张|一张|一下)图|截图(?:分析|看看|识别|翻译|解释)|^(?:截图|截屏)[吧啊呗!！?？。]*$|\b(?:take|grab|capture)\s+(?:a |the |my |current )?(?:screenshot|screen|desktop)\b/.test(request)
  );
  const definition = /什么意思|什么含义|这个词|这几个字|这个单词|定义|\bmeaning of\b/.test(request);
  const reportedIssue = repair && !definition && (
    /(?:我(?:这边|这|的程序)?(?:遇到(?:了)?|出现(?:了)?|发生(?:了)?|看到(?:了)?|这边|这)|(?:程序|软件|应用|电脑|页面|终端)(?:又|突然|老是|一直|总是)?).{0,6}(?:报错|出错|闪退|崩溃|红字|蓝屏)|(?:报错|出错|闪退|崩溃|卡死|蓝屏)[了啦]|红字报错/.test(request)
  );
  const wantsVisual = screenshotRequest || (visualSource && (inspect || translation || repair)) || contextualEnglish || reportedIssue;

  // Explicit task verbs take priority over nouns such as 文档、日志、语音.
  let kind: TaskKind;
  if (translation) kind = 'translate';
  else if (repair) kind = 'repair';
  else if (/持续|跟进|长期|截止|每天|定时|提醒|follow.?up/.test(request)) kind = 'followup';
  else if (/调研|研究|比较|对比|并行|\bresearch\b|\bcompare\b/.test(request)) kind = 'research';
  else if (/云电脑|接管|交还|使用电脑|操作电脑|\bcomputer\b/.test(request)) kind = 'computer';
  else if (/slack|teams|跨渠道|跨平台|渠道/.test(request)) kind = 'channels';
  else if (/语音|通话|打电话|\bvoice\b|\bcall\b/.test(request)) kind = 'voice';
  else if (/space|起草|@dot|写一份|写一篇|(?:编辑|写|整理).{0,8}文档/.test(request)) kind = 'space';
  else if (/文件|日志|读取|\bcsv\b|\.(?:txt|md|json|csv|log)\b/.test(request)) kind = 'files';
  else if (visualSource || screenshotMention || /看不懂|没看懂|这是(?:啥|什么)|这是什么/.test(request)) kind = 'screen';
  else kind = 'general';

  if (forbidden) return result(kind, false, kind === 'general' ? 'low' : 'high', '你明确要求不截图或不查看屏幕；仅按文字继续。');
  if (hasText && !visualSource && !screenshotRequest) {
    return result(kind, false, kind === 'general' ? 'low' : 'high', '已有你提供的文字或引用内容，不因其中的词语查看屏幕。');
  }
  if (wantsVisual) return result(kind === 'general' ? 'screen' : kind, true, 'high', '请求指向当前页面、可见报错或截图；本次读取已指定主屏幕。');
  if (kind === 'screen' || (kind === 'repair' && !hasText)) {
    return result(kind, false, 'low', screenshotHowTo ? '你在询问截图方法，尚未请求读取屏幕。' : '内容或来源还不明确；可以补充文字，或主动选择查看屏幕。');
  }
  return result(kind, false, kind === 'general' ? 'low' : 'high', kind === 'general' ? '暂不确定具体任务；先按文字继续，不查看屏幕。' : '识别到任务方向，当前没有查看屏幕的明确请求。');
}

export function getTaskKind(prompt: string): TaskKind { return understandRequest(prompt).kind; }

export function usesScreenWorkspace(intent: TaskIntent, prompt: string): boolean {
  return intent.needsScreen || ['screen', 'translate', 'repair'].includes(intent.kind)
    || (intent.confidence === 'low' && /看看|看一下|看不懂|怎么回事|这是啥/.test(prompt));
}
