import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as {
	name: string
	version: string
}

export const marcPackageName = packageJson.name
export const marcPackageVersion = packageJson.version
