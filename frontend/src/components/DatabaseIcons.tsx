import React from 'react';

// ─── 公共接口 ───────────────────────────────────────────────

export interface DbIconProps {
    size?: number;
    color?: string;
}

// ─── 默认色表 ───────────────────────────────────────────────

const DB_DEFAULT_COLORS: Record<string, string> = {
    mysql:      '#00758F',
    mariadb:    '#003545',
    postgres:   '#336791',
    redis:      '#DC382D',
    mongodb:    '#47A248',
    kingbase:   '#1890FF',
    dameng:     '#E6002D',
    oracle:     '#F80000',
    sqlserver:  '#CC2927',
    clickhouse: '#FFBF00',
    sqlite:     '#003B57',
    duckdb:     '#FFC107',
    vastbase:   '#0066CC',
    highgo:     '#00A86B',
    tdengine:   '#2962FF',
    diros:      '#0050B3',
    doris:      '#0050B3',
    sphinx:     '#2F5D62',
    custom:     '#888888',
};

const normalizeDbIconType = (type: string): string => {
    const key = String(type || 'custom').trim().toLowerCase();
    return key === 'doris' ? 'diros' : key;
};

export const getDbDefaultColor = (type: string): string =>
    DB_DEFAULT_COLORS[normalizeDbIconType(type)] || DB_DEFAULT_COLORS.custom;

// ─── 有品牌 SVG 文件的数据库类型（文件在 /db-icons/ 下） ────

const BRAND_SVG_TYPES = new Set([
    'mysql', 'mariadb', 'postgres', 'redis', 'mongodb', 'clickhouse', 'sqlite',
    'diros', 'sphinx', 'duckdb', 'sqlserver',
]);

/** 品牌 SVG 图标：用 <img> 加载 /db-icons/*.svg */
const BrandSvgIcon: React.FC<{ type: string; size: number; color?: string }> = ({ type, size, color }) => {
    const bgColor = color || getDbDefaultColor(type);
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size, borderRadius: size * 0.22,
            background: '#fff', border: `1.5px solid ${bgColor}`,
            flexShrink: 0, overflow: 'hidden',
        }}>
            <img
                src={`/db-icons/${type}.svg`}
                alt={type}
                width={size * 0.7}
                height={size * 0.7}
                style={{ display: 'block' }}
            />
        </span>
    );
};

// ─── 彩色标签图标（fallback） ──────────────────────────────

/** 通用彩色标签：填充背景 + 白色粗体缩写 */
const ColorBadge: React.FC<{ size: number; color: string; label: string }> = ({ size, color, label }) => {
    const textSize = label.length <= 2 ? size * 0.48 : size * 0.38;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="22" height="22" rx="5" fill={color}/>
            <text
                x="12" y="12" dominantBaseline="central" textAnchor="middle"
                fontSize={textSize} fontWeight="800" fontFamily="system-ui,-apple-system,sans-serif"
                fill="#fff" letterSpacing={label.length > 2 ? -0.5 : 0}
            >
                {label}
            </text>
        </svg>
    );
};

// ─── 各数据库图标 ───────────────────────────────────────────

// 有品牌 SVG 的数据库
const MySQLIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="mysql" size={size} color={color} />
);
const MariaDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="mariadb" size={size} color={color} />
);
const PostgresIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="postgres" size={size} color={color} />
);
const RedisIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="redis" size={size} color={color} />
);
const MongoDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="mongodb" size={size} color={color} />
);
const ClickHouseIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="clickhouse" size={size} color={color} />
);
const SQLiteIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="sqlite" size={size} color={color} />
);

