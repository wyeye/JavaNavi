import { JVM_DIAGNOSTIC_COMMAND_PRESETS } from "./jvmDiagnosticPresentation";

export type JVMDiagnosticCompletionMode = "command" | "argument";

export interface JVMDiagnosticCompletionState {
  mode: JVMDiagnosticCompletionMode;
  head: string;
  search: string;
}

export interface JVMDiagnosticCompletionItem {
  label: string;
  insertText: string;
  detail: string;
  documentation?: string;
  scope: JVMDiagnosticCompletionMode;
  isSnippet?: boolean;
}

type DiagnosticCommandDefinition = {
  head: string;
  detail: string;
  documentation: string;
};

const BASE_COMMAND_DEFINITIONS: DiagnosticCommandDefinition[] = [
  {
    head: "dashboard",
    detail: "观察类命令",
    documentation: "查看 JVM 运行总览。",
  },
  {
    head: "jvm",
    detail: "观察类命令",
    documentation: "查看 JVM 内存、线程、类加载、GC 和运行参数信息。",
  },
  {
    head: "thread",
    detail: "观察类命令",
    documentation: "查看热点线程、线程栈和阻塞线程。",
  },
  {
    head: "sc",
    detail: "观察类命令",
    documentation: "搜索匹配类信息。",
  },
  {
    head: "sm",
    detail: "观察类命令",
    documentation: "查看类的方法签名。",
  },
  {
    head: "jad",
    detail: "观察类命令",
    documentation: "反编译指定类。",
  },
  {
    head: "sysprop",
    detail: "观察类命令",
    documentation: "查看系统属性。",
  },
  {
    head: "sysenv",
    detail: "观察类命令",
    documentation: "查看环境变量。",
  },
  {
    head: "classloader",
    detail: "观察类命令",
    documentation: "查看类加载器信息。",
  },
  {
    head: "trace",
    detail: "跟踪类命令",
    documentation: "跟踪方法调用耗时路径。",
  },
  {
    head: "watch",
    detail: "跟踪类命令",
    documentation: "观察入参、返回值或异常。",
  },
  {
    head: "stack",
    detail: "跟踪类命令",
    documentation: "输出方法调用栈。",
  },
  {
    head: "monitor",
    detail: "跟踪类命令",
    documentation: "周期性统计方法调用。",
  },
  {
    head: "tt",
    detail: "跟踪类命令",
    documentation: "方法时光隧道，记录和回放调用。",
  },
  {
    head: "ognl",
    detail: "高风险命令",
    documentation: "执行 OGNL 表达式，默认需要额外授权。",
  },
  {
    head: "vmtool",
    detail: "高风险命令",
    documentation: "直接操作 JVM 对象或执行 VMTool 动作。",
  },
  {
    head: "redefine",
    detail: "高风险命令",
    documentation: "重新定义类字节码。",
  },
  {
    head: "retransform",
    detail: "高风险命令",
    documentation: "重新触发类转换。",
  },
  {
    head: "stop",
    detail: "控制命令",
    documentation: "停止当前后台任务。",
  },
];

const buildBaseCommandItems = (): JVMDiagnosticCompletionItem[] => {
  const itemsByHead = new Map<string, JVMDiagnosticCompletionItem>();

  BASE_COMMAND_DEFINITIONS.forEach((item) => {
    itemsByHead.set(item.head, {
      label: item.head,
      insertText: item.head,
      detail: item.detail,
      documentation: item.documentation,
      scope: "command",
    });
  });

  JVM_DIAGNOSTIC_COMMAND_PRESETS.forEach((item) => {
    const head = item.command.split(/\s+/, 1)[0]?.trim().toLowerCase() || item.label;
    if (itemsByHead.has(head)) {
      return;
    }
    itemsByHead.set(head, {
      label: head,
      insertText: head,
      detail: `${item.category} 命令`,
      documentation: item.description,
      scope: "command",
    });
  });

  return Array.from(itemsByHead.values());
};

const BASE_COMMAND_ITEMS = buildBaseCommandItems();

