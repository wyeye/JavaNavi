import type { Plugin } from 'vite';
import ts from 'typescript';

const CJK_PATTERN = /[\u4e00-\u9fff]/;
const SOURCE_MARKER = '@javanavi-i18n-fallback-source';

const isFrontendSource = (id: string): boolean => {
  return /\/src\/.+\.(tsx?|jsx?)$/.test(id)
    && !id.includes('/src/i18n/')
    && !id.includes('/src/vite-plugins/');
};

const shouldPreserveLiteral = (node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean => {
  const parent = node.parent;
  if (!parent) return false;

  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isImportEqualsDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isModuleDeclaration(parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  return false;
};

const wrapStringLiteral = (
  factory: ts.NodeFactory,
  text: string,
  kind: string,
): ts.CallExpression => factory.createCallExpression(
  factory.createIdentifier('__javanaviI18nText'),
  undefined,
  [factory.createStringLiteral(text), factory.createStringLiteral(kind)],
);

const wrapTemplateExpression = (
  factory: ts.NodeFactory,
  node: ts.TemplateExpression,
  kind: string,
): ts.CallExpression => {
  const args: ts.Expression[] = [factory.createStringLiteral(kind), factory.createStringLiteral(node.head.text)];
  node.templateSpans.forEach((span) => {
    args.push(span.expression);
    args.push(factory.createStringLiteral(span.literal.text));
  });
  return factory.createCallExpression(factory.createIdentifier('__javanaviI18nTemplate'), undefined, args);
};

const visibleContextKind = (node: ts.Node): string => {
  let current: ts.Node | undefined = node.parent;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parent) {
    if (ts.isJsxAttribute(current) || ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      return 'jsx';
    }
    if (ts.isCallExpression(current)) {
      const expressionText = current.expression.getText();
      if (/\b(message|notification)\.(success|error|warning|info|loading|open)\b/.test(expressionText)
        || /\bModal\.(confirm|error|warning|info|success)\b/.test(expressionText)) {
        return 'message';
      }
    }
    if (ts.isNewExpression(current) && current.expression.getText() === 'Error') {
      return 'message';
    }
    if (ts.isThrowStatement(current)) {
      return 'message';
    }
  }
  return 'text';
};

const createI18nFallbackPreamble = (factory: ts.NodeFactory, sourceId: string): ts.Statement[] => {
  const marker = factory.createExpressionStatement(factory.createVoidZero());
  ts.addSyntheticLeadingComment(
    marker,
    ts.SyntaxKind.MultiLineCommentTrivia,
    ` ${SOURCE_MARKER} ${sourceId.replace(/\*\//g, '*\\/')} `,
    true,
  );

  const globalLanguage = factory.createElementAccessExpression(
    factory.createIdentifier('globalThis'),
    factory.createStringLiteral('__javanaviLanguage'),
  );
  const globalTranslator = factory.createElementAccessExpression(
    factory.createIdentifier('globalThis'),
    factory.createStringLiteral('__javanaviI18nCompatText'),
  );

  const languageConst = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList([
      factory.createVariableDeclaration(
        '__javanaviI18nLanguage',
        undefined,
        undefined,
        factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createConditionalExpression(
            factory.createStrictEquality(globalLanguage, factory.createStringLiteral('zh')),
            factory.createToken(ts.SyntaxKind.QuestionToken),
            factory.createStringLiteral('zh'),
            factory.createToken(ts.SyntaxKind.ColonToken),
            factory.createStringLiteral('en'),
          ),
        ),
      ),
    ], ts.NodeFlags.Const),
  );

  const textConst = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList([
      factory.createVariableDeclaration(
        '__javanaviI18nText',
        undefined,
        undefined,
        factory.createArrowFunction(
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(undefined, undefined, 'text'),
            factory.createParameterDeclaration(undefined, undefined, 'kind', undefined, undefined, factory.createStringLiteral('text')),
          ],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createBlock([
            factory.createIfStatement(
              factory.createStrictEquality(
                factory.createCallExpression(factory.createIdentifier('__javanaviI18nLanguage'), undefined, []),
                factory.createStringLiteral('zh'),
              ),
              factory.createReturnStatement(factory.createIdentifier('text')),
            ),
            factory.createVariableStatement(
              undefined,
              factory.createVariableDeclarationList([
                factory.createVariableDeclaration('translator', undefined, undefined, globalTranslator),
              ], ts.NodeFlags.Const),
            ),
            factory.createReturnStatement(factory.createConditionalExpression(
              factory.createStrictEquality(
                factory.createTypeOfExpression(factory.createIdentifier('translator')),
                factory.createStringLiteral('function'),
              ),
              factory.createToken(ts.SyntaxKind.QuestionToken),
              factory.createCallExpression(factory.createIdentifier('translator'), undefined, [
                factory.createIdentifier('text'),
                factory.createIdentifier('kind'),
              ]),
              factory.createToken(ts.SyntaxKind.ColonToken),
              factory.createIdentifier('text'),
            )),
          ], true),
        ),
      ),
    ], ts.NodeFlags.Const),
  );

  const templateConst = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList([
      factory.createVariableDeclaration(
        '__javanaviI18nTemplate',
        undefined,
        undefined,
        factory.createArrowFunction(
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(undefined, undefined, 'kind'),
            factory.createParameterDeclaration(undefined, factory.createToken(ts.SyntaxKind.DotDotDotToken), 'parts'),
          ],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          factory.createCallExpression(factory.createIdentifier('__javanaviI18nText'), undefined, [
            factory.createCallExpression(
              factory.createPropertyAccessExpression(factory.createIdentifier('parts'), 'join'),
              undefined,
              [factory.createStringLiteral('')],
            ),
            factory.createIdentifier('kind'),
          ]),
        ),
      ),
    ], ts.NodeFlags.Const),
  );

  return [marker, languageConst, textConst, templateConst];
};

