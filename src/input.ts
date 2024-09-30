import * as core from '@actions/core'
import * as glob from '@actions/glob'
import { hashFiles } from '@actions/glob'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

class Input {
  constructor(
    public key: string,
    public restoreKeys: string[],
    public derivedDataDirectory: string | null,
    public sourcePackagesDirectory: string | null,
    public restoreMtimeTargets: string[],
    public swiftpmPackageResolvedFile: string[],
    public swiftpmCacheKey: string | null,
    public swiftpmCacheRestoreKeys: string[],
    public useDefaultMtimeTargets: boolean,
    public deleteUsedDerivedDataCache: boolean,
    public token: string,
    public verbose: boolean,
    public cacheReadOnly: boolean
  ) {}

  getDerivedDataDirectory(): string {
    let result = this.derivedDataDirectory
    if (result == null) {
        result = '~/Library/Developer/Xcode/DerivedData'
    }
    result = result.replace(/^~\//, `${os.homedir()}/`)
    return result
  }

  async getSourcePackagesDirectory(): Promise<string | null> {
    let result = this.sourcePackagesDirectory
    if (result == null) {
      // find DerivedData/{AppName}-{ID}/SourcePackages
      const derivedDataDirectory = this.getDerivedDataDirectory()
      const globber = await glob.create(path.join(derivedDataDirectory, '*/SourcePackages'))
      const files = await globber.glob()
      if (0 < files.length) {
          result = files[0]
      }
    }
    result = result?.replace(/^~\//, `${os.homedir()}/`) ?? null
    return result
  }

  async getSwiftpmCacheKey(): Promise<string> {
    let result = this.swiftpmCacheKey
    if (result == null) {
      let resolvedFiles = this.swiftpmPackageResolvedFile
      if (resolvedFiles.length <= 0) {
        resolvedFiles = [
          '**/*.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
          '**/*.xcworkspace/xcshareddata/swiftpm/Package.resolved'
        ]
      }
      result = `irgaly/xcode-cache-sourcepackages-${await hashFiles(resolvedFiles.join('\n'))}`
    }
    return result
  }
}

export async function debugLocalInput(): Promise<boolean> {
  let result = false
  const inputFile = process.env['INPUT']
  if (inputFile) {
    // setup environment from file for debug
    const json = JSON.parse(await fs.readFile(inputFile, 'utf8'))
    Object.entries(json).forEach(([key, value]) => {
      core.info(`set debug env: ${key} => ${value}`)
      process.env[key] = value as string
    })
    result = true
  }
  return result
}

export function getInput(): Input {
  return new Input(
    core.getInput('key'),
    core.getMultilineInput('restore-keys'),
    getInputOrNull('deriveddata-directory'),
    getInputOrNull('sourcepackages-directory'),
    core.getMultilineInput('restore-mtime-targets'),
    core.getMultilineInput('swiftpm-package-resolved-file'),
    getInputOrNull('swiftpm-cache-key'),
    core.getMultilineInput('swiftpm-cache-restore-keys'),
    core.getBooleanInput('use-default-mtime-targets'),
    core.getBooleanInput('delete-used-deriveddata-cache'),
    core.getInput('token'),
    core.getBooleanInput('verbose'),
    core.getBooleanInput('cache-read-only')
  )
}

function getInputOrNull(name: string): string | null {
  let value: string | null = core.getInput(name)
  if (value.length <= 0) {
      value = null
  }
  return value
}