const ARGUMENT_ITEMS_BY_HEAD: Record<string, JVMDiagnosticCompletionItem[]> = {
  dashboard: [
    {
      label: "dashboard",
      insertText: "",
      detail: "直接执行",
      documentation: "查看当前 JVM 运行总览。",
      scope: "argument",
    },
  ],
  jvm: [
    {
      label: "jvm",
      insertText: "",
      detail: "直接执行",
      documentation: "查看 JVM 内存、线程、类加载、GC 和运行参数信息。",
      scope: "argument",
    },
  ],
  thread: [
    {
      label: "繁忙线程 TOP N (-n)",
      insertText: "-n ${1:5}",
      detail: "线程参数",
      documentation: "查看 CPU 最繁忙的前 N 个线程。",
      scope: "argument",
      isSnippet: true,
    },
    {
      label: "阻塞线程 (-b)",
      insertText: "-b",
      detail: "线程参数",
      documentation: "查找当前阻塞其他线程的线程。",
      scope: "argument",
    },
    {
      label: "指定线程 ID",
      insertText: "${1:1}",
      detail: "线程参数",
      documentation: "查看指定线程的详细栈信息。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sc: [
    {
      label: "类匹配模板",
      insertText: "${1:com.foo.*}",
      detail: "类搜索模板",
      documentation: "按类名模式搜索。",
      scope: "argument",
      isSnippet: true,
    },
    {
      label: "详细模式 (-d)",
      insertText: "-d ${1:com.foo.OrderService}",
      detail: "类搜索模板",
      documentation: "输出类的详细信息。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sm: [
    {
      label: "方法签名模板",
      insertText: "${1:com.foo.OrderService} ${2:submitOrder}",
      detail: "方法搜索模板",
      documentation: "查看类的方法签名。",
      scope: "argument",
      isSnippet: true,
    },
    {
      label: "详细模式 (-d)",
      insertText: "-d ${1:com.foo.OrderService} ${2:submitOrder}",
      detail: "方法搜索模板",
      documentation: "输出方法详细签名。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  jad: [
    {
      label: "反编译模板",
      insertText: "${1:com.foo.OrderService}",
      detail: "反编译模板",
      documentation: "反编译指定类。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sysprop: [
    {
      label: "查看属性",
      insertText: "${1:java.version}",
      detail: "系统属性模板",
      documentation: "读取指定系统属性。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sysenv: [
    {
      label: "查看环境变量",
      insertText: "${1:JAVA_HOME}",
      detail: "环境变量模板",
      documentation: "读取指定环境变量。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  classloader: [
    {
      label: "树形视图 (-t)",
      insertText: "-t",
      detail: "类加载器模板",
      documentation: "输出类加载器树形结构。",
      scope: "argument",
    },
    {
      label: "全部 URL 统计 (--url-stat)",
      insertText: "--url-stat",
      detail: "类加载器模板",
      documentation: "查看类加载器 URL 统计。",
      scope: "argument",
    },
    {
      label: "指定类加载器 Hash",
      insertText: "${1:19469ea2}",
      detail: "类加载器模板",
      documentation: "查看指定类加载器详情。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  trace: [
    {
      label: "trace 模板",
      insertText: "${1:com.foo.OrderService} ${2:submitOrder} '${3:#cost > 100}'",
      detail: "跟踪模板",
      documentation: "跟踪慢方法调用链路。",
      scope: "argument",
      isSnippet: true,
    },
    {
      label: "条件过滤 '#cost > 100'",
      insertText: "'${1:#cost > 100}'",
      detail: "跟踪参数",
      documentation: "追加 trace 条件表达式。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  watch: [
    {
      label: "watch 模板",
      insertText:
        "${1:com.foo.OrderService} ${2:submitOrder} '${3:{params,returnObj}}' -x ${4:2}",
      detail: "观察模板",
      documentation: "观察入参、返回值或异常。",
      scope: "argument",
      isSnippet: true,
    },
    {
      label: "展开层级 -x 2",
      insertText: "-x ${1:2}",
      detail: "观察参数",
      documentation: "设置对象展开层级。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  stack: [
    {
      label: "stack 模板",
      insertText: "${1:com.foo.OrderService} ${2:submitOrder} '${3:#cost > 100}'",
      detail: "调用栈模板",
      documentation: "输出方法调用栈。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  monitor: [
    {
      label: "monitor 模板",
      insertText: "${1:com.foo.OrderService} ${2:submitOrder} -c ${3:5}",
      detail: "监控模板",
      documentation: "按周期统计方法调用情况。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  tt: [
    {
      label: "tt 录制模板",
      insertText: "-t ${1:com.foo.OrderService} ${2:submitOrder}",
      detail: "时光隧道模板",
      documentation: "录制指定方法调用。",
      scope: "argument",
      isSnippet: true,
    },
    {
      label: "查看记录列表 (-l)",
      insertText: "-l",
      detail: "时光隧道模板",
      documentation: "查看当前录制列表。",
      scope: "argument",
    },
    {
      label: "回放记录 (-i)",
      insertText: "-i ${1:1000} -p",
      detail: "时光隧道模板",
      documentation: "查看指定记录详情。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  ognl: [
    {
      label: "ognl 模板",
      insertText: "'${1:@java.lang.System@getProperty(\"user.dir\")}'",
      detail: "高风险模板",
      documentation: "执行 OGNL 表达式，高风险命令默认受策略限制。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  vmtool: [
    {
      label: "vmtool getInstances",
      insertText:
        "--action getInstances --className ${1:com.foo.OrderService} --limit ${2:10}",
      detail: "高风险模板",
      documentation: "获取指定类实例，高风险命令默认受策略限制。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  redefine: [
    {
      label: "redefine 模板",
      insertText: "${1:/tmp/OrderService.class}",
      detail: "高风险模板",
      documentation: "重新定义类字节码文件路径。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  retransform: [
    {
      label: "retransform 模板",
      insertText: "${1:com.foo.OrderService}",
      detail: "高风险模板",
      documentation: "重新转换指定类。",
      scope: "argument",
      isSnippet: true,
    },
  ],
  stop: [
    {
      label: "stop",
      insertText: "",
      detail: "控制命令",
      documentation: "停止当前后台任务。",
      scope: "argument",
    },
  ],
};

const COMMAND_HEAD_SET = new Set(
  BASE_COMMAND_ITEMS.map((item) => item.label.toLowerCase()),
);

const normalizeSearchText = (value: string): string =>
  String(value || "").trim().toLowerCase();

const resolveCurrentLine = (textBeforeCursor: string): string =>
  String(textBeforeCursor || "").split(/\r?\n/).pop() || "";

const matchesSearch = (
  item: JVMDiagnosticCompletionItem,
  search: string,
): boolean => {
  if (!search) {
    return true;
  }
  const normalizedSearch = normalizeSearchText(search);
  const candidates = [item.label, item.insertText, item.detail];
  return candidates.some((candidate) =>
    String(candidate || "").toLowerCase().includes(normalizedSearch),
  );
};

export const resolveJVMDiagnosticCompletionMode = (
  textBeforeCursor: string,
): JVMDiagnosticCompletionState => {
  const currentLine = resolveCurrentLine(textBeforeCursor);
  const normalizedLine = currentLine.replace(/^\s+/, "");

  if (!normalizedLine) {
    return {
      mode: "command",
      head: "",
      search: "",
    };
  }

  const head = normalizedLine.split(/\s+/, 1)[0]?.toLowerCase() || "";
  const hasWhitespaceAfterHead = /\s/.test(normalizedLine);

  if (!hasWhitespaceAfterHead) {
    return {
      mode: "command",
      head,
      search: head,
    };
  }

  const search = (normalizedLine.match(/([^\s]*)$/)?.[1] || "").toLowerCase();
  if (COMMAND_HEAD_SET.has(head)) {
    return {
      mode: "argument",
      head,
      search,
    };
  }

  return {
    mode: "command",
    head: "",
    search,
  };
};

export const resolveJVMDiagnosticCompletionItems = (
  textBeforeCursor: string,
): JVMDiagnosticCompletionItem[] => {
  const state = resolveJVMDiagnosticCompletionMode(textBeforeCursor);
  const source =
    state.mode === "argument" && state.head
      ? ARGUMENT_ITEMS_BY_HEAD[state.head] || []
      : BASE_COMMAND_ITEMS;

  return source.filter((item) => matchesSearch(item, state.search));
};
