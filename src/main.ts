import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { existsSync, BigIntStats } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getInput, debugLocalInput } from './input'
import * as util from './util'
import { MtimeJson } from './json'
import { promisify } from 'util'
const nanoutimes = require(`../lib/node-v${process.versions.modules}-darwin-${os.arch()}/nanoutimes.node`)

main()

async function main() {
  try {
    const debugLocal = await debugLocalInput()
    if (debugLocal) {
      util.fakeCache(cache)
    }
    const runnerOs = process.env['RUNNER_OS']
    if (runnerOs != 'macOS') {
      throw new Error(`setup-xcode supports only macOS, current host is ${runnerOs}`)
    }
    const input = getInput()
    core.info('Input parameters:')
    Object.entries(input).forEach(([key, value]) => {
      core.info(`  ${key} = ${value}`)
    })
    core.info('')
    const derivedDataDirectory = await input.getDerivedDataDirectory()
    const derivedDataRestoredKey = await restoreDerivedData(
      derivedDataDirectory,
      input.key,
      input.restoreKeys
    )
    const derivedDataRestored = (derivedDataRestoredKey != undefined)
    core.info('')
    const sourcePackagesDirectory = await input.getSourcePackagesDirectory()
    let sourcePackagesRestoredKey: string | undefined = undefined
    let sourcePackagesRestored = false
    if (sourcePackagesDirectory == null) {
      core.info(`There are no SourcePackages directory in DerivedData, skip restoring SourcePackages`)
    } else {
      sourcePackagesRestoredKey = await restoreSourcePackages(
        sourcePackagesDirectory,
        await input.getSwiftpmCacheKey(),
        input.swiftpmCacheRestoreKeys
      )
      sourcePackagesRestored = (sourcePackagesRestoredKey != undefined)
    }
    core.info('')
    if (!derivedDataRestored) {
      core.info(`Skipped restoring mtime because of DerivedData is not restored`)
    } else {
      await restoreMtime(
        derivedDataDirectory,
        input.restoreMtimeTargets,
        input.verbose
      )
    }
    core.info('')
    core.info(`set-output: restored = ${derivedDataRestored}`)
    core.setOutput('restored', derivedDataRestored.toString());
    if (derivedDataRestored) {
      core.info(`set-output: restored-key = ${derivedDataRestoredKey}`)
      core.setOutput('restored-key', derivedDataRestoredKey);
    } else {
      core.info(`restored-key will not set`)
    }
    core.info(`set-output: swiftpm-restored = ${sourcePackagesRestored}`)
    core.setOutput('swiftpm-restored', sourcePackagesRestored.toString());
    if (sourcePackagesRestored) {
      core.info(`set-output: swiftpm-restored-key = ${sourcePackagesRestoredKey}`)
      core.setOutput('swiftpm-restored-key', sourcePackagesRestoredKey);
    } else {
      core.info(`swiftpm-restored-key will not set`)
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

async function restoreDerivedData(
  derivedDataDirectory: string,
  key: string,
  restoreKeys: string[]
): Promise<string | undefined> {
  const begin = new Date()
  core.info(`[${util.getHHmmss(begin)}]: Restoring DerivedData...`)
  core.info(`cache key:\n  ${key}`)
  core.info(`restore keys:\n  ${restoreKeys.join('\n')}`)
  const restoreKey = await cache.restoreCache([derivedDataDirectory], key, restoreKeys)
  const restored = (restoreKey != undefined)
  if (!restored) {
    core.info('DerivedData cache not found')
  } else {
    core.info(`Restored cache key:\n  ${restoreKey}`)
    core.saveState('deriveddata-restorekey', restoreKey)
    core.info(`Restored to:\n  ${derivedDataDirectory}`)
  }
  const end = new Date()
  core.info(`[${util.getHHmmss(end)}]: ${util.elapsed(begin, end)}s`)
  return restoreKey
}

async function restoreSourcePackages(
  sourcePackagesDirectory: string,
  key: string,
  restoreKeys: string[]
): Promise<string | undefined> {
  const begin = new Date()
  core.info(`[${util.getHHmmss(begin)}]: Restoring SourcePackages...`)
  core.info(`cache key:\n  ${key}`)
  core.info(`restore keys:\n  ${restoreKeys.join('\n')}`)
  const restoreKey = await cache.restoreCache([sourcePackagesDirectory], key, restoreKeys)
  const restored = (restoreKey != undefined)
  if (!restored) {
    core.info('SourcePackages cache not found')
  } else {
    core.info(`Restored cache key:\n  ${restoreKey}`)
    core.saveState('sourcepackages-restorekey', restoreKey)
    core.info(`Restored to:\n  ${sourcePackagesDirectory}`)
  }
  const end = new Date()
  core.info(`[${util.getHHmmss(end)}]: ${util.elapsed(begin, end)}s`)
  return restoreKey
}

async function restoreMtime(
  derivedDataDirectory: string,
  restoreMtimeTargets: string[],
  verbose: boolean
) {
  const begin = new Date()
  core.info(`[${util.getHHmmss(begin)}]: Restoring mtime...`)
  let changed = 0
  let skipped: string[] = []
  const jsonFile = path.join(derivedDataDirectory, 'xcode-cache-mtime.json')
  let json = null
  try {
    json = await fs.readFile(jsonFile, 'utf8')
  } catch (error) {
    core.warning(`xcode-cache-mtime.json not found: ${jsonFile}`)
  }
  if (json != null) {
    const files = JSON.parse(json) as MtimeJson[]
    core.info(`Restoring from:\n  ${jsonFile}`)
    if (verbose) {
      core.startGroup('Restoring mtime')
    }
    for (const item of files) {
      let stat: BigIntStats | null = null
      try {
        stat = await fs.stat(item.path, {bigint: true})
      } catch (error) {
        // file not exist
        // do nothing
      }
      if (stat != null) {
        const fileMtime = stat.mtimeNs.toString()
        const cacheMtime = item.time.replace('.', '')
        if (fileMtime == cacheMtime) {
          if (verbose) {
            skipped.push(`same mtime : ${item.path}`)
          }
        } else {
          let sha256 = ''
          if (stat.isDirectory()) {
            sha256 = await util.calculateDirectoryHash(item.path)
          } else {
            sha256 = await util.calculateHash(item.path)
          }
          if (sha256 != item.sha256) {
            if (verbose) {
              skipped.push(`contents changed : ${item.path}`)
            }
          } else {
            if (verbose) {
              core.info(`${util.getTimeString(stat.mtimeNs)} => ${item.time} : ${item.path}`)
            }
            const [second, nano] = item.time.split('.').map(v => Number(v))
            nanoutimes.utimesSync(item.path, second, nano, second, nano)
            changed++
          }
        }
      }
    }
    if (verbose) {
      core.endGroup()
      if (0 < skipped.length) {
        core.startGroup('Skipped files')
        skipped.forEach (v => {
          core.info(v)
        })
        core.endGroup()
      }
    }
    core.info(`Restored ${changed} file's mtimes.`)
    const end = new Date()
    core.info(`[${util.getHHmmss(end)}]: ${util.elapsed(begin, end)}s`)
  }
}
