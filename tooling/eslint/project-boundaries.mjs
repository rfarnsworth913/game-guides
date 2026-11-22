import { dirname, resolve, sep } from 'node:path';

const normalize = value => value.split(sep).join('/');

/** Check resolved paths as well as aliases so relative imports cannot bypass ownership. */
export function boundaryViolation(filename, specifier, root = process.cwd()) {
    const source = normalize(resolve(filename));
    let target;
    if (specifier.startsWith('.')) target = resolve(dirname(filename), specifier);
    else {
        const aliases = { '@lib/': 'projects/lib/', '@shared-lib/': 'projects/lib/', '@common/': 'projects/common/', '@core/': 'projects/guides-app/src/app/core/', '@guides-app/': 'projects/guides-app/src/app/' };
        const alias = Object.keys(aliases).find(prefix => specifier.startsWith(prefix));
        if (!alias) return null;
        target = resolve(root, aliases[alias] + specifier.slice(alias.length));
    }
    const folder = name => normalize(resolve(root, 'projects', name)) + '/';
    const within = (path, name) => path.startsWith(folder(name));
    target = normalize(target);
    if (within(source, 'data-parser') && !source.includes('/legacy/') && !source.endsWith('.spec.ts') && target.includes('/data-parser/src/legacy/')) return 'Production parser code cannot import deprecated legacy parsers.';
    if (within(source, 'guides-app') && !source.includes('/game-layout/') && !source.endsWith('.spec.ts') && target.includes('/layouts/game-layout/')) return 'Active browser code cannot import the deprecated alternate layout.';
    if (within(source, 'lib') && target.startsWith(normalize(resolve(root, 'projects')) + '/') && !within(target, 'lib')) return 'lib may only depend on lib and external packages.';
    if (within(source, 'common') && target.startsWith(normalize(resolve(root, 'projects')) + '/') && !within(target, 'lib') && !within(target, 'common')) return 'common may only depend on common, lib and external packages.';
    if (within(source, 'guides-app') && (within(target, 'middleware') || within(target, 'data-parser'))) return 'Browser code cannot import middleware or parser implementations.';
    if ((within(source, 'middleware') || within(source, 'data-parser')) && within(target, 'guides-app')) return 'Server and parser code cannot import browser implementations.';
    return null;
}

export default {
    rules: {
        imports: {
            meta: { type: 'problem', schema: [], messages: { ownership: '{{reason}}' } },
            create(context) {
                const check = node => {
                    if (!node || typeof node.value !== 'string') return;
                    const reason = boundaryViolation(context.filename, node.value, context.cwd);
                    if (reason) context.report({ node, messageId: 'ownership', data: { reason } });
                };
                return {
                    ImportDeclaration: node => check(node.source),
                    ExportNamedDeclaration: node => check(node.source),
                    ExportAllDeclaration: node => check(node.source),
                    ImportExpression: node => check(node.source),
                    CallExpression: node => { if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node.arguments[0]); },
                };
            },
        },
    },
};
