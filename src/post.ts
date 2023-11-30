import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getInput, debugLocalInput } from './input'
import * as util from './util'
import { MtimeJson } from './json'

post()

async function post() {
  try {
    const debugLocal = await debugLocalInput()
    if (debugLocal) {
      util.fakeCache(cache)
      util.fakeOctokit(github)
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
    const tempDirectory = path.join(process.env['RUNNER_TEMP']!, 'irgaly-xcode-cache')
    const derivedDataDirectory = await input.getDerivedDataDirectory()
    const sourcePackagesDirectory = await input.getSourcePackagesDirectory()
    if (!existsSync(derivedDataDirectory)) {
      core.warning(`DerivedData directory not found:\n  ${derivedDataDirectory}`)
      core.warning('Skipped storing mtime')
    } else {
      const derivedDataRestoreKey = core.getState('deriveddata-restorekey')
      if (derivedDataRestoreKey == input.key) {
        core.warning(`DerivedData cache has been restored with same key: ${input.key}`)
        core.warning('Skipped storing mtime')
      } else {
        await storeMtime(
          derivedDataDirectory,
          sourcePackagesDirectory,
          input.restoreMtimeTargets,
          input.useDefaultMtimeTargets,
          input.verbose
        )
      }
    }
    core.info('')
    if (sourcePackagesDirectory == null) {
      core.info(`There are no SourcePackages directory in DerivedData, skip restoring SourcePackages`)
    } else {
      if (!existsSync(sourcePackagesDirectory)) {
        core.warning(`SourcePackages directory not exists:\n  ${sourcePackagesDirectory}`)
        core.warning('Skipped storing SourcePackages')
      } else {
        await storeSourcePackages(
          sourcePackagesDirectory,
          await input.getSwiftpmCacheKey()
        )
      }
    }
    core.info('')
    if (input.deleteUsedDerivedDataCache) {
      await deleteUsedDerivedDataCache(
        input.key,
        input.token
      )
    } else {
      core.info('Skipped deleting old DerivedData cache')
    }
    core.info('')
    await storeDerivedData(
      await input.getDerivedDataDirectory(),
      sourcePackagesDirectory,
      tempDirectory,
      input.key
    )
    if (!debugLocal && existsSync(tempDirectory)) {
      core.info(`Clean up: removing temporary directory: ${tempDirectory}`)
      await fs.rm(tempDirectory, { recursive: true, force: true })
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

async function deleteUsedDerivedDataCache(
  key: string,
  token: string
) {
  const restoreKey = core.getState('deriveddata-restorekey')
  if (restoreKey == '') {
    core.info(`DerivedData cache has not been restored.`)
    core.info('Skipped deleting old DerivedData cache')
  } else if (restoreKey == key) {
    core.info(`DerivedData cache has been restored with same key:\n  ${key}`)
    core.info('Skipped deleting old DerivedData cache')
  } else {
    const begin = new Date()
    core.info(`[${util.getHHmmss(begin)}]: Deleting old DerivedData cache...`)
    core.info(`Cache key:\n  ${restoreKey}`)
    const octokit = github.getOctokit(token)
    try {
      const result = await octokit.request('DELETE /repos/{owner}/{repo}/actions/caches{?key,ref}', {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        key: restoreKey,
        ref: github.context.ref
      })
      core.info(`DELETE cache API Result:\n${JSON.stringify(result, null, '  ')}`)
    } catch (error: any) {
      if (error.status == 404) {
        core.info('API returns "Cache is Not Found" response.')
        core.info('This occurs when Cache belongs to other branch.')
        core.info(`This is expected behavior and treat it as success, if this job is the first build of "${github.context.ref}" branch.`)
        core.info(`DELETE cache API Result:\n${JSON.stringify(error, null, '  ')}`)
      } else {
        core.error('Error when deleting old DerivedData cache:')
        core.error('Please be sure actions:write permission is granted for your token.')
        core.error('See API Docs: https://docs.github.com/en/rest/actions/cache?apiVersion=2022-11-28#delete-github-actions-caches-for-a-repository-using-a-cache-key')
        core.error('See GitHub Actions Permissions: https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs')
        core.error(`${JSON.stringify(error, null, '  ')}`)
        throw error
      }
    }
    const end = new Date()
    core.info(`[${util.getHHmmss(end)}]: ${util.elapsed(begin, end)}s`)
  }
}

async function storeDerivedData(
  derivedDataDirectory: string,
  sourcePackagesDirectory: string | null,
  tempDirectory: string,
  key: string
) {
  const restoreKey = core.getState('deriveddata-restorekey')
  if (restoreKey == key) {
    core.info(`DerivedData cache has been restored with same key:\n  ${key}`)
    core.info('Skipped storing DerivedData')
  } else {
    const begin = new Date()
    core.info(`[${util.getHHmmss(begin)}]: Storing DerivedData...`)
    core.info(`Cache path:\n  ${derivedDataDirectory}`)
    if (sourcePackagesDirectory != null) {
      if (
        util.pathContains(derivedDataDirectory, sourcePackagesDirectory) &&
        existsSync(sourcePackagesDirectory)
      ) {
        // replace SourcePackages directory by empty directory
        await fs.mkdir(tempDirectory, { recursive: true })
        await fs.rename(sourcePackagesDirectory, path.join(tempDirectory, path.basename(sourcePackagesDirectory)))
        await fs.mkdir(sourcePackagesDirectory)
      }
    }
    await cache.saveCache([derivedDataDirectory], key)
    core.info(`Cached with key:\n  ${key}`)
    if (sourcePackagesDirectory != null) {
      const backup = path.join(tempDirectory, path.basename(sourcePackagesDirectory))
      if (existsSync(backup)) {
        await fs.rm(sourcePackagesDirectory, { recursive: true, force: true })
        await fs.rename(backup, sourcePackagesDirectory)
      }
    }
    const end = new Date()
    core.info(`[${util.getHHmmss(end)}]: ${util.elapsed(begin, end)}s`)
  }
}

async function storeSourcePackages(
  sourcePackagesDirectory: string,
  key: string
) {
  const restoreKey = core.getState('sourcepackages-restorekey')
  if (restoreKey == key) {
    core.info(`SourcePackages cache has been restored with same key:\n  ${key}`)
    core.info('Skipped storing SourcePackages')
  } else {
    const begin = new Date()
    core.info(`[${util.getHHmmss(begin)}]: Storing SourcePackages...`)
    core.info(`Cache path:\n  ${sourcePackagesDirectory}`)
    try {
      await cache.saveCache([sourcePackagesDirectory], key)
      core.info(`Cached with key:\n  ${key}`)
    } catch (error) {
      // in case cache key conflict,
      // this occurs when SourcePackages directory is under DerivedData and
      // DerivedData cache missed.
      // then logging warning and treat as success.
      core.warning(`SourcePackages cache key exists, not saved: ${error}`)
    }
    const end = new Date()
    core.info(`[${util.getHHmmss(end)}]: ${util.elapsed(begin, end)}s`)
  }
}

async function storeMtime(
  derivedDataDirectory: string,
  sourcePackagesDirectory: string | null,
  restoreMtimeTargets: string[],
  useDefaultMtimeTarget: boolean,
  verbose: boolean
) {
  const begin = new Date()
  core.info(`[${util.getHHmmss(begin)}]: Storing mtime...`)
  let stored = 0
  const jsonFile = path.join(derivedDataDirectory, 'xcode-cache-mtime.json')
  const json: MtimeJson[] = []
  const defaultMtimeTargets = [
    "**/*.swift",
    "**/*.xib",
    "**/*.storyboard",
    "**/*.strings",
    "**/*.plist",
    "**/*.intentdefinition",
    "**/*.json",
    "**/*.xcassets",
    "**/*.xcassets/**/*",
    "**/*.bundle",
    "**/*.bundle/**/*",
    "**/*.xcdatamodel",
    "**/*.xcdatamodel/**/*",
    "**/*.framework",
    "**/*.framework/**/*",
    "**/*.xcframework",
    "**/*.xcframework/**/*",
    "**/*.m",
    "**/*.mm",
    "**/*.h",
    "**/*.c",
    "**/*.cc",
    "**/*.cpp",
    "**/*.hpp",
    "**/*.hxx"
  ]
  let patterns: string[] = []
  if (useDefaultMtimeTarget) {
    patterns = [...patterns, ...defaultMtimeTargets]
  }
  const targets = restoreMtimeTargets.sort((l, r) => {
    let order = 0
    const excludeL = l.startsWith('!')
    const excludeR = r.startsWith('!')
    if (excludeL != excludeR) {
      if (excludeL) {
        order = 1
      } else {
        order = -1
      }
    }
    return order
  })
  patterns = [...patterns, ...targets]
  patterns = [...patterns, `!${derivedDataDirectory}/**/*`]
  if (sourcePackagesDirectory != null) {
    patterns = [...patterns, `!${sourcePackagesDirectory}/**/*`]
  }
  core.info(`Storing to:\n  ${jsonFile}`)
  if (verbose) {
    core.info(`Target glob patterns:`)
    patterns.forEach(pattern => {
      core.info(`  ${pattern}`)
    })
  }
  const cwd = process.cwd()
  const globber = await glob.create(patterns.join('\n'), { implicitDescendants: false })
  const files = (await globber.glob()).map(filePath => {
    return path.relative(cwd, filePath)
  })
  if (verbose) {
    core.startGroup('Storing mtime')
  }
  for(const path of files) {
    try {
      const stat = await fs.stat(path, {bigint: true})
      const mtime = util.getTimeString(stat.mtimeNs)
      let sha256 = ''
      if (stat.isDirectory()) {
        sha256 = await util.calculateDirectoryHash(path)
      } else {
        sha256 = await util.calculateHash(path)
      }
      if (verbose) {
        core.info(`${mtime} : ${path}`)
      }
      json.push({ path: path, time: mtime, sha256: sha256 })
      stored++
    } catch (error) {
      core.warning(`Cannot read file stat: ${path}`)
    }
  }
  if (verbose) {
    core.endGroup()
  }
  await fs.writeFile(jsonFile, JSON.stringify(json))
  core.info(`Stored ${stored} file's mtimes`)
  const end = new Date()
  core.info(`[${util.getHHmmss(end)}]: ${util.elapsed(begin, end)}s`)
}
