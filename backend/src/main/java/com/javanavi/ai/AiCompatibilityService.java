package com.javanavi.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.AppLanguage;
import com.javanavi.i18n.I18nContext;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.CompatEventDto;
import com.javanavi.security.SecretRedactor;
import com.javanavi.security.SecretStore;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Inet6Address;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

@Service
public class AiCompatibilityService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<Map<String, Object>>> LIST_OF_MAPS = new TypeReference<>() {};
    private static final String PROVIDER_SECRET_PREFIX = "ai-provider:";
    private static final String ALLOW_PRIVATE_AI_ENDPOINTS_ENV = "JAVANAVI_ALLOW_PRIVATE_AI_ENDPOINTS";

    private final ObjectMapper objectMapper;
    private final SecretStore secretStore;
    private final Path stateFile;
    private final HttpClient httpClient;
    private final CompatEventPublisher eventPublisher;
    private final I18nMessages messages;
    private final Set<String> cancelledChatStreams = ConcurrentHashMap.newKeySet();

    public AiCompatibilityService(
            SecurityProperties properties,
            ObjectMapper objectMapper,
            SecretStore secretStore,
            CompatEventPublisher eventPublisher,
            I18nMessages messages
    ) {
        this.objectMapper = objectMapper;
        this.secretStore = secretStore;
        this.eventPublisher = eventPublisher;
        this.messages = messages;
        Path directory = Path.of(properties.getDataDirectory()).toAbsolutePath().normalize();
        this.stateFile = directory.resolve("ai-state.json");
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public synchronized List<Map<String, Object>> getProviders() {
        return providers(readState()).stream().map(this::redactedProvider).toList();
    }

    public synchronized Map<String, Object> saveProvider(Map<String, Object> input) {
        if (input == null) {
            throw new IllegalArgumentException("AI provider payload is required.");
        }
        Map<String, Object> state = readState();
        List<Map<String, Object>> providers = new ArrayList<>(providers(state));
        String id = sanitizeId(firstText(text(input.get("id")), "provider-" + UUID.randomUUID().toString().substring(0, 8)));
        Map<String, Object> existing = providers.stream()
                .filter(provider -> id.equals(text(provider.get("id"))))
                .findFirst()
                .orElse(null);

        String type = normalizeType(firstText(text(input.get("type")), existing == null ? null : text(existing.get("type")), "openai"));
        String apiFormat = providerApiFormat(type, firstText(text(input.get("apiFormat")), existing == null ? null : text(existing.get("apiFormat"))));
        boolean transportRequested = booleanValue(input.get("transportEnabled"), existing != null && booleanValue(existing.get("transportEnabled"), false));
        boolean transportEnabled = transportRequested && supportsProviderTransport(type, apiFormat);
        String apiKey = text(input.get("apiKey"));
        boolean hasSecret = existing != null && bool(existing.get("hasSecret")) || secretStore.get(secretKey(id)).isPresent();
        if (apiKey != null && !apiKey.isBlank()) {
            secretStore.put(secretKey(id), apiKey);
            hasSecret = true;
        } else if (Boolean.TRUE.equals(input.get("clearApiKey"))) {
            secretStore.delete(secretKey(id));
            hasSecret = false;
        }

        Map<String, Object> provider = orderedMap(
                "id", id,
                "type", type,
                "name", firstText(text(input.get("name")), existing == null ? null : text(existing.get("name")), id),
                "apiKey", "",
                "secretRef", secretRef(id),
                "hasSecret", hasSecret,
                "baseUrl", firstText(text(input.get("baseUrl")), existing == null ? null : text(existing.get("baseUrl")), defaultBaseUrl(type)),
                "model", firstText(text(input.get("model")), existing == null ? null : text(existing.get("model")), defaultModel(type)),
                "models", stringList(input.get("models")),
                "apiFormat", apiFormat,
                "headers", mapValue(input.get("headers")),
                "transportEnabled", transportEnabled,
                "maxTokens", positiveInt(input.get("maxTokens"), existing == null ? 4096 : positiveInt(existing.get("maxTokens"), 4096)),
                "temperature", numeric(input.get("temperature"), existing == null ? 0.2 : numeric(existing.get("temperature"), 0.2)),
                "updatedAt", Instant.now().toString()
        );
        providers.removeIf(item -> id.equals(text(item.get("id"))));
        providers.add(provider);
        state.put("providers", providers);
        if (isBlank(text(state.get("activeProvider")))) {
            state.put("activeProvider", id);
        }
        writeState(state);
        return redactedProvider(provider);
    }

    public synchronized void deleteProvider(String id) {
        String providerId = sanitizeId(id);
        Map<String, Object> state = readState();
        List<Map<String, Object>> providers = new ArrayList<>(providers(state));
        providers.removeIf(provider -> providerId.equals(text(provider.get("id"))));
        state.put("providers", providers);
        if (providerId.equals(text(state.get("activeProvider")))) {
            state.put("activeProvider", providers.isEmpty() ? "" : text(providers.get(0).get("id")));
        }
        secretStore.delete(secretKey(providerId));
        writeState(state);
    }

    public synchronized String getActiveProvider() {
        return firstText(text(readState().get("activeProvider")), "");
    }

    public synchronized void setActiveProvider(String id) {
        Map<String, Object> state = readState();
        String providerId = firstText(text(id), "");
        if (!providerId.isBlank()) {
            providerId = sanitizeId(providerId);
        }
        state.put("activeProvider", providerId);
        writeState(state);
    }

    public Map<String, String> builtinPrompts() {
        AppLanguage language = I18nContext.language();
        return orderedStringMap(
                promptTitle(language, "General Chat Assistant", "通用聊天助手"), buildGeneralChatPrompt(language),
                promptTitle(language, "SQL Generator", "SQL 生成器"), buildSqlGeneratePrompt(language),
                promptTitle(language, "SQL Explainer", "SQL 解析器"), buildSqlExplainPrompt(language),
                promptTitle(language, "SQL Optimizer", "SQL 优化器"), buildSqlOptimizePrompt(language),
                promptTitle(language, "Data Insight Analysis", "数据洞察分析"), buildDataAnalyzePrompt(language),
                promptTitle(language, "Schema Review", "表结构审查"), buildSchemaInsightPrompt(language)
        );
    }

    private static String promptTitle(AppLanguage language, String english, String chinese) {
        return language == AppLanguage.ZH ? chinese : english;
    }

    private static String buildSqlGeneratePrompt(AppLanguage language) {
        if (language != AppLanguage.ZH) {
            return """
                    You are the JavaNavi AI assistant, a senior database development expert and SQL query architect. Convert the user's natural-language request into precise, clean, high-performance SQL queries or Redis commands.

                    Strict output rules:
                    1. Output runnable code first: always place code in a markdown code block with the correct language tag, such as sql or bash.
                    2. Keep it concise: skip long prefaces and go straight to the answer.
                    3. Protect production data: prefer parameterized queries or safe patterns that reduce SQL injection risk. For DELETE or UPDATE statements without a WHERE clause, issue a strong production red-line warning.
                    4. Prioritize performance: add a reasonable LIMIT for large result sets by default, such as LIMIT 100, and choose efficient patterns for JOIN and aggregation work.
                    5. Add short comments only when the query contains complex nested logic.
                    """.strip();
        }
        return """
                你是 JavaNavi AI 助手，一位顶级的数据库开发专家和 SQL 查询构建师。根据用户的自然语言需求，生成精准、优雅、高性能的 SQL 查询或 Redis 命令。

                严苛输出规则：
                1. 首要目标是输出纯粹的代码：始终将代码放在正确语言标识（如 sql 或 bash）的 markdown 代码块中。
                2. 保持精简：不要添加过多的前置闲聊，直奔主题。
                3. 保护生产安全：优先使用参数化查询或安全防范写法避免 SQL 注入。对于未指定条件的 DELETE/UPDATE 语句，必须提出强烈的红线警告！！
                4. 性能至上：对大型查询默认添加合理的 LIMIT 限制（如 LIMIT 100），在 JOIN 和聚合时优先选择最高效的范式写法。
                5. 适度注释：对于存在复杂逻辑嵌套的代码，请在代码块内使用单行注释简要说明思路。
                """.strip();
    }

    private static String buildSqlExplainPrompt(AppLanguage language) {
        if (language != AppLanguage.ZH) {
            return """
                    You are the JavaNavi AI assistant, a senior database engineer. Explain SQL statements with professional, structured developer language that is clear without being shallow.

                    Explanation rules:
                    1. Business intent: summarize in one sentence what the SQL is trying to solve.
                    2. Step-by-step logic: explain key clauses in realistic execution order: FROM -> JOIN -> WHERE -> GROUP BY -> SELECT -> ORDER BY.
                    3. Performance risks: point out likely issues such as implicit type conversion, functions that block index usage, Cartesian products, or full table scans.
                    4. Formatting: use lists, bold key terms, and compact sections so the answer stays readable.
                    """.strip();
        }
        return """
                你是 JavaNavi AI 助手，一位深耕数据库领域多年的资深开发工程师。请用专业、条理分明且深入浅出的开发者语言向用户全盘解析 SQL 语句的底层意图与执行逻辑。

                解析规范：
                1. 宏观逻辑解构：用简短的一句话概括这条 SQL 在业务上想要解决什么问题。
                2. 步进逻辑拆解：按执行器真实的执行顺序（FROM -> JOIN -> WHERE -> GROUP BY -> SELECT -> ORDER BY）拆解每个关键子句的作用。
                3. 性能排雷点：敏锐指出可能存在的性能陷阱（如隐式类型转换、没有走索引的函数调用、潜在的笛卡尔积/全表扫描等）。
                4. 严谨的排版：使用列表呈现关键点，重点词汇加粗，确保长文不累赘。
                """.strip();
    }

    private static String buildSqlOptimizePrompt(AppLanguage language) {
        if (language != AppLanguage.ZH) {
            return """
                    You are the JavaNavi AI assistant, a full-stack performance engineer and senior DBA experienced with high-concurrency systems. Diagnose the user's SQL precisely and provide a practical performance rewrite plan.

                    Diagnosis and rewrite rules:
                    1. Identify bottlenecks: call out weak points such as poor driving-table choice, missing covering indexes, redundant subqueries, or sort/aggregation pressure.
                    2. Optimized SQL: when an improvement is possible, show an optimized SQL version that preserves the original logic.
                    3. Explain why: describe why the rewritten version should be faster from the optimizer and execution-plan perspective.
                    4. Index guidance: when schema support is missing, provide concrete DDL-level CREATE INDEX statements and explain the index-order rationale.
                    5. Priority: end with urgency as High, Medium, or Low based on lock risk, throughput impact, or long-term tuning value.
                    """.strip();
        }
        return """
                你是 JavaNavi AI 助手，一名曾主导过千万级高并发系统的全栈性能工程专家与高级 DBA。请对用户提供的原始 SQL 进行冷酷、精确的诊断并开出性能重构处方。

                诊断与处方要求：
                1. 性能瓶颈透视：精准点出当前语句死穴（不合理的驱动表、无法利用覆盖索引、多此一举的子查询等）。
                2. 重构版本的 SQL：如果存在性能提升空间，直接向用户展示彻底优化过的高性能写法，并确保逻辑等价性。
                3. 剖析原因：不仅要告诉用户“怎么改”，更要说清楚执行器“为什么这样会更快”。
                4. 索引构建建议：若现有结构无法支撑需求，提出明确的 DDL 级别的 CREATE INDEX 语句建议，并强调其依据（如满足最左前缀匹配）。
                5. 优先级评估：在回答的最后标注本次优化建议的紧迫性（高：阻断级/锁表风险；中：吞吐量瓶颈；低：长效微调）。
                """.strip();
    }

    private static String buildDataAnalyzePrompt(AppLanguage language) {
        if (language != AppLanguage.ZH) {
            return """
                    You are the JavaNavi AI assistant, a senior data analysis expert. Review the user's query sample and extract practical information from the result set.

                    Insight goals:
                    1. Core statistics: summarize row counts and key numeric indicators such as minimum, maximum, average, and median when available.
                    2. Trends and anomalies: identify upward or downward movement when timestamps exist, and highlight outliers when values differ sharply.
                    3. Business value: do more than restate the data; provide one actionable suggestion for developers or business decision makers.
                    4. Format: use a compact report style with a title and concise bullet points.
                    """.strip();
        }
        return """
                你是 JavaNavi AI 助手，一位具备极致敏锐商业嗅觉的高级数据分析专家。你将审视用户通过查询得到的数据样本，从中提炼出蕴含的真金白银般的信息。

                洞察目标：
                1. 硬统计：总观数据行数、核心数值指标（极值、平均值、聚合中位数等）的冰冷现实。
                2. 趋势与异动：如果数据带有时间戳，敏锐捕捉其上升或下降趋势；如果有异类离群值，将其高亮标注。
                3. 商业价值挖掘：不能只翻译数据，要在数据的表象上结合你的 AI 见识，给出一条有建设性的、能帮助业务决策层或开发者的业务层行动建议。
                4. 展现格式：你的分析应该是“标题 + 浓缩要点”的极简研报形式，杜绝毫无波澜的流水账。
                """.strip();
    }

    private static String buildSchemaInsightPrompt(AppLanguage language) {
        if (language != AppLanguage.ZH) {
            return """
                    You are the JavaNavi AI assistant, a chief database architect responsible for the full database lifecycle. Review the supplied table schemas with strict normalization and future-growth criteria.

                    Review scope:
                    1. Normalization trade-offs: identify obvious anti-third-normal-form choices and decide whether redundancy is justified by performance or is a design error.
                    2. Index robustness: evaluate primary-key choices such as auto-increment IDs or UUIDs, redundant indexes that slow writes, and missing composite indexes for frequent access paths.
                    3. Physical capacity: review data types such as oversized VARCHAR fields or unnecessary BIGINT columns that waste storage.
                    4. Code-level guidance: when structural issues exist, provide specific ALTER TABLE scripts with concrete improvements.
                    """.strip();
        }
        return """
                你是 JavaNavi AI 助手，一位统筹数据库宏观生命周期的首席数据库架构师。在这个环节里，你需要对用户提供的数据库表结构执行最严厉的范式与前瞻性审查。

                审查视界：
                1. 规范化博弈：是否存在明显的反三范式设计？这种冗余是否有助于性能（适当的反范式），还是纯粹的设计失误？
                2. 索引健壮性审查：评估主键选择（如自增、UUID 的利弊），是否存在冗余索引阻碍写入？以及是否遗漏了高频的联合索引。
                3. 物理容量前瞻：审视数据类型分配（如使用过大的 VARCHAR、没必要的 BIGINT 等可能带来的空间挥霍）。
                4. 代码级指引：如果存在结构性缺陷，不要只发牢骚，直接给出包含具体优化的 ALTER TABLE 结构修改建议脚本。
                """.strip();
    }

    private static String buildGeneralChatPrompt(AppLanguage language) {
        if (language != AppLanguage.ZH) {
            return """
                    You are the JavaNavi AI assistant, a dedicated intelligent expert system deeply integrated into the database/cache client (JavaNavi).
                    Your goal is to provide developers, DBAs, and data scientists with professional, precise, forward-looking data-side solutions.

                    Core persona and interaction style:
                    - Absolute professionalism: provide reliable judgment on database products such as MySQL, PostgreSQL, DuckDB, and Redis, including internals, execution plans, and index principles.
                    - Direct answers: avoid empty pleasantries. When the user's intent is clear, put runnable, paste-ready code near the top.
                    - Structure and readability: use Markdown headings, bold text, and correctly tagged code blocks such as sql, json, or bash.
                    - Zero tolerance for production red lines: when SQL may create severe production risk, such as bulk UPDATE or DELETE without a WHERE clause or a query likely to lock a production table, warn immediately.

                    Capability map:
                    1. Natural-language query generation: translate user intent into accurate queries.
                    2. Execution-logic explanation: analyze query behavior and performance risks.
                    3. Expert tuning: identify bottlenecks and provide indexing and rewrite strategies.
                    4. Data insight: go beyond aggregation and extract business-relevant patterns from result sets.
                    5. Schema review: assess table design limits and propose architecture evolution for data growth.

                    Interaction rules:
                    - Always discuss issues with the user in professional, confident English.
                    - When providing database code, apply the relevant engine's best practices. When the exact dialect version is unknown, prefer standard SQL and mention version differences when they matter, such as MySQL 8 window functions.
                    - Do not refuse too early: when the user asks for SQL but no detailed DDL is attached, infer the likely target table from the plain table-name list in the conversation. When the table still cannot be inferred, clearly list the known tables and ask which one should be queried.
                    """.strip();
        }
        return """
                你是 JavaNavi AI 助手，一款深度集成在数据库/缓存客户端（JavaNavi）内部的专属智能专家系统。
                你的目标是成为开发者、DBA 和数据科学家最得力的超级外脑，提供专业、精准、具有前瞻性的数据端解决方案。

                核心人设与交互基调：
                - 绝对专业：对各流派数据库产品（MySQL、PostgreSQL、DuckDB、Redis）底层机制、执行计划和索引原理有不可动摇的专业判断力。
                - 直击痛点：谢绝套话与无效寒暄，若用户的意图明确，首屏直接给出可以直接粘贴运行的优雅代码。
                - 结构化与可读性：恰到好处地使用 Markdown 标题、加粗和代码块（必须带正确的语言标识 如 sql/json/bash），以工匠精神打磨每一次排版。
                - 零容忍的生产红线：当你察觉用户的 SQL 有潜在灾难风险（比如没有 WHERE 条件的批量更新/删除、可能锁爆生产表的严重慢查询），必须立即触发红色预警提示阻止用户。

                你的综合能力版图：
                1. 📝 自然语言驱动：翻译人类意图为精准的查询语句。
                2. 🔍 底层原理解析：剥丝抽茧分析查询背后的执行逻辑与性能隐患。
                3. ⚡ 专家级调优：指出并化解性能瓶颈，给出覆盖全维度的索引调优思路。
                4. 📊 数据洞察炼金：不仅聚合数据，更能从结果集中挖掘商业维度的深度规律。
                5. 🏗️ 架构先知视界：全局审阅表结构设计局限，提出抗数据膨胀级别的架构演进方案。

                互动守则：
                - 永远使用专业、具有合作感且充满信心的中文与用户探讨问题。
                - 当被要求提供任何数据库代码时，需结合相关数据库引擎的最佳实践。如果不清楚当前方言版本，请以标准实现为主基调并好心指出版别差异（如 MySQL 8 窗口函数 等）。
                - 绝不轻易拒绝：如果用户要求写 SQL 但并未显式挂载任何表的详细 DDL，请尽最大努力根据对话上下文中带入的【纯表名列表】去推测他要查询哪个表。如果实在无法推断，请温柔且专业地向用户解释目前已知的表有哪些，并询问到底想查哪张表。
                """.strip();
    }

    public synchronized Map<String, Object> listModels() {
        List<Map<String, Object>> providers = getProviders();
        Map<String, Object> byProvider = new LinkedHashMap<>();
        for (Map<String, Object> provider : providers) {
            byProvider.put(text(provider.get("id")), provider.get("models"));
        }
        return orderedMap("models", providers.stream().flatMap(provider -> stringList(provider.get("models")).stream()).distinct().toList(), "byProvider", byProvider);
    }

    public synchronized Map<String, Object> testProvider(Map<String, Object> input) {
        Map<String, Object> state = readState();
        String id = input == null ? null : text(input.get("id"));
        String providerId = isBlank(id) ? "" : sanitizeId(id);
        Map<String, Object> savedProvider = providerId.isBlank()
                ? Map.of()
                : providers(state).stream()
                .filter(provider -> providerId.equals(text(provider.get("id"))))
                .findFirst()
                .orElse(Map.of());
        String type = normalizeType(firstText(input == null ? null : text(input.get("type")), text(savedProvider.get("type"))));
        String apiFormat = providerApiFormat(type, firstText(input == null ? null : text(input.get("apiFormat")), text(savedProvider.get("apiFormat"))));
        String model = firstText(input == null ? null : text(input.get("model")), text(savedProvider.get("model")));
        String apiKey = input == null ? null : text(input.get("apiKey"));
        Optional<String> storedSecret = providerId.isBlank() ? Optional.empty() : secretStore.get(secretKey(providerId));
        boolean hasStoredSecret = storedSecret.isPresent();
        boolean transportRequested = booleanValue(input == null ? null : input.get("transportEnabled"), booleanValue(savedProvider.get("transportEnabled"), false));
        boolean modelDiscoverySupported = supportsProviderTransport(type, apiFormat);
        boolean transportEnabled = transportRequested && modelDiscoverySupported;
        if (!"claude_cli".equals(type) && isBlank(apiKey) && !hasStoredSecret) {
            return orderedMap(
                    "success", false,
                    "message", "AI provider API key is required or must already be stored.",
                    "providerId", providerId.isBlank() ? "preview" : providerId,
                    "networkTested", false,
                    "transportEnabled", false,
                    "transportRequested", transportRequested,
                    "transportCapability", transportCapability(type, apiFormat),
                    "modelDiscoverySupported", modelDiscoverySupported,
                    "modelsFetched", false
            );
        }
        if (transportEnabled) {
            Map<String, Object> provider = new LinkedHashMap<>(savedProvider);
            provider.put("type", type);
            provider.put("apiFormat", apiFormat);
            provider.put("model", model);
            provider.put("baseUrl", firstText(input == null ? null : text(input.get("baseUrl")), text(savedProvider.get("baseUrl")), defaultBaseUrl(type)));
            provider.put("headers", input != null && input.get("headers") != null ? mapValue(input.get("headers")) : mapValue(savedProvider.get("headers")));
            String effectiveApiKey = isBlank(apiKey) ? storedSecret.orElse("") : apiKey;
            try {
                Map<String, Object> transport = switch (type) {
                    case "anthropic" -> invokeAnthropicHealthCheck(provider, effectiveApiKey);
                    case "gemini" -> invokeGeminiHealthCheck(provider, effectiveApiKey);
                    default -> invokeOpenAiCompatibleHealthCheck(provider, effectiveApiKey);
                };
                return orderedMap(
                        "success", true,
                        "message", "AI provider transport test succeeded via JavaNavi Web HTTP check.",
                        "providerId", providerId.isBlank() ? "preview" : providerId,
                        "networkTested", true,
                        "transportEnabled", true,
                        "transportRequested", true,
                        "transportCapability", transportCapability(type, apiFormat),
                        "modelDiscoverySupported", true,
                        "modelsFetched", true,
                        "models", transport.getOrDefault("models", List.of()),
                        "modelCount", transport.getOrDefault("modelCount", 0),
                        "transport", transport
                );
            } catch (IOException | InterruptedException | IllegalArgumentException error) {
                if (error instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return orderedMap(
                        "success", false,
                        "message", "AI provider transport test failed: " + SecretRedactor.redact(error.getMessage()),
                        "providerId", providerId.isBlank() ? "preview" : providerId,
                        "networkTested", true,
                        "transportEnabled", true,
                        "transportRequested", true,
                        "transportCapability", transportCapability(type, apiFormat),
                        "modelDiscoverySupported", true,
                        "modelsFetched", false
                );
            }
        }
        if (isBlank(model)) {
            return orderedMap(
                    "success", false,
                    "message", "AI model is required.",
                    "providerId", providerId.isBlank() ? "preview" : providerId,
                    "networkTested", false,
                    "transportEnabled", false,
                    "transportRequested", transportRequested,
                    "transportCapability", transportCapability(type, apiFormat),
                    "modelDiscoverySupported", modelDiscoverySupported,
                    "modelsFetched", false
            );
        }
        return orderedMap(
                "success", true,
                "message", "AI provider configuration is valid for JavaNavi Web local storage; enable transportEnabled for outbound HTTP model calls.",
                "providerId", providerId.isBlank() ? "preview" : providerId,
                "networkTested", false,
                "transportEnabled", false,
                "transportRequested", transportRequested,
                "transportCapability", transportCapability(type, apiFormat),
                "modelDiscoverySupported", modelDiscoverySupported,
                "modelsFetched", false
        );
    }

    public synchronized String getSafetyLevel() {
        return firstText(text(readState().get("safetyLevel")), "readonly");
    }

    public synchronized void setSafetyLevel(String level) {
        Map<String, Object> state = readState();
        state.put("safetyLevel", normalizeSafety(level));
        writeState(state);
    }

    public synchronized String getContextLevel() {
        return firstText(text(readState().get("contextLevel")), "schema_only");
    }

    public synchronized void setContextLevel(String level) {
        Map<String, Object> state = readState();
        state.put("contextLevel", normalizeContext(level));
        writeState(state);
    }

    public Map<String, Object> checkSql(String sql) {
        SqlOperationType operationType = sqlOperationType(sql);
        String safetyLevel = getSafetyLevel();
        boolean allowed = switch (safetyLevel) {
            case "full" -> true;
            case "readwrite" -> operationType != SqlOperationType.DDL;
            default -> operationType == SqlOperationType.QUERY;
        };
        boolean requiresConfirm = allowed && switch (safetyLevel) {
            case "full" -> operationType != SqlOperationType.QUERY;
            case "readwrite" -> operationType == SqlOperationType.DML;
            default -> false;
        };
        return orderedMap(
                "allowed", allowed,
                "operationType", operationType.apiName(),
                "requiresConfirm", requiresConfirm,
                "warningMessage", sqlSafetyWarning(operationType, safetyLevel, allowed, requiresConfirm)
        );
    }

    public synchronized Map<String, Object> chatSend(Map<String, Object> input) {
        Map<String, Object> state = readState();
        String active = firstText(text(state.get("activeProvider")), "");
        Optional<Map<String, Object>> provider = providers(state).stream()
                .filter(item -> active.equals(text(item.get("id"))))
                .findFirst();
        if (provider.isEmpty()) {
            return orderedMap(
                    "content", "JavaNavi AI provider is not configured. Save a provider before sending model requests.",
                    "choices", List.of(),
                    "providerId", "",
                    "transport", "java-web-local-state"
            );
        }
        Map<String, Object> selected = provider.get();
        boolean transportEnabled = booleanValue(selected.get("transportEnabled"), false);
        if (transportEnabled) {
            Optional<String> apiKey = secretStore.get(secretKey(active));
            if (apiKey.isEmpty()) {
                return orderedMap(
                        "content", "JavaNavi AI provider transport failed: provider '" + firstText(text(selected.get("name")), active) + "' has transport enabled but no stored API key.",
                        "choices", List.of(),
                        "providerId", active,
                        "model", selected.get("model"),
                        "transport", transportName(selected),
                        "transportError", true
                );
            }
            String normalizedType = normalizeType(text(selected.get("type")));
            try {
                return switch (normalizedType) {
                    case "anthropic" -> invokeAnthropicChat(selected, input, apiKey.get(), active);
                    case "gemini" -> invokeGeminiChat(selected, input, apiKey.get(), active);
                    default -> invokeOpenAiCompatibleChat(selected, input, apiKey.get(), active);
                };
            } catch (IOException | InterruptedException | IllegalArgumentException error) {
                if (error instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return orderedMap(
                        "content", "JavaNavi AI provider transport failed: " + SecretRedactor.redact(error.getMessage()),
                        "choices", List.of(),
                        "providerId", active,
                        "model", selected.get("model"),
                        "transport", transportName(selected),
                        "transportError", true
                );
            }
        }
        return orderedMap(
                "content", "JavaNavi AI provider '" + firstText(text(selected.get("name")), active) + "' is configured with outbound model transport disabled; enable transportEnabled to use JavaNavi Web HTTP model calls.",
                "choices", List.of(),
                "providerId", active,
                "model", selected.get("model"),
                "transport", "java-web-local-state",
                "transportCapability", transportCapability(selected)
        );
    }

    private Map<String, Object> invokeOpenAiCompatibleChat(Map<String, Object> provider, Map<String, Object> input, String apiKey, String providerId) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> messages = defaultChatMessages(input);
        Map<String, Object> requestBody = openAiCompatibleChatRequestBody(provider, input, model, messages, false);

        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(chatCompletionsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        applyAdditionalHeaders(builder, provider, "authorization");

        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        return orderedMap(
                "content", assistantContent(payload),
                "choices", payload.getOrDefault("choices", List.of()),
                "providerId", providerId,
                "model", firstText(text(payload.get("model")), model),
                "transport", "openai-compatible-http",
                "usage", payload.getOrDefault("usage", Map.of()),
                "responseId", text(payload.get("id"))
        );
    }

    private Map<String, Object> invokeAnthropicChat(Map<String, Object> provider, Map<String, Object> input, String apiKey, String providerId) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> messages = defaultChatMessages(input);
        Map<String, Object> requestBody = anthropicRequestBody(provider, input, model, messages);
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(anthropicMessagesUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        applyAdditionalHeaders(builder, provider, "x-api-key", "anthropic-version");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        return orderedMap(
                "content", assistantContentFromAnthropic(payload),
                "choices", payload.getOrDefault("content", List.of()),
                "providerId", providerId,
                "model", firstText(text(payload.get("model")), model),
                "transport", "anthropic-http",
                "usage", payload.getOrDefault("usage", Map.of()),
                "responseId", text(payload.get("id"))
        );
    }

    private Map<String, Object> invokeGeminiChat(Map<String, Object> provider, Map<String, Object> input, String apiKey, String providerId) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> messages = defaultChatMessages(input);
        Map<String, Object> requestBody = geminiRequestBody(provider, input, messages);
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(geminiGenerateContentUri(text(provider.get("baseUrl")), model)))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        applyAdditionalHeaders(builder, provider, "x-goog-api-key");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        return orderedMap(
                "content", assistantContentFromGemini(payload),
                "choices", payload.getOrDefault("candidates", List.of()),
                "providerId", providerId,
                "model", firstText(text(payload.get("modelVersion")), model),
                "transport", "gemini-http",
                "usage", payload.getOrDefault("usageMetadata", Map.of()),
                "responseId", text(payload.get("responseId"))
        );
    }

    private Map<String, Object> invokeOpenAiCompatibleHealthCheck(Map<String, Object> provider, String apiKey) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(modelsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .GET();
        applyAdditionalHeaders(builder, provider, "authorization");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        List<String> models = openAiCompatibleModelIds(payload);
        return orderedMap(
                "statusCode", response.statusCode(),
                "endpoint", "models",
                "modelCount", models.size(),
                "models", models
        );
    }

    private Map<String, Object> invokeAnthropicHealthCheck(Map<String, Object> provider, String apiKey) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(anthropicModelsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .GET();
        applyAdditionalHeaders(builder, provider, "x-api-key", "anthropic-version");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        List<String> models = anthropicModelIds(payload);
        return orderedMap(
                "statusCode", response.statusCode(),
                "endpoint", "models",
                "modelCount", models.size(),
                "models", models
        );
    }

    private Map<String, Object> invokeGeminiHealthCheck(Map<String, Object> provider, String apiKey) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(geminiModelsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("x-goog-api-key", apiKey)
                .GET();
        applyAdditionalHeaders(builder, provider, "x-goog-api-key");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        List<String> models = geminiModelIds(payload);
        return orderedMap(
                "statusCode", response.statusCode(),
                "endpoint", "models",
                "modelCount", models.size(),
                "models", models
        );
    }

    private Map<String, Object> anthropicRequestBody(Map<String, Object> provider, Map<String, Object> input, String model, List<Object> messages) {
        Map<String, Object> requestBody = orderedMap(
                "model", model,
                "messages", anthropicMessages(messages),
                "max_tokens", positiveInt(provider.get("maxTokens"), 4096),
                "temperature", numeric(provider.get("temperature"), 0.2)
        );
        String systemPrompt = firstSystemPrompt(messages);
        if (!isBlank(systemPrompt)) {
            requestBody.put("system", systemPrompt);
        }
        return requestBody;
    }

    private Map<String, Object> geminiRequestBody(Map<String, Object> provider, Map<String, Object> input, List<Object> messages) {
        Map<String, Object> requestBody = orderedMap(
                "contents", geminiContents(messages),
                "generationConfig", orderedMap(
                        "temperature", numeric(provider.get("temperature"), 0.2),
                        "maxOutputTokens", positiveInt(provider.get("maxTokens"), 4096)
                )
        );
        String systemPrompt = firstSystemPrompt(messages);
        if (!isBlank(systemPrompt)) {
            requestBody.put("system_instruction", orderedMap(
                    "parts", List.of(orderedMap("text", systemPrompt))
            ));
        }
        return requestBody;
    }

    public void chatCancel(String sessionId) {
        String id = text(sessionId);
        if (!id.isBlank()) {
            cancelledChatStreams.add(sanitizeId(id));
        }
    }

    public synchronized Map<String, Object> chatStream(String sessionId, Map<String, Object> input) {
        String id = sanitizeId(sessionId);
        cancelledChatStreams.remove(id);
        Optional<Map<String, Object>> streamedTransport = tryOpenAiCompatibleStreamingChat(id, input);
        if (streamedTransport.isPresent()) {
            return streamedTransport.get();
        }
        Map<String, Object> response = chatSend(input);
        String eventName = "ai:stream:" + id;
        String transport = firstText(text(response.get("transport")), "java-web-local-state");
        if (booleanValue(response.get("transportError"), false)) {
            publishAiStreamEvent(eventName, id, "error", "AI stream transport error", orderedMap(
                    "error", firstText(text(response.get("content")), "AI stream transport error"),
                    "transport", transport
            ));
            publishAiStreamEvent(eventName, id, "completed", "AI stream completed with error", orderedMap(
                    "done", true,
                    "transport", transport
            ));
            return orderedMap("streamed", false, "sessionId", id, "eventName", eventName, "transport", transport, "error", response.get("content"));
        }

        String content = firstText(text(response.get("content")), "");
        List<String> chunks = streamChunks(content);
        if (chunks.isEmpty()) {
            chunks = List.of("");
        }
        for (String chunk : chunks) {
            if (!chunk.isEmpty()) {
                publishAiStreamEvent(eventName, id, "generating", "AI stream content", orderedMap(
                        "content", chunk,
                        "transport", transport,
                        "providerId", response.get("providerId"),
                        "model", response.get("model")
                ));
            }
        }
        publishAiStreamEvent(eventName, id, "completed", "AI stream completed", orderedMap(
                "done", true,
                "transport", transport,
                "providerId", response.get("providerId"),
                "model", response.get("model"),
                "usage", response.getOrDefault("usage", Map.of())
        ));
        return orderedMap("streamed", true, "sessionId", id, "eventName", eventName, "transport", transport, "chunks", chunks.size());
    }

    private Optional<Map<String, Object>> tryOpenAiCompatibleStreamingChat(String sessionId, Map<String, Object> input) {
        Map<String, Object> state = readState();
        String active = firstText(text(state.get("activeProvider")), "");
        Optional<Map<String, Object>> provider = providers(state).stream()
                .filter(item -> active.equals(text(item.get("id"))))
                .findFirst();
        if (provider.isEmpty()
                || !booleanValue(provider.get().get("transportEnabled"), false)
                || !supportsOpenAiCompatibleTransport(provider.get())) {
            return Optional.empty();
        }
        Optional<String> apiKey = secretStore.get(secretKey(active));
        if (apiKey.isEmpty()) {
            return Optional.empty();
        }
        String eventName = "ai:stream:" + sessionId;
        try {
            Map<String, Object> result = invokeOpenAiCompatibleStreamingChat(provider.get(), input, apiKey.get(), active, sessionId, eventName);
            return Optional.of(result);
        } catch (IOException | InterruptedException | IllegalArgumentException error) {
            if (error instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            publishAiStreamEvent(eventName, sessionId, "error", "AI stream transport error", orderedMap(
                    "error", SecretRedactor.redact(error.getMessage()),
                    "transport", "openai-compatible-http"
            ));
            publishAiStreamEvent(eventName, sessionId, "completed", "AI stream completed with error", orderedMap(
                    "done", true,
                    "transport", "openai-compatible-http"
            ));
            return Optional.of(orderedMap(
                    "streamed", false,
                    "sessionId", sessionId,
                    "eventName", eventName,
                    "transport", "openai-compatible-http",
                    "error", SecretRedactor.redact(error.getMessage())
            ));
        }
    }

    private Map<String, Object> invokeOpenAiCompatibleStreamingChat(
            Map<String, Object> provider,
            Map<String, Object> input,
            String apiKey,
            String providerId,
            String sessionId,
            String eventName
    ) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> messages = objectList(input == null ? null : input.get("messages"));
        if (messages.isEmpty()) {
            messages = List.of(orderedMap("role", "user", "content", firstText(text(input == null ? null : input.get("prompt")), "Hello")));
        }
        Map<String, Object> requestBody = openAiCompatibleChatRequestBody(provider, input, model, messages, true);
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(chatCompletionsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(60))
                .header("Accept", "text/event-stream")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        mapValue(provider.get("headers")).forEach((key, value) -> {
            String header = text(key);
            String headerValue = text(value);
            if (!header.isBlank() && !headerValue.isBlank() && !"authorization".equalsIgnoreCase(header)) {
                builder.header(header, headerValue);
            }
        });

        HttpResponse<Stream<String>> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofLines());
        List<String> chunks = new ArrayList<>();
        try (Stream<String> lines = response.body()) {
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String body = String.join("\n", lines.toList());
                throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + SecretRedactor.redact(body));
            }
            for (String line : (Iterable<String>) lines::iterator) {
                if (cancelledChatStreams.contains(sessionId)) {
                    publishAiStreamEvent(eventName, sessionId, "cancelled", "AI stream cancelled", orderedMap(
                            "done", true,
                            "cancelled", true,
                            "transport", "openai-compatible-http",
                            "providerId", providerId,
                            "model", model
                    ));
                    return orderedMap("streamed", false, "cancelled", true, "sessionId", sessionId, "eventName", eventName, "transport", "openai-compatible-http", "chunks", chunks.size());
                }
                String chunk = streamChunkFromLine(line);
                if (chunk == null) {
                    continue;
                }
                if (!chunk.isEmpty()) {
                    chunks.add(chunk);
                    publishAiStreamEvent(eventName, sessionId, "generating", "AI provider stream content", orderedMap(
                            "content", chunk,
                            "transport", "openai-compatible-http",
                            "providerId", providerId,
                            "model", model
                    ));
                }
            }
        } finally {
            cancelledChatStreams.remove(sessionId);
        }
        publishAiStreamEvent(eventName, sessionId, "completed", "AI stream completed", orderedMap(
                "done", true,
                "transport", "openai-compatible-http",
                "providerId", providerId,
                "model", model
        ));
        return orderedMap("streamed", true, "sessionId", sessionId, "eventName", eventName, "transport", "openai-compatible-http", "providerStreamed", true, "chunks", chunks.size());
    }

    private Map<String, Object> openAiCompatibleChatRequestBody(Map<String, Object> provider, Map<String, Object> input, String model, List<Object> messages, boolean stream) {
        Map<String, Object> requestBody = orderedMap(
                "model", model,
                "messages", messages,
                "stream", stream,
                "temperature", numeric(provider.get("temperature"), 0.2),
                "max_tokens", positiveInt(provider.get("maxTokens"), 4096)
        );
        List<Object> tools = objectList(input == null ? null : input.get("tools"));
        if (!tools.isEmpty()) {
            requestBody.put("tools", tools);
        }
        return requestBody;
    }

    private void publishAiStreamEvent(String eventName, String sessionId, String phase, String message, Map<String, Object> payload) {
        eventPublisher.publish(new CompatEventDto(
                UUID.randomUUID().toString(),
                eventName,
                "ai",
                sessionId,
                "javanavi-ai",
                phase,
                message,
                Instant.now(),
                payload
        ));
    }

    public synchronized List<Map<String, Object>> getSessions() {
        Map<String, Object> sessions = sessions(readState());
        return sessions.values().stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(session -> orderedMap(
                        "id", text(session.get("id")),
                        "title", firstText(text(session.get("title")), "Untitled"),
                        "updatedAt", numeric(session.get("updatedAt"), 0),
                        "messageCount", messageCount(text(session.get("messagesJSON")))
                ))
                .sorted(Comparator.comparingDouble(item -> -numeric(item.get("updatedAt"), 0)))
                .toList();
    }

    public synchronized Map<String, Object> loadSession(String sessionId) {
        String id = sanitizeId(sessionId);
        Object sessionValue = sessions(readState()).get(id);
        if (!(sessionValue instanceof Map<?, ?> rawSession)) {
            return orderedMap("id", id, "title", "", "updatedAt", 0, "messages", List.of());
        }
        Map<String, Object> session = mapValue(rawSession);
        return orderedMap(
                "id", id,
                "title", firstText(text(session.get("title")), "Untitled"),
                "updatedAt", numeric(session.get("updatedAt"), 0),
                "messages", parseMessages(text(session.get("messagesJSON")))
        );
    }

    public synchronized void saveSession(String sessionId, String title, double updatedAt, String messagesJson) {
        String id = sanitizeId(sessionId);
        Map<String, Object> state = readState();
        Map<String, Object> sessions = new LinkedHashMap<>(sessions(state));
        sessions.put(id, orderedMap(
                "id", id,
                "title", firstText(title, "Untitled"),
                "updatedAt", updatedAt <= 0 ? System.currentTimeMillis() : updatedAt,
                "messagesJSON", firstText(messagesJson, "[]")
        ));
        state.put("sessions", sessions);
        writeState(state);
    }

    public synchronized void deleteSession(String sessionId) {
        String id = sanitizeId(sessionId);
        Map<String, Object> state = readState();
        Map<String, Object> sessions = new LinkedHashMap<>(sessions(state));
        sessions.remove(id);
        state.put("sessions", sessions);
        writeState(state);
    }

    private Map<String, Object> readState() {
        try {
            if (!Files.exists(stateFile)) {
                return defaultState();
            }
            String json = Files.readString(stateFile, StandardCharsets.UTF_8);
            if (json.isBlank()) {
                return defaultState();
            }
            Map<String, Object> state = objectMapper.readValue(json, MAP_TYPE);
            Map<String, Object> result = defaultState();
            if (state != null) {
                result.putAll(state);
            }
            return result;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi AI state.", error);
        }
    }

    private void writeState(Map<String, Object> state) {
        try {
            Files.createDirectories(stateFile.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(stateFile.toFile(), state);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi AI state.", error);
        }
    }

    private Map<String, Object> defaultState() {
        return orderedMap(
                "providers", new ArrayList<Map<String, Object>>(),
                "activeProvider", "",
                "safetyLevel", "readonly",
                "contextLevel", "schema_only",
                "sessions", new LinkedHashMap<String, Object>()
        );
    }

    private List<Map<String, Object>> providers(Map<String, Object> state) {
        Object value = state.get("providers");
        if (value == null) {
            return new ArrayList<>();
        }
        return new ArrayList<>(objectMapper.convertValue(value, LIST_OF_MAPS));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> sessions(Map<String, Object> state) {
        Object value = state.get("sessions");
        if (value instanceof Map<?, ?> map) {
            return new LinkedHashMap<>((Map<String, Object>) map);
        }
        return new LinkedHashMap<>();
    }

    private Map<String, Object> redactedProvider(Map<String, Object> provider) {
        Map<String, Object> result = new LinkedHashMap<>(provider);
        String id = text(result.get("id"));
        boolean hasSecret = bool(result.get("hasSecret")) || (!isBlank(id) && secretStore.get(secretKey(id)).isPresent());
        result.put("apiKey", "");
        result.put("hasSecret", hasSecret);
        result.put("secretRef", isBlank(id) ? "" : secretRef(id));
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        if (value == null) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(value, LinkedHashMap.class);
    }

    private List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(AiCompatibilityService::text).filter(item -> !isBlank(item)).distinct().toList();
        }
        String single = text(value);
        if (isBlank(single)) {
            return List.of();
        }
        return List.of(single);
    }

    private List<Object> objectList(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        return List.of();
    }

    static List<String> openAiCompatibleModelIds(Map<String, Object> payload) {
        if (payload == null) {
            return List.of();
        }
        return objectListStatic(payload.get("data")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> text(item.get("id")))
                .filter(item -> !isBlank(item))
                .distinct()
                .toList();
    }

    static List<String> anthropicModelIds(Map<String, Object> payload) {
        if (payload == null) {
            return List.of();
        }
        return objectListStatic(payload.get("data")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> firstText(text(item.get("id")), text(item.get("name"))))
                .filter(item -> !isBlank(item))
                .distinct()
                .toList();
    }

    static List<String> geminiModelIds(Map<String, Object> payload) {
        if (payload == null) {
            return List.of();
        }
        return objectListStatic(payload.get("models")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> normalizeGeminiModelName(firstText(text(item.get("name")), text(item.get("model")))))
                .filter(item -> !isBlank(item))
                .distinct()
                .toList();
    }

    private static List<Map<String, Object>> anthropicMessages(List<Object> messages) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object raw : messages) {
            if (!(raw instanceof Map<?, ?> map)) {
                continue;
            }
            String role = normalizeChatRole(text(map.get("role")));
            if ("system".equals(role)) {
                continue;
            }
            String content = firstText(text(map.get("content")), text(map.get("text")));
            if (isBlank(content)) {
                continue;
            }
            result.add(orderedMap(
                    "role", role,
                    "content", List.of(orderedMap("type", "text", "text", content))
            ));
        }
        return result;
    }

    private static List<Map<String, Object>> geminiContents(List<Object> messages) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object raw : messages) {
            if (!(raw instanceof Map<?, ?> map)) {
                continue;
            }
            String role = normalizeChatRole(text(map.get("role")));
            if ("system".equals(role)) {
                continue;
            }
            String content = firstText(text(map.get("content")), text(map.get("text")));
            if (isBlank(content)) {
                continue;
            }
            result.add(orderedMap(
                    "role", "assistant".equals(role) ? "model" : "user",
                    "parts", List.of(orderedMap("text", content))
            ));
        }
        return result;
    }

    private static List<Object> objectListStatic(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        return List.of();
    }

    private static URI chatCompletionsUri(String baseUrl) {
        String base = firstText(baseUrl, defaultBaseUrl("openai"));
        String normalized = trimTrailingSlash(base);
        if (normalized.endsWith("/chat/completions")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/chat/completions");
        }
        return URI.create(normalized + "/v1/chat/completions");
    }

    private static URI modelsUri(String baseUrl) {
        String base = firstText(baseUrl, defaultBaseUrl("openai"));
        String normalized = trimTrailingSlash(base);
        if (normalized.endsWith("/chat/completions")) {
            return URI.create(normalized.substring(0, normalized.length() - "/chat/completions".length()) + "/models");
        }
        if (normalized.endsWith("/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/models");
        }
        return URI.create(normalized + "/v1/models");
    }

    private static URI anthropicMessagesUri(String baseUrl) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("anthropic")));
        if (normalized.endsWith("/v1/messages")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/messages");
        }
        return URI.create(normalized + "/v1/messages");
    }

    private static URI anthropicModelsUri(String baseUrl) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("anthropic")));
        if (normalized.endsWith("/v1/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/models");
        }
        return URI.create(normalized + "/v1/models");
    }

    private static URI geminiModelsUri(String baseUrl) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("gemini")));
        if (normalized.endsWith("/v1beta/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1beta")) {
            return URI.create(normalized + "/models");
        }
        return URI.create(normalized + "/v1beta/models");
    }

    private static URI geminiGenerateContentUri(String baseUrl, String model) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("gemini")));
        String normalizedModel = normalizeGeminiModelName(firstText(model, defaultModel("gemini")));
        if (normalized.endsWith(":generateContent")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/models")) {
            return URI.create(normalized + "/" + normalizedModel + ":generateContent");
        }
        if (normalized.contains("/models/") && !normalized.endsWith("/models")) {
            return URI.create(normalized + ":generateContent");
        }
        if (normalized.endsWith("/v1beta")) {
            return URI.create(normalized + "/models/" + normalizedModel + ":generateContent");
        }
        return URI.create(normalized + "/v1beta/models/" + normalizedModel + ":generateContent");
    }

    private static URI validatedProviderUri(URI uri) {
        if (uri == null) {
            throw new IllegalArgumentException("AI provider endpoint is required.");
        }
        String scheme = text(uri.getScheme()).toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            throw new IllegalArgumentException("AI provider endpoint must use http or https.");
        }
        String host = text(uri.getHost());
        if (host.isBlank()) {
            throw new IllegalArgumentException("AI provider endpoint host is required.");
        }
        if (!allowPrivateProviderEndpoints() && isPrivateProviderHost(host)) {
            throw new IllegalArgumentException("AI provider endpoint targets a local or private network host; set "
                    + ALLOW_PRIVATE_AI_ENDPOINTS_ENV + "=true only for trusted local testing.");
        }
        return uri;
    }

    private static boolean allowPrivateProviderEndpoints() {
        return booleanValue(System.getenv(ALLOW_PRIVATE_AI_ENDPOINTS_ENV), false);
    }

    private static boolean isPrivateProviderHost(String host) {
        String normalized = host.trim().toLowerCase(Locale.ROOT);
        if (normalized.equals("localhost")
                || normalized.equals("localhost.localdomain")
                || normalized.endsWith(".localhost")
                || normalized.equals("0.0.0.0")) {
            return true;
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(normalized)) {
                if (isPrivateProviderAddress(address)) {
                    return true;
                }
            }
            return false;
        } catch (UnknownHostException error) {
            return false;
        }
    }

    private static boolean isPrivateProviderAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        if (address instanceof Inet6Address inet6) {
            byte[] bytes = inet6.getAddress();
            int first = bytes.length > 0 ? bytes[0] & 0xff : 0;
            return (first & 0xfe) == 0xfc;
        }
        return false;
    }

    private static String providerErrorMessage(Map<String, Object> payload) {
        Object error = payload.get("error");
        if (error instanceof Map<?, ?> map) {
            return firstText(text(map.get("message")), text(map.get("type")), text(map.get("status")), "unknown provider error");
        }
        return firstText(text(error), text(payload.get("message")), text(payload.get("detail")), "unknown provider error");
    }

    private static String assistantContent(Map<String, Object> payload) {
        Object choices = payload.get("choices");
        if (choices instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> choice) {
            Object message = choice.get("message");
            if (message instanceof Map<?, ?> messageMap) {
                String content = text(messageMap.get("content"));
                if (!isBlank(content)) {
                    return content;
                }
            }
            String text = text(choice.get("text"));
            if (!isBlank(text)) {
                return text;
            }
        }
        return "";
    }

    private static String assistantContentFromAnthropic(Map<String, Object> payload) {
        return objectListStatic(payload.get("content")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> {
                    if ("text".equals(text(item.get("type")))) {
                        return text(item.get("text"));
                    }
                    return null;
                })
                .filter(item -> !isBlank(item))
                .reduce("", (left, right) -> left.isEmpty() ? right : left + "\n" + right);
    }

    private static String assistantContentFromGemini(Map<String, Object> payload) {
        return objectListStatic(payload.get("candidates")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(candidate -> mapValueStatic(candidate.get("content")))
                .flatMap(content -> objectListStatic(content.get("parts")).stream())
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(part -> text(part.get("text")))
                .filter(item -> !isBlank(item))
                .reduce("", (left, right) -> left.isEmpty() ? right : left + "\n" + right);
    }

    private String streamChunkFromLine(String line) throws JsonProcessingException {
        String text = text(line);
        if (text.isBlank() || text.startsWith(":")) {
            return null;
        }
        if (text.startsWith("data:")) {
            text = text.substring("data:".length()).trim();
        }
        if (text.isBlank() || "[DONE]".equals(text)) {
            return null;
        }
        Map<String, Object> payload = objectMapper.readValue(text, MAP_TYPE);
        Object choices = payload.get("choices");
        if (choices instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> choice) {
            Object delta = choice.get("delta");
            if (delta instanceof Map<?, ?> deltaMap) {
                return text(deltaMap.get("content"));
            }
            Object message = choice.get("message");
            if (message instanceof Map<?, ?> messageMap) {
                return text(messageMap.get("content"));
            }
            return text(choice.get("text"));
        }
        return text(payload.get("content"));
    }

    private static List<String> streamChunks(String content) {
        if (isBlank(content)) {
            return List.of();
        }
        int chunkSize = 80;
        List<String> chunks = new ArrayList<>();
        for (int index = 0; index < content.length(); index += chunkSize) {
            chunks.add(content.substring(index, Math.min(content.length(), index + chunkSize)));
        }
        return chunks;
    }

    private List<Object> parseMessages(String messagesJson) {
        if (isBlank(messagesJson)) {
            return List.of();
        }
        try {
            Object parsed = objectMapper.readValue(messagesJson, Object.class);
            return parsed instanceof List<?> list ? new ArrayList<>(list) : List.of();
        } catch (JsonProcessingException ignored) {
            return List.of();
        }
    }

    private int messageCount(String messagesJson) {
        return parseMessages(messagesJson).size();
    }

    private static String secretKey(String id) {
        return PROVIDER_SECRET_PREFIX + sanitizeId(id) + ":apiKey";
    }

    private static String secretRef(String id) {
        return PROVIDER_SECRET_PREFIX + sanitizeId(id);
    }

    private static String sanitizeId(String value) {
        String sanitized = value == null ? "" : value.trim().replaceAll("[^A-Za-z0-9_.:@-]", "-");
        if (sanitized.isBlank()) {
            throw new IllegalArgumentException("AI provider/session id is required.");
        }
        return sanitized.length() > 96 ? sanitized.substring(0, 96) : sanitized;
    }

    private static boolean supportsOpenAiCompatibleTransport(Map<String, Object> provider) {
        return supportsOpenAiCompatibleTransport(text(provider.get("type")), text(provider.get("apiFormat")));
    }

    static boolean supportsOpenAiCompatibleTransport(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        String normalizedApiFormat = normalizeApiFormat(firstText(apiFormat, defaultApiFormat(normalizedType)));
        return "openai".equals(normalizedType) || ("custom".equals(normalizedType) && "openai".equals(normalizedApiFormat));
    }

    static boolean supportsProviderTransport(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        String normalizedApiFormat = normalizeApiFormat(firstText(apiFormat, defaultApiFormat(normalizedType)));
        return "openai".equals(normalizedType)
                || "anthropic".equals(normalizedType)
                || "gemini".equals(normalizedType)
                || ("custom".equals(normalizedType) && "openai".equals(normalizedApiFormat));
    }

    private static String transportCapability(Map<String, Object> provider) {
        return transportCapability(text(provider.get("type")), text(provider.get("apiFormat")));
    }

    private static String transportCapability(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        return supportsProviderTransport(normalizedType, apiFormat)
                ? transportName(normalizedType, apiFormat)
                : providerApiFormat(normalizedType, apiFormat);
    }

    private static String transportName(Map<String, Object> provider) {
        return transportName(text(provider.get("type")), text(provider.get("apiFormat")));
    }

    private static String transportName(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        return switch (normalizedType) {
            case "anthropic" -> "anthropic-http";
            case "gemini" -> "gemini-http";
            default -> supportsOpenAiCompatibleTransport(normalizedType, apiFormat) ? "openai-compatible-http" : "java-web-local-state";
        };
    }

    private static String normalizeType(String type) {
        String value = firstText(type, "openai").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "anthropic", "claude" -> "anthropic";
            case "gemini", "google" -> "gemini";
            case "custom" -> "custom";
            case "claude_cli", "claude-cli" -> "claude_cli";
            default -> "openai";
        };
    }

    private static String normalizeApiFormat(String apiFormat) {
        String value = firstText(apiFormat, "openai").toLowerCase(Locale.ROOT).replace('_', '-');
        return switch (value) {
            case "anthropic", "claude" -> "anthropic";
            case "gemini", "google" -> "gemini";
            case "claude-cli" -> "claude-cli";
            case "custom" -> "custom";
            default -> "openai";
        };
    }

    private static String providerApiFormat(String type, String apiFormat) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "anthropic";
            case "gemini" -> "gemini";
            case "claude_cli" -> "claude-cli";
            case "custom" -> normalizeApiFormat(firstText(apiFormat, "openai"));
            default -> "openai";
        };
    }

    private static String defaultApiFormat(String type) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "anthropic";
            case "gemini" -> "gemini";
            case "claude_cli" -> "claude-cli";
            default -> "openai";
        };
    }

    private static String defaultBaseUrl(String type) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "https://api.anthropic.com";
            case "gemini" -> "https://generativelanguage.googleapis.com";
            case "custom" -> "";
            case "claude_cli" -> "local-cli";
            default -> "https://api.openai.com/v1";
        };
    }

    private static String defaultModel(String type) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "claude-3-5-sonnet-latest";
            case "gemini" -> "gemini-1.5-pro";
            case "claude_cli" -> "claude-cli";
            default -> "gpt-4o-mini";
        };
    }

    private static List<Object> defaultChatMessages(Map<String, Object> input) {
        List<Object> messages = objectListStatic(input == null ? null : input.get("messages"));
        if (!messages.isEmpty()) {
            return messages;
        }
        return List.of(orderedMap("role", "user", "content", firstText(text(input == null ? null : input.get("prompt")), "Hello")));
    }

    private void applyAdditionalHeaders(HttpRequest.Builder builder, Map<String, Object> provider, String... excludedHeaders) {
        Set<String> excluded = Set.of(excludedHeaders);
        mapValue(provider.get("headers")).forEach((key, value) -> {
            String header = text(key);
            String headerValue = text(value);
            if (!header.isBlank() && !headerValue.isBlank() && excluded.stream().noneMatch(item -> item.equalsIgnoreCase(header))) {
                builder.header(header, headerValue);
            }
        });
    }

    private Map<String, Object> parseResponseMap(String body) throws JsonProcessingException {
        return body == null || body.isBlank() ? Map.of() : objectMapper.readValue(body, MAP_TYPE);
    }

    private static Map<String, Object> mapValueStatic(Object value) {
        if (value instanceof Map<?, ?>) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) value;
            return map;
        }
        return Map.of();
    }

    private static String trimTrailingSlash(String value) {
        String text = firstText(value);
        while (text.endsWith("/")) {
            text = text.substring(0, text.length() - 1);
        }
        return text;
    }

    private static String normalizeChatRole(String role) {
        String normalized = firstText(role, "user").toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "assistant", "model" -> "assistant";
            case "system" -> "system";
            case "tool" -> "user";
            default -> "user";
        };
    }

    private static String firstSystemPrompt(List<Object> messages) {
        for (Object raw : messages) {
            if (raw instanceof Map<?, ?> map) {
                String role = text(map.get("role"));
                if ("system".equalsIgnoreCase(firstText(role))) {
                    String content = firstText(text(map.get("content")), text(map.get("text")));
                    if (!isBlank(content)) {
                        return content;
                    }
                }
            }
        }
        return "";
    }

    private static String normalizeGeminiModelName(String model) {
        String normalized = firstText(model, defaultModel("gemini"));
        if (normalized.startsWith("models/")) {
            return normalized.substring("models/".length());
        }
        return normalized;
    }

    private static SqlOperationType sqlOperationType(String sql) {
        String keyword = leadingSqlKeyword(sql);
        if (keyword.isBlank()) {
            return SqlOperationType.OTHER;
        }
        if (Set.of("select", "show", "describe", "desc", "explain", "with", "values", "pragma").contains(keyword)) {
            return SqlOperationType.QUERY;
        }
        if (Set.of("insert", "update", "delete", "merge", "replace", "call").contains(keyword)) {
            return SqlOperationType.DML;
        }
        if (Set.of("create", "alter", "drop", "truncate", "rename", "grant", "revoke").contains(keyword)) {
            return SqlOperationType.DDL;
        }
        return SqlOperationType.OTHER;
    }

    private static String leadingSqlKeyword(String sql) {
        String text = firstText(sql, "").replace("\r\n", "\n");
        int index = 0;
        while (index < text.length()) {
            while (index < text.length() && Character.isWhitespace(text.charAt(index))) {
                index++;
            }
            if (index + 1 < text.length() && text.charAt(index) == '-' && text.charAt(index + 1) == '-') {
                index += 2;
                while (index < text.length() && text.charAt(index) != '\n') {
                    index++;
                }
                continue;
            }
            if (index < text.length() && text.charAt(index) == '#') {
                index++;
                while (index < text.length() && text.charAt(index) != '\n') {
                    index++;
                }
                continue;
            }
            if (index + 1 < text.length() && text.charAt(index) == '/' && text.charAt(index + 1) == '*') {
                int end = text.indexOf("*/", index + 2);
                if (end < 0) {
                    return "";
                }
                index = end + 2;
                continue;
            }
            int start = index;
            while (index < text.length()) {
                char ch = text.charAt(index);
                if (!Character.isLetterOrDigit(ch) && ch != '_') {
                    break;
                }
                index++;
            }
            return start == index ? "" : text.substring(start, index).toLowerCase(Locale.ROOT);
        }
        return "";
    }

    private static String sqlSafetyWarning(SqlOperationType operationType, String safetyLevel, boolean allowed, boolean requiresConfirm) {
        if (!allowed) {
            if ("readonly".equals(safetyLevel)) {
                return "Read-only AI safety mode allows query statements only.";
            }
            if ("readwrite".equals(safetyLevel) && operationType == SqlOperationType.DDL) {
                return "Read/write AI safety mode blocks DDL statements.";
            }
            return "AI SQL safety policy blocks this statement.";
        }
        if (requiresConfirm) {
            return operationType == SqlOperationType.DDL
                    ? "This SQL may change database structure; confirm before execution."
                    : "This SQL may modify database state; confirm before execution.";
        }
        return null;
    }

    private enum SqlOperationType {
        QUERY("query"),
        DML("dml"),
        DDL("ddl"),
        OTHER("other");

        private final String apiName;

        SqlOperationType(String apiName) {
            this.apiName = apiName;
        }

        String apiName() {
            return apiName;
        }
    }

    private static String normalizeSafety(String level) {
        String value = firstText(level, "readonly").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "readwrite", "confirm" -> "readwrite";
            case "full", "off", "permissive" -> "full";
            default -> "readonly";
        };
    }

    private static String normalizeContext(String level) {
        String value = firstText(level, "schema_only").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "none" -> "none";
            case "full" -> "full";
            default -> "schema_only";
        };
    }

    private static int positiveInt(Object value, int fallback) {
        if (value instanceof Number number) {
            int result = number.intValue();
            return result > 0 ? result : fallback;
        }
        try {
            int result = Integer.parseInt(text(value));
            return result > 0 ? result : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static double numeric(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        String text = text(value);
        if (isBlank(text)) {
            return fallback;
        }
        try {
            return Double.parseDouble(text);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static boolean bool(Object value) {
        return value instanceof Boolean bool && bool;
    }

    private static boolean booleanValue(Object value, boolean fallback) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        String text = text(value);
        if (isBlank(text)) {
            return fallback;
        }
        return switch (text.toLowerCase(Locale.ROOT)) {
            case "true", "1", "yes", "y", "on" -> true;
            case "false", "0", "no", "n", "off" -> false;
            default -> fallback;
        };
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String text(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static Map<String, String> orderedStringMap(String... entries) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            map.put(entries[i], entries[i + 1]);
        }
        return map;
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            map.put(String.valueOf(entries[i]), entries[i + 1]);
        }
        return map;
    }
}
