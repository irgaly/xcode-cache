import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'
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
          tempDirectory,
          await input.getSwiftpmCacheKey(),
          input.verbose
        )
      }
    }
    core.info('')
    await storeDerivedData(
      await input.getDerivedDataDirectory(),
      sourcePackagesDirectory,
      tempDirectory,
      input.key,
      input.verbose
    )
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

async function storeDerivedData(
  derivedDataDirectory: string,
  sourcePackagesDirectory: string | null,
  tempDirectory: string,
  key: string,
  verbose: boolean
) {
  const restoreKey = core.getState('deriveddata-restorekey')
  if (restoreKey == key) {
    core.info(`DerivedData cache has been restored with same key:\n  ${key}`)
    core.info('Skipped storing SourcePackages')
  } else {
    core.info(`Storing DerivedData...`)
    const tar = path.join(tempDirectory, 'DerivedData.tar')
    await fs.mkdir(tempDirectory, { recursive: true })
    const parent = path.dirname(derivedDataDirectory)
    let excludes: string[] = []
    let constainsSourcePackages = false
    if (sourcePackagesDirectory != null) {
      if (util.pathContains(derivedDataDirectory, sourcePackagesDirectory)) {
        // exclude SourcePackages directory's children
        const relativePath = path.relative(parent, sourcePackagesDirectory)
        excludes = (await fs.readdir(sourcePackagesDirectory)).flatMap (fileName =>
          ['--exclude', `./${path.join(relativePath, fileName)}`]
        )
      }
    }
    let args = ['--posix', '-cf', tar, ...excludes, '-C', parent, path.basename(derivedDataDirectory)]
    if (verbose) {
      args = ['-v', ...args]
      core.startGroup('Pack DerivedData.tar')
      await exec.exec('tar', ['--version'])
    }
    await exec.exec('tar', args)
    if (verbose) {
      core.endGroup()
    }
    core.info(`Packed to:\n  ${tar}`)
    await cache.saveCache([tar], key)
    core.info(`Cached with key:\n  ${key}`)
  }
}

async function storeSourcePackages(
  sourcePackagesDirectory: string,
  tempDirectory: string,
  key: string,
  verbose: boolean
) {
  const restoreKey = core.getState('sourcepackages-restorekey')
  if (restoreKey == key) {
    core.info(`SourcePackages cache has been restored with same key:\n  ${key}`)
    core.info('Skipped storing SourcePackages')
  } else {
    core.info(`Storing SourcePackages...`)
    const tar = path.join(tempDirectory, 'SourcePackages.tar')
    await fs.mkdir(tempDirectory, { recursive: true })
    let args = ['--posix', '-cf', tar, '-C', path.dirname(sourcePackagesDirectory), path.basename(sourcePackagesDirectory)]
    if (verbose) {
      args = ['-v', ...args]
      core.startGroup('Pack SourcePackages.tar')
      await exec.exec('tar', ['--version'])
    }
    await exec.exec('tar', args)
    if (verbose) {
      core.endGroup()
    }
    core.info(`Packed to:\n  ${tar}`)
    try {
      await cache.saveCache([tar], key)
      core.info(`Cached with key:\n  ${key}`)
    } catch (error) {
      // in case cache key conflict,
      // this occurs when SourcePackages directory is under DerivedData and
      // DerivedData cache missed.
      // then logging warning and treat as success.
      core.warning(`SourcePackages cache key exists, not saved: ${error}`)
    }
  }
}

async function storeMtime(
  derivedDataDirectory: string,
  sourcePackagesDirectory: string | null,
  restoreMtimeTargets: string[],
  useDefaultMtimeTarget: boolean,
  verbose: boolean
) {
  core.info(`Storing mtime...`)
  let stored = 0
  const jsonFile = path.join(derivedDataDirectory, 'xcode-cache-mtime.json')
  const json: MtimeJson[] = []
  const defaultMtimeTargets = [
    "**/*.swift",
    "**/*.xib",
    "**/*.storyboard",
    "**/*.strings",
    "**/*.plist",
    "**/*.xcassets",
    "**/*.bundle",
    "**/*.bundle/**/*",
    "**/*.bundle/**/*",
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
  patterns = [...patterns, `!${derivedDataDirectory}`]
  if (sourcePackagesDirectory != null) {
    patterns = [...patterns, `!${sourcePackagesDirectory}`]
  }
  core.info(`Storing to:\n  ${jsonFile}`)
  if (verbose) {
    core.info(`Target glob patterns:`)
    patterns.forEach(pattern => {
      core.info(`  ${pattern}`)
    })
  }
  const cwd = process.cwd()
  const globber = await glob.create(patterns.join('\n'))
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
}
