import fs from 'fs-extra'
import semver from 'semver'

// Define your package.json and version.ts file paths
const packageJsonPath = './package.json'
const versionTsPath = './src/version.ts'

// Read the current package.json
const packageJson = fs.readJsonSync(packageJsonPath)

// Increment the version
const newVersion = semver.inc(packageJson.version, 'patch') // You can use 'minor' or 'major' instead of 'patch' to increment accordingly

// Update package.json version
packageJson.version = newVersion
fs.writeJsonSync(packageJsonPath, packageJson, { spaces: 2 })

// Update version.ts file
const versionTsContent = `export const RetoolRPCVersion = '${newVersion}'\n`
fs.writeFileSync(versionTsPath, versionTsContent)

console.log(`Version bumped to ${newVersion}.`)