// 无品牌 SVG → 彩色文字标签
const OracleIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.oracle} label="Or" />
);
const SQLServerIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="sqlserver" size={size} color={color} />
);
const DorisIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="diros" size={size} color={color} />
);
const SphinxIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="sphinx" size={size} color={color} />
);
const DuckDBIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <BrandSvgIcon type="duckdb" size={size} color={color} />
);
const KingBaseIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.kingbase} label="KB" />
);
const DamengIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.dameng} label="DM" />
);
const VastBaseIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.vastbase} label="VB" />
);
const HighGoIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.highgo} label="HG" />
);
const TDengineIcon: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.tdengine} label="TD" />
);

/** Custom — 齿轮图标 */
const CustomIcon: React.FC<DbIconProps> = ({ size = 16, color }) => {
    const c = color || DB_DEFAULT_COLORS.custom;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="22" height="22" rx="5" fill={c}/>
            <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="1.5" fill="none"/>
            <path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.34 6.34l1.77 1.77M15.89 15.89l1.77 1.77M6.34 17.66l1.77-1.77M15.89 8.11l1.77-1.77" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    );
};

// ─── 图标注册表 ─────────────────────────────────────────────

const DorisIconFallback: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.diros} label="Do" />
);
const SphinxIconFallback: React.FC<DbIconProps> = ({ size = 16, color }) => (
    <ColorBadge size={size} color={color || DB_DEFAULT_COLORS.sphinx} label="Sp" />
);

const DB_ICON_MAP: Record<string, React.FC<DbIconProps>> = {
    mysql: MySQLIcon,
    mariadb: MariaDBIcon,
    diros: DorisIcon,
    sphinx: SphinxIcon,
    postgres: PostgresIcon,
    redis: RedisIcon,
    mongodb: MongoDBIcon,
    kingbase: KingBaseIcon,
    dameng: DamengIcon,
    oracle: OracleIcon,
    sqlserver: SQLServerIcon,
    clickhouse: ClickHouseIcon,
    sqlite: SQLiteIcon,
    duckdb: DuckDBIcon,
    vastbase: VastBaseIcon,
    highgo: HighGoIcon,
    tdengine: TDengineIcon,
    custom: CustomIcon,
};

/** 可选图标类型列表（用于图标选择器 UI） */
export const DB_ICON_TYPES: string[] = [
    'mysql', 'mariadb', 'postgres', 'redis', 'mongodb',
    'oracle', 'sqlserver', 'sqlite', 'duckdb', 'clickhouse',
    'diros', 'sphinx', 'kingbase', 'dameng', 'vastbase', 'highgo',
    'tdengine', 'custom',
];

/** 该类型是否有品牌 SVG 文件 */
export const hasBrandSvg = (type: string): boolean => BRAND_SVG_TYPES.has(normalizeDbIconType(type));

/** 获取数据库图标 React 节点 */
export const getDbIcon = (type: string, color?: string, size?: number): React.ReactNode => {
    const key = normalizeDbIconType(type);
    const Component = DB_ICON_MAP[key] || CustomIcon;
    return <Component size={size} color={color} />;
};

/** 获取数据库图标显示名称（中文） */
export const getDbIconLabel = (type: string): string => {
    const labels: Record<string, string> = {
        mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL',
        redis: 'Redis', mongodb: 'MongoDB',
        oracle: 'Oracle',
        sqlserver: 'SQL Server', clickhouse: 'ClickHouse', sqlite: 'SQLite',
        duckdb: 'DuckDB', diros: 'Doris', doris: 'Doris', sphinx: 'Sphinx',
        kingbase: '金仓', dameng: '达梦', vastbase: 'VastBase',
        highgo: '瀚高', tdengine: 'TDengine',
        custom: '自定义',
    };
    return labels[String(type || '').trim().toLowerCase()] || type;
};

/** 预设颜色列表 */
export const PRESET_ICON_COLORS: string[] = [
    '#336791', '#00758F', '#DC382D', '#47A248', '#F80000',
    '#CC2927', '#1890FF', '#E6002D', '#FFBF00', '#2962FF',
    '#00A86B', '#0066CC', '#FF6B35', '#7C3AED',
];