export const i18nFallbackPlugin = (): Plugin => ({
  name: 'javanavi-i18n-fallback',
  enforce: 'pre',
  transform(code, id) {
    if (!isFrontendSource(id) || !CJK_PATTERN.test(code) || code.includes(SOURCE_MARKER)) {
      return null;
    }

    const scriptKind = id.endsWith('.tsx') || id.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, scriptKind);
    let transformedLiteralCount = 0;

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const { factory } = context;
      const visit: ts.Visitor = (node) => {
        if (ts.isJsxAttribute(node)
          && node.initializer
          && ts.isStringLiteral(node.initializer)
          && CJK_PATTERN.test(node.initializer.text)) {
          transformedLiteralCount += 1;
          return factory.updateJsxAttribute(
            node,
            node.name,
            factory.createJsxExpression(undefined, wrapStringLiteral(factory, node.initializer.text, 'jsx')),
          );
        }

        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
          && CJK_PATTERN.test(node.text)
          && !shouldPreserveLiteral(node)
          && visibleContextKind(node) !== 'text') {
          transformedLiteralCount += 1;
          return wrapStringLiteral(factory, node.text, visibleContextKind(node));
        }

        if (ts.isTemplateExpression(node)) {
          const hasCjk = CJK_PATTERN.test(node.head.text)
            || node.templateSpans.some((span) => CJK_PATTERN.test(span.literal.text));
          if (hasCjk && visibleContextKind(node) !== 'text') {
            transformedLiteralCount += 1;
            return wrapTemplateExpression(factory, node, visibleContextKind(node));
          }
        }

        if (ts.isJsxText(node) && CJK_PATTERN.test(node.getText(sourceFile))) {
          const rawText = node.getText(sourceFile);
          if (rawText.trim()) {
            transformedLiteralCount += 1;
            return factory.createJsxExpression(undefined, wrapStringLiteral(factory, rawText, 'jsx'));
          }
        }

        return ts.visitEachChild(node, visit, context);
      };

      return (node) => {
        const visited = ts.visitEachChild(node, visit, context);
        if (transformedLiteralCount === 0) {
          return visited;
        }
        return factory.updateSourceFile(visited, [
          ...createI18nFallbackPreamble(factory, id),
          ...visited.statements,
        ]);
      };
    };

    const result = ts.transform(sourceFile, [transformer]);
    try {
      if (transformedLiteralCount === 0) {
        return null;
      }
      const output = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]);
      return { code: output, map: null };
    } finally {
      result.dispose();
    }
  },
});
