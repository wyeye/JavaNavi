import React from "react";
import { Card, Typography } from "antd";

const { Paragraph, Text } = Typography;

type JVMWorkspaceShellProps = React.HTMLAttributes<HTMLDivElement> & {
  darkMode?: boolean;
};

type JVMWorkspaceHeroProps = {
  darkMode?: boolean;
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
};

export const getJVMWorkspaceCardStyle = (
  darkMode?: boolean,
): React.CSSProperties => ({
  borderRadius: 18,
  boxShadow: darkMode
    ? "0 16px 38px rgba(0, 0, 0, 0.26)"
    : "0 18px 44px rgba(24, 54, 96, 0.08)",
});

const getShellBackground = (darkMode?: boolean): string =>
  darkMode
    ? "linear-gradient(135deg, #101820 0%, #141414 48%, #1f1f1f 100%)"
    : "linear-gradient(135deg, #eef4ff 0%, #f7f9fc 45%, #ffffff 100%)";

const getHeroBackground = (darkMode?: boolean): string =>
  darkMode
    ? "linear-gradient(135deg, rgba(22,119,255,0.22), rgba(82,196,26,0.08))"
    : "linear-gradient(135deg, rgba(22,119,255,0.14), rgba(19,194,194,0.08))";

export const JVMWorkspaceShell: React.FC<JVMWorkspaceShellProps> = ({
  children,
  darkMode,
  style,
  ...rest
}) => (
  <div
    {...rest}
    data-jvm-workspace-shell="true"
    style={{
      height: "100%",
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      padding: 24,
      display: "grid",
      gap: 18,
      alignContent: "start",
      background: getShellBackground(darkMode),
      ...style,
    }}
  >
    {children}
  </div>
);

export const JVMWorkspaceHero: React.FC<JVMWorkspaceHeroProps> = ({
  darkMode,
  eyebrow,
  title,
  description,
  badges,
  actions,
}) => (
  <Card
    data-jvm-workspace-hero="true"
    variant="borderless"
    style={{
      ...getJVMWorkspaceCardStyle(darkMode),
      background: getHeroBackground(darkMode),
      border: darkMode
        ? "1px solid rgba(255,255,255,0.08)"
        : "1px solid rgba(22,119,255,0.12)",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: 18,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Text type="secondary">{eyebrow}</Text>
        <Typography.Title level={3} style={{ margin: "4px 0 8px" }}>
          {title}
        </Typography.Title>
        {description ? (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {description}
          </Paragraph>
        ) : null}
        {badges ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            {badges}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  </Card>
);
