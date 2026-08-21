import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const contextFiles = [
    'CLAUDE.md',
    'apps/api/CLAUDE.md',
    'apps/web/CLAUDE.md',
    'apps/admin/CLAUDE.md'
]

const markdownLinkPattern = /\[[^\]]*]\(([^)]+)\)/g

const brokenReferences = []

for (const contextFile of contextFiles) {
    if (!existsSync(contextFile)) {
        brokenReferences.push({
            source: contextFile,
            target: contextFile,
        })
        continue
    }

    const content = readFileSync(contextFile, 'utf8')

    for (const match of content.matchAll(markdownLinkPattern)) {
        const target = match[1]

        if (
            target.startsWith('http://') ||
            target.startsWith('https://') ||
            target.startsWith('#')
        ) {
            continue
        }

        const path = target.split('#')[0]

        if (!path) {
            continue
        }

        const resolvedPath = resolve(dirname(contextFile), path)

        if (!existsSync(resolvedPath)) {
            brokenReferences.push({
                source: contextFile,
                target,
            })
        }
    }
}

if (brokenReferences.length > 0) {
    console.error('Broken Claude context references:')

    for (const { source, target } of brokenReferences) {
        console.error(`- ${source} -> ${target}`)
    }

    process.exit(1)
}

console.log('Claude context references are valid.')